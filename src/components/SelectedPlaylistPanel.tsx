import {
  useEffect,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  type SyntheticEvent,
  type TouchEvent,
} from "react";
import { ArrowDown, ArrowUp, Ellipsis, ExternalLink, ImagePlus, ListMusic, Pencil, Play, Plus, RefreshCw, Save, ScrollText, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatTrackDuration } from "@/lib/formatUtils";
import { getPlaylistArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";
import type { TFunction } from "@/types/app";
import type { Album, EntityId, Playlist, Track } from "@/types/audio";

type PlaylistTrackEntry = {
  album: Album | null;
  track: Track;
  trackIndex: number;
};

type SelectedPlaylistPanelProps = {
  albumPanelRef: RefObject<HTMLElement | null>;
  currentTrack: Track | null;
  isAlbumPanelCollapsed: boolean;
  onAlbumPanelPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onAlbumPanelPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onAlbumPanelPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onAlbumPanelPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onAlbumPanelTouchCancel: () => void;
  onAlbumPanelTouchEnd: (event: TouchEvent) => void;
  onAlbumPanelTouchMove: (event: TouchEvent) => void;
  onAlbumPanelTouchStart: (event: TouchEvent) => void;
  onAlbumPanelWheel: (deltaY: number) => void;
  onDeletePlaylist: (playlist: Playlist) => void;
  onJumpToAlbum: (album: Album) => void;
  onOpenAddTracks: () => void;
  onOpenTrackDetail: (track: Track) => void;
  onOpenTrackLyrics: (track: Track) => void;
  onChooseArtwork: (playlist: Playlist) => void;
  onPlayPlaylistTrack: (track: Track, playlist: Playlist) => void;
  onPlayPlaylist: (playlist: Playlist) => void;
  onReloadPlaylist: () => void;
  onRemoveTrack: (playlist: Playlist, trackIndex: number) => void;
  onRenamePlaylist: (playlist: Playlist, name: string) => void;
  onReorderTrack: (playlist: Playlist, fromIndex: number, toIndex: number) => void;
  onSelectTrack: (track: Track) => void;
  isSavingArtwork: boolean;
  playlist: Playlist;
  selectedTrackId: EntityId | null;
  t: TFunction;
  trackEntries: PlaylistTrackEntry[];
};

export function SelectedPlaylistPanel({
  albumPanelRef,
  currentTrack,
  isAlbumPanelCollapsed,
  onAlbumPanelPointerCancel,
  onAlbumPanelPointerDown,
  onAlbumPanelPointerMove,
  onAlbumPanelPointerUp,
  onAlbumPanelTouchCancel,
  onAlbumPanelTouchEnd,
  onAlbumPanelTouchMove,
  onAlbumPanelTouchStart,
  onAlbumPanelWheel,
  onDeletePlaylist,
  onJumpToAlbum,
  onOpenAddTracks,
  onOpenTrackDetail,
  onOpenTrackLyrics,
  onChooseArtwork,
  onPlayPlaylistTrack,
  onPlayPlaylist,
  onReloadPlaylist,
  onRemoveTrack,
  onRenamePlaylist,
  onReorderTrack,
  onSelectTrack,
  isSavingArtwork,
  playlist,
  selectedTrackId,
  t,
  trackEntries,
}: SelectedPlaylistPanelProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(playlist.name);
  const playlistArtworkSrc = getPlaylistArtworkSrc(playlist);
  const playlistFileName = playlist.filePath?.split(/[\\/]/).pop();
  const panelStyle = playlistArtworkSrc
    ? ({ "--selected-artwork-bg": `url("${playlistArtworkSrc.replace(/"/g, '\\"')}")` } as CSSProperties)
    : undefined;
  const panelClassName = [
    "album-panel",
    "playlist-detail-panel",
    playlistArtworkSrc ? "has-artwork-bg" : "",
    isAlbumPanelCollapsed ? "collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    setNameDraft(playlist.name);
    setIsRenaming(false);
    if (albumPanelRef.current) {
      albumPanelRef.current.scrollTop = 0;
    }
  }, [albumPanelRef, playlist.id, playlist.name]);

  const handleTrackMenuToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const details = event.currentTarget;
    if (!details.open) {
      details.classList.remove("open-upward");
      return;
    }

    albumPanelRef.current?.querySelectorAll<HTMLDetailsElement>(".track-row-menu[open]").forEach((otherMenu) => {
      if (otherMenu !== details) {
        otherMenu.removeAttribute("open");
      }
    });

    window.requestAnimationFrame(() => {
      if (!details.isConnected || !details.open) {
        return;
      }
      const popover = details.querySelector<HTMLElement>(".track-row-menu-popover");
      if (!popover) {
        return;
      }
      const panelRect = albumPanelRef.current?.getBoundingClientRect();
      const summaryRect = details.getBoundingClientRect();
      const visibleTop = Math.max(panelRect?.top ?? 0, 0);
      const visibleBottom = Math.min(panelRect?.bottom ?? window.innerHeight, window.innerHeight);
      const spaceAbove = summaryRect.top - visibleTop;
      const spaceBelow = visibleBottom - summaryRect.bottom;
      details.classList.toggle("open-upward", spaceBelow < popover.offsetHeight + 6 && spaceAbove > spaceBelow);
    });
  };

  const handleTrackMenuBlur = (event: FocusEvent<HTMLDetailsElement>) => {
    const details = event.currentTarget;
    window.requestAnimationFrame(() => {
      if (details.isConnected && !details.contains(document.activeElement)) {
        details.removeAttribute("open");
      }
    });
  };

  const handleTrackMenuKeyDown = (event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape" || !event.currentTarget.open) {
      return;
    }
    event.preventDefault();
    event.currentTarget.removeAttribute("open");
    event.currentTarget.querySelector<HTMLElement>("summary")?.focus();
  };

  return (
    <section
      aria-label={t("library.selectedPlaylistLabel")}
      className={panelClassName}
      data-state={isAlbumPanelCollapsed ? "collapsed" : "expanded"}
      onPointerCancel={onAlbumPanelPointerCancel}
      onPointerDown={onAlbumPanelPointerDown}
      onPointerMove={onAlbumPanelPointerMove}
      onPointerUp={onAlbumPanelPointerUp}
      onTouchCancel={onAlbumPanelTouchCancel}
      onTouchEnd={onAlbumPanelTouchEnd}
      onTouchMove={onAlbumPanelTouchMove}
      onTouchStart={onAlbumPanelTouchStart}
      onWheel={(event) => onAlbumPanelWheel(event.deltaY)}
      ref={albumPanelRef}
      style={panelStyle}
    >
      <div className="album-artwork-edit-target">
        <div className="playlist-detail-art">
          {playlistArtworkSrc ? (
            <img alt={t("playlists.artworkAlt", { playlist: playlist.name })} src={playlistArtworkSrc} />
          ) : (
            <ListMusic aria-hidden="true" />
          )}
        </div>
        <Button
          aria-label={t("playlists.chooseArtwork", { playlist: playlist.name })}
          className="album-artwork-edit-button icon-button"
          disabled={isSavingArtwork}
          onClick={() => onChooseArtwork(playlist)}
          title={t("playlists.chooseArtwork", { playlist: playlist.name })}
          type="button"
          variant="secondary"
        >
          <ImagePlus aria-hidden="true" />
          <span className="sr-only">{t("playlists.chooseArtwork", { playlist: playlist.name })}</span>
        </Button>
      </div>

      <div className="album-detail">
        <p className="eyebrow">{t("view.playlists")}</p>
        {isRenaming ? (
          <form
            className="playlist-name-form"
            data-keyboard-scope="text"
            onSubmit={(event) => {
              event.preventDefault();
              onRenamePlaylist(playlist, nameDraft);
              setIsRenaming(false);
            }}
          >
            <Input
              aria-label={t("playlists.namePrompt")}
              onChange={(event) => setNameDraft(event.currentTarget.value)}
              value={nameDraft}
            />
            <Button aria-label={t("tags.save")} className="icon-button" type="submit" variant="outline">
              <Save aria-hidden="true" />
            </Button>
            <Button
              aria-label={t("tags.cancel")}
              className="icon-button"
              onClick={() => {
                setNameDraft(playlist.name);
                setIsRenaming(false);
              }}
              type="button"
              variant="outline"
            >
              <X aria-hidden="true" />
            </Button>
          </form>
        ) : (
          <button
            aria-label={t("playlists.rename", { playlist: playlist.name })}
            className="album-title-edit-button"
            onClick={() => setIsRenaming(true)}
            type="button"
          >
            <h2>{playlist.name}</h2>
            <Pencil aria-hidden="true" />
          </button>
        )}
        <p>
          {t("playlists.trackCount", { count: playlist.trackCount })}
          {playlist.missingTrackPaths.length > 0 ? ` / ${t("playlists.missingTrackCount", { count: playlist.missingTrackPaths.length })}` : ""}
        </p>
        {playlist.filePath ? (
          <p className="album-genre playlist-file-path" title={playlist.filePath}>
            {playlistFileName}
          </p>
        ) : null}
        <div className="playlist-detail-actions">
          <Button disabled={playlist.tracks.length === 0} onClick={() => onPlayPlaylist(playlist)} type="button" variant="outline">
            <Play aria-hidden="true" />
            <span>{t("player.play")}</span>
          </Button>
          <Button onClick={onOpenAddTracks} type="button" variant="outline">
            <Plus aria-hidden="true" />
            <span>{t("playlists.addTracks")}</span>
          </Button>
          <Button aria-label={t("playlists.reload")} className="icon-button" onClick={onReloadPlaylist} title={t("playlists.reload")} type="button" variant="outline">
            <RefreshCw aria-hidden="true" />
          </Button>
          <Button aria-label={t("playlists.delete", { playlist: playlist.name })} className="icon-button" onClick={() => onDeletePlaylist(playlist)} title={t("playlists.delete", { playlist: playlist.name })} type="button" variant="outline">
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
        {playlist.tracks.length === 0 ? <p className="tag-edit-message">{t("playlists.emptyPlayback")}</p> : null}
      </div>

      <Separator />
      <ol className="track-list">
        {trackEntries.length === 0 ? (
          <li className="empty-state">{t("playlists.emptyTracks")}</li>
        ) : (
          trackEntries.map(({ album, track, trackIndex }, displayIndex) => {
            const trackRowClassName = [
              "track-list-row",
              track.id === currentTrack?.id ? "active-track-row" : "",
              track.id === selectedTrackId ? "selected-track-row" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const albumTitle = album ? localizeLibraryText(album.title, t) : t("data.unknownAlbum");
            const artist = localizeLibraryText(track.artist || album?.artist || t("data.unknownArtist"), t);

            return (
              <li className={trackRowClassName} key={`${playlist.id}-${track.id}-${displayIndex}`}>
                <span className="track-title-cell">
                  <span className="track-action-slot">
                    <span className="track-number" aria-hidden="true">
                      {displayIndex + 1}
                    </span>
                    <button
                      aria-label={`${t("player.play")} ${localizeLibraryText(track.title, t)}`}
                      className="track-play-button musical-ripple-button"
                      disabled={!album}
                      onClick={() => {
                        if (album) onPlayPlaylistTrack(track, playlist);
                      }}
                      title={`${t("player.play")} ${localizeLibraryText(track.title, t)}`}
                      type="button"
                    >
                      <Play aria-hidden="true" />
                    </button>
                  </span>
                  <Button
                    aria-label={localizeLibraryText(track.title, t)}
                    className="track-select-button"
                    onClick={() => onSelectTrack(track)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onOpenTrackDetail(track);
                    }}
                    variant="outline"
                    type="button"
                  >
                    <span className="track-title-wrap">
                      <span className="track-title">
                        <span className="track-name">{localizeLibraryText(track.title, t)}</span>
                        <span aria-hidden="true" className="track-album-meta">
                          {artist} · {albumTitle}
                        </span>
                      </span>
                    </span>
                  </Button>
                </span>
                <span className="track-row-actions">
                  <small className="track-duration">{formatTrackDuration(track)}</small>
                  {track.hasLyrics || track.lyrics?.trim() ? (
                    <button
                      aria-label={t("trackDetail.showLyrics", { track: localizeLibraryText(track.title, t) })}
                      className="track-lyrics-button has-lyrics-icon"
                      onClick={() => onOpenTrackLyrics(track)}
                      title={t("trackDetail.lyricsTab")}
                      type="button"
                    >
                      <ScrollText aria-hidden="true" />
                      <span className="sr-only">{t("trackDetail.lyricsTab")}</span>
                    </button>
                  ) : null}
                  <details
                    className="track-row-menu"
                    onBlur={handleTrackMenuBlur}
                    onKeyDown={handleTrackMenuKeyDown}
                    onToggle={handleTrackMenuToggle}
                  >
                    <summary
                      aria-label={t("playlists.trackActions", { track: localizeLibraryText(track.title, t) })}
                      role="button"
                      title={t("playlists.trackActions", { track: localizeLibraryText(track.title, t) })}
                    >
                      <Ellipsis aria-hidden="true" />
                    </summary>
                    <div className="track-row-menu-popover">
                      {album ? (
                        <button
                          aria-label={t("playlists.jumpToAlbum", { album: albumTitle })}
                          onClick={(event) => {
                            event.currentTarget.closest("details")?.removeAttribute("open");
                            onJumpToAlbum(album);
                          }}
                          type="button"
                        >
                          <ExternalLink aria-hidden="true" />
                          <span>{t("playlists.showAlbum")}</span>
                        </button>
                      ) : null}
                      <button
                        aria-label={t("playlists.moveTrackUp", { track: localizeLibraryText(track.title, t) })}
                        disabled={displayIndex === 0}
                        onClick={(event) => {
                          event.currentTarget.closest("details")?.removeAttribute("open");
                          onReorderTrack(playlist, trackIndex, trackEntries[displayIndex - 1]?.trackIndex ?? trackIndex);
                        }}
                        type="button"
                      >
                        <ArrowUp aria-hidden="true" />
                        <span>{t("playlists.moveUp")}</span>
                      </button>
                      <button
                        aria-label={t("playlists.moveTrackDown", { track: localizeLibraryText(track.title, t) })}
                        disabled={displayIndex === trackEntries.length - 1}
                        onClick={(event) => {
                          event.currentTarget.closest("details")?.removeAttribute("open");
                          onReorderTrack(playlist, trackIndex, trackEntries[displayIndex + 1]?.trackIndex ?? trackIndex);
                        }}
                        type="button"
                      >
                        <ArrowDown aria-hidden="true" />
                        <span>{t("playlists.moveDown")}</span>
                      </button>
                      <button
                        aria-label={t("playlists.removeTrack", { track: localizeLibraryText(track.title, t) })}
                        className="destructive"
                        onClick={(event) => {
                          event.currentTarget.closest("details")?.removeAttribute("open");
                          onRemoveTrack(playlist, trackIndex);
                        }}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" />
                        <span>{t("playlists.remove")}</span>
                      </button>
                    </div>
                  </details>
                </span>
              </li>
            );
          })
        )}
        {playlist.missingTrackPaths.map((trackPath, missingIndex) => (
          <li className="track-list-row missing-track-row" key={`${playlist.id}-missing-${trackPath}-${missingIndex}`}>
            <span className="track-title-cell">
              <span className="track-action-slot">
                <span className="track-number" aria-hidden="true">
                  {trackEntries.length + missingIndex + 1}
                </span>
              </span>
              <span className="track-select-button missing-track-copy">
                <span className="track-title-wrap">
                  <span className="track-title">
                    <span className="track-name">{t("playlists.missingTrack")}</span>
                    <span aria-hidden="true" className="track-album-meta">{trackPath}</span>
                  </span>
                </span>
              </span>
            </span>
            <span className="track-row-actions">
              <small>{t("playlists.reloadToRecover")}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
