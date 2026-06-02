import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const isMockDataRuntime = import.meta.env.VITE_MOCK_DATA === "true";

const localBrowserHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const localApiBaseUrl = "http://127.0.0.1:1422";

export const isLocalBrowserRuntime =
  typeof window !== "undefined" && !isTauriRuntime && localBrowserHosts.has(window.location.hostname);
export const isBrowserBackendRuntime = typeof window !== "undefined" && !isTauriRuntime && !isMockDataRuntime;

export const hasRealBackend = !isMockDataRuntime;

export type RemotePlayerState = {
  selectedAlbumId: number | null;
  playbackAlbumId: number | null;
  currentTrackId: number | null;
  isPlaying: boolean;
  isShuffle: boolean;
  repeatMode: string;
  currentTime: number;
  volume: number;
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
  return localApiRequest<boolean>("/api/player_state", {
    body: JSON.stringify({ state }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

export async function getRemotePlayerState() {
  return localApiRequest<RemotePlayerState | null>("/api/player_state");
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

export function getBackendMediaSrc(path: string) {
  if (isTauriRuntime) return convertFileSrc(path);
  return `/api/media?path=${encodeURIComponent(path)}`;
}

async function localApiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${isTauriRuntime ? localApiBaseUrl : ""}${path}`, init);
  if (!response.ok) {
    throw await response.text();
  }

  return response.json() as Promise<T>;
}
