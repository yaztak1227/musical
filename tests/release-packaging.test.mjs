import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  smokeReleaseSidecar,
  verifyReleaseBundle,
} from "../scripts/verify-release-bundle.mjs";

const NOTICES = [
  "THIRD_PARTY_NOTICES.txt",
  "ONNX_RUNTIME_1.28.0_THIRD_PARTY_NOTICES.txt",
  "NODE_RUNTIME_LICENSE.txt",
];

function fixturePaths(bundleRoot, platform, layout) {
  if (layout === "macos-app") {
    return {
      mainExecutable: path.join(bundleRoot, "Contents", "MacOS", "musical"),
      nodeSidecar: path.join(bundleRoot, "Contents", "MacOS", "musical-node"),
      resourceDirectory: path.join(bundleRoot, "Contents", "Resources"),
    };
  }
  if (layout === "linux-deb") {
    return {
      mainExecutable: path.join(bundleRoot, "usr", "bin", "musical"),
      nodeSidecar: path.join(bundleRoot, "usr", "bin", "musical-node"),
      resourceDirectory: path.join(bundleRoot, "usr", "lib", "Musical"),
    };
  }
  return {
    mainExecutable: path.join(bundleRoot, platform === "windows" ? "musical.exe" : "musical"),
    nodeSidecar: path.join(
      bundleRoot,
      platform === "windows" ? "musical-node.exe" : "musical-node",
    ),
    resourceDirectory: bundleRoot,
  };
}

async function createBundleFixture(platform, layout) {
  const cleanupRoot = await mkdtemp(path.join(os.tmpdir(), "musical-release-bundle-"));
  const bundleRoot =
    layout === "macos-app" ? path.join(cleanupRoot, "Musical.app") : cleanupRoot;
  const frontendDist = path.join(cleanupRoot, "frontend-dist");
  const paths = fixturePaths(bundleRoot, platform, layout);
  const index =
    '<!doctype html><link rel="stylesheet" href="./assets/app.css"><script type="module" src="./assets/app.js"></script>';

  await Promise.all([
    mkdir(path.dirname(paths.mainExecutable), { recursive: true }),
    mkdir(path.dirname(paths.nodeSidecar), { recursive: true }),
    mkdir(path.join(paths.resourceDirectory, "mcp"), { recursive: true }),
    mkdir(path.join(paths.resourceDirectory, "resources"), { recursive: true }),
    mkdir(path.join(frontendDist, "assets"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      paths.mainExecutable,
      `main executable fixture\0${index}\0app.css\0app.js\0chunk.js`,
    ),
    writeFile(paths.nodeSidecar, "node runtime fixture"),
    writeFile(
      path.join(paths.resourceDirectory, "mcp", "server.mjs"),
      "console.log('musical mcp sidecar listening');\n",
    ),
    ...NOTICES.map((notice) =>
      writeFile(path.join(paths.resourceDirectory, "resources", notice), "notice"),
    ),
    writeFile(path.join(frontendDist, "index.html"), index),
    writeFile(path.join(frontendDist, "assets", "app.js"), "console.log('fixture')"),
    writeFile(path.join(frontendDist, "assets", "app.css"), "body { color: black; }"),
    writeFile(path.join(frontendDist, "assets", "chunk.js"), "console.log('chunk')"),
  ]);
  if (platform !== "windows" && process.platform !== "win32") {
    await chmod(paths.nodeSidecar, 0o755);
  }

  return { bundleRoot, cleanupRoot, frontendDist, paths };
}

const validLayouts = [
  { layout: "staging", platform: "macos" },
  { layout: "staging", platform: "windows" },
  { layout: "staging", platform: "linux" },
  { layout: "macos-app", platform: "macos" },
  { layout: "windows-install", platform: "windows" },
  { layout: "linux-deb", platform: "linux" },
];

for (const { layout, platform } of validLayouts) {
  test(`release verifier accepts the exact ${platform}/${layout} layout`, async () => {
    const fixture = await createBundleFixture(platform, layout);
    try {
      const result = verifyReleaseBundle(fixture.bundleRoot, {
        frontendDist: fixture.frontendDist,
        layout,
        platform,
      });
      assert.equal(result.platform, platform);
      assert.equal(result.layout, layout);
      assert.equal(result.mainExecutable, fixture.paths.mainExecutable);
      assert.equal(result.nodeSidecar, fixture.paths.nodeSidecar);
      assert.equal(
        result.mcpBundle,
        path.join(fixture.paths.resourceDirectory, "mcp", "server.mjs"),
      );
      assert.deepEqual(
        result.notices,
        NOTICES.map((notice) =>
          path.join(fixture.paths.resourceDirectory, "resources", notice),
        ),
      );
    } finally {
      await rm(fixture.cleanupRoot, { recursive: true, force: true });
    }
  });
}

test("release verifier accepts the explicit staging platform contract", async () => {
  const fixture = await createBundleFixture("windows", "staging");
  try {
    const result = verifyReleaseBundle(fixture.bundleRoot, {
      frontendDist: fixture.frontendDist,
      platform: "staging",
    });
    assert.equal(result.layout, "staging");
    assert.equal(result.mainExecutable, fixture.paths.mainExecutable);
    assert.equal(result.nodeSidecar, fixture.paths.nodeSidecar);
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("release verifier CLI accepts the documented staging arguments", async () => {
  const fixture = await createBundleFixture("windows", "staging");
  try {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/verify-release-bundle.mjs",
        "--platform=staging",
        `--root=${fixture.bundleRoot}`,
        `--frontend-dist=${fixture.frontendDist}`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Release bundle verified \(staging\/staging\)/);
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("release verifier does not accept a correctly named payload nested below an arbitrary root", async () => {
  const fixture = await createBundleFixture("windows", "windows-install");
  const arbitraryRoot = await mkdtemp(path.join(os.tmpdir(), "musical-release-arbitrary-root-"));
  const nestedRoot = path.join(arbitraryRoot, "unrelated", "Musical");
  try {
    await mkdir(path.dirname(nestedRoot), { recursive: true });
    const { cp } = await import("node:fs/promises");
    await cp(fixture.bundleRoot, nestedRoot, { recursive: true });
    assert.throws(
      () =>
        verifyReleaseBundle(arbitraryRoot, {
          frontendDist: fixture.frontendDist,
          layout: "windows-install",
          platform: "windows",
        }),
      (error) => {
        assert.match(error.message, new RegExp(`musical\\.exe`));
        assert.match(error.message, /at exact release path/);
        return true;
      },
    );
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
    await rm(arbitraryRoot, { recursive: true, force: true });
  }
});

test("macOS app rejects a sidecar placed in Resources instead of beside the main executable", async () => {
  const fixture = await createBundleFixture("macos", "macos-app");
  const misplacedSidecar = path.join(fixture.paths.resourceDirectory, "musical-node");
  try {
    await writeFile(misplacedSidecar, "misplaced sidecar");
    await rm(fixture.paths.nodeSidecar);
    assert.throws(
      () =>
        verifyReleaseBundle(fixture.bundleRoot, {
          frontendDist: fixture.frontendDist,
          layout: "macos-app",
          platform: "macos",
        }),
      (error) => {
        assert(error instanceof Error);
        assert.equal(
          error.message,
          [
            "Release bundle verification failed:",
            `- missing bundled Node sidecar at exact release path: ${fixture.paths.nodeSidecar}`,
          ].join("\n"),
        );
        return true;
      },
    );
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("Debian extraction rejects resources placed beside usr/bin instead of usr/lib/Musical", async () => {
  const fixture = await createBundleFixture("linux", "linux-deb");
  const expectedMcp = path.join(fixture.paths.resourceDirectory, "mcp");
  const misplacedMcp = path.join(fixture.bundleRoot, "usr", "bin", "mcp");
  try {
    await mkdir(misplacedMcp, { recursive: true });
    await writeFile(path.join(misplacedMcp, "server.mjs"), "misplaced server");
    await rm(expectedMcp, { recursive: true, force: true });
    assert.throws(
      () =>
        verifyReleaseBundle(fixture.bundleRoot, {
          frontendDist: fixture.frontendDist,
          layout: "linux-deb",
          platform: "linux",
        }),
      (error) => {
        assert(error instanceof Error);
        assert.equal(
          error.message,
          [
            "Release bundle verification failed:",
            `- missing MCP resource at exact release path: ${path.join(
              fixture.paths.resourceDirectory,
              "mcp",
              "server.mjs",
            )}`,
          ].join("\n"),
        );
        return true;
      },
    );
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test(
  "release verifier rejects a Unix Node sidecar without any execute bit",
  { skip: process.platform === "win32" },
  async () => {
    const fixture = await createBundleFixture("linux", "staging");
    try {
      await chmod(fixture.paths.nodeSidecar, 0o644);
      assert.throws(
        () =>
          verifyReleaseBundle(fixture.bundleRoot, {
            frontendDist: fixture.frontendDist,
            layout: "staging",
            platform: "linux",
          }),
        /bundled Node sidecar is not executable/,
      );
    } finally {
      await rm(fixture.cleanupRoot, { recursive: true, force: true });
    }
  },
);

test("release verifier reports every missing exact deployment path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "musical-release-bundle-missing-"));
  try {
    assert.throws(
      () =>
        verifyReleaseBundle(root, {
          frontendDist: path.join(root, "missing-frontend"),
          layout: "windows-install",
          platform: "windows",
        }),
      (error) => {
        assert.match(error.message, /missing main executable/);
        assert.match(error.message, /musical-node\.exe/);
        assert.match(error.message, /mcp[\\/]server\.mjs/);
        assert.match(error.message, /THIRD_PARTY_NOTICES\.txt/);
        assert.match(error.message, /NODE_RUNTIME_LICENSE\.txt/);
        assert.match(error.message, /frontend payload/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release verifier requires index bytes and every asset filename in the main executable", async () => {
  const fixture = await createBundleFixture("windows", "windows-install");
  try {
    await writeFile(fixture.paths.mainExecutable, "main executable fixture\0app.js\0app.css");
    assert.throws(
      () =>
        verifyReleaseBundle(fixture.bundleRoot, {
          frontendDist: fixture.frontendDist,
          layout: "windows-install",
          platform: "windows",
        }),
      /frontend payload/,
    );

    await writeFile(
      fixture.paths.mainExecutable,
      `main executable fixture\0${await readFile(
        path.join(fixture.frontendDist, "index.html"),
      )}`,
    );
    assert.throws(
      () =>
        verifyReleaseBundle(fixture.bundleRoot, {
          frontendDist: fixture.frontendDist,
          layout: "windows-install",
          platform: "windows",
        }),
      /frontend payload/,
    );
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("release verifier rejects an absolute workspace path in the MCP bundle", async () => {
  const fixture = await createBundleFixture("macos", "macos-app");
  try {
    await writeFile(
      path.join(fixture.paths.resourceDirectory, "mcp", "server.mjs"),
      "const source = 'D:\\\\a\\\\musical\\\\musical\\\\src\\\\mcp';\n",
    );
    assert.throws(
      () =>
        verifyReleaseBundle(fixture.bundleRoot, {
          frontendDist: fixture.frontendDist,
          layout: "macos-app",
          platform: "macos",
        }),
      /absolute build\/workspace path/,
    );
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("release verifier rejects an absolute build path in the main executable", async () => {
  const fixture = await createBundleFixture("windows", "windows-install");
  try {
    const original = await readFile(fixture.paths.mainExecutable);
    await writeFile(
      fixture.paths.mainExecutable,
      Buffer.concat([
        original,
        Buffer.from("\0D:\\a\\musical\\musical\\src-tauri\\src\\local_server.rs\0"),
      ]),
    );
    assert.throws(
      () =>
        verifyReleaseBundle(fixture.bundleRoot, {
          frontendDist: fixture.frontendDist,
          layout: "windows-install",
          platform: "windows",
        }),
      /main executable contains an absolute build\/workspace path/,
    );
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("release verifier does not mistake an HTTPS URL for a Windows drive path", async () => {
  const fixture = await createBundleFixture("macos", "macos-app");
  try {
    const original = await readFile(fixture.paths.mainExecutable);
    await writeFile(
      fixture.paths.mainExecutable,
      Buffer.concat([
        original,
        Buffer.from("\0https://github.com/yaztak1227/musical\0"),
      ]),
    );
    assert.doesNotThrow(() =>
      verifyReleaseBundle(fixture.bundleRoot, {
        frontendDist: fixture.frontendDist,
        layout: "macos-app",
        platform: "macos",
      }),
    );
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test(
  "sidecar smoke starts from a clean cwd and exits normally when stdin reaches EOF",
  { skip: process.platform === "win32" },
  async () => {
    const platform = process.platform === "darwin" ? "macos" : "linux";
    const fixture = await createBundleFixture(platform, "staging");
    const serverSource = `
      import { createServer } from "node:http";
      import path from "node:path";
      import { fileURLToPath } from "node:url";
      if (process.cwd() === path.dirname(fileURLToPath(import.meta.url))) {
        throw new Error("smoke did not use a clean cwd");
      }
      const server = createServer();
      process.stdin.once("end", () => process.exit(0));
      process.stdin.resume();
      server.on("request", (request, response) => {
        if (request.method !== "POST" || request.url !== "/mcp") {
          response.writeHead(404).end();
          return;
        }
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          const requestBody = JSON.parse(body);
          response.writeHead(200, {
            "Content-Type": "text/event-stream",
            "mcp-session-id": "fixture-session",
          });
          response.end(
            "event: message\\ndata: " +
              JSON.stringify({
                jsonrpc: "2.0",
                id: requestBody.id,
                result: {
                  protocolVersion: "2025-06-18",
                  capabilities: {},
                  serverInfo: { name: "fixture", version: "1.0.0" },
                },
              }) +
              "\\n\\n",
          );
        });
      });
      server.listen(Number(process.env.MUSICAL_MCP_PORT), "127.0.0.1", () => {
        process.stdout.write("musical mcp sidecar listening\\n");
      });
    `;
    try {
      await rm(fixture.paths.nodeSidecar);
      await symlink(process.execPath, fixture.paths.nodeSidecar);
      await writeFile(
        path.join(fixture.paths.resourceDirectory, "mcp", "server.mjs"),
        serverSource,
      );
      const before = await readFile(fixture.paths.nodeSidecar);
      const verification = verifyReleaseBundle(fixture.bundleRoot, {
        frontendDist: fixture.frontendDist,
        layout: "staging",
        platform,
      });
      const smoke = await smokeReleaseSidecar(verification, { timeoutMs: 5_000 });
      assert.equal(smoke.exitCode, 0);
      assert.ok(smoke.port > 0);
      assert.deepEqual(await readFile(fixture.paths.nodeSidecar), before);
    } finally {
      await rm(fixture.cleanupRoot, { recursive: true, force: true });
    }
  },
);

test(
  "sidecar smoke rejects an unsuccessful MCP initialize response without exposing its token",
  { skip: process.platform === "win32" },
  async () => {
    const platform = process.platform === "darwin" ? "macos" : "linux";
    const fixture = await createBundleFixture(platform, "staging");
    const serverSource = `
      import { createServer } from "node:http";
      process.stdin.once("end", () => process.exit(0));
      process.stdin.resume();
      const server = createServer((request, response) => {
        request.resume();
        request.on("end", () => {
          response.writeHead(503, {
            "Content-Type": "application/json",
          });
          response.end(JSON.stringify({ error: "fixture failure" }));
        });
      });
      server.listen(Number(process.env.MUSICAL_MCP_PORT), "127.0.0.1", () => {
        process.stdout.write("musical mcp sidecar listening\\n");
      });
    `;
    try {
      await rm(fixture.paths.nodeSidecar);
      await symlink(process.execPath, fixture.paths.nodeSidecar);
      await writeFile(path.join(fixture.paths.resourceDirectory, "mcp", "server.mjs"), serverSource);
      const verification = verifyReleaseBundle(fixture.bundleRoot, {
        frontendDist: fixture.frontendDist,
        layout: "staging",
        platform,
      });
      await assert.rejects(
        () => smokeReleaseSidecar(verification, { timeoutMs: 5_000 }),
        (error) => {
          assert.match(error.message, /HTTP 503/);
          assert.doesNotMatch(error.message, /release-bundle-smoke-test/);
          return true;
        },
      );
    } finally {
      await rm(fixture.cleanupRoot, { recursive: true, force: true });
    }
  },
);

test("release tooling pins the exact Node runtime version", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const packageLock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const nodeVersion = (await readFile(".node-version", "utf8")).trim();
  assert.equal(nodeVersion, "24.15.0");
  assert.equal(packageJson.engines?.node, nodeVersion);
  assert.equal(packageLock.packages?.[""]?.engines?.node, nodeVersion);
});

test("Tauri config does not duplicate the package version in the window title", async () => {
  const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  assert.equal(tauriConfig.app?.windows?.[0]?.title, "Musical");
});

test("Tauri resource source and target basenames stay aligned for every bundled resource", async () => {
  const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  const resources = tauriConfig.bundle?.resources;

  assert.ok(resources && typeof resources === "object" && !Array.isArray(resources));
  for (const [source, target] of Object.entries(resources)) {
    assert.equal(
      path.posix.basename(source),
      path.posix.basename(target),
      `Tauri resource source and target must have the same basename: ${source} -> ${target}`,
    );
  }
});

test("Node runtime preparation fails closed for a target different from the host", () => {
  const mismatchedTarget =
    process.platform === "win32" ? "aarch64-apple-darwin" : "x86_64-pc-windows-msvc";
  const result = spawnSync(
    process.execPath,
    ["scripts/prepare-node-runtime.mjs", `--target=${mismatchedTarget}`],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the Node runtime host/);
});
