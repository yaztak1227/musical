import { createMCPClient } from "@ai-sdk/mcp";
import { createFakeBridge, reservePort, startMcpSidecar } from "../tests/mcp/helpers.mjs";

const token = `smoke-${Date.now()}`;
const bridge = await createFakeBridge({
  token,
  handlers: {
    get_player_state: () => ({ state: null }),
  },
});
const mcpPort = await reservePort();
const sidecar = await startMcpSidecar({ bridgePort: bridge.port, mcpPort, token });

try {
  const client = await createMCPClient({
    transport: {
      type: "http",
      url: `http://127.0.0.1:${mcpPort}/mcp`,
    },
  });
  try {
    const list = await client.listTools();
    if (!list.tools.some((tool) => tool.name === "get_player_state")) {
      throw new Error("get_player_state was not listed");
    }
    const tools = await client.tools();
    if (!("get_player_state" in tools)) {
      throw new Error("AI SDK tool conversion did not include get_player_state");
    }
    const result = await client.callTool({ name: "get_player_state", arguments: {} });
    if (result.isError || result.structuredContent?.state !== null) {
      throw new Error(`unexpected tool result: ${JSON.stringify(result)}`);
    }
    console.log(`AI SDK MCP smoke passed with ${list.tools.length} tools.`);
  } finally {
    await client.close();
  }
} finally {
  await sidecar.stop();
  await bridge.close();
}
