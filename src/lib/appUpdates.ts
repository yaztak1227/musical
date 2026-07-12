import { check, type Update } from "@tauri-apps/plugin-updater";
import packageJson from "../../package.json";
import { isTauriRuntime } from "./backend";
import { isNewerVersion } from "./version";

export type AppUpdateResult =
  | { status: "installed"; version: string }
  | { status: "none" }
  | { status: "unsupported" };

export type AppUpdateCheckResult =
  | { status: "available"; update: Update; version: string }
  | { status: "none" }
  | { status: "unsupported" };

export type AvailableAppUpdate = Extract<AppUpdateCheckResult, { status: "available" }>;

export async function checkAppUpdate(): Promise<AppUpdateCheckResult> {
  if (!isTauriRuntime) return { status: "unsupported" };

  const update = await check();
  if (!update || !isNewerVersion(update.version, packageJson.version)) return { status: "none" };

  return { status: "available", update, version: update.version };
}

export async function installAppUpdate(update: Update): Promise<Extract<AppUpdateResult, { status: "installed" }>> {
  await update.downloadAndInstall();
  return { status: "installed", version: update.version };
}
