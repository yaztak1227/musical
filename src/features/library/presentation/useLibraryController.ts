import type { ComponentProps } from "react";
import type { AlbumBrowser } from "@/components/AlbumBrowser";
import type { LibrarySettingsDialog } from "@/components/LibrarySettingsDialog";
import type { LibrarySidebar } from "@/components/LibrarySidebar";

type AlbumBrowserProps = ComponentProps<typeof AlbumBrowser>;
type LibrarySettingsDialogProps = ComponentProps<typeof LibrarySettingsDialog>;
type LibrarySidebarProps = ComponentProps<typeof LibrarySidebar>;

export type LibraryControllerInput = {
  albumBrowserProps: AlbumBrowserProps;
  librarySettingsDialogProps: LibrarySettingsDialogProps | null;
  librarySidebarProps: LibrarySidebarProps;
};

export function useLibraryController(input: LibraryControllerInput) {
  return input;
}
