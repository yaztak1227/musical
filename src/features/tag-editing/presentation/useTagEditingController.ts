import type { ComponentProps } from "react";
import type { SelectedAlbumPanel } from "@/components/SelectedAlbumPanel";
import type { TrackDetailDialog } from "@/components/TrackDetailDialog";

type SelectedAlbumPanelProps = ComponentProps<typeof SelectedAlbumPanel>;
type TrackDetailDialogProps = ComponentProps<typeof TrackDetailDialog>;

export type TagEditingControllerInput = {
  selectedAlbumPanelProps: SelectedAlbumPanelProps;
  trackDetailDialogProps: TrackDetailDialogProps | null;
};

export function useTagEditingController(input: TagEditingControllerInput) {
  return input;
}
