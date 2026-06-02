import { spawn } from "node:child_process";

const port = String(process.env.PUBLIC_DEV_PORT || process.env.PORT || 1420);
const host = process.env.PUBLIC_DEV_HOST || "0.0.0.0";

const vite = spawn("npm", ["run", "dev", "--", "--host", host, "--port", port], {
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

vite.on("exit", (code) => {
  process.exitCode = code ?? 0;
});

process.on("SIGINT", () => {
  vite.kill();
  process.exit(130);
});

process.on("SIGTERM", () => {
  vite.kill();
  process.exit(143);
});
