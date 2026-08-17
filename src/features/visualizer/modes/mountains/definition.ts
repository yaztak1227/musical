import { paletteColor, rgba } from "../../palette";
import type {
  VisualizerCanvasRenderInput,
  VisualizerModeDefinition,
  VisualizerModeRuntime,
} from "../../types";

export function drawMountains(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerCanvasRenderInput["palette"],
  reducedMotion: boolean,
) {
  const motionTime = time * (reducedMotion ? 0.00006 : 0.00028);
  const layerCount = reducedMotion ? 3 : 5;
  context.save();

  // Paint from the distant ridge to the foreground ridge. Each solid pass uses
  // source-over so the nearest mountain remains visually in front of the glow.
  for (let layer = 0; layer < layerCount; layer += 1) {
    const color = paletteColor(palette, layer);
    const baseline = height * (0.32 + layer * 0.09);
    const points: Array<readonly [number, number]> = [];
    for (let x = 0; x <= width + 18; x += 18) {
      const progress = x / Math.max(1, width);
      const value = (values[Math.floor(progress * (values.length - 1))] ?? 0) / 255;
      const wave = Math.sin(progress * Math.PI * (2.4 + layer * 0.42) + motionTime * (1 + layer * 0.14) + layer) * height * 0.07;
      const shimmer = Math.sin(progress * Math.PI * 9 - motionTime * 1.8 + layer * 0.7) * height * 0.025;
      points.push([x, baseline + wave + shimmer - value * height * (0.16 + layer * 0.012)]);
    }

    const traceMountain = () => {
      context.beginPath();
      context.moveTo(0, height);
      points.forEach(([x, y]) => context.lineTo(x, y));
      context.lineTo(width, height);
      context.closePath();
    };
    const isForeground = layer === layerCount - 1;

    context.save();
    context.globalCompositeOperation = "lighter";
    context.filter = reducedMotion ? "blur(8px)" : "blur(14px)";
    const glowGradient = context.createLinearGradient(0, height * 0.18, 0, height);
    glowGradient.addColorStop(0, rgba(color, 0));
    glowGradient.addColorStop(0.5, rgba(color, isForeground ? 0.2 : 0.09 + layer * 0.018));
    glowGradient.addColorStop(1, rgba(color, isForeground ? 0.12 : 0.025));
    context.fillStyle = glowGradient;
    traceMountain();
    context.fill();
    context.restore();

    context.save();
    context.globalCompositeOperation = "source-over";
    context.filter = "none";
    const bodyGradient = context.createLinearGradient(0, height * 0.18, 0, height);
    bodyGradient.addColorStop(0, rgba(color, 0));
    bodyGradient.addColorStop(0.48, rgba(color, isForeground ? 0.34 : 0.12 + layer * 0.025));
    bodyGradient.addColorStop(1, rgba(color, isForeground ? 0.54 : 0.16 + layer * 0.025));
    context.fillStyle = bodyGradient;
    traceMountain();
    context.fill();
    if (isForeground) {
      context.beginPath();
      points.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = rgba(color, 0.86);
      context.lineWidth = Math.max(1.25, Math.min(width, height) * 0.0022);
      context.shadowBlur = reducedMotion ? 4 : 8;
      context.shadowColor = rgba(color, 0.5);
      context.stroke();
    }
    context.restore();
  }
  context.restore();
}

function createRuntime(): VisualizerModeRuntime {
  return {
    render: ({ context, values, width, height, time, palette, reducedMotion }) => {
      drawMountains(context, values, width, height, time, palette, reducedMotion);
    },
  };
}

export const mountainsDefinition = {
  id: "mountains",
  labelKey: "player.visualizerMountains",
  icon: "mountains",
  renderer: "canvas2d",
  canvas: "base",
  supportsChibi: false,
  createRuntime,
  createCanvasRenderer: (runtime) => runtime.render,
} as const satisfies VisualizerModeDefinition;
