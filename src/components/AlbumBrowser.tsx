import {
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowDownAZ, ArrowUpAZ, ListMusic, Maximize2, Minimize2, Pause, Play, Plus, ScrollText, Search, SlidersHorizontal, SquareLibrary } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import type { TranslationKey } from "@/i18n";
import type { Album, EntityId, Playlist, Track } from "@/types/audio";
import type { AlbumListMode, AlbumSortDirection, AlbumSortMode, AlbumViewMode } from "@/types/app";
import { AlbumCard, AlbumCardFactory } from "@/components/AlbumCard";
import { formatTrackDuration } from "@/lib/formatUtils";
import { getPlaylistArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";
import { prepareMarquee } from "@/lib/marqueeUtils";
import { logRenderDiagnostic } from "@/lib/renderDiagnostics";

type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

type AlbumBrowserProps = {
  albums: Album[];
  albumListMode: AlbumListMode;
  albumSortDirection: AlbumSortDirection;
  albumSortMode: AlbumSortMode;
  albumViewMode: AlbumViewMode;
  isTauriRuntime: boolean;
  isPlaying: boolean;
  panelRef: RefObject<HTMLElement | null>;
  lyricsOnly: boolean;
  playbackAlbumId: EntityId | null;
  playlists: Playlist[];
  query: string;
  selectedAlbumId: EntityId | null;
  selectedPlaylistId: EntityId | null;
  t: TFunction;
  onPausePlayback: () => void;
  onCreatePlaylist: (name: string) => void;
  onPlayAlbum: (album: Album, options?: { selectAlbum?: boolean }) => void;
  onPlayPlaylist: (playlist: Playlist) => void;
  onQueryChange: (query: string) => void;
  onLyricsOnlyChange: (lyricsOnly: boolean) => void;
  onListModeChange: (listMode: AlbumListMode) => void;
  onOpenTrackLyrics: (track: Track) => void;
  onSelectAlbum: (album: Album) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onPlayTrack: (track: Track, albumId: EntityId) => void;
  onSortDirectionChange: (sortDirection: AlbumSortDirection) => void;
  onSortModeChange: (sortMode: AlbumSortMode) => void;
  onViewModeChange: (viewMode: AlbumViewMode) => void;
};

function getScrollIndexLabel(value: string, options: { collapseNumbers?: boolean } = {}) {
  const collapseNumbers = options.collapseNumbers ?? true;
  const firstCharacter = Array.from(value.trim())[0];
  if (!firstCharacter) return "#";
  if (!collapseNumbers && /\p{Number}/u.test(firstCharacter)) return value.trim();
  if (/\p{Number}/u.test(firstCharacter)) return "#";
  return /\p{Letter}/u.test(firstCharacter) ? firstCharacter.toLocaleUpperCase() : firstCharacter;
}

type AlbumScrollIndexItem = {
  label: string;
  row: number;
  targetId: string;
};

function AlbumBrowserComponent({
  albums,
  albumListMode,
  albumSortDirection,
  albumSortMode,
  albumViewMode,
  isTauriRuntime,
  isPlaying,
  panelRef,
  lyricsOnly,
  playbackAlbumId,
  playlists,
  query,
  selectedAlbumId,
  selectedPlaylistId,
  t,
  onPausePlayback,
  onCreatePlaylist,
  onPlayAlbum,
  onPlayPlaylist,
  onQueryChange,
  onLyricsOnlyChange,
  onListModeChange,
  onOpenTrackLyrics,
  onSelectAlbum,
  onSelectPlaylist,
  onPlayTrack,
  onSortDirectionChange,
  onSortModeChange,
  onViewModeChange,
}: AlbumBrowserProps) {
  const renderCountRef = useRef(0);
  const albumListRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollEndTimeoutRef = useRef<number | null>(null);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [scrollIndexItems, setScrollIndexItems] = useState<AlbumScrollIndexItem[]>([]);
  const [activeScrollIndex, setActiveScrollIndex] = useState(0);
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
  const filteredPlaylists = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return playlists;
    return playlists.filter((playlist) => {
      const playlistText = [
        playlist.name,
        ...playlist.tracks.flatMap((track) => [track.title, track.artist, track.filePath ?? ""]),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return playlistText.includes(normalizedQuery);
    });
  }, [playlists, query]);
  const nextSortDirection = albumSortDirection === "asc" ? "desc" : "asc";
  const sortDirectionLabel =
    albumSortDirection === "asc" ? t("sort.ascending") : t("sort.descending");

  function getAlbumScrollIndexLabel(album: Album) {
    if (albumSortMode === "artist") return getScrollIndexLabel(localizeLibraryText(album.artist, t));
    if (albumSortMode === "year") return getScrollIndexLabel(String(album.yearLabel ?? album.year ?? t("library.fallbackYear")), { collapseNumbers: false });
    return getScrollIndexLabel(localizeLibraryText(album.title, t));
  }

  function getTrackScrollIndexLabel(album: Album, track: Track) {
    if (albumSortMode === "artist") return getScrollIndexLabel(localizeLibraryText(track.artist, t));
    if (albumSortMode === "year") return getScrollIndexLabel(String(album.yearLabel ?? album.year ?? t("library.fallbackYear")), { collapseNumbers: false });
    return getScrollIndexLabel(localizeLibraryText(track.title, t));
  }

  function getPlaylistScrollIndexLabel(playlist: Playlist) {
    return getScrollIndexLabel(playlist.name);
  }

  function submitNewPlaylist() {
    const name = newPlaylistName.trim() || t("playlists.defaultName");
    onCreatePlaylist(name);
    setNewPlaylistName("");
  }

  function getVisibleAlbumRowIndex() {
    const scrollElement = albumListRef.current;
    if (!scrollElement) return 0;

    const scrollRect = scrollElement.getBoundingClientRect();
    const albumElements = Array.from(scrollElement.querySelectorAll<HTMLElement>("[data-scroll-index-id]"));
    const firstVisibleAlbum = albumElements.find((element) => element.getBoundingClientRect().bottom >= scrollRect.top + 20);
    const row = Number(firstVisibleAlbum?.dataset.albumIndexRow);
    return Number.isFinite(row) ? row : 0;
  }

  function syncActiveScrollIndex() {
    if (programmaticScrollRef.current) {
      if (programmaticScrollEndTimeoutRef.current) window.clearTimeout(programmaticScrollEndTimeoutRef.current);
      programmaticScrollEndTimeoutRef.current = window.setTimeout(() => {
        programmaticScrollRef.current = false;
        syncActiveScrollIndex();
      }, 140);
      return;
    }

    const visibleRow = getVisibleAlbumRowIndex();
    const nearestIndex = scrollIndexItems.reduce((nearest, item, index) => {
      const currentDistance = Math.abs(item.row - visibleRow);
      const nearestDistance = Math.abs(scrollIndexItems[nearest]?.row - visibleRow);
      return currentDistance < nearestDistance ? index : nearest;
    }, 0);
    setActiveScrollIndex(nearestIndex);
  }

  function scrollToAlbumIndexItem(item: AlbumScrollIndexItem) {
    const scrollElement = albumListRef.current;
    if (!scrollElement) return;

    const targetElement = scrollElement.querySelector<HTMLElement>(`[data-scroll-index-id="${item.targetId}"]`);
    if (!targetElement) return;

    const scrollRect = scrollElement.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    programmaticScrollRef.current = true;
    if (programmaticScrollEndTimeoutRef.current) window.clearTimeout(programmaticScrollEndTimeoutRef.current);
    programmaticScrollEndTimeoutRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
      syncActiveScrollIndex();
    }, 420);
    scrollElement.scrollTo({
      top: scrollElement.scrollTop + targetRect.top - scrollRect.top - 8,
      behavior: "smooth",
    });
    const nextActiveIndex = Math.max(0, scrollIndexItems.findIndex((scrollIndexItem) => scrollIndexItem === item));
    setActiveScrollIndex(nextActiveIndex);
  }

  function scrollToPointerIndex(event: ReactPointerEvent<HTMLDivElement>) {
    const railElement = event.currentTarget;
    const railRect = railElement.getBoundingClientRect();
    const ratio = Math.min(0.999, Math.max(0, (event.clientY - railRect.top) / railRect.height));
    const item = scrollIndexItems[Math.floor(ratio * scrollIndexItems.length)];
    if (item) scrollToAlbumIndexItem(item);
  }

  function rebuildScrollIndex() {
    const scrollElement = albumListRef.current;
    if (!scrollElement) return;

    const scrollRect = scrollElement.getBoundingClientRect();
    const rowItems: AlbumScrollIndexItem[] = [];
    let currentRowTop: number | null = null;
    let row = -1;

    Array.from(scrollElement.querySelectorAll<HTMLElement>("[data-scroll-index-id]")).forEach((element) => {
      const label = element.dataset.scrollIndexLabel;
      const targetId = element.dataset.scrollIndexId;
      if (!label || !targetId) return;

      const rowTop = Math.round(element.getBoundingClientRect().top - scrollRect.top + scrollElement.scrollTop);
      if (currentRowTop === null || Math.abs(rowTop - currentRowTop) > 4) {
        row += 1;
        currentRowTop = rowTop;
        rowItems.push({ label, row, targetId });
      }
      element.dataset.albumIndexRow = String(row);
    });

    const maxSlots = Math.max(8, Math.floor(scrollElement.clientHeight / 14));
    const nextItems =
      rowItems.length <= maxSlots
        ? rowItems
        : Array.from({ length: maxSlots }, (_, index) => rowItems[Math.round((index * (rowItems.length - 1)) / (maxSlots - 1))]).filter(
            (item, index, items) => item && item.row !== items[index - 1]?.row,
          );

    setScrollIndexItems((currentItems) => {
      const currentSignature = currentItems.map((item) => `${item.row}:${item.targetId}:${item.label}`).join("|");
      const nextSignature = nextItems.map((item) => `${item.row}:${item.targetId}:${item.label}`).join("|");
      return currentSignature === nextSignature ? currentItems : nextItems;
    });
  }

  useLayoutEffect(() => {
    rebuildScrollIndex();
  }, [albumListMode, albumSortMode, albumViewMode, albums, filteredPlaylists, t, trackRows.length]);

  useEffect(() => {
    const scrollElement = albumListRef.current;
    if (!scrollElement) return undefined;

    const resizeObserver = new ResizeObserver(() => rebuildScrollIndex());
    resizeObserver.observe(scrollElement);
    return () => resizeObserver.disconnect();
  }, [albumListMode, albumSortMode, albumViewMode, albums, filteredPlaylists, t, trackRows.length]);

  useEffect(() => {
    syncActiveScrollIndex();
  }, [scrollIndexItems]);

  useEffect(
    () => () => {
      if (programmaticScrollEndTimeoutRef.current) window.clearTimeout(programmaticScrollEndTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    logRenderDiagnostic("AlbumBrowser committed", {
      albumListMode,
      albums: albums.length,
      albumViewMode,
      lyricsOnly,
      playlists: playlists.length,
      query,
      render: renderCountRef.current,
      selectedAlbumId,
    });
  });

  return (
    <section className="albums-panel" aria-label={t("library.albumListLabel")} data-scroll-index-mode={albumSortMode} ref={panelRef}>
      <div className="albums-panel-header">
        <div className="albums-title">
          <Badge variant="secondary">
            {albumViewMode === "playlist" ? t("playlists.count", { count: filteredPlaylists.length }) : t("albums.count", { count: albums.length })}
          </Badge>
          {albumViewMode === "playlist" ? (
            <form
              className="playlist-create-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitNewPlaylist();
              }}
            >
              <Input
                aria-label={t("playlists.namePrompt")}
                onChange={(event) => setNewPlaylistName(event.target.value)}
                placeholder={t("playlists.defaultName")}
                value={newPlaylistName}
              />
              <Button
                aria-label={t("playlists.create")}
                className="playlist-create-button"
                title={t("playlists.create")}
                type="submit"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                <span>{t("playlists.create")}</span>
              </Button>
            </form>
          ) : null}
          <Button
            aria-expanded={isFilterPanelOpen}
            aria-label={t("filters.toggle")}
            className="album-filter-toggle-button"
            onClick={() => setIsFilterPanelOpen((value) => !value)}
            title={t("filters.toggle")}
            type="button"
            variant="outline"
          >
            <SlidersHorizontal aria-hidden="true" />
            <span>{t("filters.toggle")}</span>
          </Button>
        </div>
        <div className="album-toolbar" data-open={isFilterPanelOpen}>
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
                  <SquareLibrary />
                  <span className="sr-only">{t("view.list")}</span>
                </TabsTrigger>
                <TabsTrigger value="playlist" aria-label={t("view.playlists")} title={t("view.playlists")}>
                  <ListMusic />
                  <span className="sr-only">{t("view.playlists")}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      <div
        className="albums-panel-main"
        onScroll={syncActiveScrollIndex}
        ref={albumListRef}
      >
        {albumViewMode === "playlist" ? (
          <div className="album-grid large playlist-grid">
            {filteredPlaylists.length === 0 ? (
              <div className="empty-state">{t("playlists.empty")}</div>
            ) : (
              filteredPlaylists.map((playlist) => {
                const playlistArtworkSrc = getPlaylistArtworkSrc(playlist);

                return (
                  <Button
                    className={[
                      "album-card playlist-card",
                      playlist.id === selectedPlaylistId ? "active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-scroll-index-id={`playlist-${playlist.id}`}
                    data-scroll-index-label={getPlaylistScrollIndexLabel(playlist)}
                    key={playlist.id}
                    onFocus={prepareMarquee}
                    onMouseEnter={prepareMarquee}
                    onClick={() => onSelectPlaylist(playlist)}
                    title={playlist.name}
                    type="button"
                    variant="outline"
                  >
                    <span className="album-cover-wrap playlist-cover-wrap">
                      {playlistArtworkSrc ? (
                        <img alt={t("playlists.artworkAlt", { playlist: playlist.name })} src={playlistArtworkSrc} />
                      ) : (
                        <span className="album-placeholder playlist-placeholder" aria-hidden="true">
                          <ListMusic aria-hidden="true" />
                        </span>
                      )}
                      <span
                        aria-label={t("playlists.play", { playlist: playlist.name })}
                        className="album-hover-play musical-ripple-button"
                        aria-disabled={playlist.tracks.length === 0}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (playlist.tracks.length === 0) return;
                          onPlayPlaylist(playlist);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            if (playlist.tracks.length === 0) return;
                            onPlayPlaylist(playlist);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        title={t("playlists.play", { playlist: playlist.name })}
                      >
                        <Play aria-hidden="true" />
                      </span>
                    </span>
                    <span className="album-card-title marquee-wrap">
                      <span className="marquee-text">{playlist.name}</span>
                    </span>
                    <small className="album-card-meta">
                      {t("playlists.trackCount", { count: playlist.trackCount })}
                    </small>
                  </Button>
                );
              })
            )}
          </div>
        ) : albumViewMode === "list" ? (
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
              {albums.map((album) => {
                const isPlaybackAlbumPlaying = isPlaying && album.id === playbackAlbumId;
                const playbackActionLabel = isPlaybackAlbumPlaying ? t("player.pause") : t("album.playSelected");

                return (
                  <div
                    className={[
                      "album-table-row",
                      album.id === selectedAlbumId ? "active" : "",
                      isPlaybackAlbumPlaying ? "playing-album-row" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-album-id={album.id}
                    data-scroll-index-id={`album-${album.id}`}
                    data-scroll-index-label={getAlbumScrollIndexLabel(album)}
                    key={album.id}
                    onClick={() => onSelectAlbum(album)}
                    role="row"
                  >
                    <span className="table-primary" role="cell">
                      <button
                        className="album-table-select-button"
                        onFocus={prepareMarquee}
                        onMouseEnter={prepareMarquee}
                        onClick={() => onSelectAlbum(album)}
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
                      aria-label={playbackActionLabel}
                      className="album-table-play-button musical-ripple-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isPlaybackAlbumPlaying) {
                          onPausePlayback();
                        } else {
                          onPlayAlbum(album);
                        }
                      }}
                      title={playbackActionLabel}
                      type="button"
                    >
                      {isPlaybackAlbumPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                    </button>
                  </div>
                );
              })}
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
                  className={[
                    "album-table-row",
                    album.id === selectedAlbumId ? "active" : "",
                    isPlaying && album.id === playbackAlbumId ? "playing-album-row" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-album-id={album.id}
                  data-scroll-index-id={`track-${track.id}`}
                  data-scroll-index-label={getTrackScrollIndexLabel(album, track)}
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
                        className="track-lyrics-table-button has-lyrics-icon"
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
                    className="album-table-play-button musical-ripple-button"
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
                  isPlaying={isPlaying && album.id === playbackAlbumId}
                  isTauriRuntime={isTauriRuntime}
                  key={album.id}
                  onPause={onPausePlayback}
                  onPlay={onPlayAlbum}
                  onSelect={onSelectAlbum}
                  scrollIndexLabel={getAlbumScrollIndexLabel(album)}
                  t={t}
                  variant={albumCardVariant}
                />
              ))
            )}
          </div>
        )}
      </div>
      {scrollIndexItems.length > 1 ? (
        <div
          aria-label={t("albums.scrollIndexLabel")}
          className="album-scroll-index"
          data-index-mode={albumSortMode}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            scrollToPointerIndex(event);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) scrollToPointerIndex(event);
          }}
          role="navigation"
          style={{ "--album-scroll-index-count": scrollIndexItems.length } as CSSProperties}
        >
          {scrollIndexItems.map((item, index) => (
            <button
              aria-current={index === activeScrollIndex ? "location" : undefined}
              aria-label={t("albums.jumpToIndex", { letter: item.label })}
              className="album-scroll-index-button"
              key={`${item.row}-${item.targetId}`}
              onClick={() => scrollToAlbumIndexItem(item)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export const AlbumBrowser = memo(AlbumBrowserComponent);
