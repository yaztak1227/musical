import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import type { TranslationKey } from "@/i18n";
import type { Album } from "@/types/audio";
import type { AlbumViewMode } from "@/types/app";
import { getArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";
import { prepareMarquee } from "@/lib/marqueeUtils";

type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

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

export function AlbumCard({ album, isActive, isTauriRuntime, variant, t, onPlay, onSelect }: AlbumCardProps) {
  const albumTitle = localizeLibraryText(album.title, t);
  const albumArtist = localizeLibraryText(album.artist, t);
  const albumYear = album.yearLabel ?? album.year;
  const artworkSrc = getArtworkSrc(album, isTauriRuntime);

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
