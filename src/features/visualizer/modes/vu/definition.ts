import { averageFrequencyBand } from "../shared/analysis";
import { mixVisualizerColors, paletteColor, rgba } from "../../palette";
import type { VisualizerCanvasRenderInput, VisualizerModeDefinition, VisualizerModeRuntime, VisualizerPalette } from "../../types";

function drawVuMeters(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  palette: VisualizerPalette,
) {
  const meterCount = width < 700 ? 2 : 3;
  const panelWidth = Math.min(250, width * (meterCount === 2 ? 0.36 : 0.24));
  const panelHeight = Math.min(190, height * 0.3);
  const gap = Math.min(34, width * 0.035);
  const totalWidth = panelWidth * meterCount + gap * (meterCount - 1);
  const startX = (width - totalWidth) / 2;
  const top = height * 0.35;

  context.save();
  for (let meter = 0; meter < meterCount; meter += 1) {
    const bandStart = meter / meterCount;
    const energy = averageFrequencyBand(values, bandStart, (meter + 1) / meterCount);
    const x = startX + meter * (panelWidth + gap);
    const color = paletteColor(palette, meter);
    const panelGradient = context.createLinearGradient(0, top, 0, top + panelHeight);
    panelGradient.addColorStop(0, "rgba(255, 255, 255, 0.13)");
    panelGradient.addColorStop(1, rgba(color, 0.08));
    context.fillStyle = panelGradient;
    context.strokeStyle = "rgba(255, 255, 255, 0.24)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.roundRect(x, top, panelWidth, panelHeight, 18);
    context.fill();
    context.stroke();

    const pivotX = x + panelWidth / 2;
    const pivotY = top + panelHeight * 0.78;
    const arcRadius = panelWidth * 0.34;
    context.strokeStyle = rgba(color, 0.42);
    context.lineWidth = 5;
    context.beginPath();
    context.arc(pivotX, pivotY, arcRadius, Math.PI * 1.12, Math.PI * 1.88);
    context.stroke();

    for (let tick = 0; tick <= 10; tick += 1) {
      const angle = Math.PI * (1.12 + tick * 0.076);
      context.strokeStyle = tick > 7 ? "rgba(255, 104, 92, 0.72)" : "rgba(255, 255, 255, 0.42)";
      context.lineWidth = tick % 5 === 0 ? 2 : 1;
      context.beginPath();
      context.moveTo(pivotX + Math.cos(angle) * arcRadius * 0.86, pivotY + Math.sin(angle) * arcRadius * 0.86);
      context.lineTo(pivotX + Math.cos(angle) * arcRadius * 1.04, pivotY + Math.sin(angle) * arcRadius * 1.04);
      context.stroke();
    }

    const needleAngle = Math.PI * (1.12 + Math.min(1, energy) * 0.76);
    context.strokeStyle = rgba(mixVisualizerColors(color, [255, 255, 255], 0.38), 0.94);
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(pivotX, pivotY);
    context.lineTo(pivotX + Math.cos(needleAngle) * arcRadius * 0.94, pivotY + Math.sin(needleAngle) * arcRadius * 0.94);
    context.stroke();
    context.fillStyle = "rgba(245, 245, 248, 0.92)";
    context.beginPath();
    context.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function createRuntime(): VisualizerModeRuntime {
  return {
    render: ({ context, values, width, height, palette }: VisualizerCanvasRenderInput) => {
      drawVuMeters(context, values, width, height, palette);
    },
  };
}

export const vuDefinition = {
  id: "vu",
  labelKey: "player.visualizerVu",
  icon: "vu",
  renderer: "canvas2d",
  canvas: "base",
  supportsChibi: false,
  createRuntime,
  createCanvasRenderer: (runtime) => runtime.render,
} as const satisfies VisualizerModeDefinition;
