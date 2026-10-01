import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { BridgeClient } from "../../dist/mcp/bridgeClient.js";

async function startResponseServer(status, body, contentType = "text/plain; charset=utf-8") {
  const server = createServer((_request, response) => {
    response.writeHead(status, { "Content-Type": contentType });
    response.end(body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

function serverPort(server) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return address.port;
}

async function closeServer(server) {
  server.close();
  await once(server, "close");
}

test("BridgeClient preserves a text/plain HTTP error body", async () => {
  const server = await startResponseServer(500, "plain bridge failure");
  const client = new BridgeClient({ baseUrl: `http://127.0.0.1:${serverPort(server)}`, token: "test" });

  try {
    await assert.rejects(
      () => client.callTool("get_library", {}),
      (error) => {
        assert.equal(error.message, "plain bridge failure");
        assert.doesNotMatch(error.message, /SyntaxError|Unexpected token/);
        return true;
      },
    );
  } finally {
    await closeServer(server);
  }
});

test("BridgeClient uses the error field from a JSON HTTP error object", async () => {
  const server = await startResponseServer(
    500,
    JSON.stringify({ error: "structured bridge failure" }),
    "application/json; charset=utf-8",
  );
  const client = new BridgeClient({ baseUrl: `http://127.0.0.1:${serverPort(server)}`, token: "test" });

  try {
    await assert.rejects(() => client.callTool("get_library", {}), (error) => {
      assert.equal(error.message, "structured bridge failure");
      return true;
    });
  } finally {
    await closeServer(server);
  }
});

test("BridgeClient falls back to the HTTP status for an empty error body", async () => {
  const server = await startResponseServer(503, "");
  const client = new BridgeClient({ baseUrl: `http://127.0.0.1:${serverPort(server)}`, token: "test" });

  try {
    await assert.rejects(() => client.callTool("get_library", {}), (error) => {
      assert.equal(error.message, "Musical bridge request failed with HTTP 503");
      return true;
    });
  } finally {
    await closeServer(server);
  }
});
