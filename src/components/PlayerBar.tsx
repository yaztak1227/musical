import { type CSSProperties, forwardRef, type KeyboardEvent, type RefObject, useEffect, useEffectEvent, useId, useImperativeHandle, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Pause, Play, Repeat, Repeat1, Shuffle, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import type { TranslationKey } from "@/i18n";
import type { Album, Playlist, Track } from "@/types/audio";
import type { RepeatMode } from "@/types/app";
import { formatSeconds, formatTrackDuration, getTrackDurationSeconds } from "@/lib/formatUtils";
import { getAudioErrorMessage, getArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";

type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

export type PlayerBarHandle = {
  getCurrentTime: () => number;
  getVolume: () => number;
  resetPosition: () => void;
  seekTo: (nextTime: number, source?: string) => void;
  setVolume: (nextVolume: number) => void;
  stepVolume: (delta: number) => void;
  toggleMute: () => void;
};

type PlayerBarProps = {
  audioRef: RefObject<HTMLAudioElement | null>;
  currentAlbum: Album | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  isRemoteSynced: boolean;
  isShuffle: boolean;
  isTauriRuntime: boolean;
  playbackError: string | null;
  playbackPlaylist: Playlist | null;
  queueLength: number;
  queueTracks: Track[];
  repeatMode: RepeatMode;
  t: TFunction;
  onCycleRepeat: () => void;
  onEnded: () => void;
  onNextTrack: () => void;
  onPlaybackError: (message: string) => void;
  onPlayingChange: (isPlaying: boolean) => void;
  onPreviousTrack: () => void;
  onSeek: (nextTime: number) => void;
  onSelectCurrentAlbum: () => void;
  onShuffleChange: (isShuffle: boolean) => void;
  onTogglePlayback: () => void;
  onOpenVisualizer: () => void;
  onVolumeChange: (nextVolume: number) => void;
};

export const PlayerBar = forwardRef<PlayerBarHandle, PlayerBarProps>(function PlayerBar(
  {
    audioRef,
    currentAlbum,
    currentTrack,
    isPlaying,
    isRemoteSynced,
    isShuffle,
    isTauriRuntime,
    playbackError,
    playbackPlaylist,
    queueLength,
    queueTracks,
    repeatMode,
    t,
    onCycleRepeat,
    onEnded,
    onNextTrack,
    onPlaybackError,
    onPlayingChange,
    onPreviousTrack,
    onSeek,
    onSelectCurrentAlbum,
    onShuffleChange,
    onTogglePlayback,
    onOpenVisualizer,
    onVolumeChange,
  },
  ref,
) {
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const hasRequestedEndedRef = useRef(false);
  const lastTimeUpdateRef = useRef(0);
  const mobileOptionsDragStartRef = useRef<number | null>(null);
  const queuePopoverId = useId();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() => getTrackDurationSeconds(currentTrack));
  const [isMobileOptionsOpen, setIsMobileOptionsOpen] = useState(false);
  const [isQueueHovered, setIsQueueHovered] = useState(false);
  const [isQueuePinnedOpen, setIsQueuePinnedOpen] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const effectiveDuration = duration || getTrackDurationSeconds(currentTrack);
  const seekProgress = effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;
  const currentAlbumTitle = currentAlbum ? localizeLibraryText(currentAlbum.title, t) : "";
  const currentArtworkSrc = currentAlbum ? getArtworkSrc(currentAlbum) : "";
  const isQueueOpen = isQueueHovered || isQueuePinnedOpen;
  const playerStyle = currentArtworkSrc
    ? ({ "--player-artwork-bg": `url("${currentArtworkSrc.replace(/"/g, '\\"')}")` } as CSSProperties)
    : undefined;

  function publishPosition(nextTime: number, nextDuration = durationRef.current) {
    const boundedDuration = Math.max(0, nextDuration);
    const boundedTime = Math.max(0, Math.min(nextTime, boundedDuration || nextTime));

    currentTimeRef.current = boundedTime;
    durationRef.current = boundedDuration;
    setCurrentTime(boundedTime);
    setDuration(boundedDuration);
  }

  function seekTo(nextTime: number, _source = "programmatic") {
    const boundedTime = Math.max(0, Math.min(nextTime, effectiveDuration || 0));

    currentTimeRef.current = boundedTime;
    setCurrentTime(boundedTime);

    const audio = audioRef.current;
    if (audio && isTauriRuntime && currentTrack?.filePath) {
      audio.currentTime = boundedTime;
    }
  }

  function changeVolume(nextVolume: number) {
    const boundedVolume = Math.min(1, Math.max(0, nextVolume));
    setVolume(boundedVolume);
    if (audioRef.current) {
      audioRef.current.volume = boundedVolume;
    }
  }

  function resetPosition() {
    hasRequestedEndedRef.current = false;
    publishPosition(0, getTrackDurationSeconds(currentTrack));
  }

  function requestEnded() {
    if (hasRequestedEndedRef.current) return;
    hasRequestedEndedRef.current = true;
    onEnded();
  }

  function getAudioDuration(audio: HTMLAudioElement) {
    return Number.isFinite(audio.duration) ? audio.duration : durationRef.current;
  }

  function requestEndedIfAudioIsComplete(audio: HTMLAudioElement) {
    const audioDuration = getAudioDuration(audio);
    if (audio.ended || (audioDuration > 0 && audio.currentTime >= audioDuration - 0.2)) {
      requestEnded();
      return true;
    }

    return false;
  }

  function startMobileOptionsDrag(pointerY: number) {
    mobileOptionsDragStartRef.current = pointerY;
  }

  function finishMobileOptionsDrag(pointerY: number) {
    const dragStart = mobileOptionsDragStartRef.current;
    mobileOptionsDragStartRef.current = null;
    if (dragStart === null) return;

    const dragDistance = pointerY - dragStart;
    if (dragDistance < -24) {
      setIsMobileOptionsOpen(true);
    } else if (dragDistance > 24) {
      setIsMobileOptionsOpen(false);
    }
  }

  function handleSeekSliderChange(value: number[]) {
    const nextTime = value[0] ?? 0;
    seekTo(nextTime, "seek-slider");
    onSeek(nextTime);
  }

  function handleSeekSliderKeyDownCapture(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      onPreviousTrack();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      onNextTrack();
    }
  }

  function handleVolumeSliderChange(value: number[]) {
    const nextVolume = value[0] ?? 0;
    changeVolume(nextVolume);
    onVolumeChange(nextVolume);
  }

  useImperativeHandle(
    ref,
    () => ({
      getCurrentTime: () => currentTimeRef.current,
      getVolume: () => volume,
      resetPosition,
      seekTo,
      setVolume: changeVolume,
      stepVolume: (delta: number) => changeVolume(volume + delta),
      toggleMute: () => changeVolume(volume > 0 ? 0 : 0.85),
    }),
    [currentTrack, effectiveDuration, isTauriRuntime, volume],
  );

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [audioRef, volume]);

  useEffect(() => {
    resetPosition();
  }, [currentTrack]);

  const handleAudioLoadedMetadata = useEffectEvent(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextDuration = Number.isFinite(audio.duration) ? audio.duration : getTrackDurationSeconds(currentTrack);
    publishPosition(currentTimeRef.current, nextDuration);
  });

  const handleAudioTimeUpdate = useEffectEvent(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const now = performance.now();
    currentTimeRef.current = audio.currentTime;
    if (requestEndedIfAudioIsComplete(audio)) {
      return;
    }

    if (now - lastTimeUpdateRef.current < 500) return;

    lastTimeUpdateRef.current = now;
    publishPosition(audio.currentTime);
  });

  const handleAudioEnded = useEffectEvent(() => {
    requestEnded();
  });

  const handleAudioError = useEffectEvent(() => {
    const audio = audioRef.current;
    if (!audio) return;
    onPlayingChange(false);
    onPlaybackError(getAudioErrorMessage(audio, currentTrack));
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => handleAudioLoadedMetadata();
    const handleTimeUpdate = () => handleAudioTimeUpdate();
    const handleEnded = () => handleAudioEnded();
    const handleError = () => handleAudioError();

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
  }, [audioRef]);

  useEffect(() => {
    if (!isPlaying || !isTauriRuntime || !currentTrack?.filePath) return;

    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const nextDuration = getAudioDuration(audio);
      publishPosition(audio.currentTime, nextDuration);
      requestEndedIfAudioIsComplete(audio);
    }, 250);

    return () => window.clearInterval(timer);
  }, [audioRef, currentTrack, isPlaying, isTauriRuntime, onEnded]);

  useEffect(() => {
    if (!isPlaying || isRemoteSynced || (isTauriRuntime && currentTrack?.filePath)) return;
    const mockDuration = effectiveDuration || getTrackDurationSeconds(currentTrack);
    const timer = window.setInterval(() => {
      const nextValue = currentTimeRef.current + 1;
      publishPosition(nextValue, mockDuration);

      if (mockDuration > 0 && nextValue >= mockDuration) {
        publishPosition(mockDuration, mockDuration);
        window.clearInterval(timer);
        window.setTimeout(() => requestEnded(), 0);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentTrack, effectiveDuration, isPlaying, isRemoteSynced, isTauriRuntime, onEnded]);

  return (
    <section
      className={[
        isMobileOptionsOpen ? "player-bar mobile-options-open" : "player-bar",
        currentArtworkSrc ? "has-artwork-bg" : "",
        isPlaying ? "is-playing" : "",
        isQueueOpen ? "queue-popover-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("player.label")}
      style={playerStyle}
    >
      <button
        aria-expanded={isMobileOptionsOpen}
        aria-label={t("player.options")}
        className="player-mobile-options-handle"
        onClick={() => setIsMobileOptionsOpen((value) => !value)}
        onPointerCancel={() => {
          mobileOptionsDragStartRef.current = null;
        }}
        onPointerDown={(event) => startMobileOptionsDrag(event.clientY)}
        onPointerUp={(event) => finishMobileOptionsDrag(event.clientY)}
        title={t("player.options")}
        type="button"
      >
        <span aria-hidden="true" />
      </button>
      <div className="player-track">
        <button
          aria-label={currentAlbum ? t("player.showCurrentAlbum", { album: currentAlbumTitle }) : t("player.nothingSelected")}
          className="player-artwork-button"
          disabled={!currentAlbum}
          onClick={onSelectCurrentAlbum}
          title={currentAlbum ? t("player.showCurrentAlbum", { album: currentAlbumTitle }) : undefined}
          type="button"
        >
          {currentArtworkSrc ? (
            <img alt={t("album.artworkAlt", { album: currentAlbumTitle })} src={currentArtworkSrc} />
          ) : (
            <span aria-hidden="true">{currentAlbumTitle.charAt(0).toUpperCase()}</span>
          )}
        </button>
        <div className="player-track-copy" key={currentTrack?.id ?? "empty"}>
          <p className="eyebrow">{t("player.nowPlaying")}</p>
          <strong>{currentTrack ? localizeLibraryText(currentTrack.title, t) : t("player.nothingSelected")}</strong>
          <span>
            {currentTrack
              ? playbackPlaylist
                ? t("player.playlistSource", { playlist: playbackPlaylist.name })
                : localizeLibraryText(currentTrack.artist, t)
              : t("player.pickPrompt")}
          </span>
          {playbackError ? (
            <small role="alert">{t("player.playbackError", { message: playbackError })}</small>
          ) : null}
        </div>
      </div>
      <div className="player-main">
        <div className="transport-controls">
          <Button
            aria-label={t("player.previous")}
            className="control-button icon-button musical-ripple-button"
            disabled={!currentTrack}
            onClick={onPreviousTrack}
            title={t("player.previous")}
            type="button"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <Button
            aria-label={currentTrack ? (isPlaying ? t("player.pause") : t("player.play")) : t("player.idle")}
            className="play-button icon-button musical-ripple-button"
            disabled={!currentTrack}
            onClick={onTogglePlayback}
            title={currentTrack ? (isPlaying ? t("player.pause") : t("player.play")) : t("player.idle")}
            type="button"
          >
            {isPlaying ? <Pause /> : <Play />}
          </Button>
          <Button
            aria-label={t("player.next")}
            className="control-button icon-button musical-ripple-button"
            disabled={!currentTrack}
            onClick={onNextTrack}
            title={t("player.next")}
            type="button"
            variant="outline"
          >
            <ChevronRight />
          </Button>
        </div>
        <label className="progress-control">
          <span>{formatSeconds(Math.floor(currentTime))}</span>
          <Slider
            aria-label={t("player.seek")}
            className="seek-slider"
            disabled={!currentTrack}
            max={Math.max(1, Math.floor(effectiveDuration))}
            min={0}
            onKeyDownCapture={handleSeekSliderKeyDownCapture}
            onValueChange={handleSeekSliderChange}
            step={1}
            style={{ "--seek-progress": `${seekProgress}%` } as CSSProperties}
            value={[Math.floor(currentTime)]}
          />
          <span>{formatSeconds(Math.floor(effectiveDuration))}</span>
        </label>
      </div>
      <div className="player-options">
        <Toggle
          className={isShuffle ? "option-button active" : "option-button"}
          disabled={queueLength < 2}
          pressed={isShuffle}
          onPressedChange={onShuffleChange}
        >
          <Shuffle />
          {t("player.shuffle")}
        </Toggle>
        <Button className={repeatMode !== "off" ? "option-button active" : "option-button"} onClick={onCycleRepeat} type="button" variant="outline">
          {repeatMode === "one" ? <Repeat1 /> : <Repeat />}
          {repeatMode === "off" ? t("player.repeatOff") : repeatMode === "all" ? t("player.repeatAll") : t("player.repeatOne")}
        </Button>
        <label className="volume-control">
          {volume > 0 ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          <span>{t("player.volume")}</span>
          <Slider
            aria-label={t("player.volume")}
            className="volume-slider"
            max={1}
            min={0}
            onValueChange={handleVolumeSliderChange}
            step={0.01}
            value={[volume]}
          />
        </label>
      </div>
      <div
        className={isQueueOpen ? "queue-popover-wrap open" : "queue-popover-wrap"}
        onMouseEnter={() => setIsQueueHovered(true)}
        onMouseLeave={() => setIsQueueHovered(false)}
      >
        <button
          aria-controls={queuePopoverId}
          aria-expanded={isQueueOpen}
          aria-label={t("player.queueToggle")}
          className="queue-count"
          onClick={() => {
            setIsQueueHovered(false);
            setIsQueuePinnedOpen((value) => !value);
          }}
          type="button"
        >
          {t("player.queue")} / {t("player.queueCount", { count: queueLength })}
        </button>
        <div className="queue-popover" id={queuePopoverId} role="region" aria-label={t("player.queue")}>
          <div className="queue-popover-list">
            {queueTracks.map((track, index) => {
              const isCurrentTrack = currentTrack?.id === track.id;
              return (
                <div className={isCurrentTrack ? "queue-popover-row current" : "queue-popover-row"} key={track.id}>
                  <span className="queue-track-index">{index + 1}</span>
                  <span className="queue-track-copy">
                    <strong>{localizeLibraryText(track.title, t)}</strong>
                    <span>{localizeLibraryText(track.artist, t)}</span>
                  </span>
                  <span className="queue-track-duration">{formatTrackDuration(track)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Button
        aria-label={t("player.openVisualizerAccessible")}
        className="visualizer-open-icon-button icon-button musical-ripple-button"
        disabled={!currentTrack}
        onClick={onOpenVisualizer}
        title={t("player.openVisualizer")}
        type="button"
        variant="outline"
      >
        <Maximize2 />
        <span className="sr-only">{t("player.openVisualizer")}</span>
      </Button>
    </section>
  );
});
