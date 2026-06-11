import type { RepeatMode } from "@/types/app";
import type { EntityId, Track } from "@/types/audio";

export type PlaybackResolutionState = {
  currentTrackIndex: number;
  isShuffle: boolean;
  playbackAlbumId: EntityId | null;
  queue: Track[];
  repeatMode: RepeatMode;
  selectedAlbumId: EntityId | null;
};

export type EndedTrackResolution =
  | { type: "idle" }
  | { type: "play-track"; nextQueue: Track[] | null; track: Track }
  | { type: "restart-track" }
  | { type: "stop-at-start" };

export function getNextTrack(state: Pick<PlaybackResolutionState, "currentTrackIndex" | "queue" | "repeatMode">) {
  if (state.queue.length === 0) return null;

  if (state.currentTrackIndex < 0) return state.queue[0] ?? null;
  if (state.currentTrackIndex < state.queue.length - 1) return state.queue[state.currentTrackIndex + 1] ?? null;
  return state.repeatMode === "all" ? state.queue[0] ?? null : null;
}

export function resolveEndedTrack(
  state: PlaybackResolutionState | null,
  shuffleTracks: (tracks: Track[]) => Track[],
): EndedTrackResolution {
  if (!state) return { type: "idle" };

  if (state.repeatMode === "one") return { type: "restart-track" };

  if (state.queue.length === 0) return { type: "stop-at-start" };

  if (state.currentTrackIndex >= 0 && state.currentTrackIndex < state.queue.length - 1) {
    const nextTrack = state.queue[state.currentTrackIndex + 1];
    return nextTrack ? { type: "play-track", nextQueue: null, track: nextTrack } : { type: "idle" };
  }

  if (state.repeatMode !== "all") return { type: "stop-at-start" };

  if (state.isShuffle) {
    const nextQueue = shuffleTracks(state.queue);
    const nextTrack = nextQueue[0];
    return nextTrack ? { type: "play-track", nextQueue, track: nextTrack } : { type: "idle" };
  }

  const nextTrack = state.queue[0];
  return nextTrack ? { type: "play-track", nextQueue: null, track: nextTrack } : { type: "idle" };
}
