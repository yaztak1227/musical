import { backendInvoke } from "@/lib/backend";
import type { LibrarySnapshot, ScanSummary } from "@/types/audio";

export function loadLibrarySnapshot() {
  return backendInvoke<LibrarySnapshot>("library_snapshot");
}

export function scanMusicFolder(folderPath: string) {
  return backendInvoke<ScanSummary>("scan_music_folder", { folderPath });
}

export function loadTrackLyrics(trackId: string | number) {
  return backendInvoke<string | null>("track_lyrics", { trackId });
}
