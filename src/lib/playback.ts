import type { RepeatMode } from "@/types/app";
import type { Album, EntityId, Track } from "@/types/audio";

const playbackPreferencesKey = "musical.playbackPreferences";

export type PlaybackPreferences = {
  isShuffle: boolean;
  playbackAlbumId: EntityId | null;
  repeatMode: RepeatMode;
  selectedAlbumId: EntityId | null;
};

export type PlaybackResolutionState = {
  currentTrackIndex: number;
  isShuffle: boolean;
  playbackAlbumId: EntityId | null;
  queue: Track[];
  repeatMode: RepeatMode;
  selectedAlbumId: EntityId | null;
};

export function isRepeatMode(value: unknown): value is RepeatMode {
  return value === "off" || value === "all" || value === "one";
}

export function getStoredPlaybackPreferences(): PlaybackPreferences {
  const fallback: PlaybackPreferences = {
    isShuffle: false,
    playbackAlbumId: null,
    repeatMode: "off",
    selectedAlbumId: null,
  };

  try {
    const storedPreferences = window.localStorage.getItem(playbackPreferencesKey);
    if (!storedPreferences) return fallback;

    const parsedPreferences = JSON.parse(storedPreferences) as Partial<Record<keyof PlaybackPreferences, unknown>>;
    return {
      isShuffle: parsedPreferences.isShuffle === true,
      playbackAlbumId: parseStoredAlbumId(parsedPreferences.playbackAlbumId),
      repeatMode: isRepeatMode(parsedPreferences.repeatMode) ? parsedPreferences.repeatMode : "off",
      selectedAlbumId: parseStoredAlbumId(parsedPreferences.selectedAlbumId),
    };
  } catch {
    return fallback;
  }
}

export function storePlaybackPreferences(playbackPreferences: PlaybackPreferences) {
  window.localStorage.setItem(playbackPreferencesKey, JSON.stringify(playbackPreferences));
}

export function getInitialAlbumId(albums: Album[], storedAlbumId: EntityId | null) {
  return albums.some((album) => album.id === storedAlbumId) ? storedAlbumId : albums[0]?.id ?? null;
}

export function getInitialTrack(albums: Album[], albumId: EntityId | null) {
  return albums.find((album) => album.id === albumId)?.tracks[0] ?? albums[0]?.tracks[0] ?? null;
}

export function shuffleTracks(tracks: Track[]) {
  const shuffledTracks = [...tracks];
  for (let index = shuffledTracks.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledTracks[index], shuffledTracks[randomIndex]] = [shuffledTracks[randomIndex], shuffledTracks[index]];
  }
  return shuffledTracks;
}

export function getAlbumQueueTracks(album: Album, isShuffle: boolean, startTrack: Track | null = null) {
  if (!isShuffle) return album.tracks;

  if (!startTrack) return shuffleTracks(album.tracks);

  const shuffledRemainder = shuffleTracks(album.tracks.filter((track) => track.id !== startTrack.id));
  return [startTrack, ...shuffledRemainder];
}

export function getToggledQueueTracks(album: Album, isShuffle: boolean, currentTrack: Track | null) {
  if (!isShuffle) return album.tracks;
  return getAlbumQueueTracks(album, true, currentTrack);
}

export function getNextRepeatMode(repeatMode: RepeatMode): RepeatMode {
  if (repeatMode === "off") return "all";
  if (repeatMode === "all") return "one";
  return "off";
}

function parseStoredAlbumId(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
