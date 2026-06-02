import type { TranslationKey } from "@/i18n";
import type { Album, Track } from "@/types/audio";
import type { TrackTagDraft } from "./tagEditing";

export const trackTagFields = [
  { key: "title", labelKey: "tags.title" },
  { key: "artist", labelKey: "tags.artist" },
  { key: "album", labelKey: "tags.album" },
  { key: "year", labelKey: "tags.year" },
  { key: "genre", labelKey: "tags.genre" },
  { key: "trackNumber", labelKey: "tags.trackNumber" },
  { key: "discNumber", labelKey: "tags.discNumber" },
] satisfies { key: keyof TrackTagDraft; labelKey: TranslationKey }[];

export function makeTrackTagDraft(track: Track | null, album: Album | null): TrackTagDraft {
  return {
    title: track?.title ?? "",
    artist: track?.artist ?? "",
    album: album?.title ?? "",
    year: String(album?.year ?? ""),
    genre: album?.genre ?? "",
    trackNumber: String(track?.trackNumber ?? ""),
    discNumber: String(track?.discNumber ?? ""),
  };
}

export function isTrackTagDraftChanged(draft: TrackTagDraft, track: Track, album: Album | null) {
  const original = makeTrackTagDraft(track, album);
  return trackTagFields.some((field) => draft[field.key].trim() !== original[field.key].trim());
}
