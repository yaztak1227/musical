import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyReleaseBundle } from "../scripts/verify-release-bundle.mjs";

const NOTICES = [
  "THIRD_PARTY_NOTICES.txt",
  "ONNX_RUNTIME_1.28.0_THIRD_PARTY_NOTICES.txt",
];

test("release base Tauri config supplies a non-null updater config", async () => {
  const config = JSON.parse(
    await readFile(path.join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
  );

  assert.equal(typeof config.plugins?.updater, "object");
  assert.ok(config.plugins.updater !== null);
  assert.deepEqual(config.plugins.updater.endpoints, []);
  assert.equal(config.plugins.updater.pubkey, "");
});

test("Windows release workflow starts the built app for an MCP bridge smoke test", async () => {
  const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
  const workflow = await readFile(
    path.join(process.cwd(), ".github", "workflows", "build-app.yml"),
    "utf8",
  );

  assert.equal(packageJson.scripts["smoke:release-app"], "node scripts/smoke-release-app.mjs");
  assert.match(workflow, /name: Smoke release app MCP bridge/);
  assert.match(
    workflow,
    /npm run smoke:release-app -- --executable=src-tauri\/target\/release\/musical\.exe/,
  );
});

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
    mkdir(path.join(paths.resourceDirectory, "resources"), { recursive: true }),
    mkdir(path.join(frontendDist, "assets"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      paths.mainExecutable,
      `main executable fixture\0${index}\0app.css\0app.js\0chunk.js`,
    ),
    ...NOTICES.map((notice) =>
      writeFile(path.join(paths.resourceDirectory, "resources", notice), "notice"),
    ),
    writeFile(path.join(frontendDist, "index.html"), index),
    writeFile(path.join(frontendDist, "assets", "app.js"), "console.log('fixture')"),
    writeFile(path.join(frontendDist, "assets", "app.css"), "body { color: black; }"),
    writeFile(path.join(frontendDist, "assets", "chunk.js"), "console.log('chunk')"),
  ]);
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

test("release verifier rejects a legacy Node sidecar", async () => {
  const fixture = await createBundleFixture("macos", "macos-app");
  try {
    await writeFile(fixture.paths.nodeSidecar, "legacy sidecar");
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
            `- legacy bundled Node sidecar must not be present: ${fixture.paths.nodeSidecar}`,
          ].join("\n"),
        );
        return true;
      },
    );
  } finally {
    await rm(fixture.cleanupRoot, { recursive: true, force: true });
  }
});

test("release verifier rejects a legacy MCP sidecar resource", async () => {
  const fixture = await createBundleFixture("linux", "linux-deb");
  const legacyMcp = path.join(fixture.paths.resourceDirectory, "mcp");
  try {
    await mkdir(legacyMcp, { recursive: true });
    await writeFile(path.join(legacyMcp, "server.mjs"), "legacy server");
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
            `- legacy MCP sidecar resource must not be present: ${path.join(
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
        assert.match(error.message, /THIRD_PARTY_NOTICES\.txt/);
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

test("release build does not bundle or prepare a Node sidecar", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  assert.doesNotMatch(packageJson.scripts.build, /prepare:node-runtime/);
  assert.equal(tauriConfig.bundle?.externalBin, undefined);
  assert.equal(
    Object.keys(tauriConfig.bundle?.resources ?? {}).some((source) =>
      /(?:dist-mcp|NODE_RUNTIME_LICENSE)/.test(source),
    ),
    false,
  );
});
