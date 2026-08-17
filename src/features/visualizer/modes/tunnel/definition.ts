import { mixVisualizerColors, paletteColor, rgba } from "../../palette";
import type { VisualizerCanvasRenderInput, VisualizerModeDefinition, VisualizerModeRuntime, VisualizerPalette, VisualizerWebglAdapter, VisualizerWebglRenderInput } from "../../types";

const frequencyHelixBandCount = 24;
const frequencyHelixFrameCount = 42;
const frequencyHelixCaptureIntervalMs = 55;
type FrequencyHelixTimelineState = { frames: Float32Array[]; lastCapturedAt: number };

function captureFrequencyHelixFrame(values: Uint8Array) {
  const frame = new Float32Array(frequencyHelixBandCount);
  const usableValueCount = Math.max(1, Math.floor(values.length * 0.72));

  for (let band = 0; band < frequencyHelixBandCount; band += 1) {
    const startProgress = band / frequencyHelixBandCount;
    const endProgress = (band + 1) / frequencyHelixBandCount;
    const start = Math.floor(Math.pow(startProgress, 1.75) * usableValueCount);
    const end = Math.max(start + 1, Math.floor(Math.pow(endProgress, 1.75) * usableValueCount));
    let total = 0;
    for (let index = start; index < Math.min(end, values.length); index += 1) total += values[index] ?? 0;
    frame[band] = total / Math.max(1, Math.min(end, values.length) - start) / 255;
  }

  return frame;
}

function updateFrequencyHelixTimeline(
  state: FrequencyHelixTimelineState,
  values: Uint8Array,
  time: number,
  shouldCapture: boolean,
  reducedMotion: boolean,
) {
  if (!shouldCapture && state.frames.length > 0) return;
  const captureInterval = reducedMotion ? frequencyHelixCaptureIntervalMs * 1.8 : frequencyHelixCaptureIntervalMs;
  if (state.frames.length > 0 && time - state.lastCapturedAt < captureInterval) return;

  const frame = captureFrequencyHelixFrame(values);
  if (state.frames.length === 0) {
    state.frames = Array.from({ length: frequencyHelixFrameCount }, () => frame.slice());
  } else {
    state.frames.push(frame);
    if (state.frames.length > frequencyHelixFrameCount) state.frames.shift();
  }
  state.lastCapturedAt = time;
}

function drawFrequencyHelix(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
  timeline: FrequencyHelixTimelineState,
  shouldCapture: boolean,
) {
  updateFrequencyHelixTimeline(timeline, values, time, shouldCapture, reducedMotion);
  const frames = timeline.frames;
  if (frames.length === 0) return;

  const rowCount = reducedMotion ? 22 : 38;
  const bandStep = reducedMotion ? 2 : 1;
  const centerX = width * 0.5;
  const top = height * 0.16;
  const bottom = height * 0.72;
  const amplitude = Math.min(width * 0.31, height * 0.34);
  const rotation = reducedMotion ? 0.35 : time * 0.00036;
  const turns = Math.PI * 4.5;
  const rows = Array.from({ length: rowCount }, (_, row) => {
    const progress = row / Math.max(1, rowCount - 1);
    const frameIndex = Math.round(progress * (frames.length - 1));
    const phase = progress * turns - rotation;
    const perspective = 0.55 + progress * 0.45;
    const strandOffset = Math.sin(phase) * amplitude * perspective;
    return {
      frame: frames[frameIndex] ?? frames[frames.length - 1]!,
      leftX: centerX + strandOffset,
      progress,
      rightX: centerX - strandOffset,
      y: top + progress * (bottom - top),
    };
  });

  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";

  rows.forEach((row, rowIndex) => {
    const ageAlpha = 0.18 + row.progress * 0.58;
    const direction = row.rightX >= row.leftX ? 1 : -1;
    const segmentWidth = Math.abs(row.rightX - row.leftX) / frequencyHelixBandCount;

    context.beginPath();
    context.moveTo(row.leftX, row.y);
    context.lineTo(row.rightX, row.y);
    context.strokeStyle = rgba(paletteColor(palette, rowIndex), 0.045 + ageAlpha * 0.08);
    context.lineWidth = 0.7 + row.progress * 0.7;
    context.stroke();

    for (let band = 0; band < frequencyHelixBandCount; band += bandStep) {
      const energy = row.frame[band] ?? 0;
      const nextBand = Math.min(frequencyHelixBandCount, band + bandStep);
      const x1 = row.leftX + direction * segmentWidth * band;
      const x2 = row.leftX + direction * segmentWidth * nextBand;
      const color = mixVisualizerColors(paletteColor(palette, band), [255, 255, 255], energy * 0.22);
      context.beginPath();
      context.moveTo(x1, row.y);
      context.lineTo(x2, row.y);
      context.strokeStyle = rgba(color, (0.08 + energy * 0.82) * ageAlpha);
      context.lineWidth = 0.8 + energy * 3.1 * (0.65 + row.progress * 0.35);
      context.stroke();
    }
  });

  const drawStrand = (side: "left" | "right", colorIndex: number) => {
    context.beginPath();
    rows.forEach((row, index) => {
      const x = side === "left" ? row.leftX : row.rightX;
      if (index === 0) context.moveTo(x, row.y);
      else context.lineTo(x, row.y);
    });
    const gradient = context.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, rgba(paletteColor(palette, colorIndex), 0.16));
    gradient.addColorStop(0.55, rgba(paletteColor(palette, colorIndex), 0.62));
    gradient.addColorStop(1, rgba(paletteColor(palette, colorIndex), 0.86));
    context.strokeStyle = gradient;
    context.lineWidth = Math.max(1.4, Math.min(width, height) * 0.004);
    context.shadowColor = rgba(paletteColor(palette, colorIndex), 0.58);
    context.shadowBlur = reducedMotion ? 4 : 10;
    context.stroke();
  };

  drawStrand("left", 0);
  drawStrand("right", Math.max(1, Math.floor(palette.length / 2)));
  context.shadowBlur = 0;
  context.restore();
}

function createRuntime(): VisualizerModeRuntime {
  const timeline: FrequencyHelixTimelineState = { frames: [], lastCapturedAt: 0 };
  return {
    render: ({ context, values, width, height, time, palette, reducedMotion, isLive }: VisualizerCanvasRenderInput) => {
      drawFrequencyHelix(context, values, width, height, time, palette, reducedMotion, timeline, isLive);
    },
    reset: () => { timeline.frames = []; timeline.lastCapturedAt = 0; },
  };
}

const load = async (canvas: HTMLCanvasElement): Promise<VisualizerWebglAdapter> => {
  const { FrequencyHelixWebGLVisualizer } = await import("@/lib/helixWebgl");
  const visualizer = new FrequencyHelixWebGLVisualizer(canvas);
  return {
    render: ({ values, time, palette, reducedMotion, isLive }: VisualizerWebglRenderInput) => {
      visualizer.render(values, time, palette, reducedMotion, isLive);
    },
    dispose: () => visualizer.dispose(),
    reset: () => visualizer.reset(),
  };
};

export const tunnelDefinition = {
  id: "tunnel",
  labelKey: "player.visualizerTunnel",
  icon: "tunnel",
  renderer: "webgl",
  canvas: "helix",
  canvasClassName: "visualizer-helix-canvas",
  webglPaletteRole: "mode",
  supportsChibi: false,
  createRuntime,
  createCanvasRenderer: (runtime) => runtime.render,
  createFallbackRenderer: (runtime) => runtime.render,
  load,
} as const satisfies VisualizerModeDefinition;
