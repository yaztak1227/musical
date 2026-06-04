type AudioVisualizerNode = {
  analyser: AnalyserNode;
  context: AudioContext;
};

type WindowWithAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const audibleVisualizerNodes = new WeakMap<HTMLAudioElement, AudioVisualizerNode>();
const analyserFrequencyValues = new WeakMap<AnalyserNode, Uint8Array<ArrayBuffer>>();

export function getAudioVisualizerNode(audio: HTMLAudioElement) {
  const existingNode = audibleVisualizerNodes.get(audio);
  if (existingNode) return existingNode;

  const AudioContextConstructor = window.AudioContext || (window as WindowWithAudioContext).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  const context = new AudioContextConstructor();
  const source = context.createMediaElementSource(audio);
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.minDecibels = -88;
  analyser.maxDecibels = -18;
  analyser.smoothingTimeConstant = 0.58;
  source.connect(analyser);
  analyser.connect(context.destination);

  const nextNode = { analyser, context };
  audibleVisualizerNodes.set(audio, nextNode);
  return nextNode;
}

export function sampleAudioAnalysis(analyser: AnalyserNode, bucketCount = 32, target: number[] = []) {
  let frequencyValues = analyserFrequencyValues.get(analyser);
  if (!frequencyValues || frequencyValues.length !== analyser.frequencyBinCount) {
    frequencyValues = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    analyserFrequencyValues.set(analyser, frequencyValues);
  }

  analyser.getByteFrequencyData(frequencyValues);

  const bucketSize = Math.max(1, Math.floor(frequencyValues.length / bucketCount));
  target.length = bucketCount;

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const start = bucketIndex * bucketSize;
    const end = Math.min(frequencyValues.length, start + bucketSize);
    let total = 0;

    for (let index = start; index < end; index += 1) {
      total += frequencyValues[index] ?? 0;
    }

    target[bucketIndex] = Math.round(total / Math.max(1, end - start));
  }

  return target;
}
