import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_NOTICES = [
  "THIRD_PARTY_NOTICES.txt",
  "ONNX_RUNTIME_1.28.0_THIRD_PARTY_NOTICES.txt",
];

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
  const mcpBundle = path.join(paths.resourceDirectory, "mcp", "server.mjs");
  const notices = REQUIRED_NOTICES.map((notice) =>
    path.join(paths.resourceDirectory, "resources", notice),
  );

  if (!isFile(paths.mainExecutable)) {
    errors.push(`missing main executable at exact release path: ${paths.mainExecutable}`);
  }
  if (isFile(paths.nodeSidecar)) {
    errors.push(`legacy bundled Node sidecar must not be present: ${paths.nodeSidecar}`);
  }
  if (isFile(mcpBundle)) {
    errors.push(`legacy MCP sidecar resource must not be present: ${mcpBundle}`);
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

function parseArguments(argv) {
  const values = {
    frontendDist: undefined,
    layout: undefined,
    platform: undefined,
    root: undefined,
  };
  for (const argument of argv) {
    if (argument.startsWith("--platform=")) values.platform = argument.slice("--platform=".length);
    else if (argument.startsWith("--layout=")) values.layout = argument.slice("--layout=".length);
    else if (argument.startsWith("--root=")) values.root = argument.slice("--root=".length);
    else if (argument.startsWith("--frontend-dist=")) {
      values.frontendDist = argument.slice("--frontend-dist=".length);
    } else if (!values.root && !argument.startsWith("--")) values.root = argument;
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
    process.stdout.write(
      `Release bundle verified (${result.platform}/${result.layout}): executable=${result.mainExecutable}, MCP=in-process\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
