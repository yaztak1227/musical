import { mixVisualizerColors, paletteColor, rgba } from "../../palette";
import type { VisualizerColor, VisualizerCanvasRenderInput, VisualizerModeDefinition, VisualizerModeRuntime, VisualizerPalette } from "../../types";

type InkFlowBlob = {
  blockIndex: number;
  color: VisualizerColor;
  energy: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  shapeSeed: number;
  x: number;
  y: number;
};

type InkEnergyState = {
  blockCount: number;
  energies: number[];
  lastTime: number;
};

const inkEnergyStates = new WeakMap<CanvasRenderingContext2D, InkEnergyState>();

const inkBlockAnchors = [
  [0.19, 0.54, 0.97, -0.06],
  [0.36, 0.44, 1.04, 0.03],
  [0.52, 0.47, 1.10, 0.06],
  [0.43, 0.68, 1.00, -0.03],
  [0.60, 0.62, 1.08, 0.04],
] as const;

const inkMembraneLinks = [
  [0, 1],
  [1, 2],
  [1, 3],
  [2, 4],
  [3, 4],
] as const;

const inkGroupPaletteIndices = [4, 0, 3, 6, 4] as const;
const inkGroupRadiusScales = [0.19, 0.215, 0.24, 0.19, 0.21] as const;

function inkFrequencyBlockEnergy(values: Uint8Array, blockIndex: number, blockCount: number) {
  const first = Math.floor(values.length * blockIndex / blockCount);
  const last = Math.max(first + 1, Math.floor(values.length * (blockIndex + 1) / blockCount));
  let sum = 0;
  for (let index = first; index < last; index += 1) sum += values[index] ?? 0;
  return sum / Math.max(1, (last - first) * 255);
}

function smoothInkBlockEnergies(
  context: CanvasRenderingContext2D,
  rawEnergies: number[],
  time: number,
) {
  let state = inkEnergyStates.get(context);
  if (!state || state.blockCount !== rawEnergies.length || time < state.lastTime) {
    state = {
      blockCount: rawEnergies.length,
      // Enter from the resting size instead of snapping to the current track's
      // energy when Color flow is first opened or the animation clock restarts.
      energies: rawEnergies.map(() => 0),
      lastTime: time,
    };
    inkEnergyStates.set(context, state);
    return state.energies;
  }

  const elapsedSeconds = Math.min(0.1, Math.max(0, time - state.lastTime) / 1000);
  state.lastTime = time;
  rawEnergies.forEach((rawEnergy, blockIndex) => {
    const current = state?.energies[blockIndex] ?? rawEnergy;
    const timeConstant = rawEnergy > current ? 0.16 : 0.48;
    const blend = 1 - Math.exp(-elapsedSeconds / timeConstant);
    state!.energies[blockIndex] = current + (rawEnergy - current) * blend;
  });
  return state.energies;
}

function traceInkBlob(
  context: CanvasRenderingContext2D,
  blob: InkFlowBlob,
  time: number,
  reducedMotion: boolean,
) {
  const pointCount = 18;
  const shapeTime = reducedMotion ? blob.shapeSeed : time * 0.00034 + blob.shapeSeed;
  const points = Array.from({ length: pointCount }, (_, pointIndex) => {
    const angle = pointIndex / pointCount * Math.PI * 2;
    const deformation = 1
      + Math.sin(angle * 2 + shapeTime * 0.74) * 0.035
      + Math.sin(angle * 3 - shapeTime * 0.53 + blob.shapeSeed * 1.7) * 0.05
      + Math.cos(angle * 5 + shapeTime * 0.31 + blob.shapeSeed) * 0.018;
    const localX = Math.cos(angle) * blob.radiusX * deformation;
    const localY = Math.sin(angle) * blob.radiusY * deformation;
    const rotationCos = Math.cos(blob.rotation);
    const rotationSin = Math.sin(blob.rotation);
    return {
      x: blob.x + localX * rotationCos - localY * rotationSin,
      y: blob.y + localX * rotationSin + localY * rotationCos,
    };
  });

  const first = points[0];
  const last = points[points.length - 1];
  context.beginPath();
  context.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  points.forEach((point, pointIndex) => {
    const next = points[(pointIndex + 1) % points.length];
    context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  });
  context.closePath();
}

function inkBlobRadiusToward(blob: InkFlowBlob, angle: number) {
  const relativeAngle = angle - blob.rotation;
  const normalizedX = Math.cos(relativeAngle) / blob.radiusX;
  const normalizedY = Math.sin(relativeAngle) / blob.radiusY;
  return 1 / Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
}

function traceInkMembrane(
  context: CanvasRenderingContext2D,
  first: InkFlowBlob,
  second: InkFlowBlob,
) {
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const directionX = deltaX / distance;
  const directionY = deltaY / distance;
  const normalX = -directionY;
  const normalY = directionX;
  const firstRadius = inkBlobRadiusToward(first, Math.atan2(deltaY, deltaX));
  const secondRadius = inkBlobRadiusToward(second, Math.atan2(-deltaY, -deltaX));
  const overlap = Math.max(0, firstRadius + secondRadius - distance);
  const contactX = first.x + directionX * Math.min(firstRadius, (distance + firstRadius - secondRadius) / 2);
  const contactY = first.y + directionY * Math.min(firstRadius, (distance + firstRadius - secondRadius) / 2);
  const smallerRadius = Math.min(firstRadius, secondRadius);
  const halfLength = Math.min(
    smallerRadius * 0.15,
    smallerRadius * 0.09 + overlap * 0.055,
  );
  const halfDepth = Math.min(
    smallerRadius * 0.075,
    Math.max(4, smallerRadius * 0.035 + overlap * 0.02),
  );

  context.beginPath();
  context.moveTo(
    contactX - directionX * halfDepth + normalX * halfLength * 0.62,
    contactY - directionY * halfDepth + normalY * halfLength * 0.62,
  );
  context.bezierCurveTo(
    contactX - directionX * halfDepth * 0.18 + normalX * halfLength,
    contactY - directionY * halfDepth * 0.18 + normalY * halfLength,
    contactX + directionX * halfDepth * 0.18 + normalX * halfLength,
    contactY + directionY * halfDepth * 0.18 + normalY * halfLength,
    contactX + directionX * halfDepth + normalX * halfLength * 0.62,
    contactY + directionY * halfDepth + normalY * halfLength * 0.62,
  );
  context.lineTo(
    contactX + directionX * halfDepth - normalX * halfLength * 0.62,
    contactY + directionY * halfDepth - normalY * halfLength * 0.62,
  );
  context.bezierCurveTo(
    contactX + directionX * halfDepth * 0.18 - normalX * halfLength,
    contactY + directionY * halfDepth * 0.18 - normalY * halfLength,
    contactX - directionX * halfDepth * 0.18 - normalX * halfLength,
    contactY - directionY * halfDepth * 0.18 - normalY * halfLength,
    contactX - directionX * halfDepth - normalX * halfLength * 0.62,
    contactY - directionY * halfDepth - normalY * halfLength * 0.62,
  );
  context.closePath();

  return {
    contactX,
    contactY,
    halfLength,
    normalX,
    normalY,
  };
}

function drawInk(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
) {
  const blockCount = 5;
  const rawEnergies = Array.from(
    { length: blockCount },
    (_, blockIndex) => inkFrequencyBlockEnergy(values, blockIndex, blockCount),
  );
  const energies = smoothInkBlockEnergies(context, rawEnergies, time);
  const minDimension = Math.min(width, height);
  const edgeBlur = Math.max(24, Math.min(42, minDimension * 0.04));
  const innerBlur = Math.max(3, Math.min(7, minDimension * 0.0065));
  const membraneBlur = Math.max(3, Math.min(8, minDimension * 0.0065));
  const outlineBlur = Math.max(1, Math.min(2.4, minDimension * 0.002));
  const blobs: InkFlowBlob[] = Array.from({ length: blockCount }, (_, blockIndex) => {
    const [anchorX, anchorY, aspect, rotation] = inkBlockAnchors[blockIndex];
    const rawEnergy = energies[blockIndex] ?? 0;
    const energy = Math.min(1, Math.pow(rawEnergy * 3.6, 0.7));
    const shapeSeed = (blockIndex + 1) * 0.83;
    const driftTime = reducedMotion ? shapeSeed : time * 0.00011 + shapeSeed;
    const responseTime = time * 0.0016 + blockIndex * 1.7;
    const baseRadius = minDimension * inkGroupRadiusScales[blockIndex];
    const energyScale = 0.88 + energy * 0.58;
    const radiusPulseX = reducedMotion ? 1 : 1 + Math.sin(time * 0.0021 + shapeSeed) * energy * 0.06;
    const radiusPulseY = reducedMotion ? 1 : 1 + Math.cos(time * 0.0018 + shapeSeed) * energy * 0.06;
    const paletteBase = paletteColor(palette, inkGroupPaletteIndices[blockIndex]);
    const color = blockIndex === 0
      ? mixVisualizerColors(paletteBase, [160, 170, 188], 0.58)
      : mixVisualizerColors(paletteBase, [20, 18, 28], blockIndex === 3 ? 0.24 : 0.1);
    return {
      blockIndex,
      color,
      energy,
      radiusX: baseRadius * energyScale * aspect * radiusPulseX,
      radiusY: baseRadius * energyScale / aspect * radiusPulseY,
      rotation: rotation + (reducedMotion ? 0 : Math.sin(driftTime * 0.39) * 0.045),
      shapeSeed,
      x: width * anchorX
        + Math.sin(driftTime) * minDimension * (reducedMotion ? 0 : 0.014)
        + Math.sin(responseTime) * minDimension * (reducedMotion ? 0 : energy * 0.012),
      y: height * anchorY
        + Math.cos(driftTime * 0.81) * minDimension * (reducedMotion ? 0 : 0.012)
        + Math.cos(responseTime * 0.83) * minDimension * (reducedMotion ? 0 : energy * 0.01),
    };
  });

  context.save();
  context.globalCompositeOperation = "source-over";

  context.filter = `blur(${reducedMotion ? edgeBlur * 0.82 : edgeBlur}px)`;
  blobs.forEach((blob) => {
    const gradient = context.createRadialGradient(
      blob.x - blob.radiusX * 0.14,
      blob.y - blob.radiusY * 0.12,
      Math.min(blob.radiusX, blob.radiusY) * 0.05,
      blob.x,
      blob.y,
      Math.max(blob.radiusX, blob.radiusY) * 1.08,
    );
    gradient.addColorStop(0, rgba(blob.color, 0.2 + blob.energy * 0.1));
    gradient.addColorStop(0.52, rgba(blob.color, 0.155 + blob.energy * 0.08));
    gradient.addColorStop(0.8, rgba(blob.color, 0.045 + blob.energy * 0.035));
    gradient.addColorStop(1, rgba(blob.color, 0));
    context.fillStyle = gradient;
    traceInkBlob(context, blob, time, reducedMotion);
    context.fill();
  });

  context.globalCompositeOperation = "screen";
  context.filter = `blur(${reducedMotion ? innerBlur * 0.82 : innerBlur}px)`;
  blobs.forEach((blob) => {
    const wash = context.createRadialGradient(
      blob.x + blob.radiusX * 0.08,
      blob.y - blob.radiusY * 0.06,
      0,
      blob.x,
      blob.y,
      Math.max(blob.radiusX, blob.radiusY),
    );
    wash.addColorStop(0, rgba(blob.color, 0.18 + blob.energy * 0.11));
    wash.addColorStop(0.6, rgba(blob.color, 0.135 + blob.energy * 0.075));
    wash.addColorStop(0.88, rgba(blob.color, 0.035 + blob.energy * 0.025));
    wash.addColorStop(1, rgba(blob.color, 0));
    context.fillStyle = wash;
    traceInkBlob(context, blob, time, reducedMotion);
    context.fill();
  });

  context.filter = `blur(${reducedMotion ? outlineBlur * 0.8 : outlineBlur}px)`;
  blobs.forEach((blob) => {
    context.strokeStyle = rgba(
      mixVisualizerColors(blob.color, [225, 220, 235], 0.24),
      0.065 + blob.energy * 0.025,
    );
    context.lineWidth = Math.max(1.1, minDimension * 0.0018);
    traceInkBlob(context, blob, time, reducedMotion);
    context.stroke();
  });

  context.filter = `blur(${reducedMotion ? membraneBlur * 0.82 : membraneBlur}px)`;
  inkMembraneLinks.forEach(([firstIndex, secondIndex]) => {
    const first = blobs[firstIndex];
    const second = blobs[secondIndex];
    traceInkMembrane(context, first, second);
    const membraneColor = mixVisualizerColors(first.color, second.color, 0.5);
    const membraneEnergy = (first.energy + second.energy) / 2;
    context.fillStyle = rgba(membraneColor, 0.075 + membraneEnergy * 0.055);
    context.fill();
  });

  context.filter = "none";
  context.restore();
}

function createRuntime(): VisualizerModeRuntime {
  return {
    render: ({ context, values, width, height, time, palette, reducedMotion }: VisualizerCanvasRenderInput) => {
      drawInk(context, values, width, height, time, palette, reducedMotion);
    },
  };
}

export const inkDefinition = {
  id: "ink",
  labelKey: "player.visualizerInk",
  icon: "ink",
  renderer: "canvas2d",
  canvas: "base",
  supportsChibi: false,
  createRuntime,
  createCanvasRenderer: (runtime) => runtime.render,
} as const satisfies VisualizerModeDefinition;
