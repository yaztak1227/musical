import { invoke } from "@tauri-apps/api/core";

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
  albumId: number;
  updatedFiles: number;
  failedFiles: FailedTagWrite[];
};

export type TrackTagUpdateResult = {
  trackId: number;
  albumId: number;
};

export async function updateAlbumTags(albumId: number, draft: AlbumTagDraft) {
  return invoke<AlbumTagUpdateResult>("update_album_tags", {
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

export async function updateTrackTags(trackId: number, draft: TrackTagDraft) {
  return invoke<TrackTagUpdateResult>("update_track_tags", {
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
