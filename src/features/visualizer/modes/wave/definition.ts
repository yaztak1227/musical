import { paletteColor, rgba } from "../../palette";
import { drawIdleWave } from "./idle";
import type {
  VisualizerCanvasRenderInput,
  VisualizerModeDefinition,
  VisualizerModeRuntime,
  VisualizerModeRuntimeOptions,
  VisualizerPalette,
} from "../../types";

type SurfPuchiPose = "paddling" | "standing";
type SurfPuchiImages = Record<SurfPuchiPose, HTMLImageElement | null>;
type SurfPuchiMotionState = {
  standingWeight: number;
  targetPose: SurfPuchiPose;
};

const createInitialImages = (): SurfPuchiImages => ({ paddling: null, standing: null });
const createInitialMotion = (): SurfPuchiMotionState => ({ standingWeight: 0, targetPose: "paddling" });

function loadSurfPuchiAssets(
  gender: "boy" | "girl",
  images: SurfPuchiImages,
  onChanged: () => void,
  isCancelled: () => boolean,
) {
  if (typeof Image === "undefined") return;
  void import("@/components/visualizer-assets/surfPuchiAssets")
    .then(({ surfPuchiSources }) => {
      if (isCancelled()) return;
      const nextImages = { ...images };
      (Object.entries(surfPuchiSources[gender]) as Array<[SurfPuchiPose, string]>).forEach(([pose, src]) => {
        const image = new Image();
        image.onload = () => {
          if (isCancelled()) return;
          nextImages[pose] = image;
          images.paddling = nextImages.paddling;
          images.standing = nextImages.standing;
          onChanged();
        };
        image.src = src;
      });
    })
    .catch(() => undefined);
}

function drawWaveSurfer(
  context: CanvasRenderingContext2D,
  surfacePoints: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  time: number,
  images: SurfPuchiImages,
  motion: SurfPuchiMotionState,
) {
  if (surfacePoints.length < 3) return;

  const fixedX = Math.max(width * 0.22, Math.min(width * 0.34, 330));
  const pointGap = Math.max(1, surfacePoints[1]?.x ?? 20);
  const preciseIndex = Math.max(1, Math.min(surfacePoints.length - 2, fixedX / pointGap));
  const leftIndex = Math.max(0, Math.min(surfacePoints.length - 2, Math.floor(preciseIndex)));
  const rightIndex = leftIndex + 1;
  const blend = preciseIndex - leftIndex;
  const leftPoint = surfacePoints[leftIndex];
  const rightPoint = surfacePoints[rightIndex];
  const previousPoint = surfacePoints[Math.max(0, leftIndex - 1)];
  const nextPoint = surfacePoints[Math.min(surfacePoints.length - 1, rightIndex + 1)];
  if (!leftPoint || !rightPoint || !previousPoint || !nextPoint) return;

  const x = leftPoint.x + (rightPoint.x - leftPoint.x) * blend;
  const y = leftPoint.y + (rightPoint.y - leftPoint.y) * blend;
  const slopeY = nextPoint.y - previousPoint.y;
  const slopeX = Math.max(1, nextPoint.x - previousPoint.x);
  const standingThreshold = height * 0.012;
  const paddlingThreshold = height * 0.004;
  if (slopeY > standingThreshold) motion.targetPose = "standing";
  else if (slopeY < paddlingThreshold) motion.targetPose = "paddling";

  const spriteSize = Math.max(58, Math.min(118, width * 0.09, height * 0.145));
  const slopeRotation = Math.max(-0.18, Math.min(0.2, Math.atan2(slopeY, slopeX) * 0.42));
  const bob = Math.sin(time * 0.0042) * height * 0.006;
  const targetStandingWeight = motion.targetPose === "standing" ? 1 : 0;
  motion.standingWeight += (targetStandingWeight - motion.standingWeight) * 0.12;

  drawWaveSurferPose(context, images.paddling, x - spriteSize * 0.02, y + bob + spriteSize * 0.04, spriteSize, 0.68, slopeRotation, 1 - motion.standingWeight);
  drawWaveSurferPose(context, images.standing, x + spriteSize * 0.02, y + bob - spriteSize * 0.06, spriteSize, 0.78, slopeRotation, motion.standingWeight);
}

function drawWaveSurferPose(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  spriteSize: number,
  footOffset: number,
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
  context.globalAlpha = alpha * 0.96;
  context.shadowColor = "rgba(0, 0, 0, 0.32)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 8;
  context.drawImage(image, -spriteWidth / 2, -spriteHeight * footOffset, spriteWidth, spriteHeight);
  context.restore();
}

export function drawWave(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  images: SurfPuchiImages,
  motion: SurfPuchiMotionState,
  isChibiModeEnabled: boolean,
  palette: VisualizerPalette,
  useOriginalColors: boolean,
) {
  const centerY = height * 0.52;
  const surfPoints: Array<{ x: number; y: number }> = [];
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let layer = 0; layer < 2; layer += 1) {
    context.beginPath();
    const color = paletteColor(palette, layer);
    const hue = 188 + layer * 54 + Math.sin(time * 0.0007) * 18;
    context.strokeStyle = useOriginalColors ? `hsla(${hue}, 92%, ${62 + layer * 5}%, ${0.72 - layer * 0.14})` : rgba(color, 0.72 - layer * 0.14);
    context.lineWidth = 4.6 - layer * 1.2;
    context.shadowBlur = 0;

    for (let x = 0; x <= width; x += 20) {
      const valueIndex = Math.floor((x / width) * (values.length - 1));
      const value = values[valueIndex] ?? 0;
      const amplitude = (value / 255) * height * (0.22 + layer * 0.04);
      const y = centerY + Math.sin(x * 0.012 + time * (0.002 + layer * 0.0005)) * amplitude;
      if (layer === 0) surfPoints.push({ x, y });

      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }

    context.stroke();
  }

  if (isChibiModeEnabled) drawWaveSurfer(context, surfPoints, width, height, time, images, motion);
}

function createRuntime(options: VisualizerModeRuntimeOptions = {}): VisualizerModeRuntime {
  const images = createInitialImages();
  const motion = createInitialMotion();
  let cancelled = false;
  if (options.isChibiModeEnabled) {
    loadSurfPuchiAssets(options.surfPuchiGender ?? "boy", images, options.onAssetsChanged ?? (() => undefined), () => cancelled);
  }

  return {
    render: (input: VisualizerCanvasRenderInput) => {
      if (input.isIdle && !options.isChibiModeEnabled) {
        drawIdleWave(input.context, input.width, input.height, input.palette, input.legacyOriginalHueCycle);
      } else {
        drawWave(input.context, input.values, input.width, input.height, input.time, images, motion, Boolean(options.isChibiModeEnabled), input.palette, input.legacyOriginalHueCycle);
      }
    },
    reset: () => {
      motion.standingWeight = 0;
      motion.targetPose = "paddling";
    },
    dispose: () => {
      cancelled = true;
    },
  };
}

export const waveDefinition = {
  id: "wave",
  labelKey: "player.visualizerWave",
  icon: "wave",
  renderer: "canvas2d",
  canvas: "base",
  supportsChibi: true,
  createRuntime,
  createCanvasRenderer: (runtime) => runtime.render,
} as const satisfies VisualizerModeDefinition;
