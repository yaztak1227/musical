import { memo, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play } from "lucide-react";
import type { TranslationKey } from "@/i18n";
import type { Album } from "@/types/audio";
import type { AlbumViewMode } from "@/types/app";
import { getArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";
import { prepareMarquee } from "@/lib/marqueeUtils";
import { isRenderDiagnosticsEnabled, logRenderDiagnostic } from "@/lib/renderDiagnostics";

type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

const albumCardRenderBatch = {
  count: 0,
  examples: [] as string[],
  timeoutId: 0,
};

function logAlbumCardCommit(album: Album, isActive: boolean) {
  if (!isRenderDiagnosticsEnabled()) return;

  albumCardRenderBatch.count += 1;

  if (albumCardRenderBatch.examples.length < 8) {
    albumCardRenderBatch.examples.push(`${album.id}:${album.title}${isActive ? ":active" : ""}`);
  }

  if (albumCardRenderBatch.timeoutId) return;

  albumCardRenderBatch.timeoutId = window.setTimeout(() => {
    logRenderDiagnostic("AlbumCard commits batch", {
      count: albumCardRenderBatch.count,
      examples: albumCardRenderBatch.examples,
    });
    albumCardRenderBatch.count = 0;
    albumCardRenderBatch.examples = [];
    albumCardRenderBatch.timeoutId = 0;
  }, 0);
}

type AlbumCardVariant = {
  showArtwork: boolean;
};

export class AlbumCardFactory {
  static create(viewMode: AlbumViewMode): AlbumCardVariant {
    return {
      showArtwork: viewMode !== "list",
    };
  }
}

type AlbumCardProps = {
  album: Album;
  isActive: boolean;
  isPlaying: boolean;
  isTauriRuntime: boolean;
  scrollIndexLabel: string;
  variant: AlbumCardVariant;
  t: TFunction;
  onPause: () => void;
  onPlay: (album: Album, options?: { selectAlbum?: boolean }) => void;
  onSelect: (album: Album) => void;
};

function AlbumCardComponent({
  album,
  isActive,
  isPlaying,
  isTauriRuntime,
  scrollIndexLabel,
  variant,
  t,
  onPause,
  onPlay,
  onSelect,
}: AlbumCardProps) {
  const albumTitle = localizeLibraryText(album.title, t);
  const albumArtist = localizeLibraryText(album.artist, t);
  const albumYear = album.yearLabel ?? album.year;
  const hoverActionLabel = isPlaying ? t("player.pause") : t("album.playSelected");
  const artworkSrc = useMemo(
    () => getArtworkSrc(album),
    [album.artworkPath, album.coverUrl, isTauriRuntime],
  );

  useEffect(() => {
    logAlbumCardCommit(album, isActive);
  });

  return (
    <Button
      className={[isActive ? "album-card active" : "album-card", isPlaying ? "playing-album" : ""].filter(Boolean).join(" ")}
      data-album-id={album.id}
      data-scroll-index-id={`album-${album.id}`}
      data-scroll-index-label={scrollIndexLabel}
      onFocus={prepareMarquee}
      onMouseEnter={prepareMarquee}
      onClick={() => onSelect(album)}
      variant="outline"
      type="button"
    >
      {variant.showArtwork ? (
        <span className="album-cover-wrap">
          {artworkSrc ? (
            <img alt={t("album.coverAlt", { album: albumTitle })} src={artworkSrc} />
          ) : (
            <span className="album-placeholder" aria-hidden="true">
              {albumTitle.charAt(0).toUpperCase()}
            </span>
          )}
          <span
            aria-label={hoverActionLabel}
            className="album-hover-play musical-ripple-button"
            onClick={(event) => {
              event.stopPropagation();
              if (isPlaying) {
                onPause();
              } else {
                onPlay(album, { selectAlbum: false });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                if (isPlaying) {
                  onPause();
                } else {
                  onPlay(album, { selectAlbum: false });
                }
              }
            }}
            role="button"
            tabIndex={0}
            title={hoverActionLabel}
          >
            {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </span>
        </span>
      ) : null}
      <span className="album-card-title marquee-wrap">
        <span className="marquee-text">{albumTitle}</span>
      </span>
      <small className="album-card-meta">
        {albumArtist}
        {albumYear ? ` / ${albumYear}` : ""}
      </small>
    </Button>
  );
}

export const AlbumCard = memo(AlbumCardComponent);
