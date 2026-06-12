import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListMusic, Pause, Play, SkipBack, SkipForward, StepBack, StepForward, Volume2, VolumeX } from "lucide-react";
import { getInitialLocale, translate } from "../../../i18n";
import type { TvQueueState, TvSessionSnapshot } from "../domain/tvDisplayMessage";
import { mockTvSessionSnapshot } from "../infrastructure/mockTvDisplayState";
import type { Album, LibrarySnapshot, Track } from "../../../types/audio";

type TvDisplayAppProps = {
  snapshot?: TvSessionSnapshot;
};

type FireTvRemoteKeyEvent = CustomEvent<{ key?: string }>;
type FocusZone = "controls" | "albums" | "tracks";

const controlCount = 7;

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(snapshot.player.durationSeconds);
  const [volume, setVolume] = useState(0.85);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const locale = useMemo(() => getInitialLocale(), []);
  const t = useCallback((key: string) => translate(locale, key as never), [locale]);

  const selectedAlbum = albums[selectedAlbumIndex] ?? null;
  const currentTrack = selectedAlbum?.tracks[selectedTrackIndex] ?? null;
  const focusedTrack = selectedAlbum?.tracks[focusedTrackIndex] ?? null;
  const audioUrl = currentTrack?.filePath ? makeMediaStreamUrl(currentTrack.filePath) : "";
  const player = makePlayerState(selectedAlbum, currentTrack, isPlaying, duration, currentTime, snapshot);
  const lyrics = currentTrack ? makeLyricsState(currentTrack, snapshot) : snapshot.lyrics;
  const queue = selectedAlbum && currentTrack ? makeQueueState(selectedAlbum, currentTrack) : snapshot.queue;
  const nextTrack = getNextQueueItem(queue);
  const effectiveDuration = duration || player.durationSeconds;
  const progress = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const activeLyricIndex = lyrics?.lines.findIndex((line) => line.id === lyrics.activeLineId) ?? -1;
  const playerStyle = player.artworkUrl
    ? ({ "--tv-player-artwork-bg": `url("${player.artworkUrl.replace(/"/g, '\\"')}")` } as CSSProperties)
    : undefined;

  useEffect(() => {
    let isActive = true;

    async function loadLibrary() {
      try {
        const librarySnapshot = await fetchJson<LibrarySnapshot>("/api/library_snapshot");
        if (!isActive) return;
        const nextAlbums = librarySnapshot.albums.filter((album) => album.tracks.length > 0);
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
  }, [t]);

  useEffect(() => {
    const trackCount = selectedAlbum?.tracks.length ?? 0;
    setSelectedTrackIndex((index) => clampIndex(index, trackCount));
    setFocusedTrackIndex((index) => clampIndex(index, trackCount));
  }, [selectedAlbum]);

  useEffect(() => {
    const handleRemoteKey = (key: string | undefined) => {
      if (key === "ArrowLeft") {
        moveHorizontal(-1);
      } else if (key === "ArrowRight") {
        moveHorizontal(1);
      } else if (key === "ArrowUp") {
        moveVertical(-1);
      } else if (key === "ArrowDown") {
        moveVertical(1);
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

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("musical-firetv-key", handleFireTvKey);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("musical-firetv-key", handleFireTvKey);
    };
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

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
  }, [currentTrack?.id, currentTrack?.durationSeconds]);

  useEffect(() => {
    if (!audioUrl || !pendingAutoplayRef.current) return;
    pendingAutoplayRef.current = false;
    void playAudio();
  }, [audioUrl, currentTrack?.id]);

  function moveHorizontal(delta: number) {
    if (focusZone === "controls") {
      setFocusedControlIndex((index) => clamp(index + delta, 0, controlCount - 1));
    } else if (focusZone === "albums") {
      setFocusedAlbumIndex((index) => clamp(index + delta, 0, Math.max(0, albums.length - 1)));
    } else {
      setFocusedTrackIndex((index) => clamp(index + delta, 0, Math.max(0, (selectedAlbum?.tracks.length ?? 1) - 1)));
    }
  }

  function moveVertical(delta: number) {
    const zones: FocusZone[] = ["controls", "albums", "tracks"];
    const currentIndex = zones.indexOf(focusZone);
    setFocusZone(zones[clamp(currentIndex + delta, 0, zones.length - 1)]);
  }

  async function activateFocusedItem() {
    if (focusZone === "controls") {
      await activateControl(focusedControlIndex);
    } else if (focusZone === "albums") {
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
    if (index === 5) changeVolume(-0.1);
    if (index === 6) changeVolume(0.1);
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

  function changeVolume(delta: number) {
    setVolume((currentVolume) => Math.max(0, Math.min(1, currentVolume + delta)));
  }

  return (
    <main className="tv-display-shell" style={playerStyle}>
      <audio ref={audioRef} preload="metadata" src={audioUrl || undefined} />
      <div className="tv-display-backdrop" style={{ backgroundImage: player.artworkUrl ? `url(${player.artworkUrl})` : undefined }} />
      <section className="tv-now-playing tv-player-surface" aria-label={t("tvDisplay.nowPlaying")}>
        <div className="tv-artwork-frame">
          {player.artworkUrl ? <img src={player.artworkUrl} alt="" /> : <div className="tv-artwork-fallback" />}
        </div>
        <div className="tv-track-copy">
          <p className="tv-kicker">{isPlaying ? t("tvDisplay.playingOnTv") : t("tvDisplay.readyOnTv")}</p>
          <h1>{player.title}</h1>
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
            <button className={focusedControlIndex === 5 && focusZone === "controls" ? "is-focused" : ""} type="button" onClick={() => changeVolume(-0.1)}>
              <VolumeX aria-hidden="true" size={24} />
              <span>{t("tvDisplay.volumeDown")}</span>
            </button>
            <button className={focusedControlIndex === 6 && focusZone === "controls" ? "is-focused" : ""} type="button" onClick={() => changeVolume(0.1)}>
              <Volume2 aria-hidden="true" size={24} />
              <span>{Math.round(volume * 100)}%</span>
            </button>
          </div>
          <p className={playbackError || libraryError ? "tv-player-status is-error" : "tv-player-status"}>
            {playbackError ?? libraryError ?? (audioUrl ? t("tvDisplay.localPlayer") : t("tvDisplay.noAudioSource"))}
          </p>
        </div>
      </section>

      <section className="tv-secondary-grid">
        <div className={focusZone === "albums" ? "tv-panel tv-album-browser is-zone-focused" : "tv-panel tv-album-browser"} aria-label={t("tvDisplay.albums")}>
          <div className="tv-panel-heading">
            <h2>{t("tvDisplay.albums")}</h2>
            <small>{albums.length > 0 ? t("albums.count").replace("{count}", String(albums.length)) : t("status.noLibraryScanned")}</small>
          </div>
          <div className="tv-album-rail">
            {albums.slice(Math.max(0, focusedAlbumIndex - 2), focusedAlbumIndex + 4).map((album) => {
              const albumIndex = albums.indexOf(album);
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
                    {album.coverUrl ? <img src={album.coverUrl} alt="" /> : <ListMusic aria-hidden="true" size={34} />}
                  </span>
                  <span>{album.title}</span>
                  <small>{album.artist}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className={focusZone === "tracks" ? "tv-panel tv-queue-panel tv-track-browser is-zone-focused" : "tv-panel tv-queue-panel tv-track-browser"} aria-label={t("tvDisplay.tracks")}>
          <div className="tv-panel-heading">
            <h2>{t("tvDisplay.tracks")}</h2>
            <small>{selectedAlbum ? selectedAlbum.title : t("data.unknownAlbum")}</small>
          </div>
          <ol>
            {selectedAlbum?.tracks.slice(Math.max(0, focusedTrackIndex - 3), focusedTrackIndex + 5).map((track) => {
              const trackIndex = selectedAlbum.tracks.indexOf(track);
              const isFocused = focusZone === "tracks" && trackIndex === focusedTrackIndex;
              const isCurrent = String(track.id) === String(currentTrack?.id);
              return (
                <li className={`${isCurrent ? "is-current " : ""}${isFocused ? "is-focused" : ""}`} key={track.id}>
                  <button type="button" onClick={() => void playTrack(trackIndex)}>
                    <span>{track.title}</span>
                    <small>{track.artist}</small>
                  </button>
                </li>
              );
            })}
          </ol>
          {focusedTrack ? <p className="tv-next-track">{t("tvDisplay.selectedTrack")}: {focusedTrack.title}</p> : null}
        </div>

        <div className="tv-panel tv-lyrics-panel" aria-label={t("tvDisplay.lyrics")}>
          <h2>{t("tvDisplay.lyrics")}</h2>
          <div className="tv-lyrics-lines">
            {lyrics?.lines.map((line, index) => (
              <p
                className={line.id === lyrics.activeLineId ? "is-active" : index < activeLyricIndex ? "is-past" : undefined}
                key={line.id}
              >
                {line.text}
              </p>
            ))}
          </div>
          {nextTrack ? <p className="tv-next-track">{t("tvDisplay.nextTrack")}: {nextTrack.title}</p> : null}
        </div>
      </section>
    </main>
  );
}

async function fetchJson<T>(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
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
    artworkUrl: album.coverUrl,
    audioUrl: track.filePath ? makeMediaStreamUrl(track.filePath) : undefined,
    isPlaying,
    durationSeconds: duration || track.durationSeconds || 0,
    positionSeconds,
    updatedAt: new Date().toISOString(),
  };
}

function makeLyricsState(track: Track, fallbackSnapshot: TvSessionSnapshot) {
  const lyrics = track.lyrics?.trim();
  if (!lyrics) return fallbackSnapshot.lyrics;

  return {
    trackId: String(track.id),
    mode: "plain" as const,
    lines: lyrics.split(/\r?\n/).filter(Boolean).slice(0, 8).map((text, index) => ({
      id: `${track.id}-${index}`,
      text,
    })),
    activeLineId: `${track.id}-0`,
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
      artworkUrl: album.coverUrl,
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return clamp(index, 0, length - 1);
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
