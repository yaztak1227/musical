import { writeFileSync } from "node:fs";

const outputPath = process.argv[2] ?? "src-tauri/tauri-updater.generated.conf.json";
const pubkey = process.env.TAURI_UPDATER_PUBKEY;
const endpoint =
  process.env.TAURI_UPDATER_ENDPOINT ||
  (process.env.GITHUB_REPOSITORY
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/releases/latest/download/latest.json`
    : "");

if (!pubkey) {
  throw new Error("TAURI_UPDATER_PUBKEY is required to build updater-enabled installers.");
}

if (!endpoint) {
  throw new Error("TAURI_UPDATER_ENDPOINT or GITHUB_REPOSITORY is required to build updater-enabled installers.");
}

writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      bundle: {
        createUpdaterArtifacts: true,
      },
      plugins: {
        updater: {
          endpoints: [endpoint],
          pubkey,
          windows: {
            installMode: "passive",
          },
        },
      },
    },
    null,
    2,
  )}\n`,
);
