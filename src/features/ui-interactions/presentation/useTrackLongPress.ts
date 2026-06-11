import type { ComponentProps } from "react";
import type { SelectedAlbumPanel } from "@/components/SelectedAlbumPanel";

type SelectedAlbumPanelProps = ComponentProps<typeof SelectedAlbumPanel>;

export type TrackLongPressProps = Pick<
  SelectedAlbumPanelProps,
  "onFinishTrackLongPress" | "onMoveTrackLongPress" | "onStartTrackLongPress"
>;

export function useTrackLongPress(props: TrackLongPressProps) {
  return props;
}
