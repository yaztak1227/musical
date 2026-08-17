import { expect, test, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  visualizerModeDefinitions,
  visualizerModes,
  visualizerPaletteDefinitions,
  visualizerPaletteModes,
} from "../../src/features/visualizer/registry";
import { resolveVisualizerPalette } from "../../src/features/visualizer/palette";
import { createVisualizerRenderer } from "../../src/features/visualizer/rendererFactory";
import { createVisualizerWebglRuntime } from "../../src/features/visualizer/webglRuntime";
import type {
  VisualizerPalette,
  VisualizerWebglAdapter,
  VisualizerWebglModeDefinition,
} from "../../src/features/visualizer/types";
import { createVisualizerRuntimeCache, getVisualizerRuntimeKey } from "../../src/features/visualizer/runtimeCache";
import { auroraDefinition } from "../../src/features/visualizer/modes/aurora/definition";
import { tunnelDefinition } from "../../src/features/visualizer/modes/tunnel/definition";

const { PNG } = createRequire(import.meta.url)("pngjs") as {
  PNG: { sync: { read(buffer: Buffer): { data: Uint8Array; width: number; height: number } } };
};

const signatureFixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "tests/e2e/fixtures/visualizer-signatures.v1.json"), "utf8"),
) as {
  version: number;
  viewport: { width: number; height: number };
  contract: {
    modeCount: number;
    paletteCount: number;
    canvasCount: number;
    minimumForegroundPixels: number;
    minimumColorBuckets: number;
  };
  modes: Array<{ id: string; label: string; renderer: string; canvas: CanvasKind }>;
  palettes: Array<{ id: string; label: string }>;
};

type CanvasKind = "base" | "aurora" | "starfield" | "helix" | "warp";
type CanvasContract = {
  kind: CanvasKind;
  width: number;
  height: number;
  foregroundPixels: number;
  colorBuckets: number;
  hash: number;
};

const dedicatedCanvasSelectors: Record<Exclude<CanvasKind, "base">, string> = {
  aurora: ".visualizer-aurora-canvas.active",
  starfield: ".visualizer-starfield-canvas.active",
  helix: ".visualizer-helix-canvas.active",
  warp: ".visualizer-warp-hole-canvas.active",
};

function baseCanvas(page: Page) {
  return page.locator(
    ".visualizer-canvas:not(.visualizer-aurora-canvas):not(.visualizer-starfield-canvas):not(.visualizer-helix-canvas):not(.visualizer-warp-hole-canvas)",
  );
}

function canvasLocator(page: Page, kind: CanvasKind): Locator {
  return kind === "base" ? baseCanvas(page) : page.locator(dedicatedCanvasSelectors[kind]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeWebglDefinition(
  load: VisualizerWebglModeDefinition["load"],
): VisualizerWebglModeDefinition {
  return {
    id: "aurora",
    labelKey: "player.visualizerAurora",
    icon: "aurora",
    renderer: "webgl",
    canvas: "aurora",
    canvasClassName: "visualizer-aurora-canvas",
    webglPaletteRole: "aurora",
    supportsChibi: false,
    load,
  };
}

function createRendererForRuntime(
  adapter: VisualizerWebglAdapter | null,
  palette: VisualizerPalette,
  fallbackPalettes: number[],
) {
  return createVisualizerRenderer({
    mode: "aurora",
    palette,
    auroraPalette: palette,
    paletteMode: "theme",
    reducedMotion: false,
    profile: "standard",
    legacyOriginalHueCycle: false,
    webglAdapter: adapter,
    canvasRenderers: {
      aurora: ({ palette: fallbackPalette }) => fallbackPalettes.push(fallbackPalette[0]?.[0] ?? -1),
    },
    context: {} as CanvasRenderingContext2D,
    width: () => 640,
    height: () => 360,
  });
}

async function readCompositeCanvasContract(
  page: Page,
  canvas: Locator,
  kind: CanvasKind,
  options: { forceTransparent?: boolean } = {},
): Promise<CanvasContract> {
  const size = await canvas.evaluate((element) => {
    const source = element as HTMLCanvasElement;
    return { width: source.width, height: source.height };
  });
  if (size.width === 0 || size.height === 0) {
    return { kind, ...size, foregroundPixels: 0, colorBuckets: 0, hash: 0 };
  }

  // The screenshot observes the browser-composited output. In particular it
  // does not call getContext() on a dedicated canvas, which could manufacture
  // a valid context while the application renderer had never drawn a frame.
  const stage = page.locator(".visualizer-stage");
  await canvas.evaluate((element, forceTransparent) => {
    element.setAttribute("data-visualizer-contract-target", "true");
    if (forceTransparent) element.setAttribute("data-visualizer-contract-transparent", "true");
  }, options.forceTransparent ?? false);
  await stage.evaluate((element) => element.classList.add("visualizer-contract-capture"));

  let screenshot: Buffer;
  try {
    screenshot = await stage.screenshot({ animations: "disabled" });
  } finally {
    await canvas.evaluate((element) => {
      element.removeAttribute("data-visualizer-contract-target");
      element.removeAttribute("data-visualizer-contract-transparent");
    });
    await stage.evaluate((element) => element.classList.remove("visualizer-contract-capture"));
  }
  const png = PNG.sync.read(screenshot);
  const buckets = new Set<number>();
  let foregroundPixels = 0;
  let hash = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const red = png.data[offset] ?? 0;
    const green = png.data[offset + 1] ?? 0;
    const blue = png.data[offset + 2] ?? 0;
    const alpha = png.data[offset + 3] ?? 0;
    if (alpha > 8 && Math.max(red, green, blue) > 8) {
      foregroundPixels += 1;
      buckets.add((Math.floor(red / 32) << 6) | (Math.floor(green / 32) << 3) | Math.floor(blue / 32));
      hash = (hash * 31 + red * 3 + green * 5 + blue * 7 + alpha) >>> 0;
    }
  }
  return { kind, ...size, foregroundPixels, colorBuckets: buckets.size, hash };
}

async function openVisualizer(page: Page) {
  await page.setViewportSize({ width: signatureFixture.viewport.width, height: signatureFixture.viewport.height });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.localStorage.setItem("musical.locale", "en");
    window.localStorage.removeItem("musical.visualizerMode");
    window.localStorage.removeItem("musical.visualizerPalette");
    window.localStorage.removeItem("musical.visualizerChibiMode");
  });
  await page.goto("/");
  // Keep the player paused: idle frames make the matrix reproducible and avoid
  // competing requestAnimationFrame/WebGL loops while switching 40 cases.
  await page.getByLabel("Player").getByRole("button", { name: "Open visualizer" }).click();
  await expect(page.getByRole("dialog", { name: "Player visualizer" })).toBeVisible();
  await expect(page.locator(".visualizer-canvas")).toHaveCount(signatureFixture.contract.canvasCount);
  await page.addStyleTag({
    content: `
      .player-visualizer-overlay,
      .visualizer-stage {
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      .player-visualizer-overlay::before,
      .player-visualizer-overlay::after,
      .visualizer-stage::before,
      .visualizer-stage::after {
        content: none !important;
        display: none !important;
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      .visualizer-artwork-backdrop,
      .visualizer-vignette,
      .visualizer-stage > :not(canvas) {
        display: none !important;
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      .visualizer-stage.visualizer-contract-capture {
        background: rgb(0, 0, 0) !important;
      }
      .visualizer-contract-capture canvas:not([data-visualizer-contract-target="true"]) {
        visibility: hidden !important;
        opacity: 0 !important;
      }
      .visualizer-contract-capture canvas[data-visualizer-contract-transparent="true"] {
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `,
  });
}

test.describe("visualizer render contract v1", () => {
  test.describe.configure({ mode: "serial" });

  test("keeps the factory registry aligned with the versioned mode and palette fixture", () => {
    expect([...visualizerModes]).toEqual(signatureFixture.modes.map(({ id }) => id));
    expect(visualizerModeDefinitions.map(({ id, renderer, canvas }) => ({ id, renderer, canvas }))).toEqual(
      signatureFixture.modes.map(({ id, renderer, canvas }) => ({ id, renderer, canvas })),
    );
    expect([...visualizerPaletteModes]).toEqual(signatureFixture.palettes.map(({ id }) => id));
    expect(visualizerPaletteDefinitions.map(({ id }) => id)).toEqual(
      signatureFixture.palettes.map(({ id }) => id),
    );
  });

  test("keeps every mode definition self-contained for add-in registration", () => {
    for (const definition of visualizerModeDefinitions) {
      expect(typeof definition.createRuntime, `${definition.id} runtime factory`).toBe("function");
      if (definition.renderer === "canvas2d") {
        expect(typeof definition.createCanvasRenderer, `${definition.id} Canvas renderer`).toBe("function");
        expect(definition.canvas).toBe("base");
      } else {
        expect(definition.canvasClassName, `${definition.id} dedicated canvas class`).toMatch(/^visualizer-/);
        expect(["mode", "aurora"], `${definition.id} palette role`).toContain(definition.webglPaletteRole);
        expect(typeof definition.load, `${definition.id} lazy WebGL loader`).toBe("function");
        expect(typeof definition.createFallbackRenderer, `${definition.id} Canvas fallback`).toBe("function");
      }
    }
  });

  test("keeps mode history cached while isolating variants and resetting/disposal by overlay lifetime", () => {
    const cache = createVisualizerRuntimeCache();
    const auroraKey = getVisualizerRuntimeKey("aurora", false, false, false);
    const tunnelKey = getVisualizerRuntimeKey("tunnel", false, false, false);
    const spectrumKey = getVisualizerRuntimeKey("spectrum", true, false, false);
    const orchestraKey = getVisualizerRuntimeKey("spectrum", true, false, true);
    const resetCounts = new Map<string, number>();
    const disposeCounts = new Map<string, number>();
    const runtime = (key: string) => ({
      render: () => undefined,
      reset: () => resetCounts.set(key, (resetCounts.get(key) ?? 0) + 1),
      dispose: () => disposeCounts.set(key, (disposeCounts.get(key) ?? 0) + 1),
    });

    const auroraFirst = cache.get(auroraKey, () => runtime(auroraKey));
    const tunnelFirst = cache.get(tunnelKey, () => runtime(tunnelKey));
    const spectrum = cache.get(spectrumKey, () => runtime(spectrumKey));
    const orchestra = cache.get(orchestraKey, () => runtime(orchestraKey));
    expect(cache.get(auroraKey, () => runtime("unexpected"))).toBe(auroraFirst);
    expect(cache.get(tunnelKey, () => runtime("unexpected"))).toBe(tunnelFirst);
    expect(spectrum).not.toBe(orchestra);

    cache.resetAll();
    expect(resetCounts).toEqual(new Map([
      [auroraKey, 1],
      [tunnelKey, 1],
      [spectrumKey, 1],
      [orchestraKey, 1],
    ]));
    cache.disposeAll();
    cache.disposeAll();
    expect(disposeCounts).toEqual(new Map([
      [auroraKey, 1],
      [tunnelKey, 1],
      [spectrumKey, 1],
      [orchestraKey, 1],
    ]));
  });

  test("gives Aurora and DNA Helix their own persistent runtime identities", () => {
    const cache = createVisualizerRuntimeCache();
    const auroraKey = getVisualizerRuntimeKey("aurora", false, false, false);
    const tunnelKey = getVisualizerRuntimeKey("tunnel", false, false, false);
    const auroraFirst = cache.get(auroraKey, () => auroraDefinition.createRuntime());
    const tunnelFirst = cache.get(tunnelKey, () => tunnelDefinition.createRuntime());

    expect(cache.get(tunnelKey, () => tunnelDefinition.createRuntime())).toBe(tunnelFirst);
    expect(cache.get(auroraKey, () => auroraDefinition.createRuntime())).toBe(auroraFirst);
    cache.disposeAll();
  });

  test("draws every WebGL mode fallback on Canvas 2D while loader is pending or rejected", async ({ page }) => {
    await page.goto("/");
    const observations = await page.evaluate(async () => {
      const { visualizerModeDefinitions } = await import("/src/features/visualizer/registry.ts");
      const { createVisualizerRenderer } = await import("/src/features/visualizer/rendererFactory.ts");
      const { createVisualizerWebglRuntime } = await import("/src/features/visualizer/webglRuntime.ts");
      const palette = [
        [39, 205, 255],
        [72, 224, 255],
        [92, 176, 255],
        [142, 112, 255],
        [222, 92, 255],
        [255, 100, 184],
      ] as const;
      const values = new Uint8Array(256);
      values.fill(180);

      const countVisiblePixels = (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let visiblePixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const alpha = pixels[offset + 3] ?? 0;
          const color = Math.max(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0);
          if (alpha > 8 && color > 8) visiblePixels += 1;
        }
        return visiblePixels;
      };

      const webglDefinitions = visualizerModeDefinitions.filter((definition) => definition.renderer === "webgl");
      const renderFallback = async (definition: (typeof webglDefinitions)[number], loaderState: "pending" | "rejected") => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        document.body.append(canvas);
        const context = canvas.getContext("2d");
        if (!context) throw new Error(`${definition.id} Canvas 2D context unavailable`);
        const modeRuntime = definition.createRuntime();
        const webglRuntime = createVisualizerWebglRuntime();
        let resolvePending: ((value: null) => void) | undefined;
        const loader = loaderState === "pending"
          ? () => new Promise<null>((resolve) => { resolvePending = resolve; })
          : async () => { throw new Error(`${definition.id} expected loader rejection`); };
        const activation = webglRuntime.activate({ ...definition, load: loader }, canvas);
        if (loaderState === "rejected") await activation;

        const renderer = createVisualizerRenderer({
          mode: definition.id,
          palette,
          auroraPalette: palette,
          paletteMode: "theme",
          reducedMotion: false,
          profile: "standard",
          legacyOriginalHueCycle: false,
          webglAdapter: webglRuntime.current(),
          runtime: modeRuntime,
          context,
          width: () => canvas.width,
          height: () => canvas.height,
        });
        if (renderer.usesDedicatedCanvas) throw new Error(`${definition.id} fallback unexpectedly promoted`);
        renderer.render(values, 240, false);
        const visiblePixels = countVisiblePixels(context, canvas);

        webglRuntime.dispose();
        resolvePending?.(null);
        await Promise.resolve();
        modeRuntime.dispose?.();
        canvas.remove();
        return { id: definition.id, loaderState, visiblePixels };
      };

      const results = [];
      for (const definition of webglDefinitions) {
        results.push(await renderFallback(definition, "pending"));
        results.push(await renderFallback(definition, "rejected"));
      }
      return results;
    });

    expect(observations).toHaveLength(8);
    for (const observation of observations) {
      expect(observation.visiblePixels, `${observation.id}/${observation.loaderState} fallback`).toBeGreaterThan(0);
    }
  });

  test("resolves every palette to valid RGB colors and complete CSS factory settings", () => {
    const suppliedColors = [
      [12, 34, 56],
      [78, 90, 123],
      [145, 167, 189],
      [210, 198, 176],
      [254, 232, 210],
    ] as const;

    for (const paletteMode of visualizerPaletteModes) {
      const resolved = resolveVisualizerPalette(
        paletteMode,
        suppliedColors,
        "mock-artwork.png",
        visualizerModes.length,
        visualizerPaletteModes.length,
      );

      expect(resolved.colors.length, `${paletteMode} palette color count`).toBeGreaterThan(0);
      for (const color of resolved.colors) {
        expect(color, `${paletteMode} RGB tuple`).toHaveLength(3);
        for (const channel of color) {
          expect(Number.isFinite(channel), `${paletteMode} finite RGB channel`).toBe(true);
          expect(channel, `${paletteMode} RGB lower bound`).toBeGreaterThanOrEqual(0);
          expect(channel, `${paletteMode} RGB upper bound`).toBeLessThanOrEqual(255);
        }
      }

      expect(resolved.css["--visualizer-mode-columns"]).toBe(`repeat(${visualizerModes.length}, 34px)`);
      expect(resolved.css["--visualizer-palette-columns"]).toBe(`repeat(${visualizerPaletteModes.length}, 34px)`);
      expect(resolved.css["--visualizer-artwork"]).toBe('url("mock-artwork.png")');
      resolved.colors.slice(0, 5).forEach((_, index) => {
        expect(resolved.css[`--visualizer-color-${index}` as keyof typeof resolved.css]).toMatch(
          /^rgba\(\d+, \d+, \d+, (?:0|1)(?:\.\d+)?\)$/,
        );
      });
    }
  });

  test("keeps fallback rendering through loader resolve/reject and updates palette without recreating the adapter", async () => {
    const firstPalette = [[10, 20, 30], [40, 50, 60], [70, 80, 90], [100, 110, 120], [130, 140, 150]] as const;
    const secondPalette = [[210, 20, 30], [40, 150, 60], [70, 80, 190], [200, 110, 120], [130, 240, 150]] as const;
    const loader = deferred<VisualizerWebglAdapter>();
    const renderedPaletteFirstChannels: number[] = [];
    const fallbackPaletteFirstChannels: number[] = [];
    let loadCount = 0;
    let disposeCount = 0;
    const adapter: VisualizerWebglAdapter = {
      render: ({ palette }) => renderedPaletteFirstChannels.push(palette[0]?.[0] ?? -1),
      dispose: () => { disposeCount += 1; },
    };
    const runtime = createVisualizerWebglRuntime();
    const canvas = { isConnected: true } as HTMLCanvasElement;
    const activation = runtime.activate(fakeWebglDefinition(() => {
      loadCount += 1;
      return loader.promise;
    }), canvas);

    const loadingRenderer = createRendererForRuntime(runtime.current(), firstPalette, fallbackPaletteFirstChannels);
    expect(loadingRenderer.usesDedicatedCanvas).toBe(false);
    loadingRenderer.render(new Uint8Array([1]), 1, false);
    expect(fallbackPaletteFirstChannels).toEqual([10]);

    loader.resolve(adapter);
    await expect(activation).resolves.toBe(adapter);
    const promotedRenderer = createRendererForRuntime(runtime.current(), firstPalette, fallbackPaletteFirstChannels);
    expect(promotedRenderer.usesDedicatedCanvas).toBe(true);
    promotedRenderer.render(new Uint8Array([2]), 2, false);
    expect(renderedPaletteFirstChannels).toEqual([10]);

    const paletteUpdatedRenderer = createRendererForRuntime(runtime.current(), secondPalette, fallbackPaletteFirstChannels);
    paletteUpdatedRenderer.render(new Uint8Array([3]), 3, false);
    expect(loadCount, "palette changes must not recreate the lazy adapter").toBe(1);
    expect(renderedPaletteFirstChannels, "the next frame receives the updated palette").toEqual([10, 210]);

    const rejectedRuntime = createVisualizerWebglRuntime();
    const rejectedActivation = rejectedRuntime.activate(fakeWebglDefinition(async () => {
      throw new Error("expected fake loader rejection");
    }), canvas);
    await expect(rejectedActivation).resolves.toBeNull();
    const rejectedRenderer = createRendererForRuntime(rejectedRuntime.current(), secondPalette, fallbackPaletteFirstChannels);
    expect(rejectedRenderer.usesDedicatedCanvas).toBe(false);
    rejectedRenderer.render(new Uint8Array([4]), 4, false);
    expect(fallbackPaletteFirstChannels).toEqual([10, 210]);

    runtime.dispose();
    runtime.dispose();
    expect(disposeCount, "the promoted current adapter is disposed exactly once").toBe(1);
  });

  test("disposes stale and current adapters exactly once across competing activations", async () => {
    const firstLoader = deferred<VisualizerWebglAdapter>();
    const secondLoader = deferred<VisualizerWebglAdapter>();
    const disposeCounts = { stale: 0, current: 0 };
    const staleAdapter: VisualizerWebglAdapter = {
      render: () => undefined,
      dispose: () => { disposeCounts.stale += 1; },
    };
    const currentAdapter: VisualizerWebglAdapter = {
      render: () => undefined,
      dispose: () => { disposeCounts.current += 1; },
    };
    const runtime = createVisualizerWebglRuntime();
    const canvas = { isConnected: true } as HTMLCanvasElement;
    const staleActivation = runtime.activate(fakeWebglDefinition(() => firstLoader.promise), canvas);
    const currentActivation = runtime.activate(fakeWebglDefinition(() => secondLoader.promise), canvas);

    firstLoader.resolve(staleAdapter);
    await expect(staleActivation).resolves.toBeNull();
    expect(disposeCounts.stale, "a superseded loader result is disposed exactly once").toBe(1);
    expect(runtime.current()).toBeNull();

    secondLoader.resolve(currentAdapter);
    await expect(currentActivation).resolves.toBe(currentAdapter);
    expect(runtime.current()).toBe(currentAdapter);
    runtime.dispose();
    runtime.dispose();
    expect(disposeCounts).toEqual({ stale: 1, current: 1 });
  });

  test("preserves the 10 mode and 4 palette registry dimensions", async ({ page }) => {
    await openVisualizer(page);

    const modeGroup = page.getByRole("group", { name: "Visualizer mode" });
    const paletteGroup = page.getByRole("group", { name: "Colors" });
    await expect(modeGroup.getByRole("button")).toHaveCount(signatureFixture.contract.modeCount);
    await expect(paletteGroup.getByRole("button")).toHaveCount(signatureFixture.contract.paletteCount);
    await expect(modeGroup.getByRole("button").allTextContents()).resolves.toEqual(
      Array(signatureFixture.contract.modeCount).fill(""),
    );
  });

  test("rejects an intentionally transparent target canvas as a negative control", async ({ page }) => {
    await openVisualizer(page);
    const transparentContract = await readCompositeCanvasContract(page, baseCanvas(page), "base", {
      forceTransparent: true,
    });

    expect(transparentContract.foregroundPixels).toBeLessThan(signatureFixture.contract.minimumForegroundPixels);
    expect(transparentContract.colorBuckets).toBeLessThan(signatureFixture.contract.minimumColorBuckets);
  });

  test("renders every mode × palette combination with a stable renderer contract", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await openVisualizer(page);

    const observations: Array<{
      mode: string;
      palette: string;
      renderer: string;
      canvas: CanvasContract;
    }> = [];

    for (const mode of signatureFixture.modes) {
      const modeButton = page.getByRole("button", { name: mode.label, exact: true });
      await modeButton.click();
      await expect(modeButton).toHaveAttribute("aria-pressed", "true");

      for (const palette of signatureFixture.palettes) {
        const paletteButton = page.getByRole("button", { name: palette.label, exact: true });
        await paletteButton.click();
        await expect(paletteButton).toHaveAttribute("aria-pressed", "true");

        const canvas = canvasLocator(page, mode.canvas as CanvasKind);
        await expect(canvas).toBeVisible();
        await expect.poll(async () => (
          await readCompositeCanvasContract(page, canvas, mode.canvas as CanvasKind)
        ).foregroundPixels, {
          timeout: 8_000,
          intervals: [100, 250, 500],
        }).toBeGreaterThanOrEqual(signatureFixture.contract.minimumForegroundPixels);

        const contract = await readCompositeCanvasContract(page, canvas, mode.canvas as CanvasKind);
        expect(contract.width, `${mode.id}/${palette.id} canvas width`).toBeGreaterThan(0);
        expect(contract.height, `${mode.id}/${palette.id} canvas height`).toBeGreaterThan(0);
        expect(contract.foregroundPixels, `${mode.id}/${palette.id} visible foreground pixels`).toBeGreaterThanOrEqual(
          signatureFixture.contract.minimumForegroundPixels,
        );
        expect(contract.colorBuckets, `${mode.id}/${palette.id} visible color buckets`).toBeGreaterThanOrEqual(
          signatureFixture.contract.minimumColorBuckets,
        );
        observations.push({ mode: mode.id, palette: palette.id, renderer: mode.renderer, canvas: contract });
      }
    }

    expect(observations).toHaveLength(signatureFixture.contract.modeCount * signatureFixture.contract.paletteCount);
    expect(new Set(observations.map(({ mode }) => mode)).size).toBe(signatureFixture.contract.modeCount);
    expect(new Set(observations.map(({ palette }) => palette)).size).toBe(signatureFixture.contract.paletteCount);

    // The JSON fixture is intentionally a contract, not a pixel snapshot. Keep
    // a machine-readable report for comparing a refactor run without making GPU
    // implementation differences a failure. Set UPDATE_VISUALIZER_BASELINE=1
    // when a new reference report is desired in a local artifact directory.
    if (process.env.UPDATE_VISUALIZER_BASELINE === "1") {
      const reportPath = testInfo.outputPath("visualizer-signatures.v1.observed.json");
      await testInfo.attach("visualizer-signatures.v1.observed", {
        body: JSON.stringify({ fixture: signatureFixture.version, observations }, null, 2),
        contentType: "application/json",
      });
      console.log(`Visualizer baseline observation attached: ${reportPath}`);
    }
  });
});
