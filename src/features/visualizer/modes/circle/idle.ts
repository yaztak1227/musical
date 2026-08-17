import { paletteColor, rgba } from "../../palette";
import type { VisualizerPalette } from "../../types";

export function drawIdleCircle(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: VisualizerPalette,
  useOriginalColors: boolean,
) {
  const centerX = width / 2;
  const centerY = height * 0.55;
  const radius = Math.min(width, height) * 0.15;
  const barCount = 72;

  context.save();
  context.translate(centerX, centerY);
  context.lineCap = "round";
  context.shadowBlur = 12;

  for (let index = 0; index < barCount; index += 1) {
    const angle = (index / barCount) * Math.PI * 2;
    const centerBias = Math.sin((index / barCount) * Math.PI);
    const outerRadius = radius + 6 + centerBias * 7;
    const color = paletteColor(palette, Math.floor(index / 12));
    const hue = 190 + (index / barCount) * 150;

    context.beginPath();
    context.strokeStyle = useOriginalColors ? `hsla(${hue}, 84%, 68%, 0.3)` : rgba(color, 0.3);
    context.lineWidth = 2.2;
    context.shadowColor = useOriginalColors ? `hsla(${hue}, 84%, 64%, 0.15)` : rgba(color, 0.15);
    context.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    context.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
    context.stroke();
  }

  context.beginPath();
  context.strokeStyle = "rgba(255, 255, 255, 0.18)";
  context.lineWidth = 1.2;
  context.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}
