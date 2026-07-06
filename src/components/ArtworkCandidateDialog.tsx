import { Disc3, ExternalLink, Image, LoaderCircle, Save, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { I18nMessage, TFunction } from "@/types/app";
import type { Album, Track } from "@/types/audio";
import type { ArtworkCandidate, ArtworkReleaseInspectResult, ArtworkSearchProgressView } from "@/lib/artworkSearch";
import { localizeLibraryText } from "@/lib/libraryUtils";

type ArtworkCandidateDialogProps = {
  artworkCandidateMessage: I18nMessage | null;
  artworkCandidatePreviewSrc: string;
  artworkCandidates: ArtworkCandidate[];
  artworkSearchProgress: ArtworkSearchProgressView | null;
  artworkSearchQuery: string;
  canSaveArtwork: boolean;
  editingAlbum: Album | null;
  isInspectingArtworkRelease: boolean;
  isPreviewingArtworkCandidate: boolean;
  isSavingArtwork: boolean;
  isSearchingArtworkCandidates: boolean;
  onArtworkSearchQueryChange: (value: string) => void;
  onChooseCandidate: (candidate: ArtworkCandidate) => void;
  onClose: () => void;
  onOpenGoogleSearch: () => void;
  onPreviewSelectedArtwork: () => void;
  onSaveArtwork: () => void;
  onSearchCandidates: () => void;
  selectedArtworkCandidateId: string | null;
  selectedArtworkRelease: ArtworkReleaseInspectResult | null;
  t: TFunction;
};

export function ArtworkCandidateDialog({
  artworkCandidateMessage,
  artworkCandidatePreviewSrc,
  artworkCandidates,
  artworkSearchProgress,
  artworkSearchQuery,
  canSaveArtwork,
  editingAlbum,
  isInspectingArtworkRelease,
  isPreviewingArtworkCandidate,
  isSavingArtwork,
  isSearchingArtworkCandidates,
  onArtworkSearchQueryChange,
  onChooseCandidate,
  onClose,
  onOpenGoogleSearch,
  onPreviewSelectedArtwork,
  onSaveArtwork,
  onSearchCandidates,
  selectedArtworkCandidateId,
  selectedArtworkRelease,
  t,
}: ArtworkCandidateDialogProps) {
  const hasCandidates = artworkCandidates.length > 0;
  const localTracks = editingAlbum?.tracks ?? [];
  const selectedCandidate = artworkCandidates.find((candidate) => candidate.id === selectedArtworkCandidateId) ?? null;
  const visibleSearchProgress =
    artworkSearchProgress ??
    (isSearchingArtworkCandidates ? { messageKey: "artworkSearch.progressPreparing", completed: 0, total: 1 } : null);

  return (
    <div className="artwork-candidate-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label={t("artworkSearch.label")}
        aria-modal="true"
        className="artwork-candidate-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="artwork-candidate-header">
          <div>
            <p className="eyebrow">{t("artworkSearch.source")}</p>
            <h2>{t("artworkSearch.label")}</h2>
          </div>
          <Button aria-label={t("artworkSearch.close")} className="icon-button" onClick={onClose} type="button" variant="outline">
            <X />
          </Button>
        </div>

        <div className="artwork-candidate-search">
          <label className="artwork-candidate-query">
            <span>{t("artworkSearch.query")}</span>
            <Input
              data-keyboard-scope="text"
              onChange={(event) => onArtworkSearchQueryChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearchCandidates();
              }}
              value={artworkSearchQuery}
            />
          </label>
          <Button disabled={!artworkSearchQuery.trim() || isSearchingArtworkCandidates} onClick={onSearchCandidates} type="button">
            {isSearchingArtworkCandidates ? <LoaderCircle className="spin-icon" /> : <Search />}
            {isSearchingArtworkCandidates ? t("artworkSearch.searching") : t("artworkSearch.search")}
          </Button>
          <Button disabled={!artworkSearchQuery.trim()} onClick={onOpenGoogleSearch} type="button" variant="outline">
            <ExternalLink />
            {t("artworkSearch.google")}
          </Button>
        </div>

        <div className="artwork-candidate-layout">
          <div className="artwork-candidate-results">
            {visibleSearchProgress && hasCandidates ? (
              <ArtworkSearchProgressPanel progress={visibleSearchProgress} t={t} />
            ) : null}
            <div className="artwork-candidate-grid" aria-label={t("artworkSearch.candidates")}>
              {hasCandidates ? (
                artworkCandidates.map((candidate) => {
                  const isSelected = candidate.id === selectedArtworkCandidateId;
                  const thumbnailSrc = candidate.thumbnailPath ?? candidate.previewPath ?? "";
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={isSelected ? "artwork-candidate-card selected" : "artwork-candidate-card"}
                      key={candidate.id}
                      onClick={() => onChooseCandidate(candidate)}
                      type="button"
                    >
                      <span className={matchScoreBadgeClassName(candidate.matchScore)}>
                        {formatMatchScoreBadge(candidate.matchScore)}
                      </span>
                      {thumbnailSrc ? <img alt="" src={thumbnailSrc} /> : <span className="artwork-candidate-thumb-empty"><Disc3 /></span>}
                      <span className="artwork-candidate-kind">{t("artworkSearch.releaseTitle")}</span>
                      <span className="artwork-candidate-title">{localizeLibraryText(candidate.title, t)}</span>
                      <span className="artwork-candidate-meta">
                        {[candidate.artist, candidate.year].filter(Boolean).join(" / ") || t("artworkSearch.unknownSource")}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="artwork-candidate-empty">
                  {visibleSearchProgress ? (
                    <ArtworkSearchProgressPanel progress={visibleSearchProgress} t={t} />
                  ) : (
                    <>
                      <Image />
                      <span>{t("artworkSearch.empty")}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="artwork-candidate-preview">
            <span>{t("artworkSearch.releaseCheck")}</span>
            {isInspectingArtworkRelease ? (
              <div className="artwork-release-empty">
                <LoaderCircle className="spin-icon" />
                <span>{t("artworkSearch.loadingRelease")}</span>
              </div>
            ) : selectedArtworkRelease ? (
              <div className="artwork-release-detail">
                <span className="artwork-release-title-label">{t("artworkSearch.releaseTitle")}</span>
                <strong>{localizeLibraryText(selectedArtworkRelease.title, t)}</strong>
                {selectedCandidate?.matchScore !== undefined ? (
                  <span className="artwork-release-match">
                    {selectedCandidate.matchScore === null
                      ? t("artworkSearch.matchUnavailable")
                      : t("artworkSearch.matchScore", { score: selectedCandidate.matchScore })}
                  </span>
                ) : null}
                <small>
                  {[selectedArtworkRelease.artist, selectedArtworkRelease.year, selectedArtworkRelease.country, selectedArtworkRelease.status]
                    .filter(Boolean)
                    .join(" / ")}
                </small>
                <div className="artwork-release-track-compare">
                  <div>
                    <span>{t("artworkSearch.musicBrainzTracks")}</span>
                    <div className="artwork-release-track-list" aria-label={t("artworkSearch.musicBrainzTracks")}>
                      {selectedArtworkRelease.tracks.length > 0 ? (
                        selectedArtworkRelease.tracks.slice(0, 24).map((track) => (
                          <span key={`mb-${track.position}-${track.title}`}>
                            <b>{track.position}</b>
                            <em>{localizeLibraryText(track.title, t)}</em>
                          </span>
                        ))
                      ) : (
                        <span className="artwork-release-track-empty">{t("artworkSearch.noTracks")}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span>{t("artworkSearch.localTracks")}</span>
                    <div className="artwork-release-track-list" aria-label={t("artworkSearch.localTracks")}>
                      {localTracks.length > 0 ? (
                        localTracks.slice(0, 24).map((track) => (
                          <span key={`local-${track.id}`}>
                            <b>{formatLocalTrackPosition(track)}</b>
                            <em>{localizeLibraryText(track.title, t)}</em>
                          </span>
                        ))
                      ) : (
                        <span className="artwork-release-track-empty">{t("artworkSearch.noTracks")}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  disabled={isPreviewingArtworkCandidate}
                  onClick={onPreviewSelectedArtwork}
                  type="button"
                  variant="outline"
                >
                  {isPreviewingArtworkCandidate ? <LoaderCircle className="spin-icon" /> : <Image />}
                  {isPreviewingArtworkCandidate ? t("artworkSearch.previewing") : t("artworkSearch.previewArtwork")}
                </Button>
              </div>
            ) : (
              <div className="artwork-release-empty">
                <Disc3 />
                <span>{t("artworkSearch.releaseEmpty")}</span>
              </div>
            )}

            <span>{t("artworkSearch.preview")}</span>
            {artworkCandidatePreviewSrc ? (
              <img alt={t("artworkSearch.preview")} src={artworkCandidatePreviewSrc} />
            ) : (
              <div className="artwork-candidate-preview-empty">
                {isPreviewingArtworkCandidate ? <LoaderCircle className="spin-icon" /> : <Image />}
                <span>{isPreviewingArtworkCandidate ? t("artworkSearch.previewing") : t("artworkSearch.previewEmpty")}</span>
              </div>
            )}
            <p>{t("artworkSearch.rightsNotice")}</p>
            {artworkCandidateMessage ? (
              <p className="tag-edit-message" aria-live="polite">
                {t(artworkCandidateMessage.key, artworkCandidateMessage.values)}
              </p>
            ) : null}
            <Button
              className="save-button"
              disabled={!canSaveArtwork || isSavingArtwork}
              onClick={onSaveArtwork}
              type="button"
            >
              <Save />
              {isSavingArtwork ? t("tags.saving") : t("artworkSearch.saveToAlbum")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ArtworkSearchProgressPanel({ progress, t }: { progress: ArtworkSearchProgressView; t: TFunction }) {
  const progressValue = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  return (
    <div className="artwork-candidate-search-progress" aria-live="polite">
      <LoaderCircle className="spin-icon" />
      <strong>{t("artworkSearch.searching")}</strong>
      <span>{t(progress.messageKey)}</span>
      <div
        aria-label={t("artworkSearch.searchProgress")}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progressValue}
        className="artwork-candidate-progress-bar"
        role="progressbar"
      >
        <span style={{ width: `${progressValue}%` }} />
      </div>
    </div>
  );
}

function formatLocalTrackPosition(track: Track) {
  if (track.discNumber && track.trackNumber) return `${track.discNumber}.${track.trackNumber}`;
  if (track.trackNumber) return String(track.trackNumber);
  return "-";
}

function formatMatchScoreBadge(matchScore: number | null | undefined) {
  if (matchScore === undefined) return "...";
  if (matchScore === null) return "-";
  return `${matchScore}%`;
}

function matchScoreBadgeClassName(matchScore: number | null | undefined) {
  if (matchScore === undefined) return "artwork-candidate-score-badge pending";
  if (matchScore === null) return "artwork-candidate-score-badge unavailable";
  if (matchScore >= 85) return "artwork-candidate-score-badge high";
  if (matchScore >= 65) return "artwork-candidate-score-badge medium";
  if (matchScore >= 40) return "artwork-candidate-score-badge low";
  return "artwork-candidate-score-badge poor";
}
