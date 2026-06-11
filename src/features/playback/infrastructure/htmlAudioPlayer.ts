import { getBackendMediaSrc } from "@/lib/backend";
import { releaseAudioSource } from "@/lib/renderDiagnostics";
import type { Track } from "@/types/audio";

export function loadTrackAudioSource(audio: HTMLAudioElement, track: Track | null, isTauriRuntime: boolean) {
  releaseAudioSource(audio);

  if (!isTauriRuntime || !track?.filePath) return null;

  const mediaSrc = getBackendMediaSrc(track.filePath);
  audio.src = mediaSrc;
  audio.load();
  return track.filePath;
}

export function releaseTrackAudioSource(audio: HTMLAudioElement) {
  releaseAudioSource(audio);
}

export async function playHtmlAudio(audio: HTMLAudioElement) {
  await audio.play();
}

export function pauseHtmlAudio(audio: HTMLAudioElement) {
  audio.pause();
}
