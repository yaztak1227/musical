import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { errorToolResult, redactHomePath, successToolResult } from "../../dist/mcp/results.js";

test("successToolResult uses structuredContent as the canonical payload", () => {
  const value = { state: null, tracks: [{ id: "track-1" }] };
  assert.deepEqual(successToolResult(value), {
    content: [],
    structuredContent: value,
    isError: false,
  });
});

test("successToolResult rejects values that cannot be advertised as an object output", () => {
  for (const value of [null, undefined, "text", 1, true, [], [{ id: "track-1" }]]) {
    assert.throws(() => successToolResult(value), /must be a JSON object/);
  }
});

test("errorToolResult keeps a human-readable text content block", () => {
  assert.deepEqual(errorToolResult("library unavailable"), {
    content: [{ type: "text", text: "library unavailable" }],
    isError: true,
  });
});

test("errorToolResult redacts the home directory without changing URLs or error keys", () => {
  const home = homedir();
  const message = `failed to read ${home}/Music/secret.mp3 (library.error)`;
  const result = errorToolResult(message);

  assert.equal(result.content[0].text, "failed to read [home]/Music/secret.mp3 (library.error)");
  assert.equal(result.content[0].text.includes(home), false);
  assert.equal(
    errorToolResult(`see https://example.com${home}/Music`).content[0].text,
    `see https://example.com${home}/Music`,
  );
  assert.equal(errorToolResult("library.error: unavailable").content[0].text, "library.error: unavailable");
});

test("redaction handles Windows separator and verbatim-prefix variants", () => {
  const home = "C:\\Users\\takumi";
  assert.equal(
    redactHomePath(`failed ${home}\\Music\\secret.mp3`, home),
    "failed [home]\\Music\\secret.mp3",
  );
  assert.equal(
    redactHomePath("failed \\\\?\\C:\\Users\\takumi\\Music\\secret.mp3", home),
    "failed [home]\\Music\\secret.mp3",
  );
  assert.equal(
    redactHomePath("failed //?/C:/Users/takumi/Music/secret.mp3", home),
    "failed [home]/Music/secret.mp3",
  );
  assert.equal(
    redactHomePath("failed c:\\USERS\\TAKUMI\\Music\\secret.mp3", home),
    "failed [home]\\Music\\secret.mp3",
  );

  const uncHome = "\\\\Server\\Share\\Takumi";
  assert.equal(
    redactHomePath("failed \\\\server\\share\\takumi\\Music\\secret.mp3", uncHome),
    "failed [home]\\Music\\secret.mp3",
  );
  assert.equal(
    redactHomePath("failed \\\\?\\unc\\server\\share\\takumi\\Music\\secret.mp3", uncHome),
    "failed [home]\\Music\\secret.mp3",
  );
});

test("redaction protects network URLs but redacts file URLs", () => {
  const home = "/Users/takumi";
  assert.equal(
    redactHomePath("see https://example.com/Users/takumi/Music", home),
    "see https://example.com/Users/takumi/Music",
  );
  assert.equal(
    redactHomePath("see file:///Users/takumi/Music", home),
    "see file:///[home]/Music",
  );
});
