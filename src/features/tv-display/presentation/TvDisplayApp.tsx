import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, ListMusic, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { getInitialLocale, translate } from "../../../i18n";
import type { TvAudioAnalysisFrame, TvQueueState, TvSessionSnapshot } from "../domain/tvDisplayMessage";
import { mockTvSessionSnapshot } from "../infrastructure/mockTvDisplayState";
import type { Album, LibrarySnapshot, Track } from "../../../types/audio";
import { getArtworkSrc } from "../../../lib/libraryUtils";
import { FireTvPlayerVisualizer } from "./FireTvPlayerVisualizer";

type TvDisplayAppProps = {
  snapshot?: TvSessionSnapshot;
};

type FireTvRemoteKeyEvent = CustomEvent<{ key?: string }>;
type FireTvTabEvent = CustomEvent<{ tab?: TvSurfaceTab }>;
type FireTvDiagnosticsEvent = CustomEvent<{ memory?: FireTvMemoryInfo }>;
type TvSurfaceTab = "player" | "albums" | "tracks";
type FocusZone = "controls" | "albums" | "tracks";
type FireTvMemoryInfo = {
  availableMb?: number;
  maxMb: number;
  totalMb: number;
  usedMb: number;
};
type RemoteAnalysisSegment = {
  frameIntervalMs: number;
  frames: Array<{ timecode: number; values: number[] }>;
  isComplete?: boolean;
  trackId: string | number;
};
type RemoteAnalysisBytesSegment = {
  bucketCount: number;
  frameCount: number;
  frameIntervalMs: number;
  isComplete: boolean;
  startTimeMs: number;
  trackId: string;
  values: Uint8Array;
};

const controlCount = 5;
const albumGridColumns = 4;
const visibleAlbumRows = 2;
const visibleAlbumCount = albumGridColumns * visibleAlbumRows;
const visibleTrackCount = 7;

export function TvDisplayApp({ snapshot = mockTvSessionSnapshot }: TvDisplayAppProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAutoplayRef = useRef(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumIndex, setSelectedAlbumIndex] = useState(0);
  const [focusedAlbumIndex, setFocusedAlbumIndex] = useState(0);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [focusedTrackIndex, setFocusedTrackIndex] = useState(0);
  const [focusZone, setFocusZone] = useState<FocusZone>("albums");
  const [focusedControlIndex, setFocusedControlIndex] = useState(2);
  const [activeSurfaceTab, setActiveSurfaceTab] = useState<TvSurfaceTab>(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "albums" || tab === "tracks" ? tab : "player";
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(snapshot.player.durationSeconds);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [analysisFrames, setAnalysisFrames] = useState<TvAudioAnalysisFrame[]>(snapshot.analysis?.frames ?? []);
  const [memoryInfo, setMemoryInfo] = useState<FireTvMemoryInfo | null>(null);
  const currentTimeRef = useRef(currentTime);
  const libraryId = useMemo(() => new URLSearchParams(window.location.search).get("libraryId")?.trim() || null, []);
  const locale = useMemo(() => getInitialLocale(), []);
  const t = useCallback((key: string) => translate(locale, key as never), [locale]);

  const selectedAlbum = albums[selectedAlbumIndex] ?? null;
  const currentTrack = selectedAlbum?.tracks[selectedTrackIndex] ?? null;
  const focusedTrack = selectedAlbum?.tracks[focusedTrackIndex] ?? null;
  const visibleAlbumStartIndex = getWindowStart(focusedAlbumIndex, albums.length, visibleAlbumCount, albumGridColumns);
  const visibleTrackStartIndex = getTrackWindowStart(focusedTrackIndex, selectedAlbum?.tracks.length ?? 0);
  const audioUrl = currentTrack?.filePath ? makeMediaStreamUrl(currentTrack.filePath) : "";
  const player = makePlayerState(selectedAlbum, currentTrack, isPlaying, duration, currentTime, snapshot);
  const queue = selectedAlbum && currentTrack ? makeQueueState(selectedAlbum, currentTrack) : snapshot.queue;
  const effectiveDuration = duration || player.durationSeconds;
  const progress = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const playerArtworkUrl = selectedAlbum ? getArtworkSrc(selectedAlbum) || player.artworkUrl : player.artworkUrl;
  const playerStyle = playerArtworkUrl
    ? ({ "--tv-player-artwork-bg": `url("${playerArtworkUrl.replace(/"/g, '\\"')}")` } as CSSProperties)
    : undefined;
  const previousTrack = getPreviousQueueItem(queue);
  const nextTrack = getNextQueueItem(queue);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    let isActive = true;

    async function loadLibrary() {
      try {
        const librarySnapshot = await fetchJson<LibrarySnapshot>(librarySnapshotPath(libraryId));
        if (!isActive) return;
        const nextAlbums = makeTvCollections(librarySnapshot, t);
        setAlbums(nextAlbums);
        setSelectedAlbumIndex((index) => clampIndex(index, nextAlbums.length));
        setFocusedAlbumIndex((index) => clampIndex(index, nextAlbums.length));
        setLibraryError(null);
      } catch {
        if (!isActive) return;
        setAlbums([]);
        setLibraryError(t("tvDisplay.libraryError"));
      }
    }

    void loadLibrary();
    const timer = window.setInterval(() => void loadLibrary(), 15000);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [libraryId, t]);

  useEffect(() => {
    const trackCount = selectedAlbum?.tracks.length ?? 0;
    setSelectedTrackIndex((index) => clampIndex(index, trackCount));
    setFocusedTrackIndex((index) => clampIndex(index, trackCount));
  }, [selectedAlbum]);

  useEffect(() => {
    setFocusZone(activeSurfaceTab === "player" ? "controls" : activeSurfaceTab);
  }, [activeSurfaceTab]);

  useEffect(() => {
    const handleRemoteKey = (key: string | undefined) => {
      if (key === "ArrowLeft" || key === "ArrowRight") {
        moveHorizontal(key === "ArrowLeft" ? -1 : 1);
      } else if (key === "ArrowUp" || key === "ArrowDown") {
        moveVertical(key === "ArrowUp" ? -1 : 1);
      } else if (key === "Enter" || key === " ") {
        void activateFocusedItem();
      } else if (key === "MediaPlayPause") {
        void togglePlayback();
      } else if (key === "MediaPlay") {
        void playAudio();
      } else if (key === "MediaPause") {
        pauseAudio();
      } else if (key === "MediaTrackPrevious") {
        void playAdjacentTrack(-1);
      } else if (key === "MediaTrackNext") {
        void playAdjacentTrack(1);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => handleRemoteKey(event.key);
    const handleFireTvKey = (event: Event) => handleRemoteKey((event as FireTvRemoteKeyEvent).detail?.key);
    const handleFireTvTab = (event: Event) => {
      const tab = (event as FireTvTabEvent).detail?.tab;
      if (tab === "player" || tab === "albums" || tab === "tracks") setActiveSurfaceTab(tab);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("musical-firetv-key", handleFireTvKey);
    window.addEventListener("musical-firetv-tab", handleFireTvTab);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("musical-firetv-key", handleFireTvKey);
      window.removeEventListener("musical-firetv-tab", handleFireTvTab);
    };
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      void playAdjacentTrack(1);
    };
    const handleError = () => {
      setIsPlaying(false);
      setPlaybackError(t("tvDisplay.audioError"));
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [t, selectedAlbum, selectedTrackIndex]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(currentTrack?.durationSeconds ?? 0);
    setAnalysisFrames([]);
  }, [currentTrack?.id, currentTrack?.durationSeconds]);

  useEffect(() => {
    const trackId = currentTrack?.id;
    if (!trackId) {
      setAnalysisFrames([]);
      return;
    }

    let isActive = true;
    let abortController: AbortController | null = null;
    let isLoadingAnalysis = false;

    const loadAnalysis = async () => {
      if (isLoadingAnalysis) return;
      isLoadingAnalysis = true;
      abortController = new AbortController();
      try {
        const currentPosition = currentTimeRef.current;
        const nextFrames = await fetchAnalysisFrames(String(trackId), Math.max(0, currentPosition - 0.5), 4, duration || currentTrack?.durationSeconds || 1, abortController.signal);
        if (!isActive) return;
        setAnalysisFrames((frames) => mergeAnalysisFrames(frames, nextFrames, currentTimeRef.current));
      } catch {
        if (isActive) setAnalysisFrames((frames) => retainAnalysisWindow(frames, currentTimeRef.current));
      } finally {
        isLoadingAnalysis = false;
      }
    };

    void loadAnalysis();
    const timer = window.setInterval(() => void loadAnalysis(), 2000);
    return () => {
      isActive = false;
      abortController?.abort();
      window.clearInterval(timer);
    };
  }, [currentTrack?.id, currentTrack?.durationSeconds, duration]);

  useEffect(() => {
    const handleDiagnostics = (event: Event) => {
      const memory = (event as FireTvDiagnosticsEvent).detail?.memory;
      if (memory && Number.isFinite(memory.usedMb) && Number.isFinite(memory.totalMb) && Number.isFinite(memory.maxMb)) {
        setMemoryInfo(memory);
      }
    };

    window.addEventListener("musical-firetv-diagnostics", handleDiagnostics);
    return () => window.removeEventListener("musical-firetv-diagnostics", handleDiagnostics);
  }, []);

  useEffect(() => {
    if (!audioUrl || !pendingAutoplayRef.current) return;
    pendingAutoplayRef.current = false;
    void playAudio();
  }, [audioUrl, currentTrack?.id]);

  function moveHorizontal(delta: number) {
    if (activeSurfaceTab === "player") {
      setFocusedControlIndex((index) => clamp(index + delta, 0, controlCount - 1));
    } else if (activeSurfaceTab === "albums") {
      setFocusedAlbumIndex((index) => clamp(index + delta, 0, Math.max(0, albums.length - 1)));
    } else {
      setFocusedTrackIndex((index) => clamp(index + delta, 0, Math.max(0, (selectedAlbum?.tracks.length ?? 1) - 1)));
    }
  }

  function moveVertical(delta: number) {
    if (activeSurfaceTab === "player") return;
    if (activeSurfaceTab === "albums") {
      setFocusedAlbumIndex((index) => clamp(index + delta * albumGridColumns, 0, Math.max(0, albums.length - 1)));
      return;
    }
    setFocusedTrackIndex((index) => clamp(index + delta, 0, Math.max(0, (selectedAlbum?.tracks.length ?? 1) - 1)));
  }

  async function activateFocusedItem() {
    if (activeSurfaceTab === "player") {
      await activateControl(focusedControlIndex);
    } else if (activeSurfaceTab === "albums") {
      await playAlbum(focusedAlbumIndex);
    } else {
      await playTrack(focusedTrackIndex);
    }
  }

  async function activateControl(index: number) {
    if (index === 0) await playAdjacentTrack(-1);
    if (index === 1) seekBy(-15);
    if (index === 2) await togglePlayback();
    if (index === 3) seekBy(15);
    if (index === 4) await playAdjacentTrack(1);
  }

  async function playAlbum(albumIndex: number) {
    const nextAlbum = albums[albumIndex];
    if (!nextAlbum) return;
    setSelectedAlbumIndex(albumIndex);
    setFocusedAlbumIndex(albumIndex);
    setSelectedTrackIndex(0);
    setFocusedTrackIndex(0);
    setPlaybackError(null);
    pendingAutoplayRef.current = true;
    if (String(nextAlbum.tracks[0]?.id) === String(currentTrack?.id)) {
      await playAudio();
    }
  }

  async function playTrack(trackIndex: number) {
    const track = selectedAlbum?.tracks[trackIndex];
    if (!track) return;
    setSelectedTrackIndex(trackIndex);
    setFocusedTrackIndex(trackIndex);
    pendingAutoplayRef.current = true;
    if (String(track.id) === String(currentTrack?.id)) {
      await playAudio();
    }
  }

  async function playAdjacentTrack(delta: number) {
    const trackCount = selectedAlbum?.tracks.length ?? 0;
    if (trackCount === 0) return;
    const nextIndex = (selectedTrackIndex + delta + trackCount) % trackCount;
    await playTrack(nextIndex);
  }

  async function playAudio() {
    const audio = audioRef.current;
    if (!audio || !audioUrl) {
      setPlaybackError(t("tvDisplay.noAudioSource"));
      return;
    }

    try {
      setPlaybackError(null);
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setPlaybackError(t("tvDisplay.audioError"));
    }
  }

  function pauseAudio() {
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  async function togglePlayback() {
    if (isPlaying) {
      pauseAudio();
      return;
    }
    await playAudio();
  }

  function seekBy(deltaSeconds: number) {
    const audio = audioRef.current;
    const nextTime = Math.max(0, Math.min((audio?.currentTime ?? currentTime) + deltaSeconds, effectiveDuration || currentTime));
    setCurrentTime(nextTime);
    if (audio) audio.currentTime = nextTime;
  }

  return (
    <main className={`tv-display-shell tv-display-${activeSurfaceTab}`} style={playerStyle}>
      <audio ref={audioRef} preload="metadata" src={audioUrl || undefined} />
      <div className="tv-display-backdrop" style={{ backgroundImage: playerArtworkUrl ? `url(${playerArtworkUrl})` : undefined }} />
      <section className="tv-now-playing tv-player-surface" aria-label={t("tvDisplay.nowPlaying")}>
        <FireTvPlayerVisualizer
          frames={analysisFrames}
          isPlaying={isPlaying}
          playbackTimeSeconds={currentTime}
          trackId={player.trackId}
        />
        <div className="tv-artwork-frame">
          {playerArtworkUrl ? <img src={playerArtworkUrl} alt="" /> : <div className="tv-artwork-fallback" />}
        </div>
        <div className="tv-track-copy">
          <p className="tv-kicker">{isPlaying ? t("tvDisplay.playingOnTv") : t("tvDisplay.readyOnTv")}</p>
          <h1 title={player.title}>
            <span className="tv-title-marquee">{player.title}</span>
          </h1>
          <p className="tv-artist">{player.artist}</p>
          <p className="tv-album">{player.album}</p>
          <div className="tv-progress" aria-label={t("tvDisplay.progress")}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="tv-player-times">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(effectiveDuration)}</span>
          </div>
          <div className={focusZone === "controls" ? "tv-transport-controls is-zone-focused" : "tv-transport-controls"} aria-label={t("tvDisplay.transport")}>
            <button className={focusedControlIndex === 0 && focusZone === "controls" ? "is-focused" : ""} type="button" onClick={() => void playAdjacentTrack(-1)}>
              <StepBack aria-hidden="true" size={24} />
              <span>{t("player.previous")}</span>
            </button>
            <button className={focusedControlIndex === 1 && focusZone === "controls" ? "is-focused" : ""} type="button" onClick={() => seekBy(-15)}>
              <SkipBack aria-hidden="true" size={24} />
              <span>{t("tvDisplay.rewind")}</span>
            </button>
            <button className={focusedControlIndex === 2 && focusZone === "controls" ? "tv-play-control is-focused" : "tv-play-control"} type="button" onClick={() => void togglePlayback()}>
              {isPlaying ? <Pause aria-hidden="true" size={32} /> : <Play aria-hidden="true" size={32} />}
              <span>{isPlaying ? t("tvDisplay.pause") : t("tvDisplay.play")}</span>
            </button>
            <button className={focusedControlIndex === 3 && focusZone === "controls" ? "is-focused" : ""} type="button" onClick={() => seekBy(15)}>
              <SkipForward aria-hidden="true" size={24} />
              <span>{t("tvDisplay.forward")}</span>
            </button>
            <button className={focusedControlIndex === 4 && focusZone === "controls" ? "is-focused" : ""} type="button" onClick={() => void playAdjacentTrack(1)}>
              <StepForward aria-hidden="true" size={24} />
              <span>{t("player.next")}</span>
            </button>
          </div>
          {playbackError || libraryError || !audioUrl ? (
            <p className="tv-player-status is-error">{playbackError ?? libraryError ?? t("tvDisplay.noAudioSource")}</p>
          ) : null}
          <div className="tv-adjacent-tracks" aria-label={t("tvDisplay.queue")}>
            <button type="button" onClick={() => void playAdjacentTrack(-1)}>
              <StepBack aria-hidden="true" size={24} />
              <span>{t("player.previous")}</span>
              <strong>{previousTrack?.title ?? t("data.unknownTrack")}</strong>
            </button>
            <button type="button" onClick={() => void playAdjacentTrack(1)}>
              <StepForward aria-hidden="true" size={24} />
              <span>{t("player.next")}</span>
              <strong>{nextTrack?.title ?? t("data.unknownTrack")}</strong>
            </button>
          </div>
        </div>
        {memoryInfo ? (
          <div className="tv-memory-diagnostics" aria-label={t("tvDisplay.memoryUsage")}>
            <span>{t("tvDisplay.memoryUsage")}</span>
            <strong>
              {memoryInfo.usedMb}/{memoryInfo.maxMb} MB
            </strong>
          </div>
        ) : null}
      </section>

      {activeSurfaceTab === "albums" ? (
        <section className="tv-tab-content tv-albums-view">
          <div className="tv-panel tv-album-browser is-zone-focused" aria-label={t("tvDisplay.albums")}>
          <div className="tv-panel-heading">
            <h2>{t("tvDisplay.albums")}</h2>
            <small>{albums.length > 0 ? t("albums.count").replace("{count}", String(albums.length)) : t("status.noLibraryScanned")}</small>
          </div>
          {albums[focusedAlbumIndex] ? (
            <p className="tv-focused-album-title">
              {albums[focusedAlbumIndex].title} / {albums[focusedAlbumIndex].artist}
            </p>
          ) : null}
          <div className="tv-album-rail">
            {albums.slice(visibleAlbumStartIndex, visibleAlbumStartIndex + visibleAlbumCount).map((album, index) => {
              const albumIndex = visibleAlbumStartIndex + index;
              const isFocused = focusZone === "albums" && albumIndex === focusedAlbumIndex;
              const isSelected = albumIndex === selectedAlbumIndex;
              return (
                <button
                  className={`${isFocused ? "is-focused " : ""}${isSelected ? "is-selected" : ""}`}
                  key={album.id}
                  type="button"
                  onClick={() => void playAlbum(albumIndex)}
                >
                  <span className="tv-album-cover">
                    {getArtworkSrc(album) ? <img src={getArtworkSrc(album)} alt="" /> : <ListMusic aria-hidden="true" size={34} />}
                    <span className="tv-album-cover-title">{album.title}</span>
                  </span>
                  <span className="tv-album-title">{album.title}</span>
                  <small className="tv-album-artist">{album.artist}</small>
                </button>
              );
            })}
          </div>
          </div>
        </section>
      ) : null}

      {activeSurfaceTab === "tracks" ? (
        <section className="tv-tab-content tv-tracks-view">
          <div className="tv-panel tv-queue-panel tv-track-browser is-zone-focused" aria-label={t("tvDisplay.tracks")}>
          <div className="tv-panel-heading">
            <h2>{t("tvDisplay.tracks")}</h2>
            <small>{selectedAlbum ? selectedAlbum.title : t("data.unknownAlbum")}</small>
          </div>
          <ol>
            {selectedAlbum?.tracks.slice(visibleTrackStartIndex, visibleTrackStartIndex + visibleTrackCount).map((track, index) => {
              const trackIndex = visibleTrackStartIndex + index;
              const isFocused = focusZone === "tracks" && trackIndex === focusedTrackIndex;
              const isCurrent = String(track.id) === String(currentTrack?.id);
              return (
                <li className={`${isCurrent ? "is-current " : ""}${isFocused ? "is-focused" : ""}`} key={track.id}>
                  <button type="button" onClick={() => void playTrack(trackIndex)}>
                    <span className="tv-track-lyrics-indicator">
                      {trackHasLyrics(track) ? <FileText aria-hidden="true" size={22} /> : null}
                    </span>
                    <span className="tv-track-row-copy">
                      <span>{track.title}</span>
                      <small>{track.artist}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {focusedTrack ? <p className="tv-next-track">{t("tvDisplay.selectedTrack")}: {focusedTrack.title}</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

async function fetchAnalysisFrames(
  trackId: string,
  from: number,
  duration: number,
  totalDuration: number,
  signal: AbortSignal,
) {
  try {
    return segmentBytesToAnalysisFrames(
      await fetchAnalysisBytesSegment(trackId, from, duration, totalDuration, signal),
    );
  } catch {
    return segmentToAnalysisFrames(
      await fetchAnalysisSegment(trackId, from, duration, totalDuration, signal),
    );
  }
}

async function fetchAnalysisBytesSegment(
  trackId: string,
  from: number,
  duration: number,
  totalDuration: number,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({
    compact: "true",
    duration: String(duration),
    from: String(from),
    totalDuration: String(totalDuration),
    trackId,
  });
  const response = await fetch(`/api/track_analysis_bytes?${query.toString()}`, { signal });
  if (!response.ok) throw new Error(await response.text());
  const values = new Uint8Array(await response.arrayBuffer());
  const segment = {
    bucketCount: parsePositiveIntegerHeader(response, "X-Musical-Bucket-Count"),
    frameCount: parseNonNegativeIntegerHeader(response, "X-Musical-Frame-Count"),
    frameIntervalMs: parseFiniteNumberHeader(response, "X-Musical-Frame-Interval-Ms"),
    isComplete: response.headers.get("X-Musical-Is-Complete") === "true",
    startTimeMs: parseFiniteNumberHeader(response, "X-Musical-Start-Time-Ms"),
    trackId: parseTrackIdHeader(response) ?? trackId,
    values,
  } satisfies RemoteAnalysisBytesSegment;
  if (segment.values.length !== segment.bucketCount * segment.frameCount) {
    throw new Error("invalid analysis byte length");
  }
  if (String(segment.trackId) !== String(trackId)) {
    throw new Error("stale analysis response");
  }
  return segment;
}

async function fetchAnalysisSegment(
  trackId: string,
  from: number,
  duration: number,
  totalDuration: number,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({
    compact: "true",
    duration: String(duration),
    from: String(from),
    totalDuration: String(totalDuration),
    trackId,
  });
  return fetchJson<RemoteAnalysisSegment>(`/api/track_analysis?${query.toString()}`, signal);
}

async function fetchJson<T>(path: string, signal?: AbortSignal) {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function segmentToAnalysisFrames(segment: RemoteAnalysisSegment): TvAudioAnalysisFrame[] {
  return segment.frames
    .map((frame) => ({
      bands: frame.values.map((value) => clamp(value / 255, 0, 1)),
      peak: Math.max(0, ...frame.values) / 255,
      rms: rootMeanSquare(frame.values),
      timeMs: Math.round(frame.timecode * 1000),
    }))
    .sort((first, second) => first.timeMs - second.timeMs);
}

function segmentBytesToAnalysisFrames(segment: RemoteAnalysisBytesSegment): TvAudioAnalysisFrame[] {
  const frames: TvAudioAnalysisFrame[] = [];
  for (let frameIndex = 0; frameIndex < segment.frameCount; frameIndex += 1) {
    const offset = frameIndex * segment.bucketCount;
    const values = segment.values.subarray(offset, offset + segment.bucketCount);
    frames.push({
      bands: Array.from(values, (value) => clamp(value / 255, 0, 1)),
      peak: maxByte(values) / 255,
      rms: rootMeanSquareBytes(values),
      timeMs: Math.round(segment.startTimeMs + frameIndex * segment.frameIntervalMs),
    });
  }
  return frames;
}

function parseFiniteNumberHeader(response: Response, name: string) {
  const value = Number(response.headers.get(name));
  if (!Number.isFinite(value)) throw new Error(`missing ${name}`);
  return value;
}

function parsePositiveIntegerHeader(response: Response, name: string) {
  const value = parseNonNegativeIntegerHeader(response, name);
  if (value <= 0) throw new Error(`invalid ${name}`);
  return value;
}

function parseNonNegativeIntegerHeader(response: Response, name: string) {
  const value = Number(response.headers.get(name));
  if (!Number.isInteger(value) || value < 0) throw new Error(`missing ${name}`);
  return value;
}

function parseTrackIdHeader(response: Response) {
  const value = response.headers.get("X-Musical-Track-Id");
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function maxByte(values: Uint8Array) {
  let max = 0;
  for (const value of values) {
    if (value > max) max = value;
  }
  return max;
}

function mergeAnalysisFrames(
  currentFrames: TvAudioAnalysisFrame[],
  nextFrames: TvAudioAnalysisFrame[],
  currentTimeSeconds: number,
) {
  const framesByTime = new Map<number, TvAudioAnalysisFrame>();
  for (const frame of currentFrames) framesByTime.set(frame.timeMs, frame);
  for (const frame of nextFrames) framesByTime.set(frame.timeMs, frame);
  return retainAnalysisWindow(
    Array.from(framesByTime.values()).sort((first, second) => first.timeMs - second.timeMs),
    currentTimeSeconds,
  );
}

function retainAnalysisWindow(frames: TvAudioAnalysisFrame[], currentTimeSeconds: number) {
  const currentTimeMs = currentTimeSeconds * 1000;
  const minTimeMs = Math.max(0, currentTimeMs - 1500);
  const maxTimeMs = currentTimeMs + 4500;
  return frames.filter((frame) => frame.timeMs >= minTimeMs && frame.timeMs <= maxTimeMs);
}

function rootMeanSquare(values: number[]) {
  if (values.length === 0) return 0;
  const sum = values.reduce((total, value) => total + (value / 255) ** 2, 0);
  return Math.sqrt(sum / values.length);
}

function rootMeanSquareBytes(values: Uint8Array) {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) {
    sum += (value / 255) ** 2;
  }
  return Math.sqrt(sum / values.length);
}

function librarySnapshotPath(libraryId: string | null) {
  if (!libraryId) return "/api/library_snapshot";
  const query = new URLSearchParams({ libraryId });
  return `/api/library_snapshot?${query.toString()}`;
}

function makeTvCollections(snapshot: LibrarySnapshot, t: (key: string) => string): Album[] {
  const albums = snapshot.albums.filter((album) => album.tracks.length > 0);
  const playlistAlbums = snapshot.playlists
    .filter((playlist) => playlist.tracks.length > 0)
    .map((playlist) => ({
      id: `playlist:${playlist.id}`,
      groupKey: `playlist:${playlist.id}`,
      title: playlist.name,
      artist: t("view.playlists"),
      year: null,
      yearLabel: null,
      genre: null,
      artworkPath: playlist.artworkPath ?? null,
      tracks: playlist.tracks,
    }));
  return [...playlistAlbums, ...albums];
}

function makePlayerState(
  album: Album | null,
  track: Track | null,
  isPlaying: boolean,
  duration: number,
  positionSeconds: number,
  fallbackSnapshot: TvSessionSnapshot,
) {
  if (!album || !track) return fallbackSnapshot.player;

  return {
    trackId: String(track.id),
    title: track.title,
    artist: track.artist,
    album: album.title,
    artworkUrl: getArtworkSrc(album),
    audioUrl: track.filePath ? makeMediaStreamUrl(track.filePath) : undefined,
    isPlaying,
    durationSeconds: duration || track.durationSeconds || 0,
    positionSeconds,
    updatedAt: new Date().toISOString(),
  };
}

function makeQueueState(album: Album, currentTrack: Track): TvQueueState {
  return {
    currentTrackId: String(currentTrack.id),
    items: album.tracks.map((track) => ({
      trackId: String(track.id),
      title: track.title,
      artist: track.artist,
      album: album.title,
      artworkUrl: getArtworkSrc(album),
      isCurrent: String(track.id) === String(currentTrack.id),
    })),
  };
}

function makeMediaStreamUrl(filePath: string) {
  const query = new URLSearchParams({ path: filePath });
  return `${window.location.origin}/api/media?${query.toString()}`;
}

function getNextQueueItem(queue: TvQueueState | undefined) {
  if (!queue) return null;
  const currentIndex = queue.items.findIndex((item) => item.isCurrent);
  return queue.items[currentIndex + 1] ?? queue.items[0] ?? null;
}

function getPreviousQueueItem(queue: TvQueueState | undefined) {
  if (!queue) return null;
  const currentIndex = queue.items.findIndex((item) => item.isCurrent);
  if (currentIndex < 0) return queue.items[0] ?? null;
  return queue.items[currentIndex - 1] ?? queue.items[queue.items.length - 1] ?? null;
}

function trackHasLyrics(track: Track) {
  return Boolean(track.hasLyrics || track.lyrics?.trim());
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return clamp(index, 0, length - 1);
}

function getWindowStart(focusedIndex: number, length: number, visibleCount: number, step: number) {
  if (length <= visibleCount) return 0;
  const alignedStart = Math.floor(Math.max(0, focusedIndex) / step) * step;
  return clamp(alignedStart, 0, length - visibleCount);
}

function getTrackWindowStart(focusedIndex: number, length: number) {
  if (length <= visibleTrackCount) return 0;
  return clamp(focusedIndex - 1, 0, length - visibleTrackCount);
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
