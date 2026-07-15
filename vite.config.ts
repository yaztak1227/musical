import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { getCACertificates, setDefaultCACertificates } from "node:tls";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const publicTunnelApiPath = "/api/public-dev-tunnel";
const localAccessApiPath = "/api/local-dev-access";
const localBackendOrigin = "http://127.0.0.1:1422";
const tunnelTimeoutMs = Number(process.env.PUBLIC_DEV_TUNNEL_TIMEOUT_MS || 45_000);
const tunnelReadyTimeoutMs = Number(process.env.PUBLIC_DEV_TUNNEL_READY_TIMEOUT_MS || 45_000);
const tunnelMaxAttempts = Number(process.env.PUBLIC_DEV_TUNNEL_MAX_ATTEMPTS || 2);
const cloudflaredCliPath = path.resolve(
  __dirname,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "cloudflared.cmd" : "cloudflared",
);
let didConfigureSystemCertificates = false;

type CloudflareTunnel = {
  close: () => Promise<void>;
  getURL: () => Promise<string>;
};

function configureWindowsSystemCertificates() {
  if (process.platform !== "win32" || didConfigureSystemCertificates) return;
  didConfigureSystemCertificates = true;

  setDefaultCACertificates(getCACertificates("system"));
}

function publicDevTunnelPlugin() {
  let tunnel: CloudflareTunnel | undefined;
  let publicUrl: string | undefined;
  let isLocalAccessEnabled = false;
  let isStarting = false;

  async function stopTunnel(options: { keepStarting?: boolean } = {}) {
    const activeTunnel = tunnel;
    tunnel = undefined;
    publicUrl = undefined;
    if (!options.keepStarting) isStarting = false;
    await activeTunnel?.close();
  }

  async function startTunnel(port: number, options: { regenerate?: boolean } = {}) {
    if (isStarting) throw new Error("Public tunnel is already starting.");
    if (!options.regenerate && publicUrl) return publicUrl;

    isStarting = true;
    try {
      const attemptedUrls: string[] = [];
      let lastError: unknown;

      for (let attempt = 1; attempt <= tunnelMaxAttempts; attempt += 1) {
        try {
          if (options.regenerate && attempt === 1) await stopTunnel({ keepStarting: true });
          return await startReachableTunnel(port, attemptedUrls);
        } catch (error) {
          lastError = error;
          await stopTunnel({ keepStarting: true });
          if (isCloudflareRateLimitError(error)) break;
        }
      }

      await stopTunnel({ keepStarting: true });
      throw new Error(
        `Could not create a reachable public tunnel after ${tunnelMaxAttempts} attempts. Tried: ${
          attemptedUrls.join(", ") || "none"
        }. Last error: ${String(lastError instanceof Error ? lastError.message : lastError)}`,
      );
    } finally {
      isStarting = false;
    }
  }

  async function startReachableTunnel(port: number, attemptedUrls: string[]) {
    configureWindowsSystemCertificates();
    tunnel = startCloudflareTunnel(`http://127.0.0.1:${port}`);
    const nextPublicUrl = await withTimeout(
      tunnel.getURL(),
      tunnelTimeoutMs,
      `Timed out waiting for a public tunnel URL after ${tunnelTimeoutMs}ms`,
    );
    attemptedUrls.push(nextPublicUrl);
    publicUrl = nextPublicUrl;
    await waitForReachablePublicUrl(nextPublicUrl, tunnelReadyTimeoutMs);
    return publicUrl;
  }

  return {
    name: "musical-public-dev-tunnel",
    configureServer(server) {
      server.middlewares.use(publicTunnelApiPath, async (request, response) => {
        try {
          if (!isLocalControlRequest(request)) {
            sendJson(response, 403, { error: "Remote access settings are only available locally." });
            return;
          }

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
            const url = await startTunnel(port, { regenerate: true });
            sendJson(response, 200, { enabled: true, isStarting: false, url });
            return;
          }

          await stopTunnel();
          sendJson(response, 200, { enabled: false, isStarting: false, url: null });
        } catch (error) {
          sendJson(response, 500, { error: String(error instanceof Error ? error.message : error) });
        }
      });

      server.middlewares.use(localAccessApiPath, (request, response) => {
        if (!isLocalControlRequest(request)) {
          sendJson(response, 403, { error: "Remote access settings are only available locally." });
          return;
        }

        if (request.method === "POST") {
          void readJsonBody<{ enabled?: unknown }>(request)
            .then((body) => {
              isLocalAccessEnabled = body.enabled === true;
              sendLocalAccessInfo(response, server.config.server.port, isLocalAccessEnabled);
            })
            .catch((error) => {
              sendJson(response, 500, { error: String(error instanceof Error ? error.message : error) });
            });
          return;
        }

        if (request.method !== "GET") {
          sendJson(response, 405, { error: "Method not allowed" });
          return;
        }

        sendLocalAccessInfo(response, server.config.server.port, isLocalAccessEnabled);
      });

      server.middlewares.use((request, response, next) => {
        if (shouldAllowDevRequest(request, { isLocalAccessEnabled, publicUrl })) {
          next();
          return;
        }

        sendJson(response, 403, { error: "Remote access is private." });
      });

      server.middlewares.use((request, response, next) => {
        if (
          !request.url?.startsWith("/api/") ||
          request.url.startsWith(publicTunnelApiPath) ||
          request.url.startsWith(localAccessApiPath)
        ) {
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

function sendLocalAccessInfo(response: ServerResponse, configuredPort: number | undefined, enabled: boolean) {
  const port = Number(configuredPort || 1420);
  const address = getLanIpv4Address();
  sendJson(response, 200, {
    available: enabled && Boolean(address),
    enabled,
    host: enabled ? address : null,
    port,
    url: enabled && address ? `http://${address}:${port}/` : null,
  });
}

function shouldAllowDevRequest(
  request: IncomingMessage,
  accessState: { isLocalAccessEnabled: boolean; publicUrl: string | undefined },
) {
  if (request.method === "OPTIONS") return true;
  if (request.url?.startsWith(publicTunnelApiPath) || request.url?.startsWith(localAccessApiPath)) return true;
  if (isLocalRequest(request)) return true;

  const host = getRequestHostname(request);
  if (!host) return false;
  if (accessState.publicUrl && host === new URL(accessState.publicUrl).hostname) return true;
  return accessState.isLocalAccessEnabled && isLanIpv4Address(host);
}

function isLocalRequest(request: IncomingMessage) {
  const host = getRequestHostname(request);
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1"
  );
}

function isLocalControlRequest(request: IncomingMessage) {
  if (isLocalRequest(request)) return true;

  if (getRequestHostname(request)) return false;

  const remoteAddress = request.socket.remoteAddress;
  return (
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
}

function getRequestHostname(request: IncomingMessage) {
  const host = request.headers.host;
  if (!host) return null;

  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return host.split(":")[0] || null;
  }
}

function isLanIpv4Address(host: string) {
  return host.startsWith("192.168.") || host.startsWith("10.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function getLanIpv4Address() {
  const addresses = Object.values(networkInterfaces())
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address);

  return (
    addresses.find((address) => address.startsWith("192.168.")) ??
    addresses.find((address) => address.startsWith("10.")) ??
    addresses.find((address) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) ??
    addresses[0] ??
    null
  );
}

function startCloudflareTunnel(originUrl: string): CloudflareTunnel {
  const child = spawn(cloudflaredCliPath, ["tunnel", "--url", originUrl, "--no-tls-verify"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const publicUrl = waitForCloudflareTunnelUrl(child);

  return {
    close: () => closeChildProcess(child),
    getURL: () => publicUrl,
  };
}

function waitForCloudflareTunnelUrl(child: ChildProcessWithoutNullStreams) {
  return new Promise<string>((resolve, reject) => {
    let isResolved = false;
    let registeredConnection = false;
    let recentOutput = "";
    let url: string | null = null;

    const resolveIfReady = () => {
      if (!url || !registeredConnection || isResolved) return;

      isResolved = true;
      resolve(url);
    };

    const parseOutput = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      recentOutput = `${recentOutput}${text}`.slice(-4000);
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) url = match[0];
      if (text.includes("Registered tunnel connection")) registeredConnection = true;

      resolveIfReady();
    };

    child.stdout.on("data", parseOutput);
    child.stderr.on("data", parseOutput);
    child.on("error", (error) => {
      if (!isResolved) reject(error);
    });
    child.on("exit", (code, signal) => {
      if (isResolved) return;

      reject(
        new Error(
          `cloudflared exited before publishing a URL: ${signal ?? code ?? "unknown"} ${recentOutput}`.trim(),
        ),
      );
    });
  });
}

function isCloudflareRateLimitError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error);
  return message.includes("429 Too Many Requests") || message.includes("error code: 1015");
}

function closeChildProcess(child: ChildProcessWithoutNullStreams) {
  return new Promise<void>((resolve) => {
    if (child.killed || child.exitCode !== null) {
      resolve();
      return;
    }

    const forceKillTimer = setTimeout(() => {
      if (!child.killed && child.exitCode === null) child.kill("SIGKILL");
    }, 2000);

    child.once("exit", () => {
      clearTimeout(forceKillTimer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

function proxyLocalBackendRequest(request: IncomingMessage, response: ServerResponse) {
  const targetUrl = new URL(request.url ?? "/api", localBackendOrigin);
  const proxyRequest = httpRequest(
    targetUrl,
    {
      headers: {
        ...request.headers,
        host: targetUrl.host,
        origin: targetUrl.origin,
      },
      method: request.method,
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("error", (error) => {
    if (response.headersSent || response.writableEnded) return;
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

async function waitForReachablePublicUrl(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(750);
  }

  throw new Error(
    `Public tunnel URL is not reachable after ${timeoutMs}ms: ${url} (${String(
      lastError instanceof Error ? lastError.message : lastError,
    )})`,
  );
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
  if (response.headersSent || response.writableEnded) return;
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
