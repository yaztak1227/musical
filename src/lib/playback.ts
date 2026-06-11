import type { Album, EntityId } from "@/types/audio";
import { type PlaybackPreferences } from "@/features/playback/domain/playbackPreferences";
import {
  getStoredPlaybackPreferences as getStoredPlaybackPreferencesFromStorage,
  storePlaybackPreferences as storePlaybackPreferencesToStorage,
} from "@/features/preferences/infrastructure/localStoragePreferencesRepository";
export {
  getAlbumQueueTracks,
  getToggledQueueTracks,
  shuffleTracks,
} from "@/features/playback/domain/playbackQueue";
export {
  getNextTrack,
  resolveEndedTrack,
  type EndedTrackResolution,
  type PlaybackResolutionState,
} from "@/features/playback/domain/playbackResolution";
export {
  getNextRepeatMode,
  isRepeatMode,
  type PlaybackPreferences,
} from "@/features/playback/domain/playbackPreferences";

export function getStoredPlaybackPreferences(): PlaybackPreferences {
  return getStoredPlaybackPreferencesFromStorage();
}

export function storePlaybackPreferences(playbackPreferences: PlaybackPreferences) {
  storePlaybackPreferencesToStorage(playbackPreferences);
}

export function getInitialAlbumId(albums: Album[], storedAlbumId: EntityId | null) {
  return albums.some((album) => album.id === storedAlbumId) ? storedAlbumId : albums[0]?.id ?? null;
}

export function getInitialTrack(albums: Album[], albumId: EntityId | null) {
  return albums.find((album) => album.id === albumId)?.tracks[0] ?? albums[0]?.tracks[0] ?? null;
}
