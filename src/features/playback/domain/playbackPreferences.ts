import type { RepeatMode } from "@/types/app";
import type { EntityId } from "@/types/audio";

export type PlaybackPreferences = {
  isShuffle: boolean;
  playbackAlbumId: EntityId | null;
  repeatMode: RepeatMode;
  selectedAlbumId: EntityId | null;
};

export function isRepeatMode(value: unknown): value is RepeatMode {
  return value === "off" || value === "all" || value === "one";
}

export function getNextRepeatMode(repeatMode: RepeatMode): RepeatMode {
  if (repeatMode === "off") return "all";
  if (repeatMode === "all") return "one";
  return "off";
}
