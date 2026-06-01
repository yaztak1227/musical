import { memo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import type { TranslationKey } from "@/i18n";
import type { Album } from "@/types/audio";
import type { AlbumViewMode } from "@/types/app";
import { getArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";
import { prepareMarquee } from "@/lib/marqueeUtils";

type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

const albumCardRenderBatch = {
  count: 0,
  examples: [] as string[],
  timeoutId: 0,
};

function logRenderDiagnostic(label: string, payload: Record<string, unknown>) {
  const message = `[render-diagnostics] ${label} ${JSON.stringify(payload)}`;
  const windowWithDiagnostics = window as Window & { __renderDiagnostics?: string[] };
  windowWithDiagnostics.__renderDiagnostics = [...(windowWithDiagnostics.__renderDiagnostics ?? []), message].slice(-300);
  document.documentElement.dataset.renderDiagnostics = JSON.stringify(windowWithDiagnostics.__renderDiagnostics);
  console.debug(message);
}

function logAlbumCardCommit(album: Album, isActive: boolean) {
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
  isTauriRuntime: boolean;
  variant: AlbumCardVariant;
  t: TFunction;
  onPlay: (album: Album) => void;
  onSelect: (album: Album) => void;
};

function AlbumCardComponent({ album, isActive, isTauriRuntime, variant, t, onPlay, onSelect }: AlbumCardProps) {
  const albumTitle = localizeLibraryText(album.title, t);
  const albumArtist = localizeLibraryText(album.artist, t);
  const albumYear = album.yearLabel ?? album.year;
  const artworkSrc = getArtworkSrc(album, isTauriRuntime);

  useEffect(() => {
    logAlbumCardCommit(album, isActive);
  });

  return (
    <Button
      className={isActive ? "album-card active" : "album-card"}
      data-album-id={album.id}
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
            aria-label={t("album.playSelected")}
            className="album-hover-play"
            onClick={(event) => {
              event.stopPropagation();
              onPlay(album);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onPlay(album);
              }
            }}
            role="button"
            tabIndex={0}
            title={t("album.playSelected")}
          >
            <Play aria-hidden="true" />
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
