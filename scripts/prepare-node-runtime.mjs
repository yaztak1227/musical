import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedVersion = "24.15.0";
const versionFile = path.join(projectRoot, ".node-version");
const configuredVersion = readFileSync(versionFile, "utf8").trim();

if (configuredVersion !== expectedVersion) {
  throw new Error(
    `Node runtime configuration mismatch: .node-version is ${JSON.stringify(configuredVersion)}, expected ${expectedVersion}.`,
  );
}

if (process.versions.node !== expectedVersion) {
  throw new Error(
    `Node ${expectedVersion} is required to stage the Musical sidecar; running ${process.version} from ${process.execPath}.`,
  );
}

function optionValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument?.slice(prefix.length) || undefined;
}

function validTargetTriple(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? value : undefined;
}

function rustHostTriple() {
  try {
    const output = execFileSync("rustc", ["-vV"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return output.match(/^host:\s*(\S+)$/m)?.[1];
  } catch {
    return undefined;
  }
}

function nodeRuntimeHostTriple() {
  const defaults = {
    darwin: {
      arm64: "aarch64-apple-darwin",
      x64: "x86_64-apple-darwin",
    },
    linux: {
      arm: "armv7-unknown-linux-gnueabihf",
      arm64: "aarch64-unknown-linux-gnu",
      x64: "x86_64-unknown-linux-gnu",
    },
    win32: {
      arm64: "aarch64-pc-windows-msvc",
      ia32: "i686-pc-windows-msvc",
      x64: "x86_64-pc-windows-msvc",
    },
  };
  return defaults[process.platform]?.[process.arch];
}

const runtimeHostTriple = nodeRuntimeHostTriple();
if (!runtimeHostTriple) {
  throw new Error(
    `Unsupported Node runtime host ${process.platform}/${process.arch}; refusing to stage it for an unknown Rust target.`,
  );
}

const compilerHostTriple = rustHostTriple();
if (compilerHostTriple && compilerHostTriple !== runtimeHostTriple) {
  throw new Error(
    `Rust host ${compilerHostTriple} does not match the Node runtime host ${runtimeHostTriple}; refusing to copy ${process.execPath}.`,
  );
}

const requestedTarget =
  optionValue("--target") ??
  process.env.TAURI_ENV_TARGET_TRIPLE ??
  process.env.TAURI_TARGET_TRIPLE ??
  process.env.RUST_TARGET;
const targetTriple = requestedTarget === undefined ? runtimeHostTriple : validTargetTriple(requestedTarget);

if (!targetTriple) {
  throw new Error(
    `Invalid Rust target triple ${JSON.stringify(requestedTarget)} for the bundled Node runtime.`,
  );
}
if (targetTriple !== runtimeHostTriple) {
  throw new Error(
    `Requested target ${targetTriple} does not match the Node runtime host ${runtimeHostTriple}; refusing to package a host executable for another platform or architecture.`,
  );
}

const nodeLicenseDir = path.join(projectRoot, "build", "node");
const nodeLicensePath = path.join(nodeLicenseDir, "LICENSE.txt");

function findNodeLicense() {
  let directory = path.dirname(path.resolve(process.execPath));
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(directory, "LICENSE");
    if (existsSync(candidate)) return candidate;
    directory = path.dirname(directory);
  }
  return undefined;
}

const licensePath = findNodeLicense();
if (!licensePath) {
  throw new Error(
    `Node.js ${expectedVersion} license was not found next to ${process.execPath}; refusing to create a distributable bundle without the runtime license.`,
  );
}

const extension = targetTriple.includes("windows") ? ".exe" : "";
const binariesDir = path.join(projectRoot, "src-tauri", "binaries");
const nodeBinaryPath = path.join(binariesDir, `musical-node-${targetTriple}${extension}`);
mkdirSync(binariesDir, { recursive: true });
copyFileSync(process.execPath, nodeBinaryPath);
if (process.platform !== "win32") {
  chmodSync(nodeBinaryPath, 0o755);
}

mkdirSync(nodeLicenseDir, { recursive: true });
copyFileSync(licensePath, nodeLicensePath);

process.stdout.write(
  `Node ${expectedVersion} staged for ${targetTriple}: ${path.relative(projectRoot, nodeBinaryPath)}\n`,
);
