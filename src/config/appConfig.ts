export const localServerConfig = {
  host: "127.0.0.1",
  port: 1422,
} as const;

export const audioAnalysisConfig = {
  bucketCount: 256,
  sampleIntervalMs: 33,
} as const;

export const remoteAudioAnalysisConfig = {
  chunkDurationSeconds: 30,
  durationPaddingSeconds: 2,
  fallbackDurationSeconds: 15 * 60,
} as const;

export const remotePlaybackConfig = {
  libraryCommandPollIntervalMs: 1000,
  clockSnapThresholdSeconds: 0.45,
  playerCommandPollIntervalMs: 250,
  playerStateSyncIntervalMs: 250,
  stateTransitDelayMaxSeconds: 5,
  stalePlayerStateToleranceSeconds: 0.05,
} as const;

export const appInteractionConfig = {
  albumPanelDragTolerance: 8,
  albumPanelSwipeThreshold: 36,
  trackLongPressDelayMs: 520,
  trackLongPressMoveTolerance: 10,
} as const;
