import type { RefObject } from "react";
import type { RemoteAudioAnalysisPacket } from "@/features/remote-player/domain/audioAnalysisPacket";

export type RemoteAudioAnalysisController = {
  audioAnalysisPacketRef: RefObject<RemoteAudioAnalysisPacket | null>;
};

export function useRemoteAudioAnalysis(controller: RemoteAudioAnalysisController) {
  return controller;
}
