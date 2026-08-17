import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const PLUGIN_SCHEMA_PATH = "tests/agent-plugin/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA_PATH = "tests/agent-plugin/schemas/1.0.0/mcp.schema.json";
const PLUGIN_SCHEMA_SHA256 = "0a4aad95ce337878ad38802ebf0daa3fde76abe3f65400c86bcbb1ec0b3ab883";
const MCP_SCHEMA_SHA256 = "6539175bfcdf43085855183e86da40ea94b166547a72b47ae9a0a390516d3acb";
const PLUGIN_ROOT = await realpath(new URL("../", import.meta.url));

function isWithinPluginRoot(resolvedPath) {
  const relativePath = relative(PLUGIN_ROOT, resolvedPath);
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

async function resolvePackageFile(path) {
  const candidate = new URL(`../${path}`, import.meta.url);
  const [entry, resolvedPath] = await Promise.all([lstat(candidate), realpath(candidate)]);
  assert.equal(
    entry.isFile() || entry.isSymbolicLink(),
    true,
    `${path} must resolve from a file entry at its fixed package location`,
  );
  assert.equal(isWithinPluginRoot(resolvedPath), true, `${path} must resolve within the plugin root`);
  assert.equal((await stat(resolvedPath)).isFile(), true, `${path} must resolve to a regular file`);
  return resolvedPath;
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function readText(path) {
  return readFile(await resolvePackageFile(path), "utf8");
}

async function readPinnedSchema(path, expectedSha256) {
  const source = await readText(path);
  assert.equal(createHash("sha256").update(source).digest("hex"), expectedSha256, `${path} must stay pinned`);
  return JSON.parse(source);
}

const validators = Promise.all([
  readPinnedSchema(PLUGIN_SCHEMA_PATH, PLUGIN_SCHEMA_SHA256),
  readPinnedSchema(MCP_SCHEMA_PATH, MCP_SCHEMA_SHA256),
]).then(([pluginSchema, mcpSchema]) => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return {
    validatePlugin: ajv.compile(pluginSchema),
    validateMcp: ajv.compile(mcpSchema),
  };
});

test("plugin.json targets Agent Plugins 1.0.0", async () => {
  const [manifest, packageJson, packageLock, cargoToml, tauriConfig, { validatePlugin }] = await Promise.all([
    readJson("plugin.json"),
    readJson("package.json"),
    readJson("package-lock.json"),
    readText("src-tauri/Cargo.toml"),
    readJson("src-tauri/tauri.conf.json"),
    validators,
  ]);

  assert.equal(validatePlugin(manifest), true, new Ajv2020().errorsText(validatePlugin.errors));
  assert.equal(manifest.$schema, PLUGIN_SCHEMA);
  const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(cargoVersion, "Cargo package version must be discoverable");
  for (const [source, version] of [
    ["package.json", packageJson.version],
    ["package-lock.json", packageLock.version],
    ["src-tauri/Cargo.toml", cargoVersion],
    ["src-tauri/tauri.conf.json", tauriConfig.version],
  ]) {
    assert.equal(manifest.version, version, `plugin version must match ${source}`);
  }
});

test("mcp.json exposes Musical as a portable Streamable HTTP server", async () => {
  const [manifest, mcp, appConfig, { validateMcp }] = await Promise.all([
    readJson("plugin.json"),
    readJson("mcp.json"),
    readText("src-tauri/src/app_config.rs"),
    validators,
  ]);

  assert.equal(validateMcp(mcp), true, new Ajv2020().errorsText(validateMcp.errors));
  assert.equal(mcp.$schema, MCP_SCHEMA);
  assert.equal(manifest.$schema.replace("plugin.schema.json", "mcp.schema.json"), mcp.$schema);
  assert.deepEqual(Object.keys(mcp.mcpServers), ["musical"]);
  assert.equal(mcp.mcpServers.musical.type, "streamable-http");

  const endpoint = new URL(mcp.mcpServers.musical.url);
  const configuredPort = appConfig.match(/LOCAL_SERVER_PORT:\s*u16\s*=\s*(\d+)/)?.[1];
  assert.ok(configuredPort, "Musical local server port must be discoverable");
  assert.equal(endpoint.protocol, "http:");
  assert.equal(endpoint.hostname, "127.0.0.1");
  assert.equal(endpoint.port, configuredPort, "plugin endpoint must follow the Musical local server port");
  assert.equal(endpoint.pathname, "/mcp");
  assert.equal(endpoint.username, "");
  assert.equal(endpoint.password, "");
  assert.equal(endpoint.hash, "");
});

test("official schemas reject non-conformant package fixtures", async () => {
  const [manifest, mcp, { validatePlugin, validateMcp }] = await Promise.all([
    readJson("plugin.json"),
    readJson("mcp.json"),
    validators,
  ]);

  assert.equal(validatePlugin({ ...manifest, name: "Musical" }), false, "uppercase plugin names must fail");
  assert.equal(validatePlugin({ ...manifest, mcpServers: {} }), false, "unknown manifest fields must fail");
  assert.equal(
    validateMcp({
      ...mcp,
      mcpServers: {
        musical: {
          ...mcp.mcpServers.musical,
          command: "node server.js",
        },
      },
    }),
    false,
    "transport variants and unknown fields must stay closed",
  );
});

test("fixed package files cannot resolve outside the plugin root", () => {
  assert.equal(isWithinPluginRoot(PLUGIN_ROOT), true);
  assert.equal(isWithinPluginRoot(`${PLUGIN_ROOT}${sep}plugin.json`), true);
  assert.equal(isWithinPluginRoot(`${PLUGIN_ROOT}${sep}..${sep}outside.json`), false);
});
