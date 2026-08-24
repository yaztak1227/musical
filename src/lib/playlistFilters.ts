import type { Playlist } from "@/types/audio";
import type { AlbumSortDirection, PlaylistSortMode } from "@/types/app";

function playlistContainsLyrics(playlist: Playlist) {
  return playlist.tracks.some((track) => track.hasLyrics || Boolean(track.lyrics?.trim()));
}

export function filterAndSortPlaylists(
  playlists: Playlist[],
  query: string,
  sortMode: PlaylistSortMode,
  sortDirection: AlbumSortDirection,
  lyricsOnly = false,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const direction = sortDirection === "asc" ? 1 : -1;

  return playlists
    .filter((playlist) => {
      if (lyricsOnly && !playlistContainsLyrics(playlist)) return false;
      if (!normalizedQuery) return true;

      const playlistText = [
        playlist.name,
        ...playlist.tracks.flatMap((track) => [track.title, track.artist, track.filePath ?? ""]),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return playlistText.includes(normalizedQuery);
    })
    .sort((left, right) => {
      const comparison = sortMode === "trackCount"
        ? left.trackCount - right.trackCount || left.name.localeCompare(right.name)
        : left.name.localeCompare(right.name);
      return comparison * direction;
    });
}
