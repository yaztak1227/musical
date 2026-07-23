import { spawn } from "node:child_process";

const child = spawn(
  "npm",
  ["run", "tauri", "--", "dev", "--config", "src-tauri/tauri.ai-test.conf.json"],
  {
    env: {
      ...process.env,
      MUSICAL_AI_TEST: "true",
      MUSICAL_OPEN_DEV_BROWSER: "false",
      PUBLIC_DEV_PORT: "1430",
      VITE_MOCK_DATA: "true",
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 0;
});
