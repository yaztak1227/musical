import type { EntityId } from "@/types/audio";

export type RemotePlaybackClock = {
  currentTime: number;
  isPlaying: boolean;
  receivedAt: number;
  trackId: EntityId | null;
};

export type RemotePlayerTiming = {
  clientReceivedAtMs: number;
  clientRequestedAtMs: number;
  responseSentAtMs: number | null;
  stateCapturedAtMs: number | null;
};

export function estimateRemotePlaybackTime(clock: RemotePlaybackClock | null, now: number) {
  if (!clock) return 0;
  const elapsed = clock.isPlaying ? Math.max(0, now - clock.receivedAt) / 1000 : 0;
  return Math.max(0, clock.currentTime + elapsed);
}

export function getRemotePlayerStateAgeSeconds(timing: RemotePlayerTiming, transitDelayMaxSeconds: number) {
  if (timing.responseSentAtMs === null || timing.stateCapturedAtMs === null) return 0;

  const serverStateAgeMs = timing.responseSentAtMs - timing.stateCapturedAtMs;
  const responseTransitMs = (timing.clientReceivedAtMs - timing.clientRequestedAtMs) / 2;
  const stateAgeSeconds = (serverStateAgeMs + responseTransitMs) / 1000;
  return Math.max(0, Math.min(transitDelayMaxSeconds, stateAgeSeconds));
}
