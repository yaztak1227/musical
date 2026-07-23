import {
  appInteractionConfig,
  audioAnalysisConfig,
  remoteAudioAnalysisConfig,
  remotePlaybackConfig,
} from "../../config/appConfig";

export const {
  albumPanelDragTolerance,
  albumPanelSwipeThreshold,
  trackLongPressDelayMs,
  trackLongPressMoveTolerance,
} = appInteractionConfig;
export const audioAnalysisSampleIntervalMs: number = audioAnalysisConfig.sampleIntervalMs;

export const {
  maxCachedPackets: remoteAudioAnalysisMaxCachedPackets,
  retryDelaysMs: remoteAudioAnalysisRetryDelaysMs,
} = remoteAudioAnalysisConfig;
export const {
  clockSnapThresholdSeconds: remotePlaybackClockSnapThresholdSeconds,
  libraryCommandPollIntervalMs,
  playerCommandPollIntervalMs,
  playerStateSyncIntervalMs: remotePlayerStateSyncIntervalMs,
  stateTransitDelayMaxSeconds: remotePlayerStateTransitDelayMaxSeconds,
  stalePlayerStateToleranceSeconds: staleRemotePlayerStateToleranceSeconds,
} = remotePlaybackConfig;
