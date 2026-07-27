export type AuroraVisualProfile = "mist" | "rainbow" | "standard";

export function resolveAuroraVisualProfile(
  paletteMode: "artwork" | "original" | "rainbow" | "theme",
): AuroraVisualProfile {
  if (paletteMode === "rainbow") return "rainbow";
  if (paletteMode === "artwork" || paletteMode === "original") return "mist";
  return "standard";
}

export const warpAngularSectorCount = 32;

const defaultAngularPeakScratch = new Float32Array(warpAngularSectorCount);

export function scatteredFrequencyIndexAt(position: number, sampleCount: number) {
  const rowCount = Math.floor(sampleCount / warpAngularSectorCount);
  if (rowCount <= 0) return Math.max(0, Math.min(sampleCount - 1, position));
  const usablePosition = ((position % (rowCount * warpAngularSectorCount)) + rowCount * warpAngularSectorCount)
    % (rowCount * warpAngularSectorCount);
  const frequencyOffset = Math.floor(usablePosition / rowCount);
  const row = usablePosition % rowCount;
  return frequencyOffset + row * warpAngularSectorCount;
}

export function captureScatteredAngularEnergy(
  values: Uint8Array,
  target = new Float32Array(warpAngularSectorCount),
  peaks = defaultAngularPeakScratch,
) {
  target.fill(0);
  peaks.fill(0);
  const usableLength = Math.floor(values.length / warpAngularSectorCount) * warpAngularSectorCount;

  if (usableLength === 0) return target;
  for (let position = 0; position < usableLength; position += 1) {
    const value = (values[scatteredFrequencyIndexAt(position, usableLength)] ?? 0) / 255;
    const sector = position % warpAngularSectorCount;
    target[sector] = (target[sector] ?? 0) + value * value;
    peaks[sector] = Math.max(peaks[sector] ?? 0, value);
  }

  const countPerSector = (usableLength / warpAngularSectorCount) & 0xffff;
  for (let sector = 0; sector < warpAngularSectorCount; sector += 1) {
    const rms = Math.sqrt((target[sector] ?? 0) / Math.max(1, countPerSector));
    target[sector] = Math.min(1, rms * 0.72 + (peaks[sector] ?? 0) * 0.38);
  }
  return target;
}
