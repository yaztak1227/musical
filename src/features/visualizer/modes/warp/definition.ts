import { paletteColor, rgba } from "../../palette";
import { averageFrequencyBand, deterministicNoise } from "../shared/analysis";
import type { VisualizerCanvasRenderInput, VisualizerModeDefinition, VisualizerModeRuntime, VisualizerPalette, VisualizerWebglAdapter, VisualizerWebglRenderInput } from "../../types";

function drawWarpHole(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
) {
  const bass = averageFrequencyBand(values, 0, 0.09);
  const mid = averageFrequencyBand(values, 0.09, 0.38);
  const high = averageFrequencyBand(values, 0.38, 0.76);
  const activity = bass * 0.48 + mid * 0.34 + high * 0.18;
  const centerX = width * 0.5;
  const centerY = height * 0.44;
  const outerRadius = Math.max(42, Math.min(width * 0.38, height * 0.48));
  const innerRadius = outerRadius * (0.1 + bass * 0.035);
  const rotation = time * (reducedMotion ? 0.000035 : 0.00014);
  const verticalScale = 0.58;

  context.save();
  context.translate(centerX, centerY);
  context.scale(1, verticalScale);

  const shadow = context.createRadialGradient(0, 0, innerRadius * 0.22, 0, 0, outerRadius * 0.58);
  shadow.addColorStop(0, "rgba(0, 0, 0, 0.92)");
  shadow.addColorStop(0.35, "rgba(0, 0, 0, 0.76)");
  shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = shadow;
  context.beginPath();
  context.arc(0, 0, outerRadius * 0.72, 0, Math.PI * 2);
  context.fill();

  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  const armCount = reducedMotion ? 3 : 5;
  const pointCount = reducedMotion ? 30 : 52;
  for (let arm = 0; arm < armCount; arm += 1) {
    const color = paletteColor(palette, arm * 2);
    const armPhase = rotation + (arm / armCount) * Math.PI * 2;
    context.beginPath();
    for (let point = 0; point < pointCount; point += 1) {
      const progress = point / Math.max(1, pointCount - 1);
      const frequencyIndex = Math.min(values.length - 1, Math.floor(Math.pow(progress, 1.5) * values.length * 0.72));
      const energy = (values[frequencyIndex] ?? 0) / 255;
      const radius = innerRadius + Math.pow(progress, 0.72) * (outerRadius - innerRadius) * (0.92 + energy * 0.08);
      const angle = armPhase + progress * Math.PI * (2.55 + mid * 0.95) + Math.sin(progress * 15 + time * 0.0005) * energy * 0.06;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = rgba(color, 0.11 + activity * 0.28);
    context.lineWidth = 1.2 + activity * 2.2;
    context.shadowColor = rgba(color, 0.32 + activity * 0.32);
    context.shadowBlur = reducedMotion ? 5 : 11;
    context.stroke();
  }

  context.shadowBlur = 0;
  const streakCount = reducedMotion ? 14 : 28;
  for (let streak = 0; streak < streakCount; streak += 1) {
    const noise = deterministicNoise(streak * 2.37 + 11.4);
    const energy = (values[Math.min(values.length - 1, Math.floor(noise * values.length * 0.7))] ?? 0) / 255;
    const angle = rotation * (0.65 + noise * 0.55) + noise * Math.PI * 2 + streak * 2.399;
    const radius = innerRadius * 1.3 + Math.pow(deterministicNoise(streak * 4.11 + 2.8), 0.62) * (outerRadius - innerRadius * 1.3);
    const tail = 0.025 + energy * 0.1 + high * 0.035;
    const color = paletteColor(palette, streak);
    context.beginPath();
    context.arc(0, 0, radius, angle - tail, angle + tail * 0.25);
    context.strokeStyle = rgba(color, 0.1 + energy * 0.52);
    context.lineWidth = 0.55 + energy * 1.65;
    context.stroke();
  }

  const horizon = context.createRadialGradient(0, 0, innerRadius * 0.7, 0, 0, innerRadius * 2.4);
  horizon.addColorStop(0, "rgba(0, 0, 0, 0)");
  horizon.addColorStop(0.42, rgba(paletteColor(palette, 0), 0.08 + bass * 0.18));
  horizon.addColorStop(0.6, rgba(paletteColor(palette, Math.floor(palette.length / 2)), 0.22 + activity * 0.34));
  horizon.addColorStop(0.74, "rgba(0, 0, 0, 0)");
  context.fillStyle = horizon;
  context.beginPath();
  context.arc(0, 0, innerRadius * 2.55, 0, Math.PI * 2);
  context.fill();

  context.globalCompositeOperation = "source-over";
  context.fillStyle = "rgba(0, 0, 0, 0.9)";
  context.beginPath();
  context.arc(0, 0, innerRadius * 0.86, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function createRuntime(): VisualizerModeRuntime {
  return {
    render: ({ context, values, width, height, time, palette, reducedMotion }: VisualizerCanvasRenderInput) => {
      drawWarpHole(context, values, width, height, time, palette, reducedMotion);
    },
  };
}

const load = async (canvas: HTMLCanvasElement): Promise<VisualizerWebglAdapter> => {
  const { WarpHoleWebGLVisualizer } = await import("@/lib/warpHoleWebgl");
  const visualizer = new WarpHoleWebGLVisualizer(canvas);
  return {
    render: ({ values, time, palette, reducedMotion, isLive, profile }: VisualizerWebglRenderInput) => {
      visualizer.render(values, time, palette, reducedMotion, isLive, true, profile);
    },
    dispose: () => visualizer.dispose(),
    reset: () => visualizer.reset(),
  };
};

export const warpDefinition = {
  id: "warp",
  labelKey: "player.visualizerWarp",
  icon: "warp",
  renderer: "webgl",
  canvas: "warp",
  canvasClassName: "visualizer-warp-hole-canvas",
  webglPaletteRole: "aurora",
  supportsChibi: false,
  createRuntime,
  createCanvasRenderer: (runtime) => runtime.render,
  createFallbackRenderer: (runtime) => runtime.render,
  load,
} as const satisfies VisualizerModeDefinition;
