import type { TranslationKey } from "@/i18n";
import type { Album } from "@/types/audio";
import type { AlbumSortDirection, AlbumSortMode } from "@/types/app";
import { localizeLibraryText } from "@/lib/libraryUtils";

type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

export class AlbumModel {
  constructor(
    readonly album: Album,
    private readonly t: TFunction,
  ) {}

  get id() {
    return this.album.id;
  }

  get localizedTitle() {
    return localizeLibraryText(this.album.title, this.t);
  }

  get localizedArtist() {
    return localizeLibraryText(this.album.artist, this.t);
  }

  get searchableText() {
    return [
      this.album.title,
      this.album.artist,
      this.localizedTitle,
      this.localizedArtist,
      this.album.yearLabel ?? "",
      String(this.album.year ?? ""),
    ]
      .join(" ")
      .toLowerCase();
  }

  get hasLyrics() {
    return this.album.tracks.some((track) => track.hasLyrics || Boolean(track.lyrics?.trim()));
  }

  matches(query: string) {
    const normalizedQuery = query.trim().toLowerCase();
    return !normalizedQuery || this.searchableText.includes(normalizedQuery);
  }

  compareTo(other: AlbumModel, sortMode: AlbumSortMode, sortDirection: AlbumSortDirection) {
    const titleCompare = this.localizedTitle.localeCompare(other.localizedTitle, undefined, {
      sensitivity: "base",
      numeric: true,
    });
    const artistCompare = this.localizedArtist.localeCompare(other.localizedArtist, undefined, {
      sensitivity: "base",
      numeric: true,
    });

    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    if (sortMode === "artist") return (artistCompare || titleCompare) * directionMultiplier;

    if (sortMode === "year") {
      const unknownYear = sortDirection === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
      const firstYear = this.album.year ?? unknownYear;
      const secondYear = other.album.year ?? unknownYear;
      const yearCompare = sortDirection === "desc" ? secondYear - firstYear : firstYear - secondYear;
      return yearCompare || titleCompare;
    }

    return (titleCompare || artistCompare) * directionMultiplier;
  }
}

export class AlbumCollection {
  private readonly models: AlbumModel[];

  constructor(albums: Album[], t: TFunction) {
    this.models = albums.map((album) => new AlbumModel(album, t));
  }

  filterAndSort(query: string, sortMode: AlbumSortMode, sortDirection: AlbumSortDirection, lyricsOnly = false) {
    return this.models
      .filter((album) => album.matches(query))
      .filter((album) => !lyricsOnly || album.hasLyrics)
      .sort((firstAlbum, secondAlbum) => firstAlbum.compareTo(secondAlbum, sortMode, sortDirection))
      .map((album) => album.album);
  }
}
