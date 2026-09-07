import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_NOTICES = [
  "THIRD_PARTY_NOTICES.txt",
  "ONNX_RUNTIME_1.28.0_THIRD_PARTY_NOTICES.txt",
  "NODE_RUNTIME_LICENSE.txt",
];

const LISTENING_MARKER = "musical mcp sidecar listening";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const MCP_INITIALIZE_REQUEST_ID = 1;
const MAX_SMOKE_TIMEOUT_MS = 5_000;
const SUPPORTED_PLATFORMS = new Set(["staging", "macos", "windows", "linux"]);
const SUPPORTED_LAYOUTS = new Set(["staging", "macos-app", "windows-install", "linux-deb"]);

function normalizePlatform(platform) {
  const normalized =
    platform === "win32"
      ? "windows"
      : platform === "darwin" || platform === "mac"
        ? "macos"
        : platform;
  if (!SUPPORTED_PLATFORMS.has(normalized)) {
    throw new Error(
      `Unsupported release bundle platform ${JSON.stringify(platform)}. Expected one of: ${[
        ...SUPPORTED_PLATFORMS,
      ].join(", ")}.`,
    );
  }
  return normalized;
}

function normalizeLayout(layout) {
  if (!SUPPORTED_LAYOUTS.has(layout)) {
    throw new Error(
      `Unsupported release bundle layout ${JSON.stringify(layout)}. Expected one of: ${[
        ...SUPPORTED_LAYOUTS,
      ].join(", ")}.`,
    );
  }
  return layout;
}

function inferLayout(root, platform) {
  if (platform === "staging") return "staging";
  if (platform === "macos" && path.extname(root).toLowerCase() === ".app") {
    return "macos-app";
  }
  if (platform === "linux" && isFile(path.join(root, "usr", "bin", "musical"))) {
    return "linux-deb";
  }
  return platform === "windows" ? "windows-install" : "staging";
}

function releasePaths(root, platform, layout) {
  if (layout === "macos-app") {
    if (platform !== "macos") {
      throw new Error(`Layout macos-app is not valid for platform ${platform}.`);
    }
    if (path.extname(root).toLowerCase() !== ".app") {
      throw new Error(`Layout macos-app requires an .app bundle root: ${root}`);
    }
    const executableDirectory = path.join(root, "Contents", "MacOS");
    return {
      mainExecutable: path.join(executableDirectory, "musical"),
      nodeSidecar: path.join(executableDirectory, "musical-node"),
      resourceDirectory: path.join(root, "Contents", "Resources"),
    };
  }

  if (layout === "linux-deb") {
    if (platform !== "linux") {
      throw new Error(`Layout linux-deb is not valid for platform ${platform}.`);
    }
    const executableDirectory = path.join(root, "usr", "bin");
    return {
      mainExecutable: path.join(executableDirectory, "musical"),
      nodeSidecar: path.join(executableDirectory, "musical-node"),
      // Tauri's Debian bundler installs resources beneath /usr/lib/<productName>.
      resourceDirectory: path.join(root, "usr", "lib", "Musical"),
    };
  }

  if (layout === "windows-install" && platform !== "windows") {
    throw new Error(`Layout windows-install is not valid for platform ${platform}.`);
  }
  if (layout === "staging" && platform !== "staging" && !["macos", "windows", "linux"].includes(platform)) {
    throw new Error(`Layout staging is not valid for platform ${platform}.`);
  }

  // A staging directory is used before the platform-specific installer is
  // created, so its executable suffix is the only platform signal available.
  // Resolve that signal once and keep all subsequent paths exact; never walk
  // the directory looking for a payload at an arbitrary depth.
  let executablePlatform = platform;
  if (layout === "staging" && platform === "staging") {
    const hasWindowsExecutable = isFile(path.join(root, "musical.exe"));
    const hasUnixExecutable = isFile(path.join(root, "musical"));
    if (hasWindowsExecutable && hasUnixExecutable) {
      throw new Error(
        `Staging bundle is ambiguous: both musical.exe and musical are present at ${root}.`,
      );
    }
    executablePlatform = hasWindowsExecutable ? "windows" : "linux";
  }
  const executableName = executablePlatform === "windows" ? "musical.exe" : "musical";
  const nodeName = executablePlatform === "windows" ? "musical-node.exe" : "musical-node";
  return {
    mainExecutable: path.join(root, executableName),
    nodeSidecar: path.join(root, nodeName),
    resourceDirectory: root,
    executablePlatform,
  };
}

function isFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function collectAssetFilenames(directory, prefix = "") {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const filenames = [];
  for (const entry of entries) {
    const relativeName = prefix ? path.join(prefix, entry.name) : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      filenames.push(...collectAssetFilenames(fullPath, relativeName));
    } else if (isFile(fullPath)) {
      // The generated Tauri payload stores asset names as UTF-8 strings. Keep
      // the path relative to dist/assets so nested asset directories work too,
      // while checking the filename itself below.
      filenames.push(relativeName);
    }
  }
  return filenames;
}

function verifyEmbeddedFrontend(executable, frontendDist) {
  if (!isFile(executable) || !frontendDist) return undefined;
  const indexPath = path.join(frontendDist, "index.html");
  const assetsPath = path.join(frontendDist, "assets");
  if (!isFile(indexPath)) return undefined;

  let binary;
  let index;
  let assets;
  try {
    binary = readFileSync(executable);
    index = readFileSync(indexPath);
    assets = collectAssetFilenames(assetsPath);
  } catch {
    return undefined;
  }
  if (assets.length === 0) return undefined;

  const indexEmbedded = binary.includes(index);
  const embeddedAssetCount = assets.filter((asset) =>
    binary.includes(Buffer.from(path.basename(asset))),
  ).length;

  // The Rust include_dir payload contains the full index or every asset name
  // from it. Checking the exact main executable prevents a nearby development
  // binary from satisfying an installer verification. Both the exact index
  // bytes and every asset filename are required: either one alone can be
  // present in an unrelated executable.
  if (!indexEmbedded || embeddedAssetCount !== assets.length) return undefined;
  return {
    assets: assets.length,
    embeddedAssetCount,
    executable,
    index: indexPath,
    indexEmbedded,
  };
}

function forbiddenBundlePath(text) {
  // Source maps and absolute workspace references are not needed by the
  // deployable bundle. Keep each match to contiguous path-like components so
  // an unrelated Cargo registry path and a later `musical` symbol in the same
  // binary string table cannot combine into a false positive.
  const windowsPath =
    /(?<![A-Za-z])[A-Za-z]:[\\/]+(?:[A-Za-z0-9._ +%-]+[\\/]+)*(?:musical|src-tauri|dist(?:-mcp)?)(?:[\\/]+[A-Za-z0-9._ +%-]+)*/i;
  const unixPath =
    /\/(?:Users|home|runner|opt\/build)\/(?:[A-Za-z0-9._ +%-]+\/)*(?:musical|src-tauri|dist(?:-mcp)?)(?:\/[A-Za-z0-9._ +%-]+)*/i;
  return windowsPath.test(text) || unixPath.test(text);
}

function readBundleText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function verifyNoBuildPath(file, label, errors) {
  const text = readBundleText(file);
  if (text === undefined) {
    errors.push(`unable to read ${label}: ${file}`);
  } else if (forbiddenBundlePath(text)) {
    errors.push(`${label} contains an absolute build/workspace path: ${file}`);
  }
}

export function verifyReleaseBundle(bundleRoot, options = {}) {
  const root = path.resolve(bundleRoot);
  const platform = normalizePlatform(options.platform ?? process.platform);
  const layout = normalizeLayout(options.layout ?? inferLayout(root, platform));
  const frontendDist = path.resolve(options.frontendDist ?? "dist");
  const errors = [];
  const paths = releasePaths(root, platform, layout);
  const executablePlatform = paths.executablePlatform ?? platform;
  const mcpBundle = path.join(paths.resourceDirectory, "mcp", "server.mjs");
  const notices = REQUIRED_NOTICES.map((notice) =>
    path.join(paths.resourceDirectory, "resources", notice),
  );

  if (!isFile(paths.mainExecutable)) {
    errors.push(`missing main executable at exact release path: ${paths.mainExecutable}`);
  }
  if (!isFile(paths.nodeSidecar)) {
    errors.push(`missing bundled Node sidecar at exact release path: ${paths.nodeSidecar}`);
  } else if (
    executablePlatform !== "windows" &&
    process.platform !== "win32" &&
    (statSync(paths.nodeSidecar).mode & 0o111) === 0
  ) {
    errors.push(`bundled Node sidecar is not executable: ${paths.nodeSidecar}`);
  }
  if (!isFile(mcpBundle)) {
    errors.push(`missing MCP resource at exact release path: ${mcpBundle}`);
  }
  for (const notice of notices) {
    if (!isFile(notice)) {
      errors.push(`missing bundled notice/license at exact release path: ${notice}`);
    }
  }

  const embeddedFrontend = verifyEmbeddedFrontend(paths.mainExecutable, frontendDist);
  if (!embeddedFrontend) {
    errors.push(
      `main executable does not contain the expected frontend payload from ${frontendDist}: ${paths.mainExecutable}`,
    );
  }

  if (isFile(paths.mainExecutable)) {
    verifyNoBuildPath(paths.mainExecutable, "main executable", errors);
  }

  if (isFile(mcpBundle)) {
    verifyNoBuildPath(mcpBundle, "MCP resource", errors);
  }

  if (errors.length > 0) {
    throw new Error(["Release bundle verification failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  }

  return {
    bundleRoot: root,
    embeddedFrontend,
    layout,
    mainExecutable: paths.mainExecutable,
    mcpBundle,
    nodeSidecar: paths.nodeSidecar,
    notices,
    platform,
    resourceDirectory: paths.resourceDirectory,
  };
}

async function reserveLoopbackPort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to reserve a loopback port for the MCP sidecar smoke test.");
  }
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function outputExcerpt(output) {
  const maximumLength = 8_000;
  return output.length <= maximumLength ? output : output.slice(-maximumLength);
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseMcpJsonRpcResponse(body, contentType, expectedId) {
  const isEventStream = contentType.toLowerCase().includes("text/event-stream");
  const candidates = isEventStream
    ? body
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .filter(Boolean)
    : [body.trim()];
  let parsedCandidates;
  try {
    parsedCandidates = candidates.map((candidate) => JSON.parse(candidate));
  } catch {
    throw new Error("MCP sidecar initialize returned an invalid JSON-RPC response.");
  }

  const response = parsedCandidates.find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      candidate.jsonrpc === "2.0" &&
      candidate.id === expectedId,
  );
  if (!response || Array.isArray(response)) {
    throw new Error("MCP sidecar initialize returned no matching JSON-RPC response.");
  }
  if (Object.prototype.hasOwnProperty.call(response, "error")) {
    throw new Error("MCP sidecar initialize returned a JSON-RPC error response.");
  }
  if (
    !Object.prototype.hasOwnProperty.call(response, "result") ||
    response.result === null ||
    typeof response.result !== "object" ||
    Array.isArray(response.result)
  ) {
    throw new Error("MCP sidecar initialize returned an incomplete JSON-RPC response.");
  }
  return response;
}

async function verifyMcpInitialize(port, deadline) {
  const remainingTime = Math.max(1, deadline - Date.now());
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: MCP_INITIALIZE_REQUEST_ID,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: "musical-release-bundle-smoke",
            version: "1.0.0",
          },
        },
      }),
      signal: AbortSignal.timeout(remainingTime),
    });
  } catch (error) {
    throw new Error(
      `MCP sidecar initialize request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const body = await response.text();
  if (response.status !== 200) {
    throw new Error(`MCP sidecar initialize returned HTTP ${response.status}.`);
  }
  const sessionId = response.headers.get("mcp-session-id")?.trim();
  if (!sessionId) {
    throw new Error("MCP sidecar initialize response did not include mcp-session-id.");
  }
  parseMcpJsonRpcResponse(
    body,
    response.headers.get("content-type") ?? "",
    MCP_INITIALIZE_REQUEST_ID,
  );
  return { sessionId };
}

export async function smokeReleaseSidecar(verification, options = {}) {
  const requestedTimeout = options.timeoutMs ?? MAX_SMOKE_TIMEOUT_MS;
  if (!Number.isFinite(requestedTimeout) || requestedTimeout <= 0) {
    throw new Error(`MCP sidecar smoke timeout must be a positive number of milliseconds: ${requestedTimeout}`);
  }
  // A release verification must fail quickly even if a caller accidentally
  // supplies a longer timeout. The smoke contract is capped at five seconds.
  const timeoutMs = Math.min(requestedTimeout, MAX_SMOKE_TIMEOUT_MS);
  const deadline = Date.now() + timeoutMs;
  const port = await reserveLoopbackPort();
  const cleanCwd = await mkdtemp(path.join(os.tmpdir(), "musical-release-sidecar-"));
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name, value]) => name !== "NODE_PATH" && value !== undefined),
  );
  Object.assign(environment, {
    MUSICAL_MCP_BRIDGE_URL: "http://127.0.0.1:1",
    MUSICAL_MCP_PARENT_WATCHDOG: "stdin",
    MUSICAL_MCP_PORT: String(port),
    MUSICAL_MCP_TOKEN: "release-bundle-smoke-test",
    MUSICAL_MCP_VERSION: "release-bundle-smoke-test",
  });

  let child;
  let exitPromise;
  let stdout = "";
  let stderr = "";
  try {
    child = spawn(verification.nodeSidecar, [verification.mcpBundle], {
      cwd: cleanCwd,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdin.on("error", () => {
      // An early child exit is reported through exitPromise with its output.
    });
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      stdout = outputExcerpt(stdout);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      stderr = outputExcerpt(stderr);
    });

    exitPromise = new Promise((resolve) => {
      child.once("error", (error) => resolve({ error }));
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    const listeningPromise = new Promise((resolve) => {
      const inspect = () => {
        if (stdout.includes(LISTENING_MARKER)) resolve({ kind: "listening" });
      };
      child.stdout.on("data", inspect);
      inspect();
    });
    const remainingStartupTime = Math.max(1, deadline - Date.now());
    const startup = await withTimeout(
      Promise.race([
        listeningPromise,
        exitPromise.then((outcome) => ({ kind: "exit", outcome })),
      ]),
      remainingStartupTime,
      `MCP sidecar did not listen within ${timeoutMs}ms. stdout: ${stdout} stderr: ${stderr}`,
    );
    if (startup.kind === "exit") {
      const detail = startup.outcome.error
        ? startup.outcome.error.message
        : `code=${startup.outcome.code}, signal=${startup.outcome.signal ?? "none"}`;
      throw new Error(`MCP sidecar exited before listening (${detail}). stdout: ${stdout} stderr: ${stderr}`);
    }

    await verifyMcpInitialize(port, deadline);

    child.stdin.end();
    const remainingExitTime = Math.max(1, deadline - Date.now());
    const outcome = await withTimeout(
      exitPromise,
      remainingExitTime,
      `MCP sidecar did not exit after stdin EOF within ${timeoutMs}ms. stdout: ${stdout} stderr: ${stderr}`,
    );
    if (outcome.error) {
      throw new Error(`Unable to launch bundled Node sidecar: ${outcome.error.message}`);
    }
    if (outcome.code !== 0 || outcome.signal) {
      throw new Error(
        `MCP sidecar exited abnormally after stdin EOF (code=${outcome.code}, signal=${
          outcome.signal ?? "none"
        }). stdout: ${stdout} stderr: ${stderr}`,
      );
    }
    return { exitCode: outcome.code, port };
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill();
      const remainingCleanupTime = Math.max(0, deadline - Date.now());
      if (exitPromise && remainingCleanupTime > 0) {
        await Promise.race([
          exitPromise,
          new Promise((resolve) => setTimeout(resolve, remainingCleanupTime)),
        ]);
      }
    }
    await rm(cleanCwd, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const values = {
    frontendDist: undefined,
    layout: undefined,
    platform: undefined,
    root: undefined,
    smokeSidecar: false,
  };
  for (const argument of argv) {
    if (argument.startsWith("--platform=")) values.platform = argument.slice("--platform=".length);
    else if (argument.startsWith("--layout=")) values.layout = argument.slice("--layout=".length);
    else if (argument.startsWith("--root=")) values.root = argument.slice("--root=".length);
    else if (argument.startsWith("--frontend-dist=")) {
      values.frontendDist = argument.slice("--frontend-dist=".length);
    } else if (argument === "--smoke-sidecar") values.smokeSidecar = true;
    else if (!values.root && !argument.startsWith("--")) values.root = argument;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return values;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const arguments_ = parseArguments(process.argv.slice(2));
    const defaultRoots = {
      darwin: path.resolve("src-tauri/target/release/bundle/macos/Musical.app"),
      linux: path.resolve("src-tauri/target/release"),
      win32: path.resolve("src-tauri/target/release"),
    };
    const root = arguments_.root ?? defaultRoots[process.platform];
    if (!root) throw new Error("A bundle root is required (use --root=/path/to/extracted-bundle).");
    const result = verifyReleaseBundle(root, {
      frontendDist: arguments_.frontendDist ?? "dist",
      layout: arguments_.layout,
      platform: arguments_.platform,
    });
    if (arguments_.smokeSidecar) {
      await smokeReleaseSidecar(result);
    }
    process.stdout.write(
      `Release bundle verified (${result.platform}/${result.layout}): executable=${result.mainExecutable}, MCP=${result.mcpBundle}, Node=${result.nodeSidecar}${
        arguments_.smokeSidecar ? ", sidecar smoke=passed" : ""
      }\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
