import { type Album } from "../types/audio";
import { type AlbumTagDraft } from "./tagEditing";

export function makeAlbumTagDraft(album: Album | null | undefined): AlbumTagDraft {
  return {
    album: album?.title ?? "",
    albumArtist: album?.artist ?? "",
    artist: album?.artist ?? "",
    year: album?.year ? String(album.year) : "",
    genre: album?.genre ?? "",
  };
}

export function isAlbumTagDraftChanged(draft: AlbumTagDraft, album: Album) {
  const normalizedDraft = normalizeAlbumTagDraft(draft);
  const normalizedAlbum = normalizeAlbumTagDraft(makeAlbumTagDraft(album));
  return (
    normalizedDraft.album !== normalizedAlbum.album ||
    normalizedDraft.albumArtist !== normalizedAlbum.albumArtist ||
    normalizedDraft.artist !== normalizedAlbum.artist ||
    normalizedDraft.year !== normalizedAlbum.year ||
    normalizedDraft.genre !== normalizedAlbum.genre
  );
}

export function normalizeAlbumTagDraft(draft: AlbumTagDraft) {
  return {
    album: draft.album.trim(),
    albumArtist: draft.albumArtist.trim(),
    artist: draft.artist.trim(),
    year: draft.year.trim(),
    genre: draft.genre.trim(),
  };
}

export function parseOptionalYear(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  const parsedValue = Number.parseInt(trimmedValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}