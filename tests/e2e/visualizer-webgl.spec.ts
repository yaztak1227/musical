import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const captureDirectory = process.env.VISUALIZER_CAPTURE_DIR;
const pulseBandEdges = [0, 0.012, 0.025, 0.05, 0.095, 0.18, 0.31, 0.5, 0.72] as const;
const warpPulseBlockEdges = [
  0, 0.004, 0.008, 0.012, 0.018, 0.025, 0.035, 0.05, 0.068, 0.095, 0.13,
  0.18, 0.235, 0.31, 0.395, 0.5, 0.57, 0.62, 0.66, 0.69, 0.72,
] as const;
const warpHoleSourceUrl = new URL("../../src/lib/warpHoleWebgl.ts", import.meta.url);
const helixSourceUrl = new URL("../../src/lib/helixWebgl.ts", import.meta.url);

// Full-screen WebGL composers contend heavily when Playwright runs this file
// across several workers. Keep the visual contracts deterministic and avoid
// treating shared-GPU scheduling delays as rendering failures.
test.describe.configure({ mode: "serial" });

async function openPlayingVisualizer(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");
  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  await page.getByLabel("Player").getByRole("button", { name: "Open visualizer" }).click();
  await expect(page.getByRole("dialog", { name: "Player visualizer" })).toBeVisible();
}

test("keeps DNA Helix as Aurora-colored filament bundles instead of neon rails", async () => {
  const source = await readFile(helixSourceUrl, "utf8");
  const fragmentShader = source.match(/const fragmentShader = `([\s\S]*?)`;/)?.[1];
  expect(fragmentShader, "DNA Helix fragment shader source").toBeDefined();

  expect(source).toContain("const shaderColorCount = 8;");
  expect(fragmentShader).toContain("uniform vec3 uColors[8];");
  expect(fragmentShader).toContain("const int STRAND_FILAMENT_COUNT = 6;");
  expect(fragmentShader).toContain("const int RUNG_FILAMENT_COUNT = 3;");
  expect(fragmentShader).toContain("const float MAX_OUTPUT_ALPHA = 0.84;");
  expect(fragmentShader).toContain("const float MAX_OUTPUT_CHANNEL = 0.88;");
  expect(fragmentShader).toContain(
    "for (int filament = 0; filament < STRAND_FILAMENT_COUNT; filament++)",
  );
  expect(fragmentShader).toContain(
    "for (int filament = 0; filament < RUNG_FILAMENT_COUNT; filament++)",
  );
  expect(fragmentShader).toMatch(/float longWander\s*=\s*sin/);
  expect(fragmentShader).toMatch(/float fineFlutter\s*=\s*sin/);
  expect(fragmentShader).toContain("historyFrequencyEnergy(historyIndex, filamentBandProgress)");
  expect(fragmentShader).toContain("historyFrequencyRise(historyIndex, filamentBandProgress)");
  expect(fragmentShader).toContain("vec3 rungColor = helixColor(clamp(rungProgress");
  expect(fragmentShader).toContain("float highlightCompression = smoothstep");
  expect(fragmentShader).toContain("clamp(accumulated, 0.0, MAX_OUTPUT_CHANNEL)");
  expect(fragmentShader).not.toContain("float position = fract(progress)");
});

test("keeps Warp Hole built from eight filamented stream families instead of paired currents", async () => {
  const source = await readFile(warpHoleSourceUrl, "utf8");
  const fragmentShader = source.match(/const fragmentShader = `([\s\S]*?)`;/)?.[1];
  expect(fragmentShader, "Warp Hole fragment shader source").toBeDefined();

  expect(fragmentShader).toContain("const int STREAM_FAMILY_COUNT = 8;");
  expect(source).toContain("const bandCount = 20;");
  expect(source).toContain("const historyTextureWidth = bandCount / 4;");
  expect(fragmentShader).toContain("uniform float uBands[20];");
  expect(fragmentShader).toContain("uniform vec4 uAudioEnergy;");
  expect(fragmentShader).toContain("uniform vec4 uAudioRise;");
  expect(fragmentShader).toContain("const int FILAMENT_COUNT = 3;");
  expect(fragmentShader).toContain("const int EMITTED_FILAMENT_COUNT = 0;");
  expect(fragmentShader).toContain("const float MAX_OUTPUT_ALPHA = 0.84;");
  expect(fragmentShader).toContain("const float AURORA_RAINBOW_EXPOSURE = 1.65;");
  expect(fragmentShader).toContain("const float AURORA_RAINBOW_BLOOM_STRENGTH = 0.31;");
  expect(fragmentShader).toContain("const float AURORA_RAINBOW_BLOOM_RADIUS = 0.62;");
  expect(fragmentShader).toContain("const float AURORA_RAINBOW_BLOOM_THRESHOLD = 0.34;");
  expect(fragmentShader).toContain("clamp(accumulated, 0.0, 0.88)");
  expect(fragmentShader).toMatch(/vec3 intrinsicRainbow\s*\(/);
  expect(fragmentShader).toMatch(/float auroraRainbowProgress\s*\(/);
  expect(fragmentShader).toContain("uniform float uMist;");
  expect(fragmentShader).toContain("uniform float uRainbow;");
  expect(fragmentShader).toContain("uRainbow * 0.16");
  expect(fragmentShader).toMatch(/float curtainVeil\s*=/);
  expect(fragmentShader).toMatch(/float curtainShoulder\s*=/);
  expect(fragmentShader).toMatch(/float curtainHalo\s*=/);
  expect(fragmentShader).toMatch(/float auroraFineFilaments\s*=/);
  expect(fragmentShader).toMatch(/float auroraHairFilaments\s*=/);
  expect(fragmentShader).toContain("float auroraSilk = auroraFineFilaments * 0.3");
  expect(fragmentShader).toMatch(/float auroraDiffuse\s*=/);
  expect(fragmentShader).toMatch(/float restrainedWhiteCore\s*=/);
  expect(fragmentShader).toContain("float strandPixelWidth = clamp(fwidth(strandCoordinate) * 0.5");
  expect(source).toContain("const shaderColorCount = 8;");
  expect(fragmentShader).toContain(
    "for (int family = 0; family < STREAM_FAMILY_COUNT; family++)",
  );
  expect(fragmentShader).toContain(
    "for (int filament = 0; filament < FILAMENT_COUNT; filament++)",
  );
  expect(fragmentShader).toMatch(/float combineStridedEnergy\s*\(/);
  expect(fragmentShader).toMatch(/float combineStridedRise\s*\(/);
  expect(fragmentShader).toContain("vec4 history0 = texture2D(uBandHistory, vec2(0.1, historyV));");
  expect(fragmentShader).toContain("vec4 older4 = texture2D(uBandHistory, vec2(0.9, olderHistoryV));");
  expect(fragmentShader).toContain("combineStridedEnergy(history0.x, history1.y, history2.z, history3.w)");
  expect(fragmentShader).toContain("return mix(blockMean, blockPeak, 0.62);");
  expect(fragmentShader).toContain("return mix(riseMean, risePeak, 0.68);");
  expect(fragmentShader).toContain(
    "int filamentGroup = int(mod(abs(filamentCell) + float(family * 2), 5.0));",
  );
  expect(fragmentShader).toContain(
    "for (int emitted = 0; emitted < EMITTED_FILAMENT_COUNT; emitted++)",
  );
  expect(fragmentShader).toMatch(/float emittedRoot\s*=\s*curtainLean/);
  expect(fragmentShader).toMatch(/float emittedAcross\s*=\s*\(familyCrossDistance - emittedRoot\)/);
  expect(fragmentShader).toContain("int emittedGroup = int(mod(float(family * 3 + emitted * 2 + 1), 5.0));");
  expect(fragmentShader).toContain("emittedEnergy * 0.32 + emittedRise * 1.12");
  expect(fragmentShader).toContain("float emittedSignalGate = smoothstep(0.025, 0.11");
  expect(fragmentShader).toContain("float emittedThreshold = mix(0.985, 0.3, emittedDriver);");
  expect(fragmentShader).toContain("float emittedLength = (0.007 + emittedEnergy * 0.05 + emittedRise * 0.15)");
  expect(fragmentShader).toContain("float emittedTaper = mix(0.00092, 0.0001, emittedProgress);");
  expect(fragmentShader).toMatch(/float strandDensity\s*=\s*mix/);
  expect(fragmentShader).toMatch(/float strandBaseCell\s*=\s*floor/);
  expect(fragmentShader).toMatch(/float longWander\s*=\s*sin/);
  expect(fragmentShader).toMatch(/float fineFlutter\s*=\s*sin/);
  expect(fragmentShader).toMatch(/float filamentCenter\s*=\s*filamentCell \+ 0\.5 \+ filamentWander/);
  expect(fragmentShader).toContain("clamp(fwidth(strandCoordinate) * 0.5, 0.015, 0.11)");
  expect(fragmentShader).toContain("float inwardOnset = clamp(historyRise");
  expect(fragmentShader).toContain("lowEnergy * 0.009 + lowRise * 0.003");
  expect(fragmentShader).toContain("lowMidEnergy * 0.72 + lowMidRise * 0.38");
  expect(fragmentShader).toContain("midHighEnergy * 0.11 + midHighRise * 0.18");
  expect(fragmentShader).toContain("float highShimmer = pow(");
  expect(source).toContain("private readonly audioEnergyUniform = new Vector4();");
  expect(source).toContain("private readonly audioRiseUniform = new Vector4();");
  expect(fragmentShader).not.toContain("auroraFineFilaments * 0.0");
  expect(fragmentShader).toContain("* familyEnvelope\n        * 0.34;");
  expect(fragmentShader).toMatch(/vec3 stridedGroupColor\s*\(int groupIndex\)/);
  expect(fragmentShader).toContain("intrinsicStridedGroupColor(groupIndex)");
  expect(fragmentShader).toContain("inputPaletteColor(float(groupIndex) / 4.0)");
  expect(fragmentShader).toMatch(/vec3 strandColor\s*=\s*mix/);
  expect(fragmentShader).toContain("stridedGroupColor(filamentGroup)");

  for (const pairedCurrentIdentifier of [
    "mainPhase",
    "echoPhase",
    "cyanCurrentColor",
    "magentaCurrentColor",
  ]) {
    expect(fragmentShader).not.toContain(pairedCurrentIdentifier);
  }
});

test("distinguishes DNA bands and Warp Hole strided block groups and audio roles", async ({ page }) => {
  test.setTimeout(180_000);
  if (captureDirectory) await mkdir(captureDirectory, { recursive: true });
  await page.goto("/");
  await page.evaluate(() => {
    document.body.innerHTML = "";
    document.documentElement.style.background = "#000";
    document.body.style.background = "#000";
  });

  for (const visualizerKind of ["helix", "warp"] as const) {
    const hashes = new Set<number>();
    const signatures: number[] = [];
    const testedBands = visualizerKind === "helix" ? 8 : 20;
    const edges = visualizerKind === "helix" ? pulseBandEdges : warpPulseBlockEdges;
    for (let band = 0; band < testedBands; band += 1) {
      const signature = await page.evaluate(async ({ bandIndex, edges, kind }) => {
        const testWindow = window as typeof window & {
          __visualizerUnderTest?: { dispose(): void };
        };
        const canvas = document.createElement("canvas");
        canvas.dataset.testVisualizer = kind;
        canvas.style.width = "960px";
        canvas.style.height = "540px";
        document.body.append(canvas);

        const palette = [
          [39, 205, 255],
          [72, 224, 255],
          [92, 176, 255],
          [142, 112, 255],
          [222, 92, 255],
          [255, 100, 184],
        ] as const;
        const frequencyValues = new Uint8Array(256);
        const pulseBands = new Float32Array(8);
        pulseBands[bandIndex] = 1;
        const start = Math.floor(frequencyValues.length * (edges[bandIndex] ?? 0));
        const end = Math.max(start + 1, Math.floor(frequencyValues.length * (edges[bandIndex + 1] ?? 1)));
        frequencyValues.fill(255, start, end);

        if (kind === "helix") {
          const modulePath = "/src/lib/helixWebgl.ts";
          const { FrequencyHelixWebGLVisualizer } = await import(/* @vite-ignore */ modulePath);
          const visualizer = new FrequencyHelixWebGLVisualizer(canvas);
          const zeros = new Uint8Array(256);
          const zeroBands = new Float32Array(8);
          visualizer.renderFrame({ audioBands: zeroBands, audioFrequencyData: zeros, palette, time: 0 });
          visualizer.renderFrame({ audioBands: pulseBands, audioFrequencyData: frequencyValues, palette, time: 58 });
          for (const time of [116, 174, 232, 290]) {
            visualizer.renderFrame({ audioBands: zeroBands, audioFrequencyData: zeros, palette, time });
          }
          testWindow.__visualizerUnderTest = visualizer;
        } else {
          const modulePath = "/src/lib/warpHoleWebgl.ts";
          const { WarpHoleWebGLVisualizer } = await import(/* @vite-ignore */ modulePath);
          const visualizer = new WarpHoleWebGLVisualizer(canvas);
          const zeros = new Uint8Array(256);
          visualizer.render(zeros, 0, palette, false, true);
          visualizer.render(frequencyValues, 55, palette, false, true);
          for (const time of [110, 165, 220, 275]) visualizer.render(zeros, time, palette, false, true);
          testWindow.__visualizerUnderTest = visualizer;
        }

        const sample = document.createElement("canvas");
        sample.width = canvas.width;
        sample.height = canvas.height;
        const context = sample.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("2D sampling context unavailable");
        context.drawImage(canvas, 0, 0);
        const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
        let hash = 0;
        const stride = Math.max(4, Math.floor(pixels.length / 6000));
        for (let offset = 0; offset < pixels.length; offset += stride) {
          hash = (hash * 31 + (pixels[offset] ?? 0)) >>> 0;
        }
        return { encodedBytes: pixels.length, hash };
      }, { bandIndex: band, edges, kind: visualizerKind });

      const canvas = page.locator(`canvas[data-test-visualizer="${visualizerKind}"]`);
      expect(signature.encodedBytes).toBeGreaterThan(0);
      hashes.add(signature.hash);
      signatures.push(signature.hash);
      if (captureDirectory) {
        await canvas.screenshot({ path: path.join(captureDirectory, `${visualizerKind}-band-${band + 1}.png`) });
      }
      await page.evaluate(() => {
        const testWindow = window as typeof window & {
          __visualizerUnderTest?: { dispose(): void };
        };
        testWindow.__visualizerUnderTest?.dispose();
        delete testWindow.__visualizerUnderTest;
        document.querySelector("canvas")?.remove();
      });
    }
    if (visualizerKind === "helix") {
      expect(hashes.size).toBe(8);
      continue;
    }

    // The five strided frequency groups still select individual hairs, while
    // four macro roles now give low/low-mid/mid-high/high distinct behavior.
    // Group 4 has two taps (blocks 10 and 15) inside the same mid-high role;
    // every other group crosses all four roles exactly once.
    expect(hashes.size).toBe(19);
    for (let group = 0; group < 4; group += 1) {
      const roleHashes = [group, group + 5, group + 10, group + 15]
        .map((block) => signatures[block]);
      expect(new Set(roleHashes).size, `Warp group ${group + 1} macro roles`).toBe(4);
    }
    expect(new Set([signatures[4], signatures[9], signatures[14], signatures[19]]).size)
      .toBe(3);
  }
});

test("keeps selected theme and artwork palette values distinct", async ({ page }) => {
  await page.goto("/");
  const palettes = await page.evaluate(async () => {
    document.documentElement.style.setProperty("--primary", "rgb(20, 40, 60)");
    document.documentElement.style.setProperty("--accent", "rgb(180, 120, 60)");
    document.documentElement.style.setProperty("--foreground", "rgb(240, 240, 240)");

    const modulePath = "/src/components/PlayerVisualizerOverlay.tsx";
    const { extractArtworkVisualizerPalette, getThemeVisualizerPalette } = await import(
      /* @vite-ignore */ modulePath
    );
    const artwork = document.createElement("canvas");
    artwork.width = 36;
    artwork.height = 36;
    const context = artwork.getContext("2d");
    if (!context) throw new Error("Artwork fixture context unavailable");
    context.fillStyle = "rgb(220, 50, 30)";
    context.fillRect(0, 0, artwork.width, artwork.height);

    return {
      artwork: await extractArtworkVisualizerPalette(artwork.toDataURL("image/png")),
      theme: getThemeVisualizerPalette(),
    };
  });

  expect(palettes.theme).toEqual([
    [64, 80, 96],
    [87, 74, 60],
    [130, 140, 150],
    [191, 142, 92],
    [16, 33, 49],
  ]);
  expect(palettes.artwork).toEqual([
    [246, 52, 26],
    [177, 37, 19],
    [249, 109, 90],
    [177, 37, 19],
    [249, 109, 90],
  ]);
  expect(palettes.artwork).not.toEqual(palettes.theme);
});

test("updates Warp Hole from distinct selected palettes within the Aurora alpha ceiling", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const metrics = await page.evaluate(async ({ edges }) => {
    const modulePath = "/src/lib/warpHoleWebgl.ts";
    const { WarpHoleWebGLVisualizer } = await import(/* @vite-ignore */ modulePath);
    const canvas = document.createElement("canvas");
    canvas.style.width = "960px";
    canvas.style.height = "540px";
    document.body.append(canvas);

    const visualizer = new WarpHoleWebGLVisualizer(canvas);
    const frequencyValues = new Uint8Array(256);
    const updateFrequencyValues = (frame: number) => {
      for (let band = 0; band < 20; band += 1) {
        const start = Math.floor(frequencyValues.length * (edges[band] ?? 0));
        const end = Math.max(
          start + 1,
          Math.floor(frequencyValues.length * (edges[band + 1] ?? 1)),
        );
        const energy = 0.34 + (Math.sin(frame * 0.47 - band * 0.83) + 1) * 0.2;
        frequencyValues.fill(Math.round(energy * 255), start, end);
      }
    };
    const captureMetrics = () => {
      const sample = document.createElement("canvas");
      sample.width = canvas.width;
      sample.height = canvas.height;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("2D sampling context unavailable");
      context.drawImage(canvas, 0, 0);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      let blue = 0;
      let maximumAlpha = 0;
      let red = 0;
      let visiblePixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const alpha = pixels[offset + 3] ?? 0;
        maximumAlpha = Math.max(maximumAlpha, alpha);
        if (alpha < 16) continue;
        red += pixels[offset] ?? 0;
        blue += pixels[offset + 2] ?? 0;
        visiblePixels += 1;
      }
      return { blue, maximumAlpha, red, visiblePixels };
    };
    const renderFrames = (
      palette: ReadonlyArray<readonly [number, number, number]>,
      startFrame: number,
      frameCount: number,
    ) => {
      for (let frame = startFrame; frame < startFrame + frameCount; frame += 1) {
        updateFrequencyValues(frame);
        visualizer.render(frequencyValues, frame * 55, palette, false, true, true);
      }
    };

    const redPalette = Array.from({ length: 5 }, () => [224, 48, 48] as const);
    const artworkPalette = Array.from({ length: 5 }, () => [48, 80, 224] as const);
    renderFrames(redPalette, 0, 40);
    const redRender = captureMetrics();
    updateFrequencyValues(40);
    visualizer.render(frequencyValues, 39 * 55 + 1, artworkPalette, false, true, true);
    const artworkRender = captureMetrics();
    visualizer.dispose();
    canvas.remove();
    return { artworkRender, redRender };
  }, { edges: warpPulseBlockEdges });

  expect(metrics.redRender.maximumAlpha).toBeLessThanOrEqual(Math.ceil(0.84 * 255));
  expect(metrics.artworkRender.maximumAlpha).toBeLessThanOrEqual(Math.ceil(0.84 * 255));
  expect(metrics.redRender.visiblePixels).toBeGreaterThan(0);
  expect(metrics.artworkRender.visiblePixels).toBeGreaterThan(0);
  expect(metrics.redRender.red).toBeGreaterThan(metrics.redRender.blue * 1.35);
  expect(metrics.artworkRender.blue).toBeGreaterThan(metrics.artworkRender.red * 1.35);
});

test("gives sustained Warp Hole frequency regions four distinct visual roles", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const results = await page.evaluate(async ({ edges, shouldCapture }) => {
    const modulePath = "/src/lib/warpHoleWebgl.ts";
    const { WarpHoleWebGLVisualizer } = await import(/* @vite-ignore */ modulePath);
    const rainbowPalette = [
      [148, 245, 31],
      [20, 209, 87],
      [10, 235, 184],
      [8, 189, 250],
      [31, 87, 250],
      [122, 51, 245],
      [235, 46, 199],
      [250, 77, 140],
    ] as const;
    const roles = [
      { endBand: 4, name: "low", startBand: 0 },
      { endBand: 9, name: "low-mid", startBand: 4 },
      { endBand: 15, name: "mid-high", startBand: 9 },
      { endBand: 20, name: "high", startBand: 15 },
    ] as const;

    const captures = [];
    for (const role of roles) {
      const canvas = document.createElement("canvas");
      canvas.style.width = "960px";
      canvas.style.height = "540px";
      document.body.append(canvas);
      const visualizer = new WarpHoleWebGLVisualizer(canvas);
      const frequencyValues = new Uint8Array(256);
      visualizer.render(frequencyValues, 0, rainbowPalette, false, true, true, "rainbow");

      for (let frame = 1; frame <= 28; frame += 1) {
        frequencyValues.fill(0);
        const level = Math.round((0.7 + Math.sin(frame * 0.41) * 0.12) * 255);
        for (let band = role.startBand; band < role.endBand; band += 1) {
          const start = Math.floor(frequencyValues.length * (edges[band] ?? 0));
          const end = Math.max(
            start + 1,
            Math.floor(frequencyValues.length * (edges[band + 1] ?? 1)),
          );
          frequencyValues.fill(level, start, end);
        }
        visualizer.render(
          frequencyValues,
          frame * 55,
          rainbowPalette,
          false,
          true,
          true,
          "rainbow",
        );
      }

      const sample = document.createElement("canvas");
      sample.width = canvas.width;
      sample.height = canvas.height;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("2D sampling context unavailable");
      context.drawImage(canvas, 0, 0);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      let hash = 0;
      let maximumAlpha = 0;
      let visiblePixels = 0;
      const stride = Math.max(4, Math.floor(pixels.length / 16_000));
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const alpha = pixels[offset + 3] ?? 0;
        maximumAlpha = Math.max(maximumAlpha, alpha);
        if (alpha >= 16) visiblePixels += 1;
      }
      for (let offset = 0; offset < pixels.length; offset += stride) {
        hash = (hash * 31 + (pixels[offset] ?? 0)) >>> 0;
      }
      captures.push({
        dataUrl: shouldCapture ? sample.toDataURL("image/png") : null,
        hash,
        maximumAlpha,
        name: role.name,
        pixelCount: sample.width * sample.height,
        visiblePixels,
      });
      visualizer.dispose();
      canvas.remove();
    }
    return captures;
  }, { edges: warpPulseBlockEdges, shouldCapture: Boolean(captureDirectory) });

  if (captureDirectory) {
    await mkdir(captureDirectory, { recursive: true });
    for (const result of results) {
      if (!result.dataUrl) continue;
      await writeFile(
        path.join(captureDirectory, `warp-role-${result.name}.png`),
        Buffer.from(result.dataUrl.split(",")[1] ?? "", "base64"),
      );
    }
  }

  expect(new Set(results.map(({ hash }) => hash)).size).toBe(4);
  for (const result of results) {
    expect(result.maximumAlpha, `${result.name} alpha`).toBeLessThanOrEqual(Math.ceil(0.84 * 255));
    expect(result.visiblePixels, `${result.name} visible pixels`).toBeGreaterThan(
      result.pixelCount * 0.005,
    );
  }
});

test("keeps the Aurora Warp Hole rainbow with wide color and white-point control", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const metrics = await page.evaluate(async ({ edges, shouldCapture }) => {
    const modulePath = "/src/lib/warpHoleWebgl.ts";
    const { WarpHoleWebGLVisualizer } = await import(/* @vite-ignore */ modulePath);
    const canvas = document.createElement("canvas");
    canvas.style.width = "960px";
    canvas.style.height = "540px";
    document.body.append(canvas);

    const visualizer = new WarpHoleWebGLVisualizer(canvas);
    const rainbowPalette = [
      [148, 245, 31],
      [20, 209, 87],
      [10, 235, 184],
      [8, 189, 250],
      [31, 87, 250],
      [122, 51, 245],
      [235, 46, 199],
      [250, 77, 140],
    ] as const;
    const frequencyValues = new Uint8Array(256);
    for (let frame = 0; frame < 40; frame += 1) {
      for (let band = 0; band < 20; band += 1) {
        const start = Math.floor(frequencyValues.length * (edges[band] ?? 0));
        const end = Math.max(
          start + 1,
          Math.floor(frequencyValues.length * (edges[band + 1] ?? 1)),
        );
        const energy = 0.34 + (Math.sin(frame * 0.47 - band * 0.83) + 1) * 0.2;
        frequencyValues.fill(Math.round(energy * 255), start, end);
      }
      visualizer.render(frequencyValues, frame * 55, rainbowPalette, false, true, true, "rainbow");
    }

    const sample = document.createElement("canvas");
    sample.width = canvas.width;
    sample.height = canvas.height;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D sampling context unavailable");
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const hueBins = new Uint32Array(8);
    const luminanceHistogram = new Uint32Array(256);
    let maximumAlpha = 0;
    let nearWhitePixels = 0;
    let saturatedPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const alpha = pixels[offset + 3] ?? 0;
      maximumAlpha = Math.max(maximumAlpha, alpha);
      const maximumChannel = Math.max(red, green, blue);
      const minimumChannel = Math.min(red, green, blue);
      const chroma = maximumChannel - minimumChannel;
      const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
      luminanceHistogram[luminance] += 1;
      if (luminance > 242) nearWhitePixels += 1;
      if (alpha < 16 || maximumChannel < 24 || chroma < maximumChannel * 0.28) continue;

      let hue: number;
      if (maximumChannel === red) hue = 60 * ((green - blue) / chroma);
      else if (maximumChannel === green) hue = 60 * (2 + (blue - red) / chroma);
      else hue = 60 * (4 + (red - green) / chroma);
      if (hue < 0) hue += 360;
      hueBins[Math.min(hueBins.length - 1, Math.floor(hue / 45))] += 1;
      saturatedPixels += 1;
    }
    visualizer.dispose();
    canvas.remove();

    const occupancyThreshold = Math.max(16, saturatedPixels * 0.0025);
    const p99Threshold = sample.width * sample.height * 0.99;
    let cumulativePixels = 0;
    let luminanceP99 = 0;
    for (let value = 0; value < luminanceHistogram.length; value += 1) {
      cumulativePixels += luminanceHistogram[value] ?? 0;
      if (cumulativePixels >= p99Threshold) {
        luminanceP99 = value;
        break;
      }
    }
    return {
      captureDataUrl: shouldCapture ? sample.toDataURL("image/png") : null,
      luminanceP99,
      maximumAlpha,
      nearWhitePixels,
      occupiedHueBins: Array.from(hueBins)
        .filter((pixelCount) => pixelCount >= occupancyThreshold)
        .length,
      pixelCount: sample.width * sample.height,
      saturatedPixels,
    };
  }, { edges: warpPulseBlockEdges, shouldCapture: Boolean(captureDirectory) });

  if (captureDirectory && metrics.captureDataUrl) {
    await mkdir(captureDirectory, { recursive: true });
    await writeFile(
      path.join(captureDirectory, "warp-rainbow-latest.png"),
      Buffer.from(metrics.captureDataUrl.split(",")[1] ?? "", "base64"),
    );
  }

  expect(metrics.maximumAlpha).toBeLessThanOrEqual(Math.ceil(0.84 * 255));
  expect(metrics.luminanceP99).toBeLessThanOrEqual(Math.round(255 * 0.78));
  expect(metrics.nearWhitePixels).toBeLessThan(metrics.pixelCount * 0.001);
  expect(metrics.saturatedPixels).toBeGreaterThan(metrics.pixelCount * 0.005);
  expect(metrics.occupiedHueBins).toBeGreaterThanOrEqual(6);
});

test("keeps the Aurora DNA rainbow saturated without white clipping", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const metrics = await page.evaluate(async ({ shouldCapture }) => {
    const modulePath = "/src/lib/helixWebgl.ts";
    const { FrequencyHelixWebGLVisualizer } = await import(/* @vite-ignore */ modulePath);
    const canvas = document.createElement("canvas");
    canvas.style.width = "960px";
    canvas.style.height = "540px";
    document.body.append(canvas);

    const visualizer = new FrequencyHelixWebGLVisualizer(canvas);
    const rainbowPalette = [
      [148, 245, 31],
      [20, 209, 87],
      [10, 235, 184],
      [8, 189, 250],
      [31, 87, 250],
      [122, 51, 245],
      [235, 46, 199],
      [250, 77, 140],
    ] as const;
    const frequencyValues = new Uint8Array(256);
    const bands = new Float32Array(8);
    for (let frame = 0; frame < 40; frame += 1) {
      for (let band = 0; band < bands.length; band += 1) {
        bands[band] = 0.3 + (Math.sin(frame * 0.47 - band * 0.83) + 1) * 0.22;
      }
      for (let bucket = 0; bucket < frequencyValues.length; bucket += 1) {
        frequencyValues[bucket] = Math.round((bands[bucket % bands.length] ?? 0) * 255);
      }
      visualizer.renderFrame({
        audioBands: bands,
        audioFrequencyData: frequencyValues,
        palette: rainbowPalette,
        time: frame * 58,
      });
    }

    const sample = document.createElement("canvas");
    sample.width = canvas.width;
    sample.height = canvas.height;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D sampling context unavailable");
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const hueBins = new Uint32Array(8);
    const luminanceHistogram = new Uint32Array(256);
    let maximumAlpha = 0;
    let nearWhitePixels = 0;
    let saturatedPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const alpha = pixels[offset + 3] ?? 0;
      maximumAlpha = Math.max(maximumAlpha, alpha);
      const maximumChannel = Math.max(red, green, blue);
      const minimumChannel = Math.min(red, green, blue);
      const chroma = maximumChannel - minimumChannel;
      const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
      luminanceHistogram[luminance] += 1;
      if (luminance > 242) nearWhitePixels += 1;
      if (alpha < 16 || maximumChannel < 24 || chroma < maximumChannel * 0.28) continue;

      let hue: number;
      if (maximumChannel === red) hue = 60 * ((green - blue) / chroma);
      else if (maximumChannel === green) hue = 60 * (2 + (blue - red) / chroma);
      else hue = 60 * (4 + (red - green) / chroma);
      if (hue < 0) hue += 360;
      hueBins[Math.min(hueBins.length - 1, Math.floor(hue / 45))] += 1;
      saturatedPixels += 1;
    }
    visualizer.dispose();
    canvas.remove();

    const occupancyThreshold = Math.max(16, saturatedPixels * 0.0025);
    const p99Threshold = sample.width * sample.height * 0.99;
    let cumulativePixels = 0;
    let luminanceP99 = 0;
    for (let value = 0; value < luminanceHistogram.length; value += 1) {
      cumulativePixels += luminanceHistogram[value] ?? 0;
      if (cumulativePixels >= p99Threshold) {
        luminanceP99 = value;
        break;
      }
    }
    return {
      captureDataUrl: shouldCapture ? sample.toDataURL("image/png") : null,
      luminanceP99,
      maximumAlpha,
      nearWhitePixels,
      occupiedHueBins: Array.from(hueBins)
        .filter((pixelCount) => pixelCount >= occupancyThreshold)
        .length,
      pixelCount: sample.width * sample.height,
      saturatedPixels,
    };
  }, { shouldCapture: Boolean(captureDirectory) });

  if (captureDirectory && metrics.captureDataUrl) {
    await mkdir(captureDirectory, { recursive: true });
    await writeFile(
      path.join(captureDirectory, "dna-rainbow-latest.png"),
      Buffer.from(metrics.captureDataUrl.split(",")[1] ?? "", "base64"),
    );
  }

  expect(metrics.maximumAlpha).toBeLessThanOrEqual(Math.ceil(0.84 * 255));
  expect(metrics.luminanceP99).toBeLessThanOrEqual(Math.round(255 * 0.78));
  expect(metrics.nearWhitePixels).toBeLessThan(metrics.pixelCount * 0.001);
  expect(metrics.saturatedPixels).toBeGreaterThan(metrics.pixelCount * 0.005);
  expect(metrics.occupiedHueBins).toBeGreaterThanOrEqual(6);
});

test("keeps low-energy DNA history visible without white clipping", async ({ page }) => {
  await page.goto("/");
  const metrics = await page.evaluate(async () => {
    const modulePath = "/src/lib/helixWebgl.ts";
    const { FrequencyHelixWebGLVisualizer } = await import(/* @vite-ignore */ modulePath);
    const canvas = document.createElement("canvas");
    canvas.style.width = "960px";
    canvas.style.height = "540px";
    document.body.append(canvas);

    const visualizer = new FrequencyHelixWebGLVisualizer(canvas);
    const palette = [
      [39, 205, 255],
      [72, 224, 255],
      [92, 176, 255],
      [142, 112, 255],
      [222, 92, 255],
      [255, 100, 184],
    ] as const;
    const frequencyValues = new Uint8Array(256);
    const bands = new Float32Array(8);

    for (let frame = 0; frame < 36; frame += 1) {
      for (let band = 0; band < bands.length; band += 1) {
        const energy = 0.055 + (Math.sin(frame * 0.63 + band * 1.17) + 1) * 0.035;
        bands[band] = energy;
      }
      for (let bucket = 0; bucket < frequencyValues.length; bucket += 1) {
        frequencyValues[bucket] = Math.round((bands[bucket % bands.length] ?? 0) * 255);
      }
      visualizer.renderFrame({ audioBands: bands, audioFrequencyData: frequencyValues, palette, time: frame * 58 });
    }

    const sample = document.createElement("canvas");
    sample.width = canvas.width;
    sample.height = canvas.height;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D sampling context unavailable");
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const luminanceHistogram = new Uint32Array(256);
    let visiblePixels = 0;
    let nearWhitePixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const luminance = Math.round(
        (pixels[offset] ?? 0) * 0.2126
          + (pixels[offset + 1] ?? 0) * 0.7152
          + (pixels[offset + 2] ?? 0) * 0.0722,
      );
      luminanceHistogram[luminance] += 1;
      if (luminance >= 16 && (pixels[offset + 3] ?? 0) >= 16) visiblePixels += 1;
      if (luminance > 242) nearWhitePixels += 1;
    }
    const target = sample.width * sample.height * 0.99;
    let cumulative = 0;
    let luminanceP99 = 0;
    for (let value = 0; value < luminanceHistogram.length; value += 1) {
      cumulative += luminanceHistogram[value] ?? 0;
      if (cumulative >= target) {
        luminanceP99 = value;
        break;
      }
    }
    visualizer.dispose();
    canvas.remove();
    return { luminanceP99, nearWhitePixels, pixelCount: sample.width * sample.height, visiblePixels };
  });

  expect(metrics.visiblePixels).toBeGreaterThan(metrics.pixelCount * 0.08);
  expect(metrics.luminanceP99).toBeLessThanOrEqual(Math.round(255 * 0.78));
  expect(metrics.nearWhitePixels).toBeLessThanOrEqual(metrics.pixelCount * 0.001);
});

test("captures DNA and warp motion at the acceptance intervals", async ({ page }) => {
  test.skip(!captureDirectory, "Set VISUALIZER_CAPTURE_DIR to save visual validation frames.");
  test.setTimeout(120_000);
  await mkdir(captureDirectory!, { recursive: true });
  await openPlayingVisualizer(page);
  await page.getByRole("button", { name: "Original", exact: true }).click();

  for (const capture of [
    { button: "DNA Helix", canvas: ".visualizer-helix-canvas.active", prefix: "dna" },
    { button: "Warp Hole", canvas: ".visualizer-warp-hole-canvas.active", prefix: "warp" },
  ]) {
    await page.getByRole("button", { name: capture.button, exact: true }).click();
    const canvas = page.locator(capture.canvas);
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(2_000);
    await canvas.screenshot({ path: path.join(captureDirectory!, `${capture.prefix}-000ms.png`) });
    await page.waitForTimeout(250);
    await canvas.screenshot({ path: path.join(captureDirectory!, `${capture.prefix}-250ms.png`) });
    await page.waitForTimeout(250);
    await canvas.screenshot({ path: path.join(captureDirectory!, `${capture.prefix}-500ms.png`) });
  }
});
