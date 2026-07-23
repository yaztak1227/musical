import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { BridgeClient } from "./bridgeClient.js";
import { musicalTools } from "./tools/catalog.js";
import { errorToolResult, successToolResult } from "./results.js";

const port = Number(process.env.MUSICAL_MCP_PORT ?? 0);
const bridgeBaseUrl = process.env.MUSICAL_MCP_BRIDGE_URL ?? "http://127.0.0.1:1422";
const token = process.env.MUSICAL_MCP_TOKEN ?? "";

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("MUSICAL_MCP_PORT must be a valid TCP port");
}

if (!token) {
  throw new Error("MUSICAL_MCP_TOKEN is required");
}

const bridgeClient = new BridgeClient({ baseUrl: bridgeBaseUrl, token });
const serverVersion = process.env.MUSICAL_MCP_VERSION ?? "0.0.0";

if (process.env.MUSICAL_MCP_PARENT_WATCHDOG === "stdin") {
  const exitWhenParentPipeCloses = () => process.exit(0);
  process.stdin.once("end", exitWhenParentPipeCloses);
  process.stdin.once("close", exitWhenParentPipeCloses);
  process.stdin.once("error", exitWhenParentPipeCloses);
  process.stdin.resume();
}

type McpSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, McpSession>();

function registerMusicalTools(server: McpServer) {
  for (const tool of musicalTools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        _meta: {
          "musical/modelVisible": tool.modelVisible,
          "musical/risk": tool.risk,
        },
      },
      async (args: unknown) => {
        try {
          return successToolResult(await bridgeClient.callTool(tool.name, args));
        } catch (error) {
          return errorToolResult(error instanceof Error ? error.message : String(error));
        }
      },
    );
  }
}

async function createMcpSession() {
  const server = new McpServer({
    name: "musical",
    version: serverVersion,
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: randomUUID,
    onsessionclosed: (sessionId) => {
      sessions.delete(sessionId);
    },
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, { server, transport });
    },
  });
  registerMusicalTools(server);
  await server.connect(transport);
  return { server, transport };
}

function isInitializeRequest(value: unknown) {
  if (Array.isArray(value)) {
    return value.some(isInitializeRequest);
  }
  return (
    value !== null &&
    typeof value === "object" &&
    "method" in value &&
    (value as { method?: unknown }).method === "initialize"
  );
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("error", reject);
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function writeJsonRpcError(response: ServerResponse, status: number, code: number, message: string) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

const httpServer = createServer(async (request, response) => {
  if (request.url?.split("?")[0] !== "/mcp") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }

  try {
    const sessionId = Array.isArray(request.headers["mcp-session-id"])
      ? request.headers["mcp-session-id"][0]
      : request.headers["mcp-session-id"];
    const existingSession = sessionId ? sessions.get(sessionId) : undefined;
    if (existingSession) {
      await existingSession.transport.handleRequest(request, response);
      return;
    }

    if (request.method !== "POST") {
      writeJsonRpcError(response, 400, -32000, "Bad Request: Mcp-Session-Id header is required");
      return;
    }

    const parsedBody = await readJsonBody(request);
    if (!isInitializeRequest(parsedBody)) {
      writeJsonRpcError(response, 400, -32000, "Bad Request: Mcp-Session-Id header is required");
      return;
    }

    const session = await createMcpSession();
    await session.transport.handleRequest(request, response, parsedBody);
  } catch (error) {
    if (!response.headersSent) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    response.end(error instanceof Error ? error.message : String(error));
  }
});

httpServer.listen(port, "127.0.0.1", () => {
  process.stdout.write(`musical mcp sidecar listening on 127.0.0.1:${port}\n`);
});

const shutdown = async () => {
  httpServer.close();
  await Promise.all([...sessions.values()].map((session) => session.server.close()));
  sessions.clear();
};

process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
