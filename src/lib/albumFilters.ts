import type { TranslationKey } from "@/i18n";
import type { Album } from "@/types/audio";
import type { AlbumSortDirection, AlbumSortMode } from "@/types/app";
import { AlbumCollection } from "@/models/AlbumModel";

type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function filterAndSortAlbums(
  albums: Album[],
  query: string,
  sortMode: AlbumSortMode,
  sortDirection: AlbumSortDirection,
  t: TFunction,
  lyricsOnly = false,
) {
  return new AlbumCollection(albums, t).filterAndSort(query, sortMode, sortDirection, lyricsOnly);
}
