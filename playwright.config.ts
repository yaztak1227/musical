import { defineConfig, devices } from "@playwright/test";

const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "true";
const devServerPort = process.env.PLAYWRIGHT_DEV_SERVER_PORT ?? "1420";
const devServerUrl = `http://127.0.0.1:${devServerPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: devServerUrl,
    trace: "on-first-retry",
  },
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: `VITE_MOCK_DATA=true npm run dev -- --host 127.0.0.1 --port ${devServerPort}`,
          url: devServerUrl,
          reuseExistingServer: false,
        },
      }),
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
