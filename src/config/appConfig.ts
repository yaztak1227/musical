export const localServerConfig = {
  host: "127.0.0.1",
  port: 1422,
} as const;

export const audioAnalysisConfig = {
  bucketCount: 256,
  sampleIntervalMs: 33,
} as const;

export const chibiSpectrumConfig = {
  collapsedDurationMs: 2_600,
  fatigueHp: 15,
  fatigueRecoveryPerSecond: 0.42,
  impactCooldownMs: 190,
  impactHoldMs: 140,
  impactRiseThreshold: 0.035,
  restRecoveryPerSecond: 1.6,
  swingThreshold: 0.01,
  textureRiseThreshold: 0.055,
} as const;

export const remoteAudioAnalysisConfig = {
  maxCachedPackets: 5,
  retryDelaysMs: [1_000, 3_000, 8_000],
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
