import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import assert from "node:assert/strict";

export async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

export function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("error", reject);
    request.on("end", () => {
      resolve(body ? JSON.parse(body) : {});
    });
  });
}

export async function reservePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  return port;
}

export async function createFakeBridge({ token, handlers }) {
  const calls = [];
  const server = createServer(async (request, response) => {
    if (request.headers["x-musical-mcp-token"] !== token) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("invalid token");
      return;
    }

    const match = request.url?.match(/^\/api\/_mcp\/tools\/([^/?]+)$/);
    if (request.method !== "POST" || !match) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }

    const toolName = decodeURIComponent(match[1]);
    const body = await readJson(request);
    calls.push({ toolName, body });
    const handler = handlers[toolName];
    if (!handler) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }

    try {
      const result = await handler(body);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  return {
    calls,
    port: await listen(server),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

export async function startMcpSidecar({ bridgePort, mcpPort, token }) {
  const child = spawn(process.execPath, ["dist/mcp/server.js"], {
    env: {
      ...process.env,
      MUSICAL_MCP_BRIDGE_URL: `http://127.0.0.1:${bridgePort}`,
      MUSICAL_MCP_PORT: String(mcpPort),
      MUSICAL_MCP_TOKEN: token,
      MUSICAL_MCP_VERSION: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`MCP sidecar did not start. stderr: ${stderr}`));
    }, 5000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("musical mcp sidecar listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`MCP sidecar exited early with ${code}. stderr: ${stderr}`));
    });
  });

  return {
    child,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill();
      }
      await once(child, "exit").catch(() => undefined);
    },
  };
}

export function assertToolResultTextIncludes(result, text) {
  assert.equal(result.content?.[0]?.type, "text");
  assert.match(result.content[0].text, text);
}
