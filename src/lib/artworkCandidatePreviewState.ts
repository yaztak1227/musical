import type { ArtworkCandidate } from "./artworkSearch";

export type ArtworkMediaSrcResolver = (path: string) => string;

export type ArtworkCandidateSelectionPreview = {
  rawPath: string;
  previewSrc: string;
  candidatePatch: Pick<ArtworkCandidate, "previewPath" | "previewRawPath"> | null;
};

export function hydrateArtworkCandidatePreview(
  candidate: ArtworkCandidate,
  options: { cachedPreviewPath?: string | null; toMediaSrc: ArtworkMediaSrcResolver },
): ArtworkCandidate {
  const thumbnailRawPath = candidate.thumbnailRawPath ?? candidate.thumbnailPath ?? null;
  const previewRawPath = options.cachedPreviewPath ?? candidate.previewRawPath ?? candidate.previewPath ?? null;

  return {
    ...candidate,
    thumbnailRawPath,
    previewRawPath,
    thumbnailPath: thumbnailRawPath ? options.toMediaSrc(thumbnailRawPath) : null,
    previewPath: previewRawPath ? options.toMediaSrc(previewRawPath) : null,
  };
}

export function getArtworkCandidateSelectionPreview(
  candidate: ArtworkCandidate,
  cachedPreviewPath: string | null | undefined,
  toMediaSrc: ArtworkMediaSrcResolver,
): ArtworkCandidateSelectionPreview {
  const rawPath = cachedPreviewPath ?? candidate.previewRawPath ?? candidate.thumbnailRawPath ?? "";
  const previewSrc = cachedPreviewPath ? toMediaSrc(cachedPreviewPath) : candidate.previewPath ?? candidate.thumbnailPath ?? "";

  return {
    rawPath,
    previewSrc,
    candidatePatch: rawPath
      ? {
          previewPath: previewSrc,
          previewRawPath: rawPath,
        }
      : null,
  };
}
