import { chibiSpectrumConfig } from "@/config/appConfig";
import { mixVisualizerColors, paletteColor, rgba } from "../../palette";
import { drawIdleSpectrum } from "./idle";
import { getFrequencyBandStats, type FrequencyBandStats } from "../shared/analysis";
import type {
  VisualizerModeDefinition,
  VisualizerModeRuntime,
  VisualizerModeRuntimeOptions,
  VisualizerPalette,
} from "../../types";

const spectrumBarCount = 48;
const chibiCharacterCount = 8;
type ChibiSpectrumPose = "raised" | "swing" | "impact" | "collapsed";
type ChibiSpectrumImages = Record<ChibiSpectrumPose, HTMLImageElement | null>;
type ChibiSpectrumMotionState = {
  collapsedUntil: Float64Array;
  fatigueScores: Float64Array;
  impactUntil: Float64Array;
  lastImpactAt: Float64Array;
  lastMotionUpdateAt: Float64Array;
  lastRaisedAt: Float64Array;
  previousAverages: Float64Array;
  previousTextures: Float64Array;
};
type OrchestraVisualizerPose = "holding" | "playing";
type OrchestraCharacterImages = Record<OrchestraVisualizerPose, HTMLImageElement | null>;
type OrchestraCharacterLayout = {
  band: number;
  baseScale: number;
  floorX: number;
  floorY: number;
};
type OrchestraVisualizerImages = {
  backgrounds: OrchestraCharacterImages;
  characters: OrchestraCharacterImages[];
};
type OrchestraVisualizerMotionState = {
  energyWeights: Float32Array;
  playingWeights: Float32Array;
};

const orchestraCharacterLayout: OrchestraCharacterLayout[] = [
  { band: 0, floorX: 0.17, floorY: 0.78, baseScale: 1 },
  { band: 1, floorX: 0.31, floorY: 0.82, baseScale: 0.98 },
  { band: 2, floorX: 0.51, floorY: 0.82, baseScale: 1.06 },
  { band: 3, floorX: 0.77, floorY: 0.82, baseScale: 1.1 },
  { band: 4, floorX: 0.17, floorY: 0.51, baseScale: 0.88 },
  { band: 5, floorX: 0.34, floorY: 0.52, baseScale: 0.92 },
  { band: 6, floorX: 0.52, floorY: 0.51, baseScale: 0.9 },
  { band: 7, floorX: 0.66, floorY: 0.52, baseScale: 0.88 },
  { band: 8, floorX: 0.81, floorY: 0.51, baseScale: 0.9 },
];

function createChibiMotion(): ChibiSpectrumMotionState {
  return {
    collapsedUntil: new Float64Array(chibiCharacterCount),
    fatigueScores: new Float64Array(chibiCharacterCount),
    impactUntil: new Float64Array(chibiCharacterCount),
    lastImpactAt: new Float64Array(chibiCharacterCount),
    lastMotionUpdateAt: new Float64Array(chibiCharacterCount),
    lastRaisedAt: new Float64Array(chibiCharacterCount),
    previousAverages: new Float64Array(chibiCharacterCount),
    previousTextures: new Float64Array(chibiCharacterCount),
  };
}

function createChibiImages(): ChibiSpectrumImages[] {
  return Array.from({ length: chibiCharacterCount }, () => ({ raised: null, swing: null, impact: null, collapsed: null }));
}

function createOrchestraImages(): OrchestraVisualizerImages {
  return {
    backgrounds: { holding: null, playing: null },
    characters: orchestraCharacterLayout.map(() => ({ holding: null, playing: null })),
  };
}

function createOrchestraMotion(): OrchestraVisualizerMotionState {
  return {
    energyWeights: new Float32Array(orchestraCharacterLayout.length),
    playingWeights: new Float32Array(orchestraCharacterLayout.length),
  };
}

function drawSpectrum(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  peakValues: Float32Array,
  palette: VisualizerPalette,
  useOriginalColors: boolean,
  chibiImages?: ChibiSpectrumImages[],
  chibiMotion?: ChibiSpectrumMotionState,
) {
  const barCount = spectrumBarCount;
  const gap = 5;
  const barWidth = Math.max(4, (width * 0.82) / barCount - gap);
  const startX = (width - (barWidth + gap) * barCount) / 2;
  const isChibiSpectrum = Boolean(chibiImages?.length);
  const baseY = height * (isChibiSpectrum ? 0.56 : 0.72);
  const maxBarHeight = height * (isChibiSpectrum ? 0.38 : 0.48);
  const capHeight = Math.max(2, Math.min(4, height * 0.005));
  const capGap = Math.max(4, height * 0.01);
  const peakDrop = height * 0.0022;

  context.shadowBlur = 0;
  for (let index = 0; index < barCount; index += 1) {
    const valueIndex = Math.floor((index / barCount) * (values.length - 1));
    const value = values[valueIndex] ?? 0;
    const normalized = value / 255;
    const barHeight = normalized * maxBarHeight;
    const color = paletteColor(palette, Math.floor((index / barCount) * palette.length));
    const hue = (index / barCount) * 210 + 168 + Math.sin(time * 0.0008) * 32;
    const x = startX + index * (barWidth + gap);
    const previousPeak = peakValues[index] ?? 0;
    const nextPeak = Math.max(barHeight, Math.max(0, previousPeak - peakDrop));
    peakValues[index] = nextPeak;

    context.fillStyle = useOriginalColors
      ? `hsla(${hue}, 96%, ${58 + normalized * 18}%, ${0.52 + normalized * 0.42})`
      : rgba(mixVisualizerColors(color, [255, 255, 255], normalized * 0.22), 0.52 + normalized * 0.42);
    context.fillRect(x, baseY - barHeight, barWidth, barHeight);

    context.fillStyle = useOriginalColors
      ? `hsla(${hue}, 96%, 78%, ${0.54 + Math.min(1, nextPeak / Math.max(1, height * 0.48)) * 0.32})`
      : rgba(mixVisualizerColors(color, [255, 255, 255], 0.38), 0.54 + Math.min(1, nextPeak / Math.max(1, height * 0.48)) * 0.32);
    context.beginPath();
    context.roundRect(x, baseY - nextPeak - capGap, barWidth, capHeight, 999);
    context.fill();
  }

  if (chibiImages?.length) drawChibiSpectrumCharacters(context, values, width, height, time, baseY, startX, barWidth + gap, chibiImages, chibiMotion);
}

function getChibiSpectrumPose(
  bandStats: FrequencyBandStats,
  index: number,
  time: number,
  chibiMotion?: ChibiSpectrumMotionState,
): ChibiSpectrumPose {
  const { average, texture } = bandStats;
  if (!chibiMotion) return average >= chibiSpectrumConfig.swingThreshold ? "swing" : "raised";

  updateChibiSpectrumFatigue(chibiMotion, index, time, average < chibiSpectrumConfig.swingThreshold);
  const previousAverage = chibiMotion.previousAverages[index] ?? 0;
  const rise = average - previousAverage;
  chibiMotion.previousAverages[index] = previousAverage + (average - previousAverage) * 0.38;
  const previousTexture = chibiMotion.previousTextures[index] ?? 0;
  const textureRise = texture - previousTexture;
  chibiMotion.previousTextures[index] = previousTexture + (texture - previousTexture) * 0.32;

  if (average < chibiSpectrumConfig.swingThreshold) {
    chibiMotion.impactUntil[index] = 0;
    return "raised";
  }
  if (time < (chibiMotion.impactUntil[index] ?? 0)) return "impact";

  const lastImpactAt = chibiMotion.lastImpactAt[index] ?? 0;
  if (
    time - lastImpactAt >= chibiSpectrumConfig.impactCooldownMs
    && (rise >= chibiSpectrumConfig.impactRiseThreshold || textureRise >= chibiSpectrumConfig.textureRiseThreshold)
  ) {
    chibiMotion.impactUntil[index] = time + chibiSpectrumConfig.impactHoldMs;
    chibiMotion.lastImpactAt[index] = time;
    chibiMotion.fatigueScores[index] = Math.min(chibiSpectrumConfig.fatigueHp + 1, (chibiMotion.fatigueScores[index] ?? 0) + 1);
    return "impact";
  }
  return "swing";
}

function updateChibiSpectrumFatigue(chibiMotion: ChibiSpectrumMotionState, index: number, time: number, isResting: boolean) {
  const lastUpdateAt = chibiMotion.lastMotionUpdateAt[index] || time;
  const elapsedSeconds = Math.max(0, (time - lastUpdateAt) / 1000);
  const recovery = elapsedSeconds * (isResting ? chibiSpectrumConfig.restRecoveryPerSecond : chibiSpectrumConfig.fatigueRecoveryPerSecond);
  chibiMotion.fatigueScores[index] = Math.max(0, (chibiMotion.fatigueScores[index] ?? 0) - recovery);
  chibiMotion.lastMotionUpdateAt[index] = time;
}

function getChibiSpectrumDisplayPose(pose: ChibiSpectrumPose, index: number, time: number, chibiMotion?: ChibiSpectrumMotionState): ChibiSpectrumPose {
  if (!chibiMotion) return pose;
  const collapsedUntil = chibiMotion.collapsedUntil[index] ?? 0;
  if (time < collapsedUntil) return "collapsed";
  if ((chibiMotion.fatigueScores[index] ?? 0) >= chibiSpectrumConfig.fatigueHp) {
    chibiMotion.collapsedUntil[index] = time + chibiSpectrumConfig.collapsedDurationMs;
    chibiMotion.fatigueScores[index] = 0;
    chibiMotion.impactUntil[index] = 0;
    chibiMotion.lastMotionUpdateAt[index] = time;
    chibiMotion.previousAverages[index] = 0;
    chibiMotion.previousTextures[index] = 0;
    return "collapsed";
  }
  if (pose === "raised") {
    chibiMotion.lastRaisedAt[index] = time;
    chibiMotion.collapsedUntil[index] = 0;
  }
  return pose;
}

function getChibiSpectrumAnimatedPose(bandStats: FrequencyBandStats, index: number, time: number, chibiMotion?: ChibiSpectrumMotionState): ChibiSpectrumPose {
  if (chibiMotion && time < (chibiMotion.collapsedUntil[index] ?? 0)) {
    chibiMotion.fatigueScores[index] = 0;
    chibiMotion.impactUntil[index] = 0;
    chibiMotion.lastMotionUpdateAt[index] = time;
    chibiMotion.previousAverages[index] = bandStats.average;
    chibiMotion.previousTextures[index] = bandStats.texture;
    return "collapsed";
  }
  return getChibiSpectrumDisplayPose(getChibiSpectrumPose(bandStats, index, time, chibiMotion), index, time, chibiMotion);
}

function getChibiSpectrumPosePulse(pose: ChibiSpectrumPose, normalizedAverage: number, chibiMotion: ChibiSpectrumMotionState | undefined, index: number, time: number) {
  if (pose === "impact") {
    const remainingImpact = Math.max(0, (chibiMotion?.impactUntil[index] ?? time) - time);
    const impactWeight = Math.min(1, remainingImpact / Math.max(1, chibiSpectrumConfig.impactHoldMs));
    return 1.02 + impactWeight * 0.08;
  }
  if (pose === "collapsed") return 1.08;
  if (pose === "swing") return 1 + Math.min(0.025, normalizedAverage * 0.025);
  return 1;
}

function drawChibiSpectrumCharacters(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  spectrumBaseY: number,
  spectrumStartX: number,
  spectrumStep: number,
  chibiImages: ChibiSpectrumImages[],
  chibiMotion?: ChibiSpectrumMotionState,
) {
  const characterCount = chibiImages.length;
  const barsPerCharacter = spectrumBarCount / characterCount;
  const spriteSize = Math.max(70, Math.min(138, width * 0.115, height * 0.23));
  const spriteTop = Math.min(height - spriteSize - 12, spectrumBaseY - spriteSize * 0.08);

  context.save();
  context.globalCompositeOperation = "source-over";
  for (let index = 0; index < characterCount; index += 1) {
    const bandStats = getFrequencyBandStats(values, index, characterCount);
    const pose = getChibiSpectrumAnimatedPose(bandStats, index, time, chibiMotion);
    const image = chibiImages[index]?.[pose] ?? null;
    const firstBarIndex = index * barsPerCharacter;
    const lastBarIndex = (index + 1) * barsPerCharacter - 1;
    const centerBarIndex = (firstBarIndex + lastBarIndex) / 2;
    const x = spectrumStartX + centerBarIndex * spectrumStep + spectrumStep / 2;
    const pulse = getChibiSpectrumPosePulse(pose, bandStats.average, chibiMotion, index, time);
    drawChibiSpectrumPose(context, image, x, spriteTop, spriteSize * pulse);
  }
  context.restore();
}

function drawChibiSpectrumPose(context: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, y: number, spriteSize: number) {
  if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
  const spriteWidth = spriteSize;
  const spriteHeight = spriteSize * (image.naturalHeight / image.naturalWidth);
  context.save();
  context.globalAlpha = 0.98;
  context.shadowColor = "rgba(0, 0, 0, 0.3)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 6;
  context.drawImage(image, x - spriteWidth / 2, y, spriteWidth, spriteHeight);
  context.restore();
}

function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement | null, width: number, height: number) {
  if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;
  const drawWidth = imageRatio > canvasRatio ? height * imageRatio : width;
  const drawHeight = imageRatio > canvasRatio ? height : width / imageRatio;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return true;
}

function drawOrchestraCharacter(context: CanvasRenderingContext2D, image: HTMLImageElement | null, x: number, floorY: number, spriteHeight: number, rotation: number, alpha: number) {
  if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0 || alpha <= 0.01) return;
  const spriteWidth = spriteHeight * (image.naturalWidth / image.naturalHeight);
  context.save();
  context.translate(x, floorY);
  context.rotate(rotation);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = alpha;
  context.shadowColor = "rgba(0, 0, 0, 0.34)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 8;
  context.drawImage(image, -spriteWidth / 2, -spriteHeight, spriteWidth, spriteHeight);
  context.restore();
}

function drawOrchestraVisualizer(context: CanvasRenderingContext2D, values: Uint8Array, width: number, height: number, time: number, images: OrchestraVisualizerImages, motion: OrchestraVisualizerMotionState, palette: VisualizerPalette) {
  const average = values.reduce((total, value) => total + value, 0) / Math.max(1, values.length) / 255;
  const backgroundBlend = Math.min(1, Math.max(0, (average - 0.08) / 0.24));
  context.save();
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, width, height);
  if (!drawCoverImage(context, images.backgrounds.holding, width, height)) {
    const fallbackGradient = context.createLinearGradient(0, 0, 0, height);
    fallbackGradient.addColorStop(0, "#2b1410");
    fallbackGradient.addColorStop(0.55, "#7a3e16");
    fallbackGradient.addColorStop(1, "#160b09");
    context.fillStyle = fallbackGradient;
    context.fillRect(0, 0, width, height);
  }
  if (backgroundBlend > 0.01 && images.backgrounds.playing?.complete) {
    context.globalAlpha = backgroundBlend * 0.72;
    drawCoverImage(context, images.backgrounds.playing, width, height);
    context.globalAlpha = 1;
  }
  context.fillStyle = rgba(paletteColor(palette, 0), 0.08 + average * 0.18);
  context.beginPath();
  context.ellipse(width * 0.5, height * 0.76, width * 0.46, height * 0.16, 0, 0, Math.PI * 2);
  context.fill();

  const sortedCharacters = orchestraCharacterLayout.map((source, index) => ({ source, index })).sort((first, second) => first.source.floorY - second.source.floorY);
  sortedCharacters.forEach(({ source, index }) => {
    const bandStats = getFrequencyBandStats(values, source.band, orchestraCharacterLayout.length);
    const currentEnergy = motion.energyWeights[index] ?? 0;
    const nextEnergy = currentEnergy + (bandStats.texture - currentEnergy) * (bandStats.texture > currentEnergy ? 0.22 : 0.08);
    motion.energyWeights[index] = nextEnergy;
    const targetPlaying = Math.min(1, Math.max(0, (nextEnergy - 0.12) / 0.22));
    const currentPlaying = motion.playingWeights[index] ?? 0;
    const nextPlaying = currentPlaying + (targetPlaying - currentPlaying) * (targetPlaying > currentPlaying ? 0.24 : 0.1);
    motion.playingWeights[index] = nextPlaying;
    const x = width * source.floorX;
    const floorY = height * source.floorY;
    const spriteHeight = Math.max(122, Math.min(height * 0.35, width * 0.2)) * source.baseScale * (1 + nextEnergy * 0.08);
    const bob = Math.sin(time * (0.0024 + index * 0.00018) + index * 0.7) * height * 0.008 * nextPlaying;
    const sway = Math.sin(time * (0.0018 + index * 0.00013) + index) * 0.035 * nextPlaying;
    const alpha = 0.98;
    drawOrchestraCharacter(context, images.characters[index]?.holding ?? null, x, floorY + bob, spriteHeight, sway * 0.35, alpha * (1 - nextPlaying));
    drawOrchestraCharacter(context, images.characters[index]?.playing ?? null, x, floorY + bob - spriteHeight * 0.014 * nextPlaying, spriteHeight * (1 + nextPlaying * 0.035), sway, alpha * nextPlaying);
  });

  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < 18; index += 1) {
    const value = (values[Math.floor((index / 18) * values.length)] ?? 0) / 255;
    if (value < 0.08) continue;
    const x = width * (0.16 + (index / 17) * 0.68);
    const y = height * (0.24 + Math.sin(time * 0.0007 + index) * 0.08);
    context.fillStyle = rgba(paletteColor(palette, index), 0.12 + value * 0.24);
    context.beginPath();
    context.arc(x, y, 1.4 + value * 4.6, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function loadChibiAssets(images: ChibiSpectrumImages[], onChanged: () => void, isCancelled: () => boolean) {
  if (typeof Image === "undefined") return;
  void import("@/components/visualizer-assets/chibiSpectrumAssets")
    .then(({ chibiSpectrumSources }) => {
      if (isCancelled()) return;
      chibiSpectrumSources.forEach((source, index) => {
        (Object.entries(source) as Array<[ChibiSpectrumPose, string]>).forEach(([pose, src]) => {
          const image = new Image();
          image.onload = () => {
            if (isCancelled()) return;
            images[index] = { ...images[index], [pose]: image };
            onChanged();
          };
          image.src = src;
        });
      });
    })
    .catch(() => undefined);
}

function loadOrchestraAssets(images: OrchestraVisualizerImages, onChanged: () => void, isCancelled: () => boolean) {
  if (typeof Image === "undefined") return;
  void import("@/components/visualizer-assets/orchestraAssets")
    .then(({ orchestraBackgroundSources, orchestraCharacterSources }) => {
      if (isCancelled()) return;
      (Object.entries(orchestraBackgroundSources) as Array<[OrchestraVisualizerPose, string]>).forEach(([pose, src]) => {
        const image = new Image();
        image.onload = () => {
          if (isCancelled()) return;
          images.backgrounds = { ...images.backgrounds, [pose]: image };
          onChanged();
        };
        image.src = src;
      });
      orchestraCharacterSources.forEach((source, index) => {
        (Object.entries(source) as Array<[OrchestraVisualizerPose, string]>).forEach(([pose, src]) => {
          const image = new Image();
          image.onload = () => {
            if (isCancelled()) return;
            images.characters[index] = { ...images.characters[index], [pose]: image };
            onChanged();
          };
          image.src = src;
        });
      });
    })
    .catch(() => undefined);
}

function createRuntime(options: VisualizerModeRuntimeOptions = {}): VisualizerModeRuntime {
  const peakValues = new Float32Array(spectrumBarCount);
  const chibiImages = createChibiImages();
  const chibiMotion = createChibiMotion();
  const orchestraImages = createOrchestraImages();
  const orchestraMotion = createOrchestraMotion();
  const onChanged = options.onAssetsChanged ?? (() => undefined);
  let cancelled = false;
  if (options.isOrchestraModeEnabled) loadOrchestraAssets(orchestraImages, onChanged, () => cancelled);
  else if (options.isChibiModeEnabled) loadChibiAssets(chibiImages, onChanged, () => cancelled);

  return {
    render: (input) => {
      if (options.isOrchestraModeEnabled) {
        drawOrchestraVisualizer(input.context, input.values, input.width, input.height, input.time, orchestraImages, orchestraMotion, input.palette);
      } else if (input.isIdle && !options.isChibiModeEnabled) {
        drawIdleSpectrum(input.context, input.width, input.height, input.palette, input.legacyOriginalHueCycle);
      } else {
        drawSpectrum(input.context, input.values, input.width, input.height, input.time, peakValues, input.palette, input.legacyOriginalHueCycle, options.isChibiModeEnabled ? chibiImages : undefined, options.isChibiModeEnabled ? chibiMotion : undefined);
      }
    },
    reset: () => {
      peakValues.fill(0);
      Object.values(chibiMotion).forEach((array) => array.fill(0));
      orchestraMotion.energyWeights.fill(0);
      orchestraMotion.playingWeights.fill(0);
    },
    dispose: () => { cancelled = true; },
  };
}

export const spectrumDefinition = {
  id: "spectrum",
  labelKey: "player.visualizerSpectrum",
  icon: "spectrum",
  renderer: "canvas2d",
  canvas: "base",
  supportsChibi: true,
  createRuntime,
  createCanvasRenderer: (runtime) => runtime.render,
} as const satisfies VisualizerModeDefinition;
