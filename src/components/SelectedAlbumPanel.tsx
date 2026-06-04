import type { CSSProperties, PointerEvent, RefObject, TouchEvent } from "react";
import { Check, Pencil, Play, Save, ScrollText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatTrackDuration } from "@/lib/formatUtils";
import { getArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";
import { prepareMarquee } from "@/lib/marqueeUtils";
import type { AlbumTagDraft } from "@/lib/tagEditing";
import type { I18nMessage, TFunction } from "@/types/app";
import type { Album, Track } from "@/types/audio";

type TrackDetailTab = "info" | "lyrics" | "artwork";

type SelectedAlbumPanelProps = {
  albumPanelRef: RefObject<HTMLElement | null>;
  albumTagDraft: AlbumTagDraft;
  albumTagMessage: I18nMessage | null;
  currentTrack: Track | null;
  hasAlbumTagChanges: boolean;
  isAlbumPanelCollapsed: boolean;
  isAlbumTagEditing: boolean;
  isSavingAlbumTags: boolean;
  onAlbumPanelPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onAlbumPanelPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onAlbumPanelPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onAlbumPanelPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onAlbumPanelTouchCancel: () => void;
  onAlbumPanelTouchEnd: (event: TouchEvent) => void;
  onAlbumPanelTouchMove: (event: TouchEvent) => void;
  onAlbumPanelTouchStart: (event: TouchEvent) => void;
  onAlbumPanelWheel: (deltaY: number) => void;
  onAlbumTagDraftChange: (draft: AlbumTagDraft | ((draft: AlbumTagDraft) => AlbumTagDraft)) => void;
  onCancelAlbumTagEditing: () => void;
  onFinishTrackLongPress: (event: PointerEvent<HTMLButtonElement>) => void;
  onMoveTrackLongPress: (event: PointerEvent<HTMLButtonElement>, track: Track) => void;
  onOpenSelectedAlbumArtworkEditor: () => void;
  onOpenTrackDetail: (track: Track, tab?: TrackDetailTab) => void;
  onPlayTrack: (track: Track, albumId: number) => void;
  onSaveAlbumTags: () => void;
  onSelectTrack: (track: Track) => void;
  onStartAlbumTagEditing: () => void;
  onStartTrackLongPress: (event: PointerEvent<HTMLButtonElement>, track: Track) => void;
  selectedAlbum: Album | null;
  selectedTrackId: number | null;
  t: TFunction;
};

export function SelectedAlbumPanel({
  albumPanelRef,
  albumTagDraft,
  albumTagMessage,
  currentTrack,
  hasAlbumTagChanges,
  isAlbumPanelCollapsed,
  isAlbumTagEditing,
  isSavingAlbumTags,
  onAlbumPanelPointerCancel,
  onAlbumPanelPointerDown,
  onAlbumPanelPointerMove,
  onAlbumPanelPointerUp,
  onAlbumPanelTouchCancel,
  onAlbumPanelTouchEnd,
  onAlbumPanelTouchMove,
  onAlbumPanelTouchStart,
  onAlbumPanelWheel,
  onAlbumTagDraftChange,
  onCancelAlbumTagEditing,
  onFinishTrackLongPress,
  onMoveTrackLongPress,
  onOpenSelectedAlbumArtworkEditor,
  onOpenTrackDetail,
  onPlayTrack,
  onSaveAlbumTags,
  onSelectTrack,
  onStartAlbumTagEditing,
  onStartTrackLongPress,
  selectedAlbum,
  selectedTrackId,
  t,
}: SelectedAlbumPanelProps) {
  const selectedAlbumArtworkSrc = selectedAlbum ? getArtworkSrc(selectedAlbum) : "";
  const hasAlbumSaveSuccess =
    albumTagMessage?.key === "tags.saved" || albumTagMessage?.key === "tags.partialSaved" || albumTagMessage?.key === "tags.mockSaved";
  const albumPanelStyle = selectedAlbumArtworkSrc
    ? ({ "--selected-artwork-bg": `url("${selectedAlbumArtworkSrc.replace(/"/g, '\\"')}")` } as CSSProperties)
    : undefined;

  return (
    <section
      aria-label={t("library.selectedAlbumLabel")}
      className={[
        isAlbumPanelCollapsed ? "album-panel collapsed" : "album-panel",
        selectedAlbumArtworkSrc ? "has-artwork-bg" : "",
        hasAlbumSaveSuccess ? "save-success" : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
      style={albumPanelStyle}
    >
      {selectedAlbum ? (
        <>
          <div className="album-artwork-edit-target">
            {selectedAlbumArtworkSrc ? (
              <img
                className="album-art"
                alt={t("album.artworkAlt", { album: localizeLibraryText(selectedAlbum.title, t) })}
                src={selectedAlbumArtworkSrc}
              />
            ) : (
              <div className="album-art placeholder-art" aria-hidden="true">
                {selectedAlbum.title.charAt(0).toUpperCase()}
              </div>
            )}
            {selectedAlbum.tracks.length > 0 ? (
              <Button
                aria-label={t("trackDetail.editArtwork")}
                className="album-artwork-edit-button icon-button"
                onClick={onOpenSelectedAlbumArtworkEditor}
                title={t("trackDetail.editArtwork")}
                type="button"
                variant="outline"
              >
                <Pencil />
              </Button>
            ) : null}
          </div>

          <div className="album-detail">
            {isAlbumTagEditing ? (
              <form
                className="album-tag-form"
                data-keyboard-scope="text"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveAlbumTags();
                }}
              >
                <label>
                  <span>{t("tags.album")}</span>
                  <Input
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      onAlbumTagDraftChange((value) => ({ ...value, album: nextValue }));
                    }}
                    value={albumTagDraft.album}
                  />
                </label>
                <label>
                  <span>{t("tags.albumArtist")}</span>
                  <Input
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      onAlbumTagDraftChange((value) => ({ ...value, albumArtist: nextValue }));
                    }}
                    value={albumTagDraft.albumArtist}
                  />
                </label>
                <label>
                  <span>{t("tags.artist")}</span>
                  <Input
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      onAlbumTagDraftChange((value) => ({ ...value, artist: nextValue }));
                    }}
                    value={albumTagDraft.artist}
                  />
                </label>
                <div className="album-tag-form-row">
                  <label>
                    <span>{t("tags.year")}</span>
                    <Input
                      inputMode="numeric"
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        onAlbumTagDraftChange((value) => ({ ...value, year: nextValue }));
                      }}
                      value={albumTagDraft.year}
                    />
                  </label>
                  <label>
                    <span>{t("tags.genre")}</span>
                    <Input
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        onAlbumTagDraftChange((value) => ({ ...value, genre: nextValue }));
                      }}
                      value={albumTagDraft.genre}
                    />
                  </label>
                </div>
                <p className="tag-edit-note">{t("tags.albumWide", { count: selectedAlbum.tracks.length })}</p>
                <div className="album-tag-actions">
                  <Button className={hasAlbumSaveSuccess ? "save-button saved" : "save-button"} disabled={!hasAlbumTagChanges || isSavingAlbumTags} type="submit">
                    {hasAlbumSaveSuccess ? <Check /> : <Save />}
                    {isSavingAlbumTags ? t("tags.saving") : t("tags.save")}
                  </Button>
                  <Button disabled={isSavingAlbumTags} onClick={onCancelAlbumTagEditing} type="button" variant="outline">
                    <X />
                    {t("tags.cancel")}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <p className="eyebrow">{selectedAlbum.yearLabel ?? selectedAlbum.year ?? t("library.fallbackYear")}</p>
                <button
                  aria-label={t("tags.editSelected")}
                  className="album-title-edit-button"
                  onClick={onStartAlbumTagEditing}
                  type="button"
                >
                  <h2>{localizeLibraryText(selectedAlbum.title, t)}</h2>
                  <Pencil aria-hidden="true" />
                </button>
                <p>{localizeLibraryText(selectedAlbum.artist, t)}</p>
                {selectedAlbum.genre ? <p className="album-genre">{selectedAlbum.genre}</p> : null}
              </>
            )}
            {albumTagMessage ? (
              <p className="tag-edit-message" aria-live="polite">
                {t(albumTagMessage.key, albumTagMessage.values)}
              </p>
            ) : null}
          </div>

          <Separator />
          <ol className="track-list">
            {selectedAlbum.tracks.map((track, trackIndex) => {
              const trackRowClassName = [
                "track-list-row",
                track.id === currentTrack?.id ? "active-track-row" : "",
                track.id === selectedTrackId ? "selected-track-row" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <li className={trackRowClassName} key={track.id}>
                  <span className="track-title-cell">
                    <span className="track-action-slot">
                      <span className="track-number" aria-hidden="true">
                        {track.trackNumber ?? trackIndex + 1}
                      </span>
                      <button
                        aria-label={`${t("player.play")} ${localizeLibraryText(track.title, t)}`}
                        className="track-play-button musical-ripple-button"
                        onClick={() => onPlayTrack(track, selectedAlbum.id)}
                        title={`${t("player.play")} ${localizeLibraryText(track.title, t)}`}
                        type="button"
                      >
                        <Play aria-hidden="true" />
                      </button>
                    </span>
                    <Button
                      className="track-select-button"
                      onFocus={prepareMarquee}
                      onMouseEnter={prepareMarquee}
                      onClick={() => onSelectTrack(track)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onOpenTrackDetail(track);
                      }}
                      onPointerCancel={onFinishTrackLongPress}
                      onPointerDown={(event) => onStartTrackLongPress(event, track)}
                      onPointerLeave={onFinishTrackLongPress}
                      onPointerMove={(event) => onMoveTrackLongPress(event, track)}
                      onPointerUp={onFinishTrackLongPress}
                      variant="outline"
                      type="button"
                    >
                      <span className="track-title-wrap marquee-wrap">
                        <span className="track-title marquee-text">
                          <span className="track-name">{localizeLibraryText(track.title, t)}</span>
                        </span>
                      </span>
                    </Button>
                    {track.hasLyrics || track.lyrics?.trim() ? (
                      <button
                        aria-label={t("trackDetail.showLyrics", { track: localizeLibraryText(track.title, t) })}
                        className="track-lyrics-button has-lyrics-icon"
                        onClick={() => onOpenTrackDetail(track, "lyrics")}
                        title={t("trackDetail.lyricsTab")}
                        type="button"
                      >
                        <ScrollText aria-hidden="true" />
                        <span className="sr-only">{t("trackDetail.lyricsTab")}</span>
                      </button>
                    ) : null}
                  </span>
                  <small>{formatTrackDuration(track)}</small>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <div className="empty-detail">
          <h2>{t("library.emptyTitle")}</h2>
          <p>{t("library.emptyDescription")}</p>
        </div>
      )}
    </section>
  );
}
