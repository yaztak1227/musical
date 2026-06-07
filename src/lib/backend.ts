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
  | "set-volume"
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
  receivedAtMs: number;
  sentAtMs: number | null;
  state: RemotePlayerState | null;
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
  const sentAtMs = Date.now();
  return localApiRequest<boolean>("/api/player_state", {
    body: JSON.stringify({ state }),
    headers: {
      "Content-Type": "application/json",
      "X-Musical-Client-Sent-At-Ms": String(sentAtMs),
    },
    method: "POST",
  });
}

export async function getRemotePlayerState() {
  const response = await fetch(`${isTauriRuntime ? localApiBaseUrl : ""}/api/player_state`);
  const receivedAtMs = Date.now();
  if (!response.ok) {
    throw await response.text();
  }

  const sentAtHeader = response.headers.get("X-Musical-State-Sent-At-Ms");
  const sentAtMs = sentAtHeader === null ? null : Number(sentAtHeader);
  return {
    receivedAtMs,
    sentAtMs: Number.isFinite(sentAtMs) ? sentAtMs : null,
    state: await response.json() as RemotePlayerState | null,
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
  return localApiRequest<{ commands: QueuedRemotePlayerCommand[] }>(
    `/api/player_commands?after=${encodeURIComponent(String(afterId))}`,
  );
}

export async function getRemoteTrackAnalysisSegment(
  trackId: EntityId,
  from: number,
  duration: number,
  totalDuration?: number,
) {
  const query = new URLSearchParams({
    duration: String(duration),
    from: String(from),
    trackId: String(trackId),
  });
  if (totalDuration !== undefined) query.set("totalDuration", String(totalDuration));
  return localApiRequest<RemoteAudioAnalysisSegment>(`/api/track_analysis?${query.toString()}`);
}

export async function getRemoteAudioAnalysisSegment(trackId: EntityId, from: number, duration: number) {
  return getRemoteTrackAnalysisSegment(trackId, from, duration);
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
