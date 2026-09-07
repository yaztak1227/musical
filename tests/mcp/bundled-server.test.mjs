import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMCPClient } from "@ai-sdk/mcp";
import { createFakeBridge, reservePort, startMcpSidecar } from "./helpers.mjs";

function stagedNodePath() {
  const targetTriple = {
    darwin: { arm64: "aarch64-apple-darwin", x64: "x86_64-apple-darwin" },
    linux: {
      arm: "armv7-unknown-linux-gnueabihf",
      arm64: "aarch64-unknown-linux-gnu",
      x64: "x86_64-unknown-linux-gnu",
    },
    win32: {
      arm64: "aarch64-pc-windows-msvc",
      ia32: "i686-pc-windows-msvc",
      x64: "x86_64-pc-windows-msvc",
    },
  }[process.platform]?.[process.arch];
  assert.ok(targetTriple, `unsupported staged Node target: ${process.platform}/${process.arch}`);
  const extension = process.platform === "win32" ? ".exe" : "";
  return path.resolve("src-tauri", "binaries", `musical-node-${targetTriple}${extension}`);
}

test("bundled MCP server runs from a clean-room cwd without workspace dependencies", async () => {
  const token = `clean-room-${Date.now()}`;
  const bridge = await createFakeBridge({
    token,
    handlers: {
      get_player_state: () => ({ state: null }),
    },
  });
  const mcpPort = await reservePort();
  const cleanRoom = await mkdtemp(path.join(os.tmpdir(), "musical-mcp-clean-room-"));
  const scriptPath = path.resolve("dist-mcp/server.mjs");
  const nodePath = stagedNodePath();
  await access(nodePath);
  const sidecar = await startMcpSidecar({
    bridgePort: bridge.port,
    cwd: cleanRoom,
    mcpPort,
    nodePath,
    scriptPath,
    token,
  });
  const client = await createMCPClient({
    transport: { type: "http", url: `http://127.0.0.1:${mcpPort}/mcp` },
  });

  try {
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 51);
    const result = await client.callTool({ name: "get_player_state", arguments: {} });
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent, { state: null });
    assert.deepEqual(bridge.calls, [{ toolName: "get_player_state", body: { arguments: {} } }]);
  } finally {
    await client.close();
    await sidecar.stop();
    await bridge.close();
    await rm(cleanRoom, { recursive: true, force: true });
  }
});
