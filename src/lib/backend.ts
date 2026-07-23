import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { localServerConfig } from "../config/appConfig";
import type { EntityId } from "../types/audio";

export const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const isMockDataRuntime = import.meta.env.VITE_MOCK_DATA === "true";

const localBrowserHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const localApiBaseUrl = `http://${localServerConfig.host}:${localServerConfig.port}`;

export const isLocalBrowserRuntime =
  typeof window !== "undefined" && !isTauriRuntime && localBrowserHosts.has(window.location.hostname);
export const isBrowserBackendRuntime = typeof window !== "undefined" && !isTauriRuntime && !isMockDataRuntime;

export const hasRealBackend = !isMockDataRuntime;

export type RemotePlayerState = {
  selectedAlbumId: EntityId | null;
  playbackAlbumId: EntityId | null;
  playbackPlaylistId: EntityId | null;
  currentTrackId: EntityId | null;
  queueTrackIds: EntityId[];
  isPlaying: boolean;
  isShuffle: boolean;
  repeatMode: string;
  currentTime: number;
  volume: number;
};

export type RemoteAudioAnalysisSegmentFrame = {
  timecode: number;
  trackId?: EntityId;
  values: number[];
};

export type RemoteAudioAnalysisSegment = {
  frameIntervalMs: number;
  frames: RemoteAudioAnalysisSegmentFrame[];
  isComplete?: boolean;
  trackId: EntityId;
};

export type RemotePlayerCommandType =
  | "cycle-repeat"
  | "next"
  | "pause"
  | "play"
  | "play-album"
  | "play-track"
  | "previous"
  | "refresh-library"
  | "seek"
  | "select-album"
  | "select-track"
  | "clear-queue"
  | "set-volume"
  | "set-queue"
  | "toggle-mute"
  | "toggle-playback"
  | "toggle-shuffle"
  | "volume-step";

export type QueuedRemotePlayerCommand = {
  id: number;
  commandType: RemotePlayerCommandType;
  payload?: Record<string, unknown> | null;
};

export type RemotePlayerStateResponse = {
  clientReceivedAtMs: number;
  clientRequestedAtMs: number;
  responseSentAtMs: number | null;
  state: RemotePlayerState | null;
  stateCapturedAtMs: number | null;
};

export async function backendInvoke<T>(command: string, payload?: Record<string, unknown>) {
  if (isTauriRuntime) {
    return invoke<T>(command, payload);
  }

  const response = await fetch(`/api/${command}`, {
    body: payload ? JSON.stringify(payload) : undefined,
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    method: payload ? "POST" : "GET",
  });

  if (!response.ok) {
    throw await response.text();
  }

  return response.json() as Promise<T>;
}

export async function publishRemotePlayerState(state: RemotePlayerState) {
  const stateCapturedAtMs = Date.now();
  return localApiRequest<boolean>("/api/player_state", {
    body: JSON.stringify({ state }),
    headers: {
      "Content-Type": "application/json",
      "X-Musical-State-Captured-At-Ms": String(stateCapturedAtMs),
    },
    method: "POST",
  });
}

export async function getRemotePlayerState() {
  const clientRequestedAtMs = performance.now();
  const response = await fetch(`${isTauriRuntime ? localApiBaseUrl : ""}/api/player_state`);
  const clientReceivedAtMs = performance.now();
  if (!response.ok) {
    throw await response.text();
  }

  const responseSentHeader = response.headers.get("X-Musical-Response-Sent-At-Ms");
  const stateCapturedHeader = response.headers.get("X-Musical-State-Captured-At-Ms");
  const responseSentAtMs = responseSentHeader === null ? null : Number(responseSentHeader);
  const stateCapturedAtMs = stateCapturedHeader === null ? null : Number(stateCapturedHeader);
  return {
    clientReceivedAtMs,
    clientRequestedAtMs,
    responseSentAtMs: Number.isFinite(responseSentAtMs) ? responseSentAtMs : null,
    state: await response.json() as RemotePlayerState | null,
    stateCapturedAtMs: Number.isFinite(stateCapturedAtMs) ? stateCapturedAtMs : null,
  } satisfies RemotePlayerStateResponse;
}

export async function sendRemotePlayerCommand(
  commandType: RemotePlayerCommandType,
  payload?: Record<string, unknown>,
) {
  return localApiRequest<QueuedRemotePlayerCommand>("/api/player_command", {
    body: JSON.stringify({ commandType, payload }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export async function getRemotePlayerCommands(afterId: number) {
  return localApiRequest<{
    commands: QueuedRemotePlayerCommand[];
    hasGap: boolean;
    latestId: number;
    oldestAvailableId: number | null;
  }>(
    `/api/player_commands?after=${encodeURIComponent(String(afterId))}`,
  );
}

export async function getRemoteTrackAnalysis(trackId: EntityId) {
  const query = new URLSearchParams({ trackId: String(trackId) });
  const queryText = query.toString();
  try {
    const response = await fetch(`${isTauriRuntime ? localApiBaseUrl : ""}/api/track_analysis_bytes?${queryText}`);
    if (!response.ok) throw await response.text();

    const bucketCount = Number(response.headers.get("X-Musical-Bucket-Count"));
    const frameCount = Number(response.headers.get("X-Musical-Frame-Count"));
    const frameIntervalMs = Number(response.headers.get("X-Musical-Frame-Interval-Ms"));
    const startTimeMs = Number(response.headers.get("X-Musical-Start-Time-Ms"));
    const responseTrackId = decodeURIComponent(response.headers.get("X-Musical-Track-Id") ?? String(trackId));
    const values = new Uint8Array(await response.arrayBuffer());
    if (
      !Number.isInteger(bucketCount)
      || bucketCount <= 0
      || !Number.isInteger(frameCount)
      || frameCount < 0
      || !Number.isFinite(frameIntervalMs)
      || !Number.isFinite(startTimeMs)
      || values.length !== bucketCount * frameCount
    ) {
      throw new Error("invalid audio analysis bytes");
    }

    return {
      frameIntervalMs,
      frames: Array.from({ length: frameCount }, (_, frameIndex) => {
        const offset = frameIndex * bucketCount;
        return {
          timecode: (startTimeMs + frameIndex * frameIntervalMs) / 1000,
          trackId: responseTrackId,
          values: Array.from(values.subarray(offset, offset + bucketCount)),
        };
      }),
      isComplete: response.headers.get("X-Musical-Is-Complete") === "true",
      trackId: responseTrackId,
    } satisfies RemoteAudioAnalysisSegment;
  } catch {
    return localApiRequest<RemoteAudioAnalysisSegment>(`/api/track_analysis?${queryText}`);
  }
}

export function getBackendMediaSrc(path: string) {
  if (isTauriRuntime) return convertFileSrc(path);
  return `/api/media?path=${encodeURIComponent(path)}`;
}

export async function localApiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${isTauriRuntime ? localApiBaseUrl : ""}${path}`, init);
  if (!response.ok) {
    throw await response.text();
  }

  return response.json() as Promise<T>;
}
