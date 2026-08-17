import { paletteColor, rgba } from "../../palette";
import { drawIdleCircle } from "./idle";
import type {
  VisualizerModeDefinition,
  VisualizerModeRuntime,
  VisualizerModeRuntimeOptions,
  VisualizerPalette,
} from "../../types";

type ChibiCharacterImages = {
  down: HTMLImageElement | null;
  up: HTMLImageElement | null;
};
type ChibiCircleMotionState = { upWeights: Float32Array };
const chibiCharacterCount = 8;

function drawCircle(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  useOriginalColors: boolean,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.18;
  const barCount = 72;

  context.save();
  context.translate(centerX, centerY);
  context.rotate(time * 0.00008);
  context.lineCap = "round";
  context.shadowBlur = 0;

  for (let index = 0; index < barCount; index += 1) {
    const valueIndex = Math.floor((index / barCount) * (values.length - 1));
    const value = values[valueIndex] ?? 0;
    const normalized = value / 255;
    const angle = (index / barCount) * Math.PI * 2;
    const innerRadius = radius + Math.sin(time * 0.0012 + index * 0.12) * 8;
    const outerRadius = innerRadius + normalized * Math.min(width, height) * 0.2;
    const color = paletteColor(palette, Math.floor((index / barCount) * palette.length));
    const hue = 320 + (index / barCount) * 220 + Math.sin(time * 0.0006) * 28;

    context.beginPath();
    context.strokeStyle = useOriginalColors ? `hsla(${hue}, 96%, 64%, 0.78)` : rgba(color, 0.78);
    context.lineWidth = 2.8;
    context.moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
    context.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
    context.stroke();
  }

  context.beginPath();
  context.strokeStyle = "rgba(255, 255, 255, 0.36)";
  context.lineWidth = 1.5;
  context.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawChibiCircle(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  chibiImages: ChibiCharacterImages[],
  chibiMotion: ChibiCircleMotionState,
  palette: VisualizerPalette,
) {
  const centerX = width / 2;
  const centerY = height * 0.5;
  const radius = Math.min(width, height) * 0.235;
  const characterCount = chibiCharacterCount;
  const spriteSize = Math.max(58, Math.min(116, Math.min(width, height) * 0.14));
  const items = Array.from({ length: characterCount }, (_, index) => {
    const angle = -Math.PI / 2 + (index / characterCount) * Math.PI * 2 + time * 0.00008;
    const valueIndex = Math.floor((index / characterCount) * (values.length - 1));
    const normalized = (values[valueIndex] ?? 0) / 255;
    const phase = index * 0.72;
    const beat = Math.max(0, Math.sin(time * 0.005 + phase)) * 0.1;
    const threshold = 0.29 + (index % 4) * 0.045;
    const targetWeight = normalized + beat > threshold ? 1 : 0;
    const currentWeight = chibiMotion.upWeights[index] ?? 0;
    const smoothing = targetWeight > currentWeight ? 0.22 : 0.1;
    const nextWeight = currentWeight + (targetWeight - currentWeight) * smoothing;
    chibiMotion.upWeights[index] = nextWeight;

    const pulse = normalized * Math.min(width, height) * 0.035;
    return {
      angle,
      imagePair: chibiImages[index],
      upWeight: nextWeight,
      x: centerX + Math.cos(angle) * (radius + pulse),
      y: centerY + Math.sin(angle) * (radius + pulse),
    };
  }).sort((first, second) => first.y - second.y);

  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = rgba(paletteColor(palette, 0), 0.22);
  context.lineWidth = 1.4;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  items.forEach(({ angle, imagePair, upWeight, x, y }) => {
    const radialX = Math.cos(angle);
    const radialY = Math.sin(angle);
    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle);
    const downOffset = spriteSize * 0.035;
    const upOffset = spriteSize * (0.075 + upWeight * 0.025);
    const tangentOffset = spriteSize * 0.012;
    const rotation = angle + Math.PI / 2;
    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = rgba(paletteColor(palette, Math.floor(((angle + Math.PI * 2.5) / (Math.PI * 2)) * palette.length)), 0.08 + upWeight * 0.13);
    context.beginPath();
    context.arc(x, y, spriteSize * (0.24 + upWeight * 0.08), 0, Math.PI * 2);
    context.fill();
    context.restore();
    drawChibiCirclePose(context, imagePair?.down ?? null, x + radialX * downOffset - tangentX * tangentOffset, y + radialY * downOffset - tangentY * tangentOffset, spriteSize, rotation, 1 - upWeight);
    drawChibiCirclePose(context, imagePair?.up ?? null, x + radialX * upOffset + tangentX * tangentOffset, y + radialY * upOffset + tangentY * tangentOffset, spriteSize, rotation, upWeight);
  });
}

function drawChibiCirclePose(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  spriteSize: number,
  rotation: number,
  alpha: number,
) {
  if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0 || alpha <= 0.01) return;

  const spriteWidth = spriteSize;
  const spriteHeight = spriteSize * (image.naturalHeight / image.naturalWidth);
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = Math.min(1, alpha) * 0.96;
  context.shadowColor = "rgba(0, 0, 0, 0.28)";
  context.shadowBlur = 14;
  context.shadowOffsetY = 7;
  context.drawImage(image, -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight);
  context.restore();
}

function loadAssets(
  images: ChibiCharacterImages[],
  onChanged: () => void,
  isCancelled: () => boolean,
) {
  if (typeof Image === "undefined") return;
  void import("@/components/visualizer-assets/chibiCharacterAssets")
    .then(({ chibiCharacterSources }) => {
      if (isCancelled()) return;
      chibiCharacterSources.forEach((source, index) => {
        (Object.entries(source) as Array<[keyof ChibiCharacterImages, string]>).forEach(([pose, src]) => {
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

function createRuntime(options: VisualizerModeRuntimeOptions = {}): VisualizerModeRuntime {
  const images = Array.from({ length: chibiCharacterCount }, () => ({ down: null, up: null }));
  const motion: ChibiCircleMotionState = { upWeights: new Float32Array(chibiCharacterCount) };
  let cancelled = false;
  if (options.isChibiModeEnabled) loadAssets(images, options.onAssetsChanged ?? (() => undefined), () => cancelled);

  return {
    render: (input) => {
      if (options.isChibiModeEnabled) drawChibiCircle(input.context, input.values, input.width, input.height, input.time, images, motion, input.palette);
      else if (input.isIdle) drawIdleCircle(input.context, input.width, input.height, input.palette, input.legacyOriginalHueCycle);
      else drawCircle(input.context, input.values, input.width, input.height, input.time, input.palette, input.legacyOriginalHueCycle);
    },
    reset: () => motion.upWeights.fill(0),
    dispose: () => { cancelled = true; },
  };
}

export const circleDefinition = {
  id: "circle",
  labelKey: "player.visualizerCircle",
  icon: "circle",
  renderer: "canvas2d",
  canvas: "base",
  supportsChibi: true,
  createRuntime,
  createCanvasRenderer: (runtime) => runtime.render,
} as const satisfies VisualizerModeDefinition;
