/** Pure audio-analysis helpers shared by independent visualizer add-ins. */
export function averageFrequencyBand(values: Uint8Array, start: number, end: number) {
  const first = Math.max(0, Math.floor(values.length * start));
  const last = Math.max(first + 1, Math.min(values.length, Math.ceil(values.length * end)));
  let total = 0;
  for (let index = first; index < last; index += 1) total += values[index] ?? 0;
  return total / Math.max(1, last - first) / 255;
}

export function deterministicNoise(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export type FrequencyBandStats = {
  average: number;
  peak: number;
  texture: number;
};

export function getFrequencyBandStats(
  values: Uint8Array,
  bandIndex: number,
  bandCount: number,
): FrequencyBandStats {
  const startIndex = Math.floor((bandIndex / bandCount) * values.length);
  const endIndex = Math.max(startIndex + 1, Math.floor(((bandIndex + 1) / bandCount) * values.length));
  let total = 0;
  let peak = 0;
  let squaredDistanceTotal = 0;

  for (let index = startIndex; index < endIndex; index += 1) {
    const value = (values[index] ?? 0) / 255;
    total += value;
    peak = Math.max(peak, value);
  }

  const sampleCount = Math.max(1, endIndex - startIndex);
  const average = total / sampleCount;
  for (let index = startIndex; index < endIndex; index += 1) {
    const value = (values[index] ?? 0) / 255;
    squaredDistanceTotal += (value - average) ** 2;
  }

  const variance = squaredDistanceTotal / sampleCount;
  return {
    average,
    peak,
    texture: peak * 0.68 + Math.sqrt(variance) * 0.32,
  };
}
