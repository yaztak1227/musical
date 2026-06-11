import { localizeLibraryText } from "@/lib/libraryUtils";
import type { Album, Track } from "@/types/audio";
import type { TranslationKey } from "@/i18n";

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function updateMediaSessionMetadata(options: {
  currentTrack: Track | null;
  isPlaying: boolean;
  playbackAlbum: Album | null;
  t: Translate;
}) {
  if (!("mediaSession" in navigator)) return;

  const { currentTrack, isPlaying, playbackAlbum, t } = options;
  navigator.mediaSession.playbackState = currentTrack ? (isPlaying ? "playing" : "paused") : "none";
  navigator.mediaSession.metadata = currentTrack && typeof MediaMetadata !== "undefined"
    ? new MediaMetadata({
        album: playbackAlbum ? localizeLibraryText(playbackAlbum.title, t) : undefined,
        artist: localizeLibraryText(currentTrack.artist, t),
        title: localizeLibraryText(currentTrack.title, t),
      })
    : null;
}
