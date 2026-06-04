import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import packageJson from "../package.json" with { type: "json" };

const artifactsDir = process.argv[2] ?? "artifacts";
const outputPath = process.argv[3] ?? join(artifactsDir, "latest.json");
const repository = process.env.GITHUB_REPOSITORY;
const refName = process.env.GITHUB_REF_NAME;

if (!repository || !refName) {
  throw new Error("GITHUB_REPOSITORY and GITHUB_REF_NAME are required to generate latest.json.");
}

const files = readdirSync(artifactsDir);
const installerName = files.find((file) => file.toLowerCase().endsWith(".exe"));
if (!installerName) {
  throw new Error(`No Windows .exe installer found in ${artifactsDir}.`);
}

const signature = readFileSync(join(artifactsDir, `${installerName}.sig`), "utf8").trim();
const version = refName.replace(/^v/, "") || packageJson.version;

writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      version,
      pub_date: new Date().toISOString(),
      platforms: {
        "windows-x86_64": {
          signature,
          url: `https://github.com/${repository}/releases/download/${refName}/${encodeURIComponent(installerName)}`,
        },
      },
    },
    null,
    2,
  )}\n`,
);
