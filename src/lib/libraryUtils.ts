import { convertFileSrc } from "@tauri-apps/api/core";
import { type Album, type Track } from "../types/audio";
import { type AlbumSortDirection, type AlbumSortMode, type I18nMessage } from "../types/app";
import { type TranslationKey } from "../i18n";

type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function localizeLibraryText(value: string, t: TFunction) {
  if (value === "Unknown Track") return t("data.unknownTrack");
  if (value === "Unknown Album") return t("data.unknownAlbum");
  if (value === "Unknown Artist") return t("data.unknownArtist");
  if (value === "Other Album") return t("data.otherAlbum");
  if (value === "Various Artists") return t("data.variousArtists");
  return value;
}

export function getArtworkSrc(album: Album, isTauriRuntime: boolean) {
  if (album.coverUrl) return album.coverUrl;
  if (!album.artworkPath) return "";
  return isTauriRuntime ? convertFileSrc(album.artworkPath) : album.artworkPath;
}

export function getAlbumStartTrack(album: Album, isShuffle: boolean) {
  if (album.tracks.length === 0) return null;
  if (!isShuffle || album.tracks.length === 1) return album.tracks[0];
  return album.tracks[Math.floor(Math.random() * album.tracks.length)] ?? album.tracks[0];
}

export function compareAlbums(
  firstAlbum: Album,
  secondAlbum: Album,
  sortMode: AlbumSortMode,
  sortDirection: AlbumSortDirection,
  t: TFunction,
) {
  const titleCompare = localizeLibraryText(firstAlbum.title, t).localeCompare(localizeLibraryText(secondAlbum.title, t), undefined, {
    sensitivity: "base",
    numeric: true,
  });
  const artistCompare = localizeLibraryText(firstAlbum.artist, t).localeCompare(
    localizeLibraryText(secondAlbum.artist, t),
    undefined,
    {
      sensitivity: "base",
      numeric: true,
    },
  );

  const directionMultiplier = sortDirection === "asc" ? 1 : -1;

  if (sortMode === "artist") return (artistCompare || titleCompare) * directionMultiplier;

  if (sortMode === "year") {
    const unknownYear = sortDirection === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    const firstYear = firstAlbum.year ?? unknownYear;
    const secondYear = secondAlbum.year ?? unknownYear;
    const yearCompare = sortDirection === "desc" ? secondYear - firstYear : firstYear - secondYear;
    return yearCompare || titleCompare;
  }

  return (titleCompare || artistCompare) * directionMultiplier;
}

export function getAlbumJumpTarget(albums: Album[], letter: string, t: TFunction) {
  const targetLetter = letter.toUpperCase();
  const albumKeys = albums
    .map((album) => ({
      album,
      key: getAlbumJumpKey(localizeLibraryText(album.title, t)),
    }))
    .filter((item) => item.key);

  if (albumKeys.length === 0) return null;

  const exactMatch = albumKeys
    .filter((item) => item.key.startsWith(targetLetter))
    .sort((left, right) => left.key.localeCompare(right.key, undefined, { sensitivity: "base", numeric: true }))[0];
  if (exactMatch) return exactMatch.album;

  const sortedAlbums = albumKeys.sort((left, right) =>
    left.key.localeCompare(right.key, undefined, { sensitivity: "base", numeric: true }),
  );
  return sortedAlbums.find((item) => item.key > targetLetter)?.album ?? sortedAlbums[sortedAlbums.length - 1]?.album ?? null;
}

export function getAlbumJumpKey(title: string) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/^[^a-zA-Z0-9]+/, "")
    .toUpperCase();
}

export function getAudioErrorMessage(audio: HTMLAudioElement, track: Track | null) {
  const codeMessages: Record<number, string> = {
    1: "aborted",
    2: "network or asset protocol error",
    3: "decode error",
    4: "unsupported source or codec",
  };
  const code = audio.error?.code ?? 0;
  const source = audio.currentSrc || audio.src || track?.filePath || "no source";
  return `${codeMessages[code] ?? "unknown audio error"} / ${source}`;
}

export function toI18nError(error: unknown): I18nMessage {
  const message = String(error);
  const [key, folderPath, reason] = message.split("\t");

  if (key === "library.error.folderOpen") {
    return { key: "status.folderOpenError", values: { folderPath, reason } };
  }

  if (key === "library.error.notFolder") {
    return { key: "status.notFolderError", values: { folderPath } };
  }

  if (key === "library.error.albumNotFound") {
    return { key: "status.albumNotFound", values: { albumId: folderPath } };
  }

  if (key === "library.error.albumHasNoTracks") {
    return { key: "status.albumHasNoTracks", values: { albumId: folderPath } };
  }

  if (key === "library.error.trackNotFound") {
    return { key: "status.trackNotFound", values: { trackId: folderPath } };
  }

  if (key === "library.error.emptyTrackTitle") {
    return { key: "status.emptyTrackTitle" };
  }

  if (key === "library.error.emptyAlbumTitle") {
    return { key: "status.emptyAlbumTitle" };
  }

  if (key === "library.error.emptyArtworkPath") {
    return { key: "status.emptyArtworkPath" };
  }

  if (key === "library.error.unsupportedArtwork") {
    return { key: "status.unsupportedArtwork" };
  }

  return { key: "status.error", values: { message } };
}
