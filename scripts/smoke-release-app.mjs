import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const LOCAL_SERVER_URL = "http://127.0.0.1:1422";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_TIMEOUT_MS = 20_000;

function parseArguments(argv) {
  const values = { executable: undefined, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (const argument of argv) {
    if (argument.startsWith("--executable=")) {
      values.executable = argument.slice("--executable=".length);
    } else if (argument.startsWith("--timeout-ms=")) {
      values.timeoutMs = Number(argument.slice("--timeout-ms=".length));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!values.executable) throw new Error("--executable=/path/to/musical is required.");
  if (!Number.isFinite(values.timeoutMs) || values.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number.");
  }
  values.executable = path.resolve(values.executable);
  return values;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isPortOpen(port) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(300);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function parseJsonRpcResponse(body, contentType, expectedId) {
  const candidates = contentType.toLowerCase().includes("text/event-stream")
    ? body
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .filter(Boolean)
    : [body.trim()];
  const messages = candidates.map((candidate) => JSON.parse(candidate));
  const response = messages.find(
    (message) => message?.jsonrpc === "2.0" && message.id === expectedId,
  );
  if (!response) throw new Error(`MCP response for request ${expectedId} was missing.`);
  if (response.error) throw new Error(`MCP request ${expectedId} failed: ${JSON.stringify(response.error)}`);
  return response.result;
}

async function waitForLocalServer(getChildOutcome, deadline) {
  let lastError;
  while (Date.now() < deadline) {
    const exited = getChildOutcome();
    if (exited) throw new Error(`Musical exited before the local server was ready (${exited}).`);
    try {
      const response = await fetch(`${LOCAL_SERVER_URL}/api/mcp-settings`, {
        signal: AbortSignal.timeout(750),
      });
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(
    `Musical local server did not become ready: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function postJson(pathname, body, headers = {}) {
  const response = await fetch(`${LOCAL_SERVER_URL}${pathname}`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`${pathname} returned HTTP ${response.status}: ${responseBody.slice(0, 500)}`);
  }
  return { body: responseBody, headers: response.headers, status: response.status };
}

async function verifyMcpBridge() {
  const initialized = await postJson("/mcp", {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "musical-release-app-smoke", version: "1.0.0" },
    },
  });
  const sessionId = initialized.headers.get("mcp-session-id")?.trim();
  if (!sessionId) throw new Error("MCP initialize response did not include mcp-session-id.");
  parseJsonRpcResponse(initialized.body, initialized.headers.get("content-type") ?? "", 1);

  const sessionHeaders = {
    "Mcp-Protocol-Version": MCP_PROTOCOL_VERSION,
    "Mcp-Session-Id": sessionId,
  };
  await postJson(
    "/mcp",
    { jsonrpc: "2.0", method: "notifications/initialized" },
    sessionHeaders,
  );
  const toolsResponse = await postJson(
    "/mcp",
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    sessionHeaders,
  );
  const toolsResult = parseJsonRpcResponse(
    toolsResponse.body,
    toolsResponse.headers.get("content-type") ?? "",
    2,
  );
  if (!Array.isArray(toolsResult?.tools) || toolsResult.tools.length === 0) {
    throw new Error("MCP tools/list returned no tools.");
  }
  if (!toolsResult.tools.some((tool) => tool?.name === "get_player_state")) {
    throw new Error("MCP tools/list did not include get_player_state.");
  }

  const callResponse = await postJson(
    "/mcp",
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_player_state", arguments: {} },
    },
    sessionHeaders,
  );
  const callResult = parseJsonRpcResponse(
    callResponse.body,
    callResponse.headers.get("content-type") ?? "",
    3,
  );
  if (callResult?.isError || !Array.isArray(callResult?.content) || callResult.content.length === 0) {
    throw new Error("MCP get_player_state did not return a successful content result.");
  }
  return toolsResult.tools.length;
}

async function terminateExactChild(child, childExit) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  const stopped = await Promise.race([childExit.then(() => true), delay(3_000).then(() => false)]);
  if (stopped) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
  } else {
    child.kill("SIGKILL");
  }
  await Promise.race([childExit, delay(3_000)]);
}

async function main() {
  const { executable, timeoutMs } = parseArguments(process.argv.slice(2));
  if (!existsSync(executable)) throw new Error(`Release executable does not exist: ${executable}`);
  if (await isPortOpen(1422)) {
    throw new Error("Port 1422 is already in use; refusing to test against an unrelated Musical process.");
  }

  let stdout = "";
  let stderr = "";
  const child = spawn(executable, [], {
    cwd: path.dirname(executable),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => {
    stdout = `${stdout}${chunk}`.slice(-8_000);
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });
  let childOutcome;
  const childExit = new Promise((resolve) => {
    child.once("error", (error) => {
      childOutcome = `launch error=${error.message}`;
      resolve(childOutcome);
    });
    child.once("exit", (code, signal) => {
      childOutcome = `code=${code}, signal=${signal ?? "none"}`;
      resolve(childOutcome);
    });
  });

  let enabledBySmoke = false;
  let primaryFailure;
  let toolCount;
  try {
    const deadline = Date.now() + timeoutMs;
    const settings = await waitForLocalServer(() => childOutcome, deadline);
    if (!settings.enabled) {
      await postJson("/api/mcp-settings", { enabled: true });
      enabledBySmoke = true;
    }
    toolCount = await verifyMcpBridge();
  } catch (error) {
    primaryFailure = new Error(
      `${error instanceof Error ? error.message : String(error)}\nstdout: ${stdout}\nstderr: ${stderr}`,
    );
  } finally {
    let cleanupFailure;
    try {
      if (enabledBySmoke) {
        await postJson("/api/mcp-settings", { enabled: false });
      }
    } catch {
      // Process termination below remains the authoritative cleanup path.
    }
    try {
      await terminateExactChild(child, childExit);
      const ports = [1422];
      const sidecarPort = Number(stdout.match(/MCP sidecar started on 127\.0\.0\.1:(\d+)/)?.[1]);
      if (Number.isInteger(sidecarPort)) ports.push(sidecarPort);
      const cleanupDeadline = Date.now() + 5_000;
      while ((await Promise.all(ports.map(isPortOpen))).some(Boolean) && Date.now() < cleanupDeadline) {
        await delay(100);
      }
      const openPorts = [];
      const finalPortStates = await Promise.all(ports.map(isPortOpen));
      for (let index = 0; index < ports.length; index += 1) {
        if (finalPortStates[index]) openPorts.push(ports[index]);
      }
      if (openPorts.length > 0) {
        throw new Error(`Musical still owns port(s) ${openPorts.join(", ")} after smoke cleanup.`);
      }
    } catch (error) {
      cleanupFailure = error instanceof Error ? error : new Error(String(error));
    }
    if (primaryFailure && cleanupFailure) {
      primaryFailure.message = `${primaryFailure.message}\ncleanup: ${cleanupFailure.message}`;
    } else if (!primaryFailure && cleanupFailure) {
      throw cleanupFailure;
    }
  }
  if (primaryFailure) throw primaryFailure;
  process.stdout.write(`Release app MCP smoke passed: executable=${executable}, tools=${toolCount}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
