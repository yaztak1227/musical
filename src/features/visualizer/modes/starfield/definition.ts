import { captureScatteredAngularEnergy, warpAngularSectorCount } from "@/lib/visualizerAnalysis";
import { mixVisualizerColors, paletteColor, rgba } from "../../palette";
import { averageFrequencyBand, deterministicNoise } from "../shared/analysis";
import type { VisualizerCanvasRenderInput, VisualizerModeDefinition, VisualizerModeRuntime, VisualizerPalette, VisualizerWebglAdapter, VisualizerWebglRenderInput } from "../../types";

function drawStarfield(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
) {
  const centerX = width * 0.5;
  const centerY = height * 0.49;
  const bass = averageFrequencyBand(values, 0, 0.16);
  const mids = averageFrequencyBand(values, 0.16, 0.48);
  const treble = averageFrequencyBand(values, 0.48, 0.9);
  const angularEnergies = captureScatteredAngularEnergy(values);
  const activity = Math.min(1, Math.sqrt(angularEnergies.reduce((total, energy) => total + energy * energy, 0) / warpAngularSectorCount) * 1.28);
  const starCount = reducedMotion ? 72 : 240;
  const speed = reducedMotion ? 0.000012 : 0.00011 + bass * 0.00025 + mids * 0.00004;
  const diagonal = Math.hypot(width, height);
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";

  const centerGlow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(width, height) * 0.34);
  centerGlow.addColorStop(0, rgba(mixVisualizerColors(paletteColor(palette, 0), [255, 255, 255], 0.48), 0.13 + bass * 0.12));
  centerGlow.addColorStop(0.16, rgba(paletteColor(palette, 2), 0.055 + mids * 0.07));
  centerGlow.addColorStop(0.52, rgba(paletteColor(palette, 0), 0.018));
  centerGlow.addColorStop(1, rgba(paletteColor(palette, 0), 0));
  context.fillStyle = centerGlow;
  context.fillRect(0, 0, width, height);

  if (!reducedMotion) {
    context.save();
    context.translate(centerX, centerY);
    context.scale(1, 0.58);
    for (let ringIndex = 0; ringIndex < 2; ringIndex += 1) {
      const phase = (time * speed * 0.2 + ringIndex * 0.53) % 1;
      const radius = diagonal * (0.055 + phase * 0.48);
      context.strokeStyle = rgba(paletteColor(palette, ringIndex * 2), (1 - phase) * (0.035 + bass * 0.05));
      context.lineWidth = 0.6 + (1 - phase) * 1.4;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  for (let index = 0; index < starCount; index += 1) {
    const angle = deterministicNoise(index + 2) * Math.PI * 2 + (deterministicNoise(index + 47) - 0.5) * 0.018;
    const normalizedAngle = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
    const sector = Math.floor(normalizedAngle * warpAngularSectorCount) % warpAngularSectorCount;
    const distributedEnergy = angularEnergies[sector] ?? 0;
    const densityThreshold = Math.min(0.96, 0.045 + Math.pow(Math.min(1, distributedEnergy * 1.3 + activity * 0.2), 0.72) * 0.915);
    if (deterministicNoise(index + 107) > densityThreshold) continue;
    const velocity = 0.62 + deterministicNoise(index + 9) * 0.76;
    const depth = (deterministicNoise(index + 31) + time * speed * velocity) % 1;
    const trailDepth = reducedMotion ? 0.008 : 0.008 + Math.pow(depth, 2.2) * (0.065 + bass * 0.1 + distributedEnergy * 0.16);
    const tailDepth = Math.max(0, depth - trailDepth);
    const radial = Math.pow(depth, 1.82) * diagonal * 0.72;
    const tailRadial = Math.pow(tailDepth, 1.82) * diagonal * 0.72;
    const stretch = 0.72 + deterministicNoise(index + 71) * 0.68;
    const x = centerX + Math.cos(angle) * radial * stretch;
    const y = centerY + Math.sin(angle) * radial * 0.58;
    const tailX = centerX + Math.cos(angle) * tailRadial * stretch;
    const tailY = centerY + Math.sin(angle) * tailRadial * 0.58;
    const energy = Math.max(distributedEnergy, (values[index % values.length] ?? 0) / 255 * 0.4);
    const size = 0.3 + Math.pow(depth, 1.7) * 2.1 + energy * 1.6;
    const color = mixVisualizerColors(paletteColor(palette, index), [232, 247, 255], 0.42 + depth * 0.2);
    const alpha = 0.1 + depth * 0.42 + energy * 0.42;

    if (!reducedMotion && depth > 0.34 && index % 3 === 0) {
      context.strokeStyle = rgba(color, alpha * 0.15);
      context.lineWidth = size * 5.2;
      context.beginPath();
      context.moveTo(tailX, tailY);
      context.lineTo(x, y);
      context.stroke();
    }

    context.strokeStyle = rgba(color, alpha);
    context.lineWidth = size;
    context.beginPath();
    context.moveTo(tailX, tailY);
    context.lineTo(x, y);
    context.stroke();
  }

  const flareColor = mixVisualizerColors(paletteColor(palette, 0), [255, 255, 255], 0.62);
  context.strokeStyle = rgba(flareColor, 0.12 + bass * 0.16);
  context.lineWidth = 0.7 + treble * 1.4;
  context.beginPath();
  context.moveTo(centerX - width * (0.08 + bass * 0.06), centerY);
  context.lineTo(centerX + width * (0.08 + bass * 0.06), centerY);
  context.stroke();
  context.restore();
}

function createRuntime(): VisualizerModeRuntime {
  return {
    render: ({ context, values, width, height, time, palette, reducedMotion }: VisualizerCanvasRenderInput) => {
      drawStarfield(context, values, width, height, time, palette, reducedMotion);
    },
  };
}

const load = async (canvas: HTMLCanvasElement): Promise<VisualizerWebglAdapter> => {
  const { WarpStarfieldWebGLVisualizer } = await import("@/lib/starfieldWebgl");
  const visualizer = new WarpStarfieldWebGLVisualizer(canvas);
  return {
    render: ({ values, time, palette, reducedMotion, isLive }: VisualizerWebglRenderInput) => {
      visualizer.render(values, time, palette, reducedMotion, isLive);
    },
    dispose: () => visualizer.dispose(),
  };
};

export const starfieldDefinition = {
  id: "starfield",
  labelKey: "player.visualizerStarfield",
  icon: "starfield",
  renderer: "webgl",
  canvas: "starfield",
  canvasClassName: "visualizer-starfield-canvas",
  webglPaletteRole: "mode",
  supportsChibi: false,
  createRuntime,
  createCanvasRenderer: (runtime) => runtime.render,
  createFallbackRenderer: (runtime) => runtime.render,
  load,
} as const satisfies VisualizerModeDefinition;
