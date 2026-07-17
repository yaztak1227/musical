import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const captureDirectory = process.env.VISUALIZER_CAPTURE_DIR;
const pulseBandEdges = [0, 0.012, 0.025, 0.05, 0.095, 0.18, 0.31, 0.5, 0.72] as const;

async function canvasSignature(canvas: Locator) {
  const screenshot = await canvas.screenshot();
  let hash = 0;
  const stride = Math.max(1, Math.floor(screenshot.length / 6000));
  for (let index = 0; index < screenshot.length; index += stride) {
    hash = (hash * 31 + (screenshot[index] ?? 0)) >>> 0;
  }
  return { encodedBytes: screenshot.length, hash };
}

async function openPlayingVisualizer(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => window.localStorage.setItem("musical.locale", "en"));
  await page.goto("/");
  await page.getByLabel("Player").getByRole("button", { name: "Play", exact: true }).click();
  await page.getByLabel("Player").getByRole("button", { name: "Open visualizer" }).click();
  await expect(page.getByRole("dialog", { name: "Player visualizer" })).toBeVisible();
}

test("distinguishes all eight single-band pulses in the DNA and warp shaders", async ({ page }) => {
  test.setTimeout(60_000);
  if (captureDirectory) await mkdir(captureDirectory, { recursive: true });
  await page.goto("/");
  await page.evaluate(() => {
    document.body.innerHTML = "";
    document.documentElement.style.background = "#000";
    document.body.style.background = "#000";
  });

  for (const visualizerKind of ["helix", "warp"] as const) {
    const hashes = new Set<number>();
    for (let band = 0; band < 8; band += 1) {
      await page.evaluate(async ({ bandIndex, edges, kind }) => {
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
      }, { bandIndex: band, edges: pulseBandEdges, kind: visualizerKind });

      const canvas = page.locator(`canvas[data-test-visualizer="${visualizerKind}"]`);
      const signature = await canvasSignature(canvas);
      expect(signature.encodedBytes).toBeGreaterThan(0);
      hashes.add(signature.hash);
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
    expect(hashes.size).toBe(8);
  }
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
    if (capture.prefix === "dna") {
      await page.waitForTimeout(250);
      await canvas.screenshot({ path: path.join(captureDirectory!, "dna-500ms.png") });
    }
  }
});
