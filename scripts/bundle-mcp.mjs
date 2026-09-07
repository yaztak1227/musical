import { mkdir, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectRoot, "dist-mcp", "server.mjs");

await mkdir(path.dirname(outputPath), { recursive: true });

const result = await build({
  absWorkingDir: projectRoot,
  bundle: true,
  entryPoints: ["src/mcp/server.ts"],
  format: "esm",
  outfile: outputPath,
  platform: "node",
  target: "node24",
  // Keep a single deployable file. Node built-ins are provided by the
  // bundled runtime and are intentionally the only external imports.
  packages: "bundle",
  metafile: true,
  plugins: [
    {
      name: "prefix-node-builtins",
      setup(buildContext) {
        const builtinNames = new Set(
          builtinModules.map((moduleName) =>
            moduleName.startsWith("node:") ? moduleName.slice("node:".length) : moduleName,
          ),
        );
        buildContext.onResolve({ filter: /.*/ }, (args) => {
          if (!builtinNames.has(args.path) || args.path.startsWith("node:")) return undefined;
          return { external: true, path: `node:${args.path}` };
        });
      },
    },
  ],
  write: false,
  logLevel: "info",
});

const metafile =
  typeof result.metafile === "string" ? JSON.parse(result.metafile) : result.metafile ?? {};
const output = Object.values(metafile.outputs ?? {}).find((entry) => entry.entryPoint);
const externalImports = output?.imports?.filter((entry) => entry.external) ?? [];
const unsupportedImports = externalImports.filter((entry) => !entry.path.startsWith("node:"));
if (!output || unsupportedImports.length > 0) {
  const details = unsupportedImports.map((entry) => entry.path).join(", ") || "none";
  throw new Error(
    `MCP bundle contains unsupported external imports (only node:* built-ins are allowed): ${details}`,
  );
}

const outputFile = result.outputFiles?.find((file) => path.resolve(file.path) === outputPath);
if (!outputFile) {
  throw new Error(`esbuild did not produce the expected MCP bundle output at ${outputPath}.`);
}
await writeFile(outputPath, outputFile.contents);

process.stdout.write(`MCP bundle written to ${path.relative(projectRoot, outputPath)}\n`);
