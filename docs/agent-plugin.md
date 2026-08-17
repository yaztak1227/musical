# Agent Plugins 1.0

The repository root is an [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/bd383552095128f6effe895b9257cfd580a6d179/spec/1.0.0.md) package that exposes Musical's local MCP endpoint.

## Portable package

- `plugin.json` declares the plugin identity and targets the canonical Agent Plugins `1.0.0` manifest schema.
- `mcp.json` declares the Musical MCP server as Streamable HTTP at `http://127.0.0.1:1422/mcp`.
- `plugin.json.version` tracks the Musical release version. It is separate from the Agent Plugins specification version declared by `$schema`.

The package does not embed credentials. `mcp.json` declares only the loopback URL, Musical rejects non-loopback requests to `/mcp`, and the internal sidecar connection bypasses system HTTP proxies.

## Use the plugin

1. Start the real Musical desktop app.
2. Open the sidebar's Settings section and enable the MCP server.
3. Load this repository root as a directory plugin in an Agent Plugins client that supports Streamable HTTP MCP servers.

The app must remain running while the client uses Musical tools. If the app is stopped or MCP is disabled, the plugin remains valid but the MCP connection is unavailable.

## Validate changes

Run the repository-level conformance checks:

```bash
npm run test:agent-plugin
```

`npm run build` runs the same checks before compiling. When the Musical release version changes, update `plugin.json.version` together with the other application version files.

The test validates both files with the official Draft 2020-12 schemas pinned from Agent Plugins specification commit `bd383552095128f6effe895b9257cfd580a6d179`. It also checks package-path containment, schema-version agreement, Musical version/port agreement, and loopback URL semantics without requiring network access.
