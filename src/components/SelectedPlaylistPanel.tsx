import { useEffect, useState, type CSSProperties, type PointerEvent, type RefObject, type TouchEvent } from "react";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, ListMusic, Pencil, Play, Plus, RefreshCw, Save, ScrollText, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatTrackDuration } from "@/lib/formatUtils";
import { getPlaylistArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";
import { prepareMarquee } from "@/lib/marqueeUtils";
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
  onPlayTrack: (track: Track, albumId: EntityId) => void;
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
  onPlayTrack,
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
  }, [playlist.id, playlist.name]);

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
        {playlist.filePath ? <p className="album-genre">{playlist.filePath}</p> : null}
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
                        if (album) onPlayTrack(track, album.id);
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
                    onFocus={prepareMarquee}
                    onMouseEnter={prepareMarquee}
                    onClick={() => onSelectTrack(track)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onOpenTrackDetail(track);
                    }}
                    variant="outline"
                    type="button"
                  >
                    <span className="track-title-wrap marquee-wrap">
                      <span className="track-title marquee-text">
                        <span className="track-name">{localizeLibraryText(track.title, t)}</span>
                        <span aria-hidden="true" className="track-album-meta">
                          {albumTitle} / {artist}
                        </span>
                      </span>
                    </span>
                  </Button>
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
                </span>
                <span className="track-row-actions">
                  {album ? (
                    <button
                      aria-label={t("playlists.jumpToAlbum", { album: albumTitle })}
                      className="track-playlist-add-button"
                      onClick={() => onJumpToAlbum(album)}
                      title={t("playlists.jumpToAlbum", { album: albumTitle })}
                      type="button"
                    >
                      <ExternalLink aria-hidden="true" />
                    </button>
                  ) : null}
                  <button
                    aria-label={t("playlists.moveTrackUp", { track: localizeLibraryText(track.title, t) })}
                    className="track-playlist-add-button"
                    disabled={displayIndex === 0}
                    onClick={() => onReorderTrack(playlist, trackIndex, trackEntries[displayIndex - 1]?.trackIndex ?? trackIndex)}
                    title={t("playlists.moveTrackUp", { track: localizeLibraryText(track.title, t) })}
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button
                    aria-label={t("playlists.moveTrackDown", { track: localizeLibraryText(track.title, t) })}
                    className="track-playlist-add-button"
                    disabled={displayIndex === trackEntries.length - 1}
                    onClick={() => onReorderTrack(playlist, trackIndex, trackEntries[displayIndex + 1]?.trackIndex ?? trackIndex)}
                    title={t("playlists.moveTrackDown", { track: localizeLibraryText(track.title, t) })}
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" />
                  </button>
                  <button
                    aria-label={t("playlists.removeTrack", { track: localizeLibraryText(track.title, t) })}
                    className="track-playlist-add-button"
                    onClick={() => onRemoveTrack(playlist, trackIndex)}
                    title={t("playlists.removeTrack", { track: localizeLibraryText(track.title, t) })}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                  <small>{formatTrackDuration(track)}</small>
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
