import type {
  ResolvedVisualizerPalette,
  VisualizerColor,
  VisualizerPalette,
  VisualizerPaletteMode,
  VisualizerCssSettings,
} from "./types";
import { resolveAuroraVisualProfile } from "@/lib/visualizerAnalysis";

export { visualizerPaletteModes } from "./registry";

export const rainbowVisualizerPalette: VisualizerPalette = [
  [154, 232, 91],
  [69, 225, 145],
  [61, 216, 199],
  [72, 177, 235],
  [104, 126, 239],
  [169, 96, 235],
  [232, 83, 197],
  [245, 126, 185],
];

export const originalVisualizerPalette: VisualizerPalette = [
  [92, 219, 255],
  [65, 164, 243],
  [99, 119, 232],
  [151, 91, 218],
  [66, 194, 183],
];

export { isVisualizerPaletteMode } from "./registry";

export function rgba(color: VisualizerColor, alpha = 1) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function paletteColor(palette: VisualizerPalette, index: number) {
  return palette[((index % palette.length) + palette.length) % palette.length] ?? rainbowVisualizerPalette[0];
}

export function mixVisualizerColors(first: VisualizerColor, second: VisualizerColor, amount: number): VisualizerColor {
  const blend = Math.max(0, Math.min(1, amount));
  return [
    Math.round(first[0] + (second[0] - first[0]) * blend),
    Math.round(first[1] + (second[1] - first[1]) * blend),
    Math.round(first[2] + (second[2] - first[2]) * blend),
  ];
}

function resolveCssVisualizerColor(value: string, fallback: VisualizerColor): VisualizerColor {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.position = "fixed";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  probe.style.color = value;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return fallback;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = resolved;
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return pixel[3] ? [pixel[0], pixel[1], pixel[2]] : fallback;
}

export function getThemeVisualizerPalette(): VisualizerPalette {
  const primary = resolveCssVisualizerColor("var(--primary)", rainbowVisualizerPalette[0]);
  const accent = resolveCssVisualizerColor("var(--accent)", rainbowVisualizerPalette[1]);
  const foreground = resolveCssVisualizerColor("var(--foreground)", [255, 255, 255]);
  return [
    mixVisualizerColors(primary, foreground, 0.2),
    mixVisualizerColors(primary, accent, 0.42),
    mixVisualizerColors(primary, foreground, 0.5),
    mixVisualizerColors(accent, foreground, 0.18),
    mixVisualizerColors(primary, [0, 0, 0], 0.18),
  ];
}

function rgbToHue([red, green, blue]: VisualizerColor) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  if (delta === 0) return 0;
  const hue = maximum === r
    ? ((g - b) / delta) % 6
    : maximum === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}

function enhanceArtworkColor(color: VisualizerColor): VisualizerColor {
  const average = (color[0] + color[1] + color[2]) / 3;
  return color.map((channel) => Math.round(Math.max(24, Math.min(246, average + (channel - average) * 1.32 + 18)))) as unknown as VisualizerColor;
}

export async function extractArtworkVisualizerPalette(src: string): Promise<VisualizerPalette | null> {
  if (!src || typeof Image === "undefined") return null;
  const image = new Image();
  image.crossOrigin = "anonymous";
  const loaded = new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
  });
  image.src = src;
  if (!(await loaded)) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 36;
  canvas.height = 36;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const buckets = Array.from({ length: 12 }, () => ({ color: [0, 0, 0] as [number, number, number], count: 0, score: 0 }));
    for (let index = 0; index < pixels.length; index += 16) {
      const color: VisualizerColor = [pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0];
      const alpha = pixels[index + 3] ?? 0;
      const maximum = Math.max(...color);
      const minimum = Math.min(...color);
      const saturation = maximum - minimum;
      const lightness = (maximum + minimum) / 2;
      if (alpha < 180 || lightness < 22 || lightness > 238) continue;
      const bucket = buckets[Math.floor(rgbToHue(color) / 30) % buckets.length];
      bucket.color[0] += color[0];
      bucket.color[1] += color[1];
      bucket.color[2] += color[2];
      bucket.count += 1;
      bucket.score += 1 + saturation / 80;
    }
    const colors = buckets
      .filter((bucket) => bucket.count > 0)
      .sort((first, second) => second.score - first.score)
      .slice(0, 4)
      .map((bucket) => enhanceArtworkColor([
        Math.round(bucket.color[0] / bucket.count),
        Math.round(bucket.color[1] / bucket.count),
        Math.round(bucket.color[2] / bucket.count),
      ]));
    if (colors.length === 0) return null;
    while (colors.length < 5) {
      const base = colors[colors.length % Math.max(1, colors.length)] ?? rainbowVisualizerPalette[0];
      colors.push(mixVisualizerColors(base, colors.length % 2 === 0 ? [255, 255, 255] : [0, 0, 0], 0.28));
    }
    return colors;
  } catch {
    return null;
  }
}

export function getAuroraVisualizerPalette(palette: VisualizerPalette, paletteMode: VisualizerPaletteMode): VisualizerPalette {
  if (paletteMode === "rainbow") return rainbowVisualizerPalette;
  return [paletteColor(palette, 4), paletteColor(palette, 0), paletteColor(palette, 2), paletteColor(palette, 1)];
}

function cssSettingsForPalette(
  colors: VisualizerPalette,
  artworkSrc: string,
  modeColumnCount: number,
  paletteColumnCount: number,
): VisualizerCssSettings {
  const css: VisualizerCssSettings = {
    "--visualizer-mode-columns": `repeat(${modeColumnCount}, 34px)`,
    "--visualizer-palette-columns": `repeat(${paletteColumnCount}, 34px)`,
  };
  colors.slice(0, 5).forEach((color, index) => {
    (css as Record<string, string>)[`--visualizer-color-${index}`] = rgba(color);
  });
  if (artworkSrc) css["--visualizer-artwork"] = `url("${artworkSrc.replace(/"/g, '\\"')}")`;
  return css;
}

export function resolveVisualizerPalette(
  paletteMode: VisualizerPaletteMode,
  colors: VisualizerPalette,
  artworkSrc = "",
  modeColumnCount = 10,
  paletteColumnCount = 4,
): ResolvedVisualizerPalette {
  const resolvedColors = paletteMode === "rainbow"
    ? rainbowVisualizerPalette
    : paletteMode === "original"
      ? originalVisualizerPalette
      : colors;
  return {
    colors: resolvedColors,
    profile: resolveAuroraVisualProfile(paletteMode),
    legacyOriginalHueCycle: paletteMode === "original",
    css: cssSettingsForPalette(resolvedColors, artworkSrc, modeColumnCount, paletteColumnCount),
  };
}
