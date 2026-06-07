import { backendInvoke } from "./backend";
import type { EntityId } from "../types/audio";

export type AlbumTagDraft = {
  album: string;
  albumArtist: string;
  artist: string;
  year: string;
  genre: string;
};

export type TrackTagDraft = {
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  trackNumber: string;
  discNumber: string;
};

export type FailedTagWrite = {
  filePath: string;
  reason: string;
};

export type AlbumTagUpdateResult = {
  albumId: EntityId;
  updatedFiles: number;
  failedFiles: FailedTagWrite[];
};

export type TrackTagUpdateResult = {
  trackId: EntityId;
  albumId: EntityId;
};

export type TrackArtworkUpdateResult = {
  trackId: EntityId;
  albumId: EntityId;
  artworkPath: string;
};

export type TrackUserStateUpdateResult = {
  trackId: EntityId;
  isFavorite: boolean;
  rating: number | null;
};

export async function updateAlbumTags(albumId: EntityId, draft: AlbumTagDraft) {
  return backendInvoke<AlbumTagUpdateResult>("update_album_tags", {
    request: {
      albumId,
      albumTitle: draft.album.trim(),
      albumArtist: draft.albumArtist.trim(),
      artist: draft.artist.trim(),
      year: parseYear(draft.year),
      genre: draft.genre.trim(),
    },
  });
}

export async function updateTrackTags(trackId: EntityId, draft: TrackTagDraft) {
  return backendInvoke<TrackTagUpdateResult>("update_track_tags", {
    request: {
      trackId,
      title: draft.title.trim(),
      artist: draft.artist.trim(),
      albumTitle: draft.album.trim(),
      year: parseYear(draft.year),
      genre: draft.genre.trim(),
      trackNumber: parsePositiveInteger(draft.trackNumber),
      discNumber: parsePositiveInteger(draft.discNumber),
    },
  });
}

export async function updateTrackArtwork(trackId: EntityId, artworkPath: string) {
  return backendInvoke<TrackArtworkUpdateResult>("update_track_artwork", {
    request: {
      trackId,
      artworkPath: artworkPath.trim(),
    },
  });
}

export async function updateTrackUserState(trackId: EntityId, isFavorite: boolean, rating: number | null) {
  return backendInvoke<TrackUserStateUpdateResult>("update_track_user_state", {
    request: {
      trackId,
      isFavorite,
      rating,
    },
  });
}

function parseYear(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsedValue = Number.parseInt(trimmedValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function parsePositiveInteger(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsedValue = Number.parseInt(trimmedValue, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}
