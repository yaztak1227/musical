import { mixVisualizerColors, paletteColor, rgba } from "../../palette";
import { averageFrequencyBand, deterministicNoise } from "../shared/analysis";
import type { AuroraVisualProfile } from "@/lib/visualizerAnalysis";
import type { VisualizerCanvasRenderInput, VisualizerModeDefinition, VisualizerModeRuntime, VisualizerPalette, VisualizerWebglAdapter, VisualizerWebglRenderInput } from "../../types";

const auroraBandCount = 5;
const auroraFrameCount = 7;
const auroraCaptureIntervalMs = 120;
type AuroraTimelineState = { frames: Float32Array[]; lastCapturedAt: number };

function captureAuroraFrame(values: Uint8Array) {
  const frame = new Float32Array(auroraBandCount);
  const bandEdges = [0.02, 0.09, 0.2, 0.38, 0.62, 0.9];
  for (let band = 0; band < auroraBandCount; band += 1) {
    frame[band] = averageFrequencyBand(values, bandEdges[band] ?? 0, bandEdges[band + 1] ?? 1);
  }
  return frame;
}

function updateAuroraTimeline(
  state: AuroraTimelineState,
  values: Uint8Array,
  time: number,
  shouldCapture: boolean,
  reducedMotion: boolean,
) {
  if (!shouldCapture && state.frames.length > 0) return;
  const captureInterval = reducedMotion ? auroraCaptureIntervalMs * 1.8 : auroraCaptureIntervalMs;
  if (state.frames.length > 0 && time - state.lastCapturedAt < captureInterval) return;

  const frame = captureAuroraFrame(values);
  if (state.frames.length === 0) {
    state.frames = Array.from({ length: auroraFrameCount }, () => frame.slice());
  } else {
    state.frames.push(frame);
    if (state.frames.length > auroraFrameCount) state.frames.shift();
  }
  state.lastCapturedAt = time;
}

function interpolateAuroraEnergy(frame: Float32Array, progress: number) {
  const position = Math.max(0, Math.min(1, progress)) * (frame.length - 1);
  const firstIndex = Math.floor(position);
  const secondIndex = Math.min(frame.length - 1, firstIndex + 1);
  const amount = position - firstIndex;
  return (frame[firstIndex] ?? 0) * (1 - amount) + (frame[secondIndex] ?? 0) * amount;
}

function auroraGradientColor(palette: VisualizerPalette, progress: number) {
  const position = Math.max(0, Math.min(1, progress)) * (palette.length - 1);
  const firstIndex = Math.floor(position);
  const secondIndex = Math.min(palette.length - 1, firstIndex + 1);
  return mixVisualizerColors(paletteColor(palette, firstIndex), paletteColor(palette, secondIndex), position - firstIndex);
}

function drawAurora(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
  timeline: AuroraTimelineState,
  shouldCapture: boolean,
  profile: AuroraVisualProfile,
) {
  const isRainbow = profile === "rainbow";
  const isMist = profile === "mist";
  updateAuroraTimeline(timeline, values, time, shouldCapture, reducedMotion);
  const frames = timeline.frames;
  if (frames.length === 0) return;

  const visibleFrameCount = reducedMotion ? 3 : 5;
  const visibleFrames = frames.slice(-visibleFrameCount);
  const motionTime = time * (reducedMotion ? 0.000025 : 0.00009);
  const filamentCount = reducedMotion ? 34 : 76;
  const startX = width * 0.025;
  const endX = width * 0.975;
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";

  visibleFrames.forEach((frame, historyIndex) => {
    const historyProgress = historyIndex / Math.max(1, visibleFrames.length - 1);
    const historyAlpha = isRainbow
      ? (0.025 + historyProgress * 0.105) * 1.2
      : (0.035 + historyProgress * 0.14) * 1.18 * (isMist ? 0.68 : 1);
    const historyOffset = (1 - historyProgress) * height * 0.048;
    const points = Array.from({ length: filamentCount + 1 }, (_, index) => {
      const progress = index / filamentCount;
      const energy = interpolateAuroraEnergy(frame, progress);
      const noise = deterministicNoise(index * 1.73 + historyIndex * 31.7);
      const ridgeWave = Math.sin(progress * Math.PI * 1.55 + motionTime * 0.72 + historyIndex * 0.16) * height * 0.052
        + Math.sin(progress * Math.PI * 4.2 - motionTime + historyIndex * 0.11) * height * 0.014;
      const ridgeY = height * 0.17 + historyOffset + ridgeWave;
      const length = height * (0.2 + energy * 0.32 + Math.pow(noise, 1.7) * 0.16)
        * (0.86 + Math.sin(progress * Math.PI * 2.4 - motionTime * 1.2) * 0.12);
      const x = startX + (endX - startX) * progress
        + Math.sin(progress * Math.PI * 3.1 + motionTime + historyIndex * 0.18) * width * 0.008
        + (deterministicNoise(index * 4.93 + historyIndex * 17.1) - 0.5) * width * 0.009;
      return { energy, progress, ridgeY, x, bottomY: Math.min(height * 0.75, ridgeY + length) };
    });

    const sheetGradient = context.createLinearGradient(startX, 0, endX, 0);
    for (let stop = 0; stop <= auroraBandCount; stop += 1) {
      const progress = stop / auroraBandCount;
      sheetGradient.addColorStop(progress, rgba(auroraGradientColor(palette, progress), historyAlpha));
    }
    context.filter = reducedMotion
      ? `blur(${isMist ? 11 : 8}px)`
      : `blur(${(isMist ? 10 : 6) + (1 - historyProgress) * (isMist ? 14 : 10)}px)`;
    context.fillStyle = sheetGradient;
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.ridgeY);
      else context.lineTo(point.x, point.ridgeY);
    });
    for (let index = points.length - 1; index >= 0; index -= 1) {
      const point = points[index];
      if (point) context.lineTo(point.x, point.bottomY);
    }
    context.closePath();
    context.fill();

    const detailedHistoryCount = reducedMotion ? 1 : 2;
    if (historyIndex >= visibleFrames.length - detailedHistoryCount) {
      points.forEach((point, index) => {
        if (index === points.length - 1) return;
        const fold = 0.24 + Math.pow((Math.sin(point.progress * Math.PI * 17 - motionTime * 1.4 + historyIndex) + 1) * 0.5, 2) * 0.76;
        const whiteMix = (point.energy * 0.12 + fold * 0.08) * (isMist ? 0.18 : 1);
        const color = mixVisualizerColors(auroraGradientColor(palette, point.progress), [255, 255, 255], whiteMix);
        const alpha = historyAlpha * (0.58 + point.energy * 1.65) * (0.48 + fold * 1.12) * (isMist ? 0.7 : 1);
        const strokeGradient = context.createLinearGradient(0, point.ridgeY, 0, point.bottomY);
        strokeGradient.addColorStop(0, rgba(color, alpha * 0.32));
        strokeGradient.addColorStop(0.12, rgba(color, alpha));
        strokeGradient.addColorStop(0.58, rgba(color, alpha * 0.72));
        strokeGradient.addColorStop(0.9, rgba(color, alpha * 0.18));
        strokeGradient.addColorStop(1, rgba(color, 0));
        const lowerSway = Math.sin(point.progress * Math.PI * 7.4 - motionTime * 1.8 + historyIndex * 0.3) * width * (0.008 + point.energy * 0.016);
        context.filter = reducedMotion
          ? `blur(${isMist ? 2.5 : 1.5}px)`
          : `blur(${(isMist ? 1.4 : 0.7) + (1 - historyProgress) * (isMist ? 4.5 : 3.5)}px)`;
        context.strokeStyle = strokeGradient;
        context.lineWidth = 0.38 + point.energy * 1.45 + fold * 0.9;
        context.beginPath();
        context.moveTo(point.x, point.ridgeY);
        context.bezierCurveTo(
          point.x + Math.sin(motionTime + index) * width * 0.004,
          point.ridgeY + (point.bottomY - point.ridgeY) * 0.32,
          point.x + lowerSway * 0.55,
          point.ridgeY + (point.bottomY - point.ridgeY) * 0.72,
          point.x + lowerSway,
          point.bottomY,
        );
        context.stroke();
      });
    }

    if (historyIndex === visibleFrames.length - 1) {
      const drawRidge = (alpha: number, blur: number, lineWidth: number) => {
        const ridgeGradient = context.createLinearGradient(startX, 0, endX, 0);
        for (let stop = 0; stop <= auroraBandCount; stop += 1) {
          const progress = stop / auroraBandCount;
          ridgeGradient.addColorStop(progress, rgba(auroraGradientColor(palette, progress), alpha));
        }
        context.filter = `blur(${blur}px)`;
        context.strokeStyle = ridgeGradient;
        context.lineWidth = lineWidth;
        context.beginPath();
        points.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.ridgeY);
          else context.lineTo(point.x, point.ridgeY);
        });
        context.stroke();
      };
      drawRidge(isMist ? 0.18 : 0.34, reducedMotion ? (isMist ? 5 : 3) : (isMist ? 10 : 7), Math.max(3, Math.min(width, height) * 0.008));
      drawRidge(isMist ? 0.34 : 0.68, reducedMotion ? (isMist ? 1.6 : 0.8) : (isMist ? 2.4 : 1.4), Math.max(0.9, Math.min(width, height) * 0.0018));
    }
  });

  context.restore();
}

function createRuntime(): VisualizerModeRuntime {
  const timeline: AuroraTimelineState = { frames: [], lastCapturedAt: 0 };
  return {
    render: (input: VisualizerCanvasRenderInput) => {
      drawAurora(input.context, input.values, input.width, input.height, input.time, input.auroraPalette, input.reducedMotion, timeline, input.isLive, input.profile);
    },
    reset: () => { timeline.frames = []; timeline.lastCapturedAt = 0; },
  };
}

const load = async (canvas: HTMLCanvasElement): Promise<VisualizerWebglAdapter> => {
  const { AuroraWebGLVisualizer } = await import("@/lib/auroraWebgl");
  const visualizer = new AuroraWebGLVisualizer(canvas);
  return {
    render: ({ values, time, palette, reducedMotion, isLive, profile }: VisualizerWebglRenderInput) => {
      visualizer.render(values, time, palette, reducedMotion, isLive, profile);
    },
    dispose: () => visualizer.dispose(),
  };
};

export const auroraDefinition = {
  id: "aurora",
  labelKey: "player.visualizerAurora",
  icon: "aurora",
  renderer: "webgl",
  canvas: "aurora",
  canvasClassName: "visualizer-aurora-canvas",
  webglPaletteRole: "aurora",
  supportsChibi: false,
  createRuntime,
  createCanvasRenderer: (runtime) => runtime.render,
  createFallbackRenderer: (runtime) => runtime.render,
  load,
} as const satisfies VisualizerModeDefinition;
