import { invoke } from "@tauri-apps/api/core";

export type AlbumTagDraft = {
  album: string;
  albumArtist: string;
  artist: string;
  year: string;
  genre: string;
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

function parseYear(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsedValue = Number.parseInt(trimmedValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}
