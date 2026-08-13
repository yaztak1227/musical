import { execFileSync, spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = path.join(rootDir, "src-tauri");
const targetDir = path.join(tauriDir, "target");
const args = new Set(process.argv.slice(2));
const statusOnly = args.has("--status");
const force = args.has("--force");
const configuredLimit = Number.parseFloat(process.env.MUSICAL_BUILD_CACHE_LIMIT_GB ?? "8");
const limitGiB = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 8;
const limitBytes = limitGiB * 1024 ** 3;

async function directorySize(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return 0;
    }
    throw error;
  }

  let total = 0;
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

function formatGiB(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function hasRunningWorkspaceBuild() {
  if (process.platform === "win32") {
    try {
      const taskList = execFileSync("tasklist", ["/FI", "IMAGENAME eq musical.exe", "/NH"], {
        encoding: "utf8",
        windowsHide: true,
      });
      return /\bmusical\.exe\b/i.test(taskList);
    } catch {
      return true;
    }
  }

  try {
    const processList = execFileSync("ps", ["-axo", "command="], { encoding: "utf8" });
    const normalizedRoot = rootDir.replaceAll("\\", "/");
    return processList
      .split("\n")
      .map((command) => command.replaceAll("\\", "/"))
      .some(
        (command) =>
          command.includes(`${normalizedRoot}/src-tauri/target/debug/musical`) ||
          command.includes(`${normalizedRoot}/src-tauri/target/codex-dev-apps/`),
      );
  } catch {
    return true;
  }
}

const sizeBefore = await directorySize(targetDir);
console.log(`[build-cache] ${path.relative(rootDir, targetDir)}: ${formatGiB(sizeBefore)} (limit ${limitGiB} GiB)`);

if (statusOnly || (!force && sizeBefore <= limitBytes)) {
  process.exit(0);
}

if (hasRunningWorkspaceBuild()) {
  console.warn("[build-cache] A Musical workspace build is running; cache pruning was skipped.");
  console.warn("[build-cache] Close the development app, then run `npm run cache:prune`.");
  process.exit(force ? 1 : 0);
}

console.log(`[build-cache] ${force ? "Manual cleanup requested" : "Limit exceeded"}; running Cargo clean...`);
const result = spawnSync("cargo", ["clean"], {
  cwd: tauriDir,
  encoding: "utf8",
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(`[build-cache] Could not run Cargo clean: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const sizeAfter = await directorySize(targetDir);
console.log(`[build-cache] Cleanup complete: ${formatGiB(sizeBefore)} -> ${formatGiB(sizeAfter)}`);
