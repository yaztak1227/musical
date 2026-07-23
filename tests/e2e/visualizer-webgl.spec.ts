import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const captureDirectory = process.env.VISUALIZER_CAPTURE_DIR;
const pulseBandEdges = [0, 0.012, 0.025, 0.05, 0.095, 0.18, 0.31, 0.5, 0.72] as const;
const warpPulseBlockEdges = [
  0, 0.004, 0.008, 0.012, 0.018, 0.025, 0.035, 0.05, 0.068, 0.095, 0.13,
  0.18, 0.235, 0.31, 0.395, 0.5, 0.57, 0.62, 0.66, 0.69, 0.72,
] as const;
const warpHoleSourceUrl = new URL("../../src/lib/warpHoleWebgl.ts", import.meta.url);

async function openPlayingVisualizer(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");
  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  await page.getByLabel("Player").getByRole("button", { name: "Open visualizer" }).click();
  await expect(page.getByRole("dialog", { name: "Player visualizer" })).toBeVisible();
}

test("keeps Warp Hole built from eight filamented stream families instead of paired currents", async () => {
  const source = await readFile(warpHoleSourceUrl, "utf8");
  const fragmentShader = source.match(/const fragmentShader = `([\s\S]*?)`;/)?.[1];
  expect(fragmentShader, "Warp Hole fragment shader source").toBeDefined();

  expect(fragmentShader).toContain("const int STREAM_FAMILY_COUNT = 8;");
  expect(source).toContain("const bandCount = 20;");
  expect(source).toContain("const historyTextureWidth = bandCount / 4;");
  expect(fragmentShader).toContain("uniform float uBands[20];");
  expect(fragmentShader).toContain("const int FILAMENT_COUNT = 11;");
  expect(fragmentShader).toContain("const int EMITTED_FILAMENT_COUNT = 13;");
  expect(fragmentShader).toContain("const float MAX_OUTPUT_ALPHA = 0.84;");
  expect(fragmentShader).toContain("const float AURORA_RAINBOW_EXPOSURE = 1.65;");
  expect(fragmentShader).toContain("const float AURORA_RAINBOW_BLOOM_STRENGTH = 0.31;");
  expect(fragmentShader).toContain("const float AURORA_RAINBOW_BLOOM_RADIUS = 0.62;");
  expect(fragmentShader).toContain("const float AURORA_RAINBOW_BLOOM_THRESHOLD = 0.34;");
  expect(fragmentShader).toContain("clamp(displayColor, 0.0, 0.88)");
  expect(fragmentShader).toMatch(/vec3 intrinsicRainbow\s*\(/);
  expect(fragmentShader).toMatch(/float curtainVeil\s*=/);
  expect(fragmentShader).toMatch(/float curtainShoulder\s*=/);
  expect(fragmentShader).toMatch(/float curtainHalo\s*=/);
  expect(fragmentShader).toContain(
    "for (int family = 0; family < STREAM_FAMILY_COUNT; family++)",
  );
  expect(fragmentShader).toContain(
    "for (int filament = 0; filament < FILAMENT_COUNT; filament++)",
  );
  expect(fragmentShader).toMatch(/float historyBlockEnergy\s*\(float historyV, int blockIndex\)/);
  expect(fragmentShader).toContain("vec2((float(texelIndex) + 0.5) / 5.0, historyV)");
  expect(fragmentShader).toContain("float block0 = historyBlockEnergy(historyV, groupIndex);");
  expect(fragmentShader).toContain("float block1 = historyBlockEnergy(historyV, groupIndex + 5);");
  expect(fragmentShader).toContain("float block2 = historyBlockEnergy(historyV, groupIndex + 10);");
  expect(fragmentShader).toContain("float block3 = historyBlockEnergy(historyV, groupIndex + 15);");
  expect(fragmentShader).toContain("return mix(blockMean, blockPeak, 0.62);");
  expect(fragmentShader).toContain("return mix(riseMean, risePeak, 0.68);");
  expect(fragmentShader).toContain("int filamentGroup = int(mod(float(family * 2 + filament * 3), 5.0));");
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
  expect(fragmentShader).toMatch(/float strandCommonWander\s*=\s*sin/);
  expect(fragmentShader).toMatch(/float longWander\s*=\s*sin/);
  expect(fragmentShader).toMatch(/float fineFlutter\s*=\s*sin/);
  expect(fragmentShader).toMatch(/float bundleWander\s*=\s*mix\(strandCommonWander, longWander, 0\.32\)/);
  expect(fragmentShader).toMatch(/float filamentOffset\s*=\s*\(\s*curtainLean/);
  expect(fragmentShader).toMatch(/vec3 stridedGroupColor\s*\(int groupIndex\)/);
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

test("distinguishes DNA bands and Warp Hole strided block groups", async ({ page }) => {
  test.setTimeout(150_000);
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

    const highTapGroupHashes: number[] = [];
    for (let group = 0; group < 5; group += 1) {
      const highTapHashes = [group + 5, group + 10, group + 15]
        .map((block) => signatures[block]);
      expect(new Set(highTapHashes).size, `Warp group ${group + 1} high taps`).toBe(1);
      expect(highTapHashes[0], `Warp group ${group + 1} high-tap signature`).toBeDefined();
      highTapGroupHashes.push(highTapHashes[0]!);
      if (group >= 2) expect(signatures[group]).toBe(highTapHashes[0]);
    }
    expect(new Set(highTapGroupHashes).size).toBe(5);
  }
});

test("keeps Warp Hole intrinsically rainbow within the Aurora alpha ceiling", async ({ page }) => {
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
    const neutralPalette = Array.from(
      { length: 6 },
      () => [148, 148, 148] as const,
    );
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
      visualizer.render(frequencyValues, frame * 55, neutralPalette, false, true);
    }

    const sample = document.createElement("canvas");
    sample.width = canvas.width;
    sample.height = canvas.height;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D sampling context unavailable");
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const hueBins = new Uint32Array(8);
    let maximumAlpha = 0;
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
      if (alpha < 16 || maximumChannel < 24 || chroma < maximumChannel * 0.28) continue;

      let hue: number;
      if (maximumChannel === red) {
        hue = 60 * ((green - blue) / chroma);
      } else if (maximumChannel === green) {
        hue = 60 * (2 + (blue - red) / chroma);
      } else {
        hue = 60 * (4 + (red - green) / chroma);
      }
      if (hue < 0) hue += 360;
      hueBins[Math.min(hueBins.length - 1, Math.floor(hue / 45))] += 1;
      saturatedPixels += 1;
    }
    visualizer.dispose();
    canvas.remove();

    const occupancyThreshold = Math.max(16, saturatedPixels * 0.0025);
    const occupiedHueBins = Array.from(hueBins)
      .filter((pixelCount) => pixelCount >= occupancyThreshold)
      .length;
    return {
      coolPixels: (hueBins[4] ?? 0) + (hueBins[5] ?? 0),
      limeGreenPixels: (hueBins[1] ?? 0) + (hueBins[2] ?? 0) + (hueBins[3] ?? 0),
      maximumAlpha,
      occupiedHueBins,
      pixelCount: sample.width * sample.height,
      saturatedPixels,
      violetRosePixels: (hueBins[6] ?? 0) + (hueBins[7] ?? 0),
    };
  }, { edges: warpPulseBlockEdges });

  expect(metrics.maximumAlpha).toBeLessThanOrEqual(Math.ceil(0.84 * 255));
  expect(metrics.saturatedPixels).toBeGreaterThan(metrics.pixelCount * 0.005);
  expect(metrics.occupiedHueBins).toBeGreaterThanOrEqual(6);
  expect(metrics.limeGreenPixels).toBeGreaterThan(metrics.saturatedPixels * 0.03);
  expect(metrics.coolPixels).toBeGreaterThan(metrics.saturatedPixels * 0.03);
  expect(metrics.violetRosePixels).toBeGreaterThan(metrics.saturatedPixels * 0.03);
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
