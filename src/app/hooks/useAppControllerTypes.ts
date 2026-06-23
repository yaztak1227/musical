import type { EntityId } from "../../types/audio";

export type AlbumPanelDragStart = {
  hasDragged: boolean;
  isCollapsed: boolean;
  pointerY: number;
  scrollTop: number;
};

export type TrackLongPressState = {
  pointerX: number;
  pointerY: number;
  timerId: number;
  trackId: EntityId;
};

export type SuppressedTrackClick = {
  timerId: number;
  trackId: EntityId;
};

export type RemotePlayerStateSnapshot = {
  currentTime: number;
  isPlaying: boolean;
  trackId: EntityId | null;
};

export type RemoteAudioAnalysisLoadState = {
  requestId: number;
  trackId: EntityId;
};

export type BackgroundAnalysisStatusPayload = {
  status: "started" | "completed";
  total: number;
  completed: number;
  failed: number;
};

export type LibraryScanProgressPayload = {
  status: "discovering" | "reading" | "writing" | "completed";
  libraryPath: string;
  processed: number;
  total: number;
  imported: number;
  skipped: number;
};

export type LibraryLoadProgressPayload = {
  status: "opening" | "albums" | "assets" | "completed";
  processed: number;
  total: number;
  tracks: number;
};

