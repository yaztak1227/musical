import type { TranslationKey } from "@/i18n";
import type { Album, EntityId, Track } from "@/types/audio";

const releaseInspectCachePrefix = "musical.artwork.releaseInspect.";
const releaseInspectCacheVersion = 1;
const releasePreviewCachePrefix = "musical.artwork.releasePreview.";
const releasePreviewCacheVersion = 1;

export type ArtworkCandidateSource = "cover-art-archive" | "manual-url" | "local-file";

export type ArtworkCandidate = {
  id: string;
  releaseId?: string | null;
  source: ArtworkCandidateSource;
  title: string;
  artist?: string | null;
  year?: string | null;
  thumbnailPath?: string | null;
  thumbnailRawPath?: string | null;
  previewPath?: string | null;
  previewRawPath?: string | null;
  imageUrl?: string | null;
  pageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  matchScore?: number | null;
};

export type ArtworkCandidateSearchResult = {
  candidates: ArtworkCandidate[];
};

export type ArtworkSearchProgress = {
  requestId?: number | null;
  status: string;
  messageKey: TranslationKey;
  completed: number;
  total: number;
};

export type ArtworkSearchProgressView = {
  messageKey: TranslationKey;
  completed: number;
  total: number;
};

export type ArtworkCandidatePreviewResult = {
  previewPath: string;
};

export type ArtworkReleaseInspectResult = {
  releaseId: string;
  title: string;
  artist?: string | null;
  year?: string | null;
  country?: string | null;
  status?: string | null;
  pageUrl: string;
  tracks: ArtworkReleaseTrack[];
};

export type ArtworkReleaseTrack = {
  position: string;
  title: string;
  lengthSeconds?: number | null;
};

export type AlbumArtworkUpdateResult = {
  albumId: EntityId;
  artworkPath: string;
  updatedFiles: number;
  failedFiles: Array<{ filePath: string; reason: string }>;
};

export function buildArtworkSearchQuery(albumTitle: string, albumArtist: string, trackArtist?: string) {
  return [albumTitle, albumArtist || trackArtist, "album cover"]
    .filter((part) => part && part.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildGoogleImagesUrl(query: string) {
  const params = new URLSearchParams({ q: query, tbm: "isch" });
  return `https://www.google.com/search?${params.toString()}`;
}

export function readCachedArtworkRelease(releaseId: string) {
  if (typeof window === "undefined") return null;
  try {
    const rawValue = window.localStorage.getItem(`${releaseInspectCachePrefix}${releaseId}`);
    if (!rawValue) return null;
    const cached = JSON.parse(rawValue) as { version?: number; release?: ArtworkReleaseInspectResult };
    if (cached.version !== releaseInspectCacheVersion || cached.release?.releaseId !== releaseId) return null;
    return cached.release;
  } catch {
    return null;
  }
}

export function writeCachedArtworkRelease(release: ArtworkReleaseInspectResult) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${releaseInspectCachePrefix}${release.releaseId}`,
      JSON.stringify({ version: releaseInspectCacheVersion, release }),
    );
  } catch {
    // LocalStorage may be full or unavailable; cache misses should not block artwork search.
  }
}

export function readCachedArtworkPreviewPath(releaseId: string) {
  if (typeof window === "undefined") return null;
  try {
    const rawValue = window.localStorage.getItem(`${releasePreviewCachePrefix}${releaseId}`);
    if (!rawValue) return null;
    const cached = JSON.parse(rawValue) as { version?: number; releaseId?: string; previewPath?: string };
    if (cached.version !== releasePreviewCacheVersion || cached.releaseId !== releaseId || !cached.previewPath) return null;
    return cached.previewPath;
  } catch {
    return null;
  }
}

export function writeCachedArtworkPreviewPath(releaseId: string, previewPath: string) {
  if (typeof window === "undefined" || !releaseId || !previewPath) return;
  try {
    window.localStorage.setItem(
      `${releasePreviewCachePrefix}${releaseId}`,
      JSON.stringify({ version: releasePreviewCacheVersion, releaseId, previewPath }),
    );
  } catch {
    // Preview cache is an optimization; failing to store it should not block artwork search.
  }
}

export function computeArtworkReleaseMatchScore(album: Album, release: ArtworkReleaseInspectResult) {
  const titleScore = textSimilarity(album.title, release.title);
  const artistScore = textSimilarity(album.artist, release.artist ?? "");
  const countScore = countSimilarity(album.tracks.length, release.tracks.length);
  const trackScore = trackListSimilarity(album.tracks, release.tracks);

  if (trackScore === null) {
    const fallbackScore = titleScore * 0.72 + artistScore * 0.18;
    const countBoost = Math.min(countScore * 0.1, Math.max(titleScore, artistScore) * 0.1);
    return Math.round((fallbackScore + countBoost) * 100);
  }

  return Math.round((trackScore * 0.6 + titleScore * 0.18 + artistScore * 0.08 + countScore * 0.14) * 100);
}

function trackListSimilarity(localTracks: Track[], releaseTracks: ArtworkReleaseTrack[]): number | null {
  const localTitles = meaningfulTrackTitles(localTracks.map((track) => track.title));
  const releaseTitles = meaningfulTrackTitles(releaseTracks.map((track) => track.title));
  if (localTitles.length < 2 || releaseTitles.length < 2) return null;

  const unorderedScore = unorderedTrackSimilarity(localTitles, releaseTitles);
  const orderedScore = orderedTrackSimilarity(localTitles, releaseTitles);
  return unorderedScore * 0.8 + orderedScore * 0.2;
}

function meaningfulTrackTitles(titles: string[]) {
  return titles.map(normalizeText).filter(isMeaningfulTrackTitle);
}

function unorderedTrackSimilarity(leftTitles: string[], rightTitles: string[]) {
  const pairs: Array<{ leftIndex: number; rightIndex: number; score: number }> = [];
  for (let leftIndex = 0; leftIndex < leftTitles.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < rightTitles.length; rightIndex += 1) {
      const score = textSimilarity(leftTitles[leftIndex] ?? "", rightTitles[rightIndex] ?? "");
      if (score >= 0.34) pairs.push({ leftIndex, rightIndex, score });
    }
  }

  pairs.sort((left, right) => right.score - left.score);
  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  let total = 0;
  for (const pair of pairs) {
    if (usedLeft.has(pair.leftIndex) || usedRight.has(pair.rightIndex)) continue;
    usedLeft.add(pair.leftIndex);
    usedRight.add(pair.rightIndex);
    total += pair.score;
  }
  return total / Math.max(leftTitles.length, rightTitles.length);
}

function orderedTrackSimilarity(leftTitles: string[], rightTitles: string[]) {
  const comparableCount = Math.min(leftTitles.length, rightTitles.length);
  let total = 0;
  for (let index = 0; index < comparableCount; index += 1) {
    total += textSimilarity(leftTitles[index] ?? "", rightTitles[index] ?? "");
  }
  return total / Math.max(leftTitles.length, rightTitles.length);
}

function countSimilarity(left: number, right: number) {
  if (left === 0 && right === 0) return 1;
  if (left === 0 || right === 0) return 0;
  return Math.min(left, right) / Math.max(left, right);
}

function textSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (normalizedLeft && normalizedLeft === normalizedRight) return 1;
  const leftVector = textFeatureVector(normalizedLeft);
  const rightVector = textFeatureVector(normalizedRight);
  return cosineSimilarity(leftVector, rightVector);
}

function textFeatureVector(value: string) {
  const compact = value.replace(/\s+/g, "");
  const features = new Map<string, number>();
  for (const word of value.split(" ")) {
    if (word) incrementFeature(features, `word:${word}`, 2.6);
  }

  if (!compact) return features;

  incrementFeature(features, `full:${compact}`, 1.4);
  if (compact.length === 1) {
    incrementFeature(features, `char:${compact}`, 1);
    return features;
  }

  for (let index = 0; index < compact.length - 1; index += 1) {
    incrementFeature(features, `bi:${compact.slice(index, index + 2)}`, 1);
  }
  for (let index = 0; index < compact.length - 2; index += 1) {
    incrementFeature(features, `tri:${compact.slice(index, index + 3)}`, 1.2);
  }

  return features;
}

function incrementFeature(features: Map<string, number>, key: string, weight: number) {
  features.set(key, (features.get(key) ?? 0) + weight);
}

function cosineSimilarity(leftVector: Map<string, number>, rightVector: Map<string, number>) {
  if (leftVector.size === 0 && rightVector.size === 0) return 1;
  if (leftVector.size === 0 || rightVector.size === 0) return 0;

  let dot = 0;
  for (const [key, leftWeight] of leftVector) {
    dot += leftWeight * (rightVector.get(key) ?? 0);
  }

  const leftMagnitude = vectorMagnitude(leftVector);
  const rightMagnitude = vectorMagnitude(rightVector);
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (leftMagnitude * rightMagnitude);
}

function vectorMagnitude(vector: Map<string, number>) {
  let sum = 0;
  for (const weight of vector.values()) {
    sum += weight * weight;
  }
  return Math.sqrt(sum);
}

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\b(?:disc|disk|cd)\s*\d+\b/g, " ")
    .replace(/\b(?:track|trk)\s*\d+\b/g, " ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfulTrackTitle(value: string) {
  if (!value || value.length < 2) return false;
  if (/^\d+$/.test(value)) return false;
  if (/^(?:untitled|untitle|unknown|unknown track|no title|audio track|track|trk|名称未設定|無題|不明な曲)(?:\s*\d+)?$/i.test(value)) {
    return false;
  }
  return true;
}
