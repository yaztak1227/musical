import type { ComponentProps } from "react";
import type { PlayerBar } from "@/components/PlayerBar";

type PlayerBarProps = Omit<ComponentProps<typeof PlayerBar>, "onOpenVisualizer">;

export type PlaybackControllerInput = {
  playerBarProps: PlayerBarProps;
};

export function usePlaybackController(input: PlaybackControllerInput) {
  return input;
}
