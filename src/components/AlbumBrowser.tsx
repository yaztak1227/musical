import { memo, type RefObject, useEffect, useMemo, useRef } from "react";
import { ArrowDownAZ, ArrowUpAZ, ListMusic, Maximize2, Minimize2, Play, ScrollText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import type { TranslationKey } from "@/i18n";
import type { Album, Track } from "@/types/audio";
import type { AlbumListMode, AlbumSortDirection, AlbumSortMode, AlbumViewMode } from "@/types/app";
import { AlbumCard, AlbumCardFactory } from "@/components/AlbumCard";
import { formatTrackDuration } from "@/lib/formatUtils";
import { localizeLibraryText } from "@/lib/libraryUtils";
import { prepareMarquee } from "@/lib/marqueeUtils";

type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

function logRenderDiagnostic(label: string, payload: Record<string, unknown>) {
  const message = `[render-diagnostics] ${label} ${JSON.stringify(payload)}`;
  const windowWithDiagnostics = window as Window & { __renderDiagnostics?: string[] };
  windowWithDiagnostics.__renderDiagnostics = [...(windowWithDiagnostics.__renderDiagnostics ?? []), message].slice(-300);
  document.documentElement.dataset.renderDiagnostics = JSON.stringify(windowWithDiagnostics.__renderDiagnostics);
  console.debug(message);
}

type AlbumBrowserProps = {
  albums: Album[];
  albumListMode: AlbumListMode;
  albumSortDirection: AlbumSortDirection;
  albumSortMode: AlbumSortMode;
  albumViewMode: AlbumViewMode;
  isTauriRuntime: boolean;
  panelRef: RefObject<HTMLElement | null>;
  lyricsOnly: boolean;
  query: string;
  selectedAlbumId: number | null;
  t: TFunction;
  onPlayAlbum: (album: Album) => void;
  onQueryChange: (query: string) => void;
  onLyricsOnlyChange: (lyricsOnly: boolean) => void;
  onListModeChange: (listMode: AlbumListMode) => void;
  onOpenTrackLyrics: (track: Track) => void;
  onSelectAlbum: (album: Album) => void;
  onPlayTrack: (track: Track, albumId: number) => void;
  onSortDirectionChange: (sortDirection: AlbumSortDirection) => void;
  onSortModeChange: (sortMode: AlbumSortMode) => void;
  onViewModeChange: (viewMode: AlbumViewMode) => void;
};

function AlbumBrowserComponent({
  albums,
  albumListMode,
  albumSortDirection,
  albumSortMode,
  albumViewMode,
  isTauriRuntime,
  panelRef,
  lyricsOnly,
  query,
  selectedAlbumId,
  t,
  onPlayAlbum,
  onQueryChange,
  onLyricsOnlyChange,
  onListModeChange,
  onOpenTrackLyrics,
  onSelectAlbum,
  onPlayTrack,
  onSortDirectionChange,
  onSortModeChange,
  onViewModeChange,
}: AlbumBrowserProps) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const albumCardVariant = useMemo(() => AlbumCardFactory.create(albumViewMode), [albumViewMode]);
  const trackRows = useMemo(
    () =>
      albums.flatMap((album) =>
        album.tracks
          .filter((track) => !lyricsOnly || track.hasLyrics || Boolean(track.lyrics?.trim()))
          .map((track) => ({ album, track })),
      ),
    [albums, lyricsOnly],
  );
  const nextSortDirection = albumSortDirection === "asc" ? "desc" : "asc";
  const sortDirectionLabel =
    albumSortDirection === "asc" ? t("sort.ascending") : t("sort.descending");

  useEffect(() => {
    logRenderDiagnostic("AlbumBrowser committed", {
      albumListMode,
      albums: albums.length,
      albumViewMode,
      lyricsOnly,
      query,
      render: renderCountRef.current,
      selectedAlbumId,
    });
  });

  return (
    <section className="albums-panel" aria-label={t("library.albumListLabel")} ref={panelRef}>
      <div className="albums-panel-header">
        <div className="albums-title">
          <Badge variant="secondary">{t("albums.count", { count: albums.length })}</Badge>
        </div>
        <div className="album-toolbar">
          <div className="album-sort-field" aria-label={t("sort.label")}>
            <div className="album-sort-control">
              <Button
                aria-label={t("sort.toggleDirection", { direction: sortDirectionLabel })}
                className="sort-direction-button"
                onClick={() => onSortDirectionChange(nextSortDirection)}
                title={t("sort.toggleDirection", { direction: sortDirectionLabel })}
                type="button"
                variant="outline"
              >
                {albumSortDirection === "asc" ? <ArrowUpAZ aria-hidden="true" /> : <ArrowDownAZ aria-hidden="true" />}
              </Button>
              <Select value={albumSortMode} onValueChange={(value) => onSortModeChange(value as AlbumSortMode)}>
                <SelectTrigger aria-label={t("sort.label")} className="album-sort-trigger" title={t("sort.label")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="title">{t("sort.title")}</SelectItem>
                  <SelectItem value="artist">{t("sort.artist")}</SelectItem>
                  <SelectItem value="year">{t("sort.year")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="album-search-field">
            <span className="sr-only">{t("search.label")}</span>
            <div className="search-input-wrap">
              <Search aria-hidden="true" />
              <Input
                value={query}
                onChange={(event) => onQueryChange(event.currentTarget.value)}
                placeholder={t("search.placeholder")}
                type="search"
              />
            </div>
          </label>
          <Toggle
            aria-label={t("search.lyricsFilter")}
            className="lyrics-filter-toggle"
            onPressedChange={onLyricsOnlyChange}
            pressed={lyricsOnly}
            title={t("search.lyricsFilter")}
          >
            <ScrollText />
          </Toggle>
          {albumViewMode === "list" ? (
            <Tabs value={albumListMode} onValueChange={(value) => onListModeChange(value as AlbumListMode)}>
              <TabsList className="list-mode-buttons">
                <TabsTrigger value="album">{t("listMode.albums")}</TabsTrigger>
                <TabsTrigger value="track">{t("listMode.tracks")}</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          <div className="view-mode-field" aria-label={t("view.label")}>
            <span className="sr-only">{t("view.label")}</span>
            <Tabs value={albumViewMode} onValueChange={(value) => onViewModeChange(value as AlbumViewMode)}>
              <TabsList className="view-mode-buttons">
                <TabsTrigger value="large" aria-label={t("view.largeIcons")} title={t("view.largeIcons")}>
                  <Maximize2 />
                  <span className="sr-only">{t("view.largeIcons")}</span>
                </TabsTrigger>
                <TabsTrigger value="small" aria-label={t("view.smallIcons")} title={t("view.smallIcons")}>
                  <Minimize2 />
                  <span className="sr-only">{t("view.smallIcons")}</span>
                </TabsTrigger>
                <TabsTrigger value="list" aria-label={t("view.list")} title={t("view.list")}>
                  <ListMusic />
                  <span className="sr-only">{t("view.list")}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      <div className="albums-panel-main">
        {albumViewMode === "list" ? (
          albums.length === 0 ? (
            <div className="empty-state">{t("library.emptySearch")}</div>
          ) : albumListMode === "album" ? (
            <div className="album-list-table albums" role="table" aria-label={t("listMode.albumTable")}>
              <div className="album-table-header" role="row">
                <span role="columnheader">{t("tags.album")}</span>
                <span role="columnheader">{t("tags.albumArtist")}</span>
                <span role="columnheader">{t("tags.year")}</span>
                <span role="columnheader">{t("listMode.trackCount")}</span>
                <span aria-hidden="true" role="columnheader" />
              </div>
              {albums.map((album) => (
                <div
                  className={album.id === selectedAlbumId ? "album-table-row active" : "album-table-row"}
                  data-album-id={album.id}
                  key={album.id}
                  onClick={() => onSelectAlbum(album)}
                  role="row"
                >
                  <span className="table-primary" role="cell">
                    <button
                      className="album-table-select-button"
                      onFocus={prepareMarquee}
                      onMouseEnter={prepareMarquee}
                      type="button"
                    >
                      <span className="marquee-wrap">
                        <span className="marquee-text">{localizeLibraryText(album.title, t)}</span>
                      </span>
                    </button>
                  </span>
                  <span role="cell">{localizeLibraryText(album.artist, t)}</span>
                  <span role="cell">{album.yearLabel ?? album.year ?? t("library.fallbackYear")}</span>
                  <span role="cell">{t("player.queueCount", { count: album.tracks.length })}</span>
                  <button
                    aria-label={t("album.playSelected")}
                    className="album-table-play-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPlayAlbum(album);
                    }}
                    title={t("album.playSelected")}
                    type="button"
                  >
                    <Play aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="album-list-table tracks" role="table" aria-label={t("listMode.trackTable")}>
              <div className="album-table-header" role="row">
                <span aria-hidden="true" role="columnheader" />
                <span role="columnheader">{t("tags.title")}</span>
                <span role="columnheader">{t("tags.artist")}</span>
                <span role="columnheader">{t("tags.album")}</span>
                <span role="columnheader">{t("trackDetail.duration")}</span>
                <span aria-hidden="true" role="columnheader" />
              </div>
              {trackRows.map(({ album, track }) => (
                <div
                  className={album.id === selectedAlbumId ? "album-table-row active" : "album-table-row"}
                  data-album-id={album.id}
                  key={track.id}
                  onFocus={prepareMarquee}
                  onMouseEnter={prepareMarquee}
                  onClick={() => onSelectAlbum(album)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectAlbum(album);
                    }
                  }}
                  role="row"
                  tabIndex={0}
                >
                  <span className="table-track-lyrics-cell" role="cell">
                    {track.hasLyrics || track.lyrics?.trim() ? (
                      <Button
                        aria-label={t("trackDetail.showLyrics", { track: localizeLibraryText(track.title, t) })}
                        className="track-lyrics-table-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenTrackLyrics(track);
                        }}
                        title={t("trackDetail.lyricsTab")}
                        type="button"
                        variant="outline"
                      >
                        <ScrollText aria-hidden="true" />
                        <span className="sr-only">{t("trackDetail.lyricsTab")}</span>
                      </Button>
                    ) : null}
                  </span>
                  <span className="table-primary table-track-title marquee-wrap" role="cell">
                    <span className="marquee-text">
                      {track.trackNumber ? `${track.trackNumber}. ` : ""}
                      {localizeLibraryText(track.title, t)}
                    </span>
                  </span>
                  <span role="cell">{localizeLibraryText(track.artist, t)}</span>
                  <span role="cell">{localizeLibraryText(album.title, t)}</span>
                  <span role="cell">{formatTrackDuration(track)}</span>
                  <Button
                    aria-label={t("player.play")}
                    className="album-table-play-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPlayTrack(track, album.id);
                    }}
                    title={t("player.play")}
                    type="button"
                    variant="outline"
                  >
                    <Play aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className={`album-grid ${albumViewMode}`}>
            {albums.length === 0 ? (
              <div className="empty-state">{t("library.emptySearch")}</div>
            ) : (
              albums.map((album) => (
                <AlbumCard
                  album={album}
                  isActive={album.id === selectedAlbumId}
                  isTauriRuntime={isTauriRuntime}
                  key={album.id}
                  onPlay={onPlayAlbum}
                  onSelect={onSelectAlbum}
                  t={t}
                  variant={albumCardVariant}
                />
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export const AlbumBrowser = memo(AlbumBrowserComponent);
