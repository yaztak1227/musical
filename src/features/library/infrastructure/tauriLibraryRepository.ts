import { backendInvoke } from "@/lib/backend";
import type { EntityId, LibrarySnapshot, ScanSummary } from "@/types/audio";

export function loadLibrarySnapshot() {
  return backendInvoke<LibrarySnapshot>("library_snapshot");
}

export function scanMusicFolder(folderPath: string) {
  return backendInvoke<ScanSummary>("scan_music_folder", { folderPath });
}

export function loadTrackLyrics(trackId: string | number) {
  return backendInvoke<string | null>("track_lyrics", { trackId });
}

export function createPlaylist(name: string) {
  return backendInvoke<LibrarySnapshot>("create_playlist", { name });
}

export function addTrackToPlaylist(playlistId: string | number, trackId: string | number) {
  return backendInvoke<LibrarySnapshot>("add_track_to_playlist", { playlistId, trackId });
}

export function addTracksToPlaylist(playlistId: EntityId, trackIds: EntityId[]) {
  return backendInvoke<LibrarySnapshot>("add_tracks_to_playlist", { playlistId, trackIds });
}

export function renamePlaylist(playlistId: EntityId, name: string) {
  return backendInvoke<LibrarySnapshot>("rename_playlist", { playlistId, name });
}

export function deletePlaylist(playlistId: EntityId) {
  return backendInvoke<LibrarySnapshot>("delete_playlist", { playlistId });
}

export function removePlaylistTrack(playlistId: EntityId, trackIndex: number) {
  return backendInvoke<LibrarySnapshot>("remove_playlist_track", { playlistId, trackIndex });
}

export function reorderPlaylistTrack(playlistId: EntityId, fromIndex: number, toIndex: number) {
  return backendInvoke<LibrarySnapshot>("reorder_playlist_track", { playlistId, fromIndex, toIndex });
}

export function updatePlaylistArtwork(playlistId: string | number, artworkPath: string) {
  return backendInvoke<{ playlistId: string | number; artworkPath: string }>("update_playlist_artwork", {
    request: {
      playlistId,
      artworkPath: artworkPath.trim(),
    },
  });
}

export function createPlaylistFromAlbum(albumId: string | number, name: string) {
  return backendInvoke<LibrarySnapshot>("create_playlist_from_album", { albumId, name });
}
