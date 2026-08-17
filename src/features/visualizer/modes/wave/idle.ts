import { paletteColor, rgba } from "../../palette";
import type { VisualizerPalette } from "../../types";

export function drawIdleWave(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: VisualizerPalette,
  useOriginalColors: boolean,
) {
  const centerY = height * 0.58;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowBlur = 14;

  for (let layer = 0; layer < 2; layer += 1) {
    context.beginPath();
    const color = paletteColor(palette, layer);
    context.strokeStyle = useOriginalColors
      ? (layer === 0 ? "rgba(99, 230, 255, 0.34)" : "rgba(255, 79, 216, 0.2)")
      : rgba(color, layer === 0 ? 0.34 : 0.2);
    context.lineWidth = layer === 0 ? 5 : 3;
    context.shadowColor = useOriginalColors
      ? (layer === 0 ? "rgba(99, 230, 255, 0.2)" : "rgba(255, 79, 216, 0.16)")
      : rgba(color, layer === 0 ? 0.2 : 0.16);

    for (let x = width * 0.26; x <= width * 0.74; x += 16) {
      const y = centerY + Math.sin((x / width) * Math.PI * 4 + layer * 0.8) * height * 0.018;
      if (x === width * 0.26) context.moveTo(x, y);
      else context.lineTo(x, y);
    }

    context.stroke();
  }

  context.restore();
}
