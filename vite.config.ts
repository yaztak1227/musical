import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { startTunnel as startCloudflareTunnel } from "untun";
import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { getCACertificates, setDefaultCACertificates } from "node:tls";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const publicTunnelApiPath = "/api/public-dev-tunnel";
const localBackendOrigin = "http://127.0.0.1:1422";
const tunnelTimeoutMs = Number(process.env.PUBLIC_DEV_TUNNEL_TIMEOUT_MS || 45_000);
const publicUrlReadyTimeoutMs = Number(process.env.PUBLIC_DEV_URL_READY_TIMEOUT_MS || 90_000);
const publicUrlReadyIntervalMs = 1_000;
let didConfigureSystemCertificates = false;

type CloudflareTunnel = NonNullable<Awaited<ReturnType<typeof startCloudflareTunnel>>>;

function configureWindowsSystemCertificates() {
  if (didConfigureSystemCertificates) return;
  didConfigureSystemCertificates = true;

  setDefaultCACertificates(getCACertificates("system"));
}

async function createPublicDevTunnel(port: number) {
  if (process.platform === "win32") return createWindowsPublicDevTunnel(port);
  return createDefaultPublicDevTunnel(getDefaultPublicDevOriginUrl(port));
}

async function createWindowsPublicDevTunnel(port: number) {
  configureWindowsSystemCertificates();
  return createDefaultPublicDevTunnel(getWindowsPublicDevOriginUrl(port));
}

async function createDefaultPublicDevTunnel(originUrl: string): Promise<CloudflareTunnel> {
  await waitForUrlReady(originUrl, 5_000, `Local dev server is unavailable at ${originUrl}`);
  const nextTunnel = await startCloudflareTunnel({
    acceptCloudflareNotice: true,
    url: originUrl,
  });
  if (!nextTunnel) throw new Error("Cloudflare tunnel setup was skipped.");
  return nextTunnel;
}

function getDefaultPublicDevOriginUrl(port: number) {
  return `http://127.0.0.1:${port}`;
}

function getWindowsPublicDevOriginUrl(port: number) {
  return `http://127.0.0.1:${port}`;
}

function publicDevTunnelPlugin() {
  let tunnel: CloudflareTunnel | undefined;
  let publicUrl: string | undefined;
  let isStarting = false;

  async function stopTunnel() {
    const activeTunnel = tunnel;
    tunnel = undefined;
    publicUrl = undefined;
    isStarting = false;
    await activeTunnel?.close();
  }

  async function startTunnel(port: number) {
    if (publicUrl) return publicUrl;
    if (isStarting) throw new Error("Public tunnel is already starting.");

    isStarting = true;
    try {
      tunnel = await createPublicDevTunnel(port);
      publicUrl = await withTimeout(
        tunnel.getURL(),
        tunnelTimeoutMs,
        `Timed out waiting for a public tunnel URL after ${tunnelTimeoutMs}ms`,
      );
      try {
        await waitForUrlReady(
          publicUrl,
          publicUrlReadyTimeoutMs,
          `Public tunnel URL was created but did not become reachable after ${publicUrlReadyTimeoutMs}ms`,
        );
      } catch (error) {
        await stopTunnel();
        throw error;
      }
      return publicUrl;
    } finally {
      isStarting = false;
    }
  }

  return {
    name: "musical-public-dev-tunnel",
    configureServer(server) {
      server.middlewares.use(publicTunnelApiPath, async (request, response) => {
        try {
          const port = Number(server.config.server.port || 1420);

          if (request.method === "GET") {
            sendJson(response, 200, { enabled: Boolean(publicUrl), isStarting, url: publicUrl ?? null });
            return;
          }

          if (request.method !== "POST") {
            sendJson(response, 405, { error: "Method not allowed" });
            return;
          }

          const body = await readJsonBody<{ enabled?: unknown }>(request);
          if (body.enabled === true) {
            const url = await startTunnel(port);
            sendJson(response, 200, { enabled: true, isStarting: false, url });
            return;
          }

          await stopTunnel();
          sendJson(response, 200, { enabled: false, isStarting: false, url: null });
        } catch (error) {
          sendJson(response, 500, { error: String(error instanceof Error ? error.message : error) });
        }
      });

      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/api/") || request.url.startsWith(publicTunnelApiPath)) {
          next();
          return;
        }
        proxyLocalBackendRequest(request, response);
      });

      server.httpServer?.once("close", () => {
        void stopTunnel();
      });
    },
  };
}

function proxyLocalBackendRequest(request: IncomingMessage, response: ServerResponse) {
  const targetUrl = new URL(request.url ?? "/api", localBackendOrigin);
  const proxyRequest = httpRequest(
    targetUrl,
    {
      headers: {
        ...request.headers,
        host: targetUrl.host,
      },
      method: request.method,
    },
    (proxyResponse) => {
      proxyResponse.on("error", (error) => {
        if (response.headersSent) {
          response.destroy(error);
          return;
        }

        sendJson(response, 502, { error: `Local backend response failed: ${error.message}` });
      });
      response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("error", (error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }

    sendJson(response, 502, { error: `Local backend is unavailable: ${error.message}` });
  });

  request.pipe(proxyRequest);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout>;

  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

async function waitForUrlReady(url: string, timeoutMs: number, message: string) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await withTimeout(
        fetch(url, { cache: "no-store", method: "GET" }),
        Math.min(publicUrlReadyIntervalMs, Math.max(1, deadline - Date.now())),
        message,
      );
      await response.body?.cancel();
      if (response.status >= 200 && response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(Math.min(publicUrlReadyIntervalMs, Math.max(1, deadline - Date.now())));
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`${message}${detail}`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJsonBody<T>(request: IncomingMessage) {
  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("error", reject);
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  if (response.headersSent) {
    response.end();
    return;
  }

  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), publicDevTunnelPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    allowedHosts: [".trycloudflare.com"],
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
