import { Check, FolderOpen, Heart, Images, Save, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { I18nMessage, TFunction } from "@/types/app";
import type { Album, Track } from "@/types/audio";
import { formatTrackDuration } from "@/lib/formatUtils";
import { localizeLibraryText } from "@/lib/libraryUtils";
import { makeTrackTagDraft, trackTagFields } from "@/lib/trackTagDraftUtils";
import type { TrackTagDraft } from "@/lib/tagEditing";

type TrackDetailTab = "info" | "lyrics" | "artwork";

type TrackDetailDialogProps = {
  artworkDraftPath: string;
  artworkPreviewSrc: string;
  detailAlbum: Album;
  detailArtworkSrc: string;
  detailLyrics: string | null;
  detailTrack: Track;
  editingTrackTag: keyof TrackTagDraft | null;
  hasRealBackend: boolean;
  hasTrackTagChanges: boolean;
  isSavingArtwork: boolean;
  isSavingTrackTags: boolean;
  isSavingTrackUserState: boolean;
  isTauriRuntime: boolean;
  onChangeTab: (tab: TrackDetailTab) => void;
  onChooseArtwork: () => void;
  onClose: () => void;
  onOpenArtworkCandidateDialog: () => void;
  onSaveArtwork: () => void;
  onSaveTrackTags: () => void;
  onTrackFavoriteChange: (isFavorite: boolean) => void;
  onTrackRatingChange: (rating: number | null) => void;
  onTrackTagDraftChange: (draft: TrackTagDraft | ((draft: TrackTagDraft) => TrackTagDraft)) => void;
  onTrackTagEditChange: (field: keyof TrackTagDraft | null) => void;
  t: TFunction;
  trackDetailTab: TrackDetailTab;
  trackTagDraft: TrackTagDraft;
  trackTagMessage: I18nMessage | null;
};

export function TrackDetailDialog({
  artworkDraftPath,
  artworkPreviewSrc,
  detailAlbum,
  detailArtworkSrc,
  detailLyrics,
  detailTrack,
  editingTrackTag,
  hasRealBackend,
  hasTrackTagChanges,
  isSavingArtwork,
  isSavingTrackTags,
  isSavingTrackUserState,
  isTauriRuntime,
  onChangeTab,
  onChooseArtwork,
  onClose,
  onOpenArtworkCandidateDialog,
  onSaveArtwork,
  onSaveTrackTags,
  onTrackFavoriteChange,
  onTrackRatingChange,
  onTrackTagDraftChange,
  onTrackTagEditChange,
  t,
  trackDetailTab,
  trackTagDraft,
  trackTagMessage,
}: TrackDetailDialogProps) {
  const hasTrackSaveSuccess = trackTagMessage?.key === "tags.trackSaved" || trackTagMessage?.key === "tags.mockSaved";
  const hasArtworkSaveSuccess = trackTagMessage?.key === "tags.artworkSaved";

  return (
    <div className="track-detail-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label={t("trackDetail.label")}
        aria-modal="true"
        className="track-detail-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="track-detail-header">
          <div className="track-detail-title">
            <p className="eyebrow">{localizeLibraryText(detailAlbum.title, t)}</p>
            <h2>{localizeLibraryText(detailTrack.title, t)}</h2>
          </div>
          <Button aria-label={t("trackDetail.close")} className="icon-button" onClick={onClose} type="button" variant="outline">
            <X />
          </Button>
        </div>

        <Tabs className="track-detail-tabs" onValueChange={(value) => onChangeTab(value as TrackDetailTab)} value={trackDetailTab}>
          <TabsList className="track-detail-tab-list">
            <TabsTrigger value="info">{t("trackDetail.infoTab")}</TabsTrigger>
            <TabsTrigger value="lyrics">{t("trackDetail.lyricsTab")}</TabsTrigger>
            <TabsTrigger value="artwork">{t("trackDetail.artworkTab")}</TabsTrigger>
          </TabsList>
          <TabsContent className="track-detail-tab-panel" value="info">
            <div className="track-user-state-panel">
              <Button
                aria-pressed={Boolean(detailTrack.isFavorite)}
                className={detailTrack.isFavorite ? "track-favorite-button active" : "track-favorite-button"}
                disabled={isSavingTrackUserState}
                onClick={() => onTrackFavoriteChange(!detailTrack.isFavorite)}
                title={detailTrack.isFavorite ? t("trackDetail.removeFavorite") : t("trackDetail.addFavorite")}
                type="button"
                variant="outline"
              >
                <Heart />
                {detailTrack.isFavorite ? t("trackDetail.favorite") : t("trackDetail.notFavorite")}
              </Button>
              <div aria-label={t("trackDetail.rating")} className="track-rating-control" role="group">
                {[1, 2, 3, 4, 5].map((rating) => {
                  const isActive = (detailTrack.rating ?? 0) >= rating;
                  const isExactRating = detailTrack.rating === rating;
                  return (
                    <button
                      aria-label={t("trackDetail.setRating", { rating })}
                      aria-pressed={isExactRating}
                      className={isActive ? "track-rating-star active" : "track-rating-star"}
                      disabled={isSavingTrackUserState}
                      key={rating}
                      onClick={() => onTrackRatingChange(isExactRating ? null : rating)}
                      title={t("trackDetail.setRating", { rating })}
                      type="button"
                    >
                      <Star aria-hidden="true" />
                    </button>
                  );
                })}
                <button
                  className="track-rating-clear"
                  disabled={isSavingTrackUserState || detailTrack.rating === null || detailTrack.rating === undefined}
                  onClick={() => onTrackRatingChange(null)}
                  title={t("trackDetail.clearRating")}
                  type="button"
                >
                  <X aria-hidden="true" />
                  <span className="sr-only">{t("trackDetail.clearRating")}</span>
                </button>
              </div>
            </div>
            <div className="track-tag-grid">
              {trackTagFields.map((field) => (
                <label className="track-tag-field" key={field.key}>
                  <span>{t(field.labelKey)}</span>
                  {editingTrackTag === field.key ? (
                    <Input
                      autoFocus
                      data-keyboard-scope="text"
                      inputMode={field.key === "year" || field.key === "trackNumber" || field.key === "discNumber" ? "numeric" : undefined}
                      onBlur={() => onTrackTagEditChange(null)}
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        onTrackTagDraftChange((value) => ({ ...value, [field.key]: nextValue }));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          onTrackTagDraftChange(makeTrackTagDraft(detailTrack, detailAlbum));
                          onTrackTagEditChange(null);
                        }
                      }}
                      value={trackTagDraft[field.key]}
                    />
                  ) : (
                    <button className="track-tag-value" onClick={() => onTrackTagEditChange(field.key)} type="button">
                      {trackTagDraft[field.key].trim() || t("trackDetail.emptyTag")}
                    </button>
                  )}
                </label>
              ))}
              <div className="track-tag-field readonly">
                <span>{t("trackDetail.duration")}</span>
                <strong>{formatTrackDuration(detailTrack)}</strong>
              </div>
              <div className="track-tag-field readonly wide">
                <span>{t("trackDetail.filePath")}</span>
                <strong>{detailTrack.filePath ?? t("trackDetail.noFilePath")}</strong>
              </div>
            </div>
            {trackTagMessage ? (
              <p className="tag-edit-message" aria-live="polite">
                {t(trackTagMessage.key, trackTagMessage.values)}
              </p>
            ) : null}
            <div className="album-tag-actions">
              <Button
                className={hasTrackSaveSuccess ? "save-button saved" : "save-button"}
                disabled={!hasTrackTagChanges || isSavingTrackTags}
                onClick={onSaveTrackTags}
                type="button"
              >
                {hasTrackSaveSuccess ? <Check /> : <Save />}
                {hasTrackSaveSuccess && trackTagMessage ? t(trackTagMessage.key, trackTagMessage.values) : isSavingTrackTags ? t("tags.saving") : t("tags.save")}
              </Button>
              <Button
                disabled={!hasTrackTagChanges || isSavingTrackTags}
                onClick={() => {
                  onTrackTagDraftChange(makeTrackTagDraft(detailTrack, detailAlbum));
                  onTrackTagEditChange(null);
                }}
                type="button"
                variant="outline"
              >
                <X />
                {t("tags.cancel")}
              </Button>
            </div>
          </TabsContent>
          <TabsContent className="track-detail-tab-panel" value="lyrics">
            <pre className="lyrics-panel">{detailLyrics?.trim() || t("trackDetail.noLyrics")}</pre>
          </TabsContent>
          <TabsContent className="track-detail-tab-panel" value="artwork">
            <div className="artwork-edit-panel">
              <div className="artwork-preview-card">
                <span>{t("trackDetail.currentArtwork")}</span>
                {detailArtworkSrc ? (
                  <img alt={t("album.artworkAlt", { album: localizeLibraryText(detailAlbum.title, t) })} src={detailArtworkSrc} />
                ) : (
                  <div className="artwork-empty-state">{t("trackDetail.noArtwork")}</div>
                )}
              </div>
              <div className="artwork-preview-card">
                <span>{t("trackDetail.selectedArtwork")}</span>
                {artworkPreviewSrc ? (
                  <img alt={t("trackDetail.selectedArtwork")} src={artworkPreviewSrc} />
                ) : (
                  <div className="artwork-empty-state">{t("trackDetail.artworkRequired")}</div>
                )}
              </div>
              <div className="album-tag-actions artwork-actions">
                {isTauriRuntime && hasRealBackend ? (
                  <Button disabled={isSavingArtwork} onClick={onOpenArtworkCandidateDialog} type="button" variant="outline">
                    <Images />
                    {t("artworkSearch.open")}
                  </Button>
                ) : null}
                <Button disabled={isSavingArtwork} onClick={onChooseArtwork} type="button" variant="outline">
                  <FolderOpen />
                  {t("trackDetail.chooseArtwork")}
                </Button>
                <Button
                  className={hasArtworkSaveSuccess ? "save-button saved" : "save-button"}
                  disabled={!artworkDraftPath || isSavingArtwork || !hasRealBackend}
                  onClick={onSaveArtwork}
                  type="button"
                >
                  {hasArtworkSaveSuccess ? <Check /> : <Save />}
                  {hasArtworkSaveSuccess && trackTagMessage
                    ? t(trackTagMessage.key, trackTagMessage.values)
                    : isSavingArtwork
                      ? t("tags.saving")
                      : t("trackDetail.saveArtwork")}
                </Button>
              </div>
              {!isTauriRuntime ? <p className="tag-edit-message">{t("trackDetail.artworkDesktopOnly")}</p> : null}
              {trackTagMessage ? (
                <p className="tag-edit-message" aria-live="polite">
                  {t(trackTagMessage.key, trackTagMessage.values)}
                </p>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
