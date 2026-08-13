import test from "node:test";
import assert from "node:assert/strict";
import { musicalTools } from "../../dist/mcp/tools/catalog.js";

test("MCP tool catalog exposes the expected tools once", () => {
  const names = musicalTools.map((tool) => tool.name);
  assert.equal(names.length, 51);
  assert.deepEqual([...new Set(names)], names);
  assert.deepEqual(
    names.slice(0, 5),
    [
      "get_player_state",
      "get_library",
      "search_library",
      "get_track_lyrics",
      "get_track_lyrics_analysis",
    ],
  );
  assert.ok(names.includes("create_playlist"));
  assert.ok(names.includes("add_track_to_playlist"));
  assert.ok(names.includes("delete_playlist"));
  assert.ok(names.includes("create_playlist_from_album"));
  assert.ok(names.includes("list_albums"));
  assert.ok(names.includes("list_tracks"));
  assert.ok(names.includes("get_queue"));
  assert.ok(names.includes("set_queue"));
  assert.ok(names.includes("play_search"));
  assert.ok(names.includes("get_favorites"));
  assert.ok(names.includes("get_search_index_status"));
  assert.ok(names.includes("build_search_index"));
  assert.ok(names.includes("search_tracks"));
  assert.ok(names.includes("recommend_tracks"));
  assert.ok(names.includes("search_lyrics_by_mood"));
  assert.ok(names.includes("play_lyrics_by_mood"));
  assert.ok(names.includes("get_track_lyrics_analysis"));

  const byName = new Map(musicalTools.map((tool) => [tool.name, tool]));
  for (const name of ["search_lyrics_by_mood", "play_lyrics_by_mood"]) {
    const description = byName.get(name).description;
    assert.match(description, /bounded topic-aware ranking/i);
    assert.match(description, /explicit grief, elegy, mourning, or bereavement/i);
    assert.match(description, /loss\/separation with sorrow/i);
    assert.match(description, /duplicate lyrical variants/i);
    assert.match(description, /generic sad-song prompt, generic mood, and relativeToCurrent remain unchanged/i);
  }
  assert.match(byName.get("search_lyrics_by_mood").description, /search_library/i);
  assert.match(byName.get("play_lyrics_by_mood").description, /play_search/i);
});

test("MCP catalog validates representative tool inputs", () => {
  const byName = new Map(musicalTools.map((tool) => [tool.name, tool]));

  assert.deepEqual(byName.get("search_library").inputSchema.parse({ query: "jazz", limit: 10 }), {
    query: "jazz",
    limit: 10,
  });
  assert.throws(() => byName.get("search_library").inputSchema.parse({ query: "", limit: 101 }));

  assert.deepEqual(
    byName.get("search_tracks").inputSchema.parse({
      query: "雨の夜",
      mode: "hybrid",
      target: "lyrics",
      sentimentWeight: 0.3,
      limit: 12,
    }),
    {
      query: "雨の夜",
      mode: "hybrid",
      target: "lyrics",
      sentimentWeight: 0.3,
      limit: 12,
    },
  );
  assert.throws(() =>
    byName.get("search_tracks").inputSchema.parse({ query: "mood", mode: "approximate" }),
  );

  assert.deepEqual(
    byName.get("search_lyrics_by_mood").inputSchema.parse({
      prompt: "  失恋した夜  ",
      moodStrength: "strong",
      artist: "  Artist  ",
      excludeTrackIds: ["track-1"],
      relativeToCurrent: "darker",
      limit: 20,
    }),
    {
      prompt: "失恋した夜",
      moodStrength: "strong",
      artist: "Artist",
      excludeTrackIds: ["track-1"],
      relativeToCurrent: "darker",
      limit: 20,
    },
  );
  assert.throws(() => byName.get("search_lyrics_by_mood").inputSchema.parse({ prompt: "   " }));
  assert.throws(() =>
    byName.get("search_lyrics_by_mood").inputSchema.parse({ prompt: "a".repeat(501) }),
  );
  assert.throws(() =>
    byName.get("search_lyrics_by_mood").inputSchema.parse({
      prompt: "mood",
      moodStrength: "loud",
    }),
  );
  assert.throws(() =>
    byName.get("search_lyrics_by_mood").inputSchema.parse({ prompt: "mood", limit: 21 }),
  );

  assert.deepEqual(
    byName.get("play_lyrics_by_mood").inputSchema.parse({
      prompt: "前向きになれる歌詞",
      moodStrength: "balanced",
      avoidTrackIds: ["track-2"],
      durationMinutes: 30,
      maxTracksPerArtist: 2,
      limit: 100,
    }),
    {
      prompt: "前向きになれる歌詞",
      moodStrength: "balanced",
      avoidTrackIds: ["track-2"],
      durationMinutes: 30,
      maxTracksPerArtist: 2,
      limit: 100,
    },
  );
  assert.throws(() =>
    byName.get("play_lyrics_by_mood").inputSchema.parse({
      prompt: "mood",
      relativeToCurrent: "same",
    }),
  );
  assert.throws(() =>
    byName.get("play_lyrics_by_mood").inputSchema.parse({
      prompt: "mood",
      durationMinutes: 1441,
    }),
  );
  assert.equal("sentimentWeight" in byName.get("search_lyrics_by_mood").inputSchema.shape, false);
  assert.equal("sentimentWeight" in byName.get("play_lyrics_by_mood").inputSchema.shape, false);
  assert.throws(() =>
    byName.get("search_tracks").inputSchema.parse({ query: "mood", sentimentWeight: -0.01 }),
  );

  assert.deepEqual(
    byName.get("recommend_tracks").inputSchema.parse({
      prompt: "quiet rainy night",
      durationMinutes: 45,
      maxTracksPerArtist: 2,
      sentimentWeight: 0.15,
    }),
    {
      prompt: "quiet rainy night",
      durationMinutes: 45,
      maxTracksPerArtist: 2,
      sentimentWeight: 0.15,
    },
  );
  assert.throws(() =>
    byName.get("recommend_tracks").inputSchema.parse({
      prompt: "quiet rainy night",
      sentimentWeight: 0.31,
    }),
  );

  assert.deepEqual(
    byName.get("get_track_lyrics_analysis").inputSchema.parse({ trackId: "track-1" }),
    { trackId: "track-1" },
  );
  assert.throws(() =>
    byName.get("get_track_lyrics_analysis").inputSchema.parse({ trackId: "" }),
  );

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
  assert.equal(byName.get("get_track_lyrics_analysis").risk, "read");
  assert.equal(byName.get("get_track_lyrics_analysis").modelVisible, true);
  assert.equal(byName.get("play").risk, "playback");
  assert.equal(byName.get("search_lyrics_by_mood").risk, "read");
  assert.equal(byName.get("search_lyrics_by_mood").modelVisible, true);
  assert.equal(byName.get("play_lyrics_by_mood").risk, "playback");
  assert.equal(byName.get("play_lyrics_by_mood").modelVisible, true);
  assert.equal(byName.get("build_search_index").risk, "library-mutation");
  assert.equal(byName.get("create_playlist").risk, "library-mutation");
  assert.equal(byName.get("delete_playlist").risk, "library-mutation");
  assert.equal(byName.get("update_track_artwork").risk, "file-mutation");
});
