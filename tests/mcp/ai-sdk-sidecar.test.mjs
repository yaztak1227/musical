import test from "node:test";
import assert from "node:assert/strict";
import { createMCPClient } from "@ai-sdk/mcp";
import {
  assertToolResultTextIncludes,
  createFakeBridge,
  reservePort,
  startMcpSidecar,
} from "./helpers.mjs";

test("sidecar exits when its parent lifecycle pipe closes", async () => {
  const token = `test-${Date.now()}`;
  const bridge = await createFakeBridge({ token, handlers: {} });
  const mcpPort = await reservePort();
  const sidecar = await startMcpSidecar({
    bridgePort: bridge.port,
    mcpPort,
    parentWatchdog: true,
    token,
  });

  try {
    sidecar.child.stdin.end();
    let timeout;
    const exitCode = await Promise.race([
      new Promise((resolve) => sidecar.child.once("exit", resolve)),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("MCP sidecar remained after its parent pipe closed")),
          2000,
        );
      }),
    ]).finally(() => clearTimeout(timeout));
    assert.equal(exitCode, 0);
  } finally {
    await sidecar.stop();
    await bridge.close();
  }
});

test("AI SDK V7 client discovers tools and receives structuredContent", async () => {
  const token = `test-${Date.now()}`;
  const bridge = await createFakeBridge({
    token,
    handlers: {
      get_player_state: () => ({ state: null }),
    },
  });
  const mcpPort = await reservePort();
  const sidecar = await startMcpSidecar({ bridgePort: bridge.port, mcpPort, token });
  const client = await createMCPClient({
    transport: { type: "http", url: `http://127.0.0.1:${mcpPort}/mcp` },
  });

  try {
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 51);
    assert.ok(listed.tools.some((tool) => tool.name === "get_player_state"));

    const tools = await client.tools();
    assert.ok("get_player_state" in tools);

    const result = await client.callTool({ name: "get_player_state", arguments: {} });
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent, { state: null });
    assert.deepEqual(bridge.calls, [{ toolName: "get_player_state", body: { arguments: {} } }]);
  } finally {
    await client.close();
    await sidecar.stop();
    await bridge.close();
  }
});

test("sidecar supports repeated independent MCP client initialization", async () => {
  const token = `test-${Date.now()}`;
  const bridge = await createFakeBridge({
    token,
    handlers: {
      get_player_state: () => ({ state: null }),
    },
  });
  const mcpPort = await reservePort();
  const sidecar = await startMcpSidecar({ bridgePort: bridge.port, mcpPort, token });
  let client1;
  let client2;

  try {
    client1 = await createMCPClient({
      transport: { type: "http", url: `http://127.0.0.1:${mcpPort}/mcp` },
    });
    const listed1 = await client1.listTools();
    assert.equal(listed1.tools.length, 51);

    client2 = await createMCPClient({
      transport: { type: "http", url: `http://127.0.0.1:${mcpPort}/mcp` },
    });
    const listed2 = await client2.listTools();
    assert.equal(listed2.tools.length, 51);
    const result = await client2.callTool({ name: "get_player_state", arguments: {} });
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent, { state: null });
  } finally {
    await client2?.close();
    await client1?.close();
    await sidecar.stop();
    await bridge.close();
  }
});

test("sidecar forwards tool arguments to the protected Musical bridge", async () => {
  const token = `test-${Date.now()}`;
  const bridge = await createFakeBridge({
    token,
    handlers: {
      search_library: ({ arguments: args }) => ({ query: args.query.toLowerCase(), results: [] }),
    },
  });
  const mcpPort = await reservePort();
  const sidecar = await startMcpSidecar({ bridgePort: bridge.port, mcpPort, token });
  const client = await createMCPClient({
    transport: { type: "http", url: `http://127.0.0.1:${mcpPort}/mcp` },
  });

  try {
    const result = await client.callTool({
      name: "search_library",
      arguments: { query: "Miles", limit: 5 },
    });
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent, { query: "miles", results: [] });
    assert.deepEqual(bridge.calls, [
      { toolName: "search_library", body: { arguments: { query: "Miles", limit: 5 } } },
    ]);
  } finally {
    await client.close();
    await sidecar.stop();
    await bridge.close();
  }
});

test("sidecar forwards track lyrics analysis and returns structuredContent", async () => {
  const token = `test-${Date.now()}`;
  const bridge = await createFakeBridge({
    token,
    handlers: {
      get_track_lyrics_analysis: ({ arguments: args }) => ({
        trackId: args.trackId,
        lyricsHash: "fixture-hash",
        sentiment: { score: null, label: "unknown", coverage: 0 },
        blocks: [],
      }),
    },
  });
  const mcpPort = await reservePort();
  const sidecar = await startMcpSidecar({ bridgePort: bridge.port, mcpPort, token });
  const client = await createMCPClient({
    transport: { type: "http", url: `http://127.0.0.1:${mcpPort}/mcp` },
  });

  try {
    const result = await client.callTool({
      name: "get_track_lyrics_analysis",
      arguments: { trackId: "track-1" },
    });
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent, {
      trackId: "track-1",
      lyricsHash: "fixture-hash",
      sentiment: { score: null, label: "unknown", coverage: 0 },
      blocks: [],
    });
    assert.deepEqual(bridge.calls, [
      {
        toolName: "get_track_lyrics_analysis",
        body: { arguments: { trackId: "track-1" } },
      },
    ]);
  } finally {
    await client.close();
    await sidecar.stop();
    await bridge.close();
  }
});

test("sidecar forwards lyrics mood search and playback results as structuredContent", async () => {
  const token = `test-${Date.now()}`;
  const bridge = await createFakeBridge({
    token,
    handlers: {
      search_lyrics_by_mood: ({ arguments: args }) => ({
        status: "ok",
        interpretedPrompt: args.prompt,
        querySentiment: { score: -0.4, label: "negative", coverage: 0.8 },
        totalDurationSeconds: 0,
        results: [],
      }),
      play_lyrics_by_mood: ({ arguments: args }) => ({
        status: "playing",
        interpretedPrompt: args.prompt,
        querySentiment: { score: 0.5, label: "positive", coverage: 0.7 },
        totalDurationSeconds: 210,
        results: [
          {
            trackId: "track-1",
            title: "Fixture",
            artist: "Artist",
            albumTitle: "Album",
            durationSeconds: 210,
            matchedText: "a short lyric excerpt",
            reason: "The saved lyrics contain a semantically similar passage.",
            sentiment: { score: 0.5, label: "positive", coverage: 0.7 },
          },
        ],
        command: { id: 1, commandType: "set-queue" },
      }),
    },
  });
  const mcpPort = await reservePort();
  const sidecar = await startMcpSidecar({ bridgePort: bridge.port, mcpPort, token });
  const client = await createMCPClient({
    transport: { type: "http", url: `http://127.0.0.1:${mcpPort}/mcp` },
  });

  try {
    const search = await client.callTool({
      name: "search_lyrics_by_mood",
      arguments: { prompt: "失恋した夜", moodStrength: "strong", limit: 5 },
    });
    assert.equal(search.isError, false);
    assert.deepEqual(search.structuredContent, {
      status: "ok",
      interpretedPrompt: "失恋した夜",
      querySentiment: { score: -0.4, label: "negative", coverage: 0.8 },
      totalDurationSeconds: 0,
      results: [],
    });

    const play = await client.callTool({
      name: "play_lyrics_by_mood",
      arguments: { prompt: "前向きになれる歌詞", durationMinutes: 30, limit: 1 },
    });
    assert.equal(play.isError, false);
    assert.equal(play.structuredContent.status, "playing");
    assert.deepEqual(play.structuredContent.command, { id: 1, commandType: "set-queue" });
    assert.deepEqual(bridge.calls, [
      {
        toolName: "search_lyrics_by_mood",
        body: { arguments: { prompt: "失恋した夜", moodStrength: "strong", limit: 5 } },
      },
      {
        toolName: "play_lyrics_by_mood",
        body: { arguments: { prompt: "前向きになれる歌詞", durationMinutes: 30, limit: 1 } },
      },
    ]);
  } finally {
    await client.close();
    await sidecar.stop();
    await bridge.close();
  }
});

test("sidecar returns MCP tool errors when bridge execution fails", async () => {
  const token = `test-${Date.now()}`;
  const bridge = await createFakeBridge({
    token,
    handlers: {
      get_library: () => {
        throw new Error("library unavailable");
      },
    },
  });
  const mcpPort = await reservePort();
  const sidecar = await startMcpSidecar({ bridgePort: bridge.port, mcpPort, token });
  const client = await createMCPClient({
    transport: { type: "http", url: `http://127.0.0.1:${mcpPort}/mcp` },
  });

  try {
    const result = await client.callTool({ name: "get_library", arguments: {} });
    assert.equal(result.isError, true);
    assertToolResultTextIncludes(result, /library unavailable/);
  } finally {
    await client.close();
    await sidecar.stop();
    await bridge.close();
  }
});
