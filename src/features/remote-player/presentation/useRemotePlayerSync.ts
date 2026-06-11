import type { RefObject } from "react";
import type { RemotePlaybackClock } from "@/features/remote-player/domain/remotePlaybackClock";

export type RemotePlayerSyncController = {
  remotePlaybackClockRef: RefObject<RemotePlaybackClock | null>;
};

export function useRemotePlayerSync(controller: RemotePlayerSyncController) {
  return controller;
}
