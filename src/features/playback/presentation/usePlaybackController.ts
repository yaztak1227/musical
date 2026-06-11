import type { ComponentProps } from "react";
import type { PlayerBar } from "@/components/PlayerBar";

type PlayerBarProps = ComponentProps<typeof PlayerBar>;

export type PlaybackControllerInput = {
  playerBarProps: PlayerBarProps;
};

export function usePlaybackController(input: PlaybackControllerInput) {
  return input;
}
