import { check } from "@tauri-apps/plugin-updater";
import { isTauriRuntime } from "./backend";

export type AppUpdateResult =
  | { status: "installed"; version: string }
  | { status: "none" }
  | { status: "unsupported" };

export async function checkAndInstallAppUpdate(): Promise<AppUpdateResult> {
  if (!isTauriRuntime) return { status: "unsupported" };

  const update = await check();
  if (!update) return { status: "none" };

  await update.downloadAndInstall();
  return { status: "installed", version: update.version };
}
