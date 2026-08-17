import { paletteColor, rgba } from "../../palette";
import type { VisualizerPalette } from "../../types";

export function drawIdleSpectrum(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: VisualizerPalette,
  useOriginalColors: boolean,
) {
  const barCount = 36;
  const gap = 6;
  const barWidth = Math.max(4, Math.min(10, (width * 0.48) / barCount - gap));
  const startX = (width - (barWidth + gap) * barCount) / 2;
  const baseY = height * 0.72;

  context.save();
  context.shadowBlur = 12;
  for (let index = 0; index < barCount; index += 1) {
    const centerBias = 1 - Math.abs(index / Math.max(1, barCount - 1) - 0.5) * 1.35;
    const barHeight = Math.max(5, height * (0.018 + centerBias * 0.018));
    const color = paletteColor(palette, index);
    const nextColor = paletteColor(palette, index + 1);
    const hue = 190 + (index / barCount) * 120;
    const gradient = context.createLinearGradient(0, baseY - barHeight, 0, baseY);

    gradient.addColorStop(0, useOriginalColors ? `hsla(${hue}, 84%, 70%, 0.36)` : rgba(color, 0.36));
    gradient.addColorStop(1, useOriginalColors ? "hsla(330, 72%, 60%, 0.2)" : rgba(nextColor, 0.2));
    context.beginPath();
    context.fillStyle = gradient;
    context.shadowColor = useOriginalColors ? `hsla(${hue}, 84%, 64%, 0.16)` : rgba(color, 0.16);
    context.roundRect(startX + index * (barWidth + gap), baseY - barHeight, barWidth, barHeight, 999);
    context.fill();
  }
  context.restore();
}
