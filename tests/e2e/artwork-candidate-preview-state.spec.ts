import { expect, test } from "@playwright/test";
import {
  getArtworkCandidateSelectionPreview,
  hydrateArtworkCandidatePreview,
} from "../../src/lib/artworkCandidatePreviewState";
import type { ArtworkCandidate } from "../../src/lib/artworkSearch";

const toMediaSrc = (path: string) => `media://${path}`;

function makeCandidate(overrides: Partial<ArtworkCandidate> = {}): ArtworkCandidate {
  return {
    id: "release-1",
    releaseId: "release-1",
    source: "cover-art-archive",
    title: "Example Album",
    artist: "Example Artist",
    year: "2024",
    thumbnailPath: null,
    thumbnailRawPath: null,
    previewPath: null,
    previewRawPath: null,
    imageUrl: null,
    pageUrl: null,
    width: null,
    height: null,
    matchScore: null,
    ...overrides,
  };
}

test("hydrates candidate display URLs while preserving raw local paths for saving", () => {
  const hydrated = hydrateArtworkCandidatePreview(
    makeCandidate({
      thumbnailPath: "/tmp/musical/thumb.jpg",
      previewPath: "/tmp/musical/front.jpg",
    }),
    { cachedPreviewPath: null, toMediaSrc },
  );

  expect(hydrated.thumbnailRawPath).toBe("/tmp/musical/thumb.jpg");
  expect(hydrated.previewRawPath).toBe("/tmp/musical/front.jpg");
  expect(hydrated.thumbnailPath).toBe("media:///tmp/musical/thumb.jpg");
  expect(hydrated.previewPath).toBe("media:///tmp/musical/front.jpg");
});

test("selecting a thumbnail-backed candidate exposes a saveable raw path", () => {
  const hydrated = hydrateArtworkCandidatePreview(
    makeCandidate({
      thumbnailPath: "/tmp/musical/thumb.jpg",
    }),
    { cachedPreviewPath: null, toMediaSrc },
  );

  const preview = getArtworkCandidateSelectionPreview(hydrated, null, toMediaSrc);

  expect(preview.rawPath).toBe("/tmp/musical/thumb.jpg");
  expect(preview.previewSrc).toBe("media:///tmp/musical/thumb.jpg");
  expect(preview.candidatePatch).toEqual({
    previewPath: "media:///tmp/musical/thumb.jpg",
    previewRawPath: "/tmp/musical/thumb.jpg",
  });
});

test("selecting a candidate prefers the cached full preview over thumbnail artwork", () => {
  const hydrated = hydrateArtworkCandidatePreview(
    makeCandidate({
      thumbnailPath: "/tmp/musical/thumb.jpg",
      previewPath: "/tmp/musical/old-front.jpg",
    }),
    { cachedPreviewPath: "/tmp/musical/cached-front.jpg", toMediaSrc },
  );

  const preview = getArtworkCandidateSelectionPreview(hydrated, "/tmp/musical/cached-front.jpg", toMediaSrc);

  expect(hydrated.thumbnailRawPath).toBe("/tmp/musical/thumb.jpg");
  expect(hydrated.previewRawPath).toBe("/tmp/musical/cached-front.jpg");
  expect(hydrated.previewPath).toBe("media:///tmp/musical/cached-front.jpg");
  expect(preview.rawPath).toBe("/tmp/musical/cached-front.jpg");
  expect(preview.previewSrc).toBe("media:///tmp/musical/cached-front.jpg");
});
