import test from "node:test";
import assert from "node:assert/strict";
import { musicalTools } from "../../dist/mcp/tools/catalog.js";

test("MCP tool catalog exposes the expected tools once", () => {
  const names = musicalTools.map((tool) => tool.name);
  assert.equal(names.length, 43);
  assert.deepEqual([...new Set(names)], names);
  assert.deepEqual(
    names.slice(0, 4),
    ["get_player_state", "get_library", "search_library", "get_track_lyrics"],
  );
  assert.ok(names.includes("create_playlist"));
  assert.ok(names.includes("add_track_to_playlist"));
  assert.ok(names.includes("create_playlist_from_album"));
  assert.ok(names.includes("list_albums"));
  assert.ok(names.includes("list_tracks"));
  assert.ok(names.includes("get_queue"));
  assert.ok(names.includes("set_queue"));
  assert.ok(names.includes("play_search"));
  assert.ok(names.includes("get_favorites"));
});

test("MCP catalog validates representative tool inputs", () => {
  const byName = new Map(musicalTools.map((tool) => [tool.name, tool]));

  assert.deepEqual(byName.get("search_library").inputSchema.parse({ query: "jazz", limit: 10 }), {
    query: "jazz",
    limit: 10,
  });
  assert.throws(() => byName.get("search_library").inputSchema.parse({ query: "", limit: 101 }));

  assert.deepEqual(byName.get("set_repeat").inputSchema.parse({ repeatMode: "one" }), {
    repeatMode: "one",
  });
  assert.throws(() => byName.get("set_repeat").inputSchema.parse({ repeatMode: "forever" }));

  assert.deepEqual(
    byName.get("update_track_user_state").inputSchema.parse({
      trackId: "track-1",
      isFavorite: true,
      rating: null,
    }),
    { trackId: "track-1", isFavorite: true, rating: null },
  );
});

test("mutation tools are classified as non-read risk", () => {
  const byName = new Map(musicalTools.map((tool) => [tool.name, tool]));
  assert.equal(byName.get("get_library").risk, "read");
  assert.equal(byName.get("play").risk, "playback");
  assert.equal(byName.get("create_playlist").risk, "library-mutation");
  assert.equal(byName.get("update_track_artwork").risk, "file-mutation");
});
