import type { ComponentProps } from "react";
import type { SelectedAlbumPanel } from "@/components/SelectedAlbumPanel";

type SelectedAlbumPanelProps = ComponentProps<typeof SelectedAlbumPanel>;

export type AlbumPanelGestureProps = Pick<
  SelectedAlbumPanelProps,
  | "onAlbumPanelPointerCancel"
  | "onAlbumPanelPointerDown"
  | "onAlbumPanelPointerMove"
  | "onAlbumPanelPointerUp"
  | "onAlbumPanelTouchCancel"
  | "onAlbumPanelTouchEnd"
  | "onAlbumPanelTouchMove"
  | "onAlbumPanelTouchStart"
  | "onAlbumPanelWheel"
>;

export function useAlbumPanelGesture(props: AlbumPanelGestureProps) {
  return props;
}
