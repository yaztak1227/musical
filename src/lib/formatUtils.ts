import { type Track } from "../types/audio";

export function formatTrackDuration(track: Track) {
  if (track.durationLabel) return track.durationLabel;
  if (typeof track.durationSeconds === "number") return formatSeconds(track.durationSeconds);
  return "--:--";
}

export function getTrackDurationSeconds(track: Track | null) {
  if (!track) return 0;
  if (typeof track.durationSeconds === "number") return track.durationSeconds;
  if (!track.durationLabel) return 0;

  const [minutes, seconds] = track.durationLabel.split(":").map(Number);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0;
  return minutes * 60 + seconds;
}

export function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}