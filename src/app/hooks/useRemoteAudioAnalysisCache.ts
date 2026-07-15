import { type RefObject, useEffectEvent, useRef } from "react";
import type { EntityId, Track } from "../../types/audio";
import { isBrowserBackendRuntime, isTauriRuntime } from "../../lib/backend";
import { getHeapUsageMb, logRenderDiagnostic } from "../../lib/renderDiagnostics";
import { type PlayerBarHandle } from "../../components/PlayerBar";
import {
  makeAudioAnalysisPacketFromFrames,
  mergeRemoteAudioAnalysisFrames,
  rebaseAudioAnalysisPacketPlaybackTime,
  type RemoteAudioAnalysisFrameEntry,
  type RemoteAudioAnalysisPacket,
} from "../../features/remote-player/domain/audioAnalysisPacket";
import {
  estimateRemotePlaybackTime,
  type RemotePlaybackClock,
} from "../../features/remote-player/domain/remotePlaybackClock";
import { getRemoteTrackAnalysisSegment } from "../../features/remote-player/infrastructure/remotePlayerRepository";
import {
  audioAnalysisSampleIntervalMs,
  remoteAudioAnalysisChunkDurationSeconds,
  remoteAudioAnalysisDurationPaddingSeconds,
  remoteAudioAnalysisFallbackDurationSeconds,
  remoteAudioAnalysisMaxCachedPackets,
  remoteAudioAnalysisRetryDelaysMs,
} from "./useAppControllerConfig";
import type { RemoteAudioAnalysisLoadState } from "./useAppControllerTypes";
import { getHeapTotalUsageMb } from "./useAppControllerUtils";

type RemoteAudioAnalysisCacheOptions = {
  currentTrack: Track | null;
  currentTrackIndex: number;
  playerBarRef: RefObject<PlayerBarHandle | null>;
  queue: Track[];
  remotePlaybackClockRef: RefObject<RemotePlaybackClock | null>;
};

export function getTrackAnalysisRequestDuration(track: Track) {
  return track.durationSeconds && track.durationSeconds > 0
    ? track.durationSeconds + remoteAudioAnalysisDurationPaddingSeconds
    : remoteAudioAnalysisFallbackDurationSeconds;
}

export function useRemoteAudioAnalysisCache({
  currentTrack,
  currentTrackIndex,
  playerBarRef,
  queue,
  remotePlaybackClockRef,
}: RemoteAudioAnalysisCacheOptions) {
  const audioAnalysisPacketRef = useRef<RemoteAudioAnalysisPacket | null>(null);
  const remoteAudioAnalysisLoadStateRef = useRef<RemoteAudioAnalysisLoadState | null>(null);
  const remoteAudioAnalysisPacketsByTrackRef = useRef(new Map<EntityId, RemoteAudioAnalysisPacket>());
  const activeRemoteAudioAnalysisWarmupsRef = useRef(new Set<EntityId>());
  const loadedRemoteAudioAnalysisTrackIdRef = useRef<EntityId | null>(null);
  const retryTrackAnalysisRef = useRef<(track: Track) => void>(() => undefined);
  const remoteAudioAnalysisRetryRef = useRef<{ attempt: number; timer: number | null; trackId: EntityId } | null>(null);

  function clearRemoteAudioAnalysisRetry() {
    const retry = remoteAudioAnalysisRetryRef.current;
    if (retry?.timer != null) window.clearTimeout(retry.timer);
    remoteAudioAnalysisRetryRef.current = null;
  }

  function clearAudioAnalysisPacket() {
    audioAnalysisPacketRef.current = null;
  }

  function resetAudioAnalysisLoad() {
    clearRemoteAudioAnalysisRetry();
    audioAnalysisPacketRef.current = null;
    remoteAudioAnalysisLoadStateRef.current = null;
    loadedRemoteAudioAnalysisTrackIdRef.current = null;
  }

  function getRemoteAudioAnalysisRetainedTrackIds(trackId: EntityId | null = null) {
    const retainedTrackIds = new Set<EntityId>();
    if (trackId != null) retainedTrackIds.add(trackId);
    if (currentTrack?.id != null) retainedTrackIds.add(currentTrack.id);
    if (loadedRemoteAudioAnalysisTrackIdRef.current != null) {
      retainedTrackIds.add(loadedRemoteAudioAnalysisTrackIdRef.current);
    }
    if (remotePlaybackClockRef.current?.trackId != null) {
      retainedTrackIds.add(remotePlaybackClockRef.current.trackId);
    }

    const anchorTrackIndex =
      currentTrackIndex >= 0
        ? currentTrackIndex
        : trackId != null
          ? queue.findIndex((track) => track.id === trackId)
          : -1;
    if (anchorTrackIndex >= 0) {
      const lastRetainedQueueIndex = Math.min(queue.length - 1, anchorTrackIndex + 1);
      for (let index = Math.max(0, anchorTrackIndex - 1); index <= lastRetainedQueueIndex; index += 1) {
        retainedTrackIds.add(queue[index].id);
      }
    }

    return retainedTrackIds;
  }

  function logRemoteAudioAnalysisCacheDiagnostic(label: string, purgedTrackIds: EntityId[]) {
    const payload = {
      audioAnalysisPacketsCached: remoteAudioAnalysisPacketsByTrackRef.current.size,
      jsHeapTotalMb: getHeapTotalUsageMb(),
      jsHeapUsedMb: getHeapUsageMb(),
      purgedAudioAnalysisPackets: purgedTrackIds.length,
      purgedTrackIds,
    };
    logRenderDiagnostic(label, payload);
    console.debug(`[remote-audio-analysis] ${label} ${JSON.stringify(payload)}`);
  }

  function purgeRemoteAudioAnalysisPackets(retainTrackId: EntityId | null = null) {
    const packetsByTrack = remoteAudioAnalysisPacketsByTrackRef.current;
    if (packetsByTrack.size <= remoteAudioAnalysisMaxCachedPackets) return;

    const retainedTrackIds = getRemoteAudioAnalysisRetainedTrackIds(retainTrackId);
    const purgedTrackIds: EntityId[] = [];
    while (packetsByTrack.size > remoteAudioAnalysisMaxCachedPackets) {
      const purgeTrackId =
        [...packetsByTrack.keys()].find((trackId) => !retainedTrackIds.has(trackId)) ??
        packetsByTrack.keys().next().value;
      if (purgeTrackId == null) break;
      packetsByTrack.delete(purgeTrackId);
      purgedTrackIds.push(purgeTrackId);
    }

    if (purgedTrackIds.length === 0) return;
    logRemoteAudioAnalysisCacheDiagnostic("Remote audio analysis cache purged", purgedTrackIds);
  }

  function clearRemoteAudioAnalysisPacketCache() {
    const packetsByTrack = remoteAudioAnalysisPacketsByTrackRef.current;
    if (packetsByTrack.size === 0) return;

    const purgedTrackIds = [...packetsByTrack.keys()];
    packetsByTrack.clear();
    logRemoteAudioAnalysisCacheDiagnostic("Remote audio analysis cache cleared", purgedTrackIds);
  }

  const loadTrackAnalysis = useEffectEvent((track: Track) => {
    const clock = remotePlaybackClockRef.current;
    if (isBrowserBackendRuntime && clock && clock.trackId !== track.id) return;

    const duration = getTrackAnalysisRequestDuration(track);
    const cachedPacket = remoteAudioAnalysisPacketsByTrackRef.current.get(track.id);
    if (cachedPacket) {
      clearRemoteAudioAnalysisRetry();
      console.debug(
        `[remote-audio-analysis] memory cache hit trackId=${String(track.id)} frames=${cachedPacket.frames.length} duration=${duration.toFixed(2)}s`,
      );
      remoteAudioAnalysisPacketsByTrackRef.current.delete(track.id);
      remoteAudioAnalysisPacketsByTrackRef.current.set(track.id, cachedPacket);
      audioAnalysisPacketRef.current = rebaseAudioAnalysisPacketPlaybackTime(
        cachedPacket,
        isTauriRuntime
          ? playerBarRef.current?.getCurrentTime() ?? 0
          : estimateRemotePlaybackTime(remotePlaybackClockRef.current, performance.now()),
        performance.now(),
      );
      loadedRemoteAudioAnalysisTrackIdRef.current = track.id;
      purgeRemoteAudioAnalysisPackets(track.id);
      return;
    }

    if (remoteAudioAnalysisLoadStateRef.current?.trackId === track.id) return;

    console.debug(
      `[remote-audio-analysis] load start trackId=${String(track.id)} trackDuration=${track.durationSeconds ?? "unknown"}s requestDuration=${duration.toFixed(2)}s`,
    );
    const requestId = (remoteAudioAnalysisLoadStateRef.current?.requestId ?? 0) + 1;
    const chunkCount = Math.max(1, Math.ceil(duration / remoteAudioAnalysisChunkDurationSeconds));
    remoteAudioAnalysisLoadStateRef.current = { requestId, trackId: track.id };
    loadedRemoteAudioAnalysisTrackIdRef.current = null;

    void (async () => {
      let frames: RemoteAudioAnalysisFrameEntry[] = [];
      let frameIntervalMs = audioAnalysisSampleIntervalMs;

      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        if (
          remoteAudioAnalysisLoadStateRef.current?.requestId !== requestId ||
          (isBrowserBackendRuntime && remotePlaybackClockRef.current && remotePlaybackClockRef.current.trackId !== track.id)
        ) {
          return;
        }

        const from = chunkIndex * remoteAudioAnalysisChunkDurationSeconds;
        const chunkDuration = Math.min(remoteAudioAnalysisChunkDurationSeconds, duration - from);
        const segment = await getRemoteTrackAnalysisSegment(track.id, from, chunkDuration, duration);
        console.debug(
          `[remote-audio-analysis] segment trackId=${String(track.id)} chunk=${chunkIndex + 1}/${chunkCount} from=${from.toFixed(2)}s duration=${chunkDuration.toFixed(2)}s frames=${segment.frames.length} complete=${segment.isComplete}`,
        );
        if (
          segment.trackId !== track.id ||
          remoteAudioAnalysisLoadStateRef.current?.requestId !== requestId ||
          (isBrowserBackendRuntime && remotePlaybackClockRef.current && remotePlaybackClockRef.current.trackId !== track.id)
        ) {
          return;
        }

        frameIntervalMs = segment.frameIntervalMs;
        frames = mergeRemoteAudioAnalysisFrames(frames, segment.frames, audioAnalysisSampleIntervalMs);
        const partialPacket = makeAudioAnalysisPacketFromFrames(
          track.id,
          frames,
          frameIntervalMs,
          isTauriRuntime
            ? playerBarRef.current?.getCurrentTime() ?? 0
            : estimateRemotePlaybackTime(remotePlaybackClockRef.current, performance.now()),
          audioAnalysisSampleIntervalMs,
          performance.now(),
        );
      if (partialPacket) audioAnalysisPacketRef.current = partialPacket;

        if (segment.isComplete) break;
      }

      if (
        remoteAudioAnalysisLoadStateRef.current?.requestId !== requestId ||
        (isBrowserBackendRuntime && remotePlaybackClockRef.current && remotePlaybackClockRef.current.trackId !== track.id)
      ) {
        return;
      }

      const completePacket = makeAudioAnalysisPacketFromFrames(
        track.id,
        frames,
        frameIntervalMs,
        isTauriRuntime
          ? playerBarRef.current?.getCurrentTime() ?? 0
          : estimateRemotePlaybackTime(remotePlaybackClockRef.current, performance.now()),
        audioAnalysisSampleIntervalMs,
        performance.now(),
      );
      if (completePacket) {
        clearRemoteAudioAnalysisRetry();
        remoteAudioAnalysisPacketsByTrackRef.current.set(track.id, completePacket);
        purgeRemoteAudioAnalysisPackets(track.id);
        audioAnalysisPacketRef.current = completePacket;
        loadedRemoteAudioAnalysisTrackIdRef.current = track.id;
        console.debug(
          `[remote-audio-analysis] load complete trackId=${String(track.id)} frames=${completePacket.frames.length} memoryCacheSize=${remoteAudioAnalysisPacketsByTrackRef.current.size}`,
        );
      }
      remoteAudioAnalysisLoadStateRef.current = null;
    })().catch((error: unknown) => {
      console.debug(`[remote-audio-analysis] load failed trackId=${String(track.id)} error=${String(error)}`);
      if (remoteAudioAnalysisLoadStateRef.current?.requestId === requestId) {
        remoteAudioAnalysisLoadStateRef.current = null;
      }
      const clock = remotePlaybackClockRef.current;
      if (isBrowserBackendRuntime && clock?.isPlaying && clock.trackId === track.id) {
        const previousRetry = remoteAudioAnalysisRetryRef.current;
        const attempt = previousRetry?.trackId === track.id ? previousRetry.attempt + 1 : 1;
        const delay = remoteAudioAnalysisRetryDelaysMs[attempt - 1];
        if (delay !== undefined) {
          if (previousRetry?.timer != null) window.clearTimeout(previousRetry.timer);
          const timer = window.setTimeout(() => {
            const latestClock = remotePlaybackClockRef.current;
            remoteAudioAnalysisRetryRef.current = { attempt, timer: null, trackId: track.id };
            if (latestClock?.isPlaying && latestClock.trackId === track.id) {
              retryTrackAnalysisRef.current(track);
            }
          }, delay);
          remoteAudioAnalysisRetryRef.current = { attempt, timer, trackId: track.id };
        }
      }
      // Partial analysis is intentionally not cached unless every chunk completes.
    });
  });
  retryTrackAnalysisRef.current = loadTrackAnalysis;

  const warmTrackAnalysisCache = useEffectEvent((track: Track | null) => {
    if (!track || activeRemoteAudioAnalysisWarmupsRef.current.has(track.id)) return;

    const duration = getTrackAnalysisRequestDuration(track);
    activeRemoteAudioAnalysisWarmupsRef.current.add(track.id);
    console.debug(
      `[remote-audio-analysis] warmup start trackId=${String(track.id)} trackDuration=${track.durationSeconds ?? "unknown"}s requestDuration=${duration.toFixed(2)}s`,
    );
    void getRemoteTrackAnalysisSegment(track.id, 0, duration, duration)
      .catch((error: unknown) => {
        console.debug(`[remote-audio-analysis] warmup failed trackId=${String(track.id)} error=${String(error)}`);
        // Cache warmup is best-effort; playback and browser sync should keep running.
      })
      .finally(() => {
        console.debug(`[remote-audio-analysis] warmup finished trackId=${String(track.id)}`);
        activeRemoteAudioAnalysisWarmupsRef.current.delete(track.id);
      });
  });

  return {
    audioAnalysisPacketRef,
    clearAudioAnalysisPacket,
    clearRemoteAudioAnalysisPacketCache,
    loadTrackAnalysis,
    resetAudioAnalysisLoad,
    warmTrackAnalysisCache,
  };
}
