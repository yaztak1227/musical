import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  type PointerEvent,
  lazy,
  Suspense,
  type TouchEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";
import { getInitialLocale, translate, type Locale, type TranslationKey } from "./i18n";
import type { Album, Track, LibrarySnapshot, ScanSummary } from "./types/audio";
import {
  type AlbumListMode,
  type AlbumSortDirection,
  type AlbumSortMode,
  type AlbumViewMode,
  type I18nMessage,
  type RepeatMode,
  type ThemeName,
  isThemeName,
} from "./types/app";
import { updateAlbumTags, updateTrackArtwork, updateTrackTags, type AlbumTagDraft, type TrackTagDraft } from "./lib/tagEditing";
import {
  backendInvoke,
  getBackendMediaSrc,
  getRemotePlayerCommands,
  getRemotePlayerState,
  getRemoteTrackAnalysisSegment,
  hasRealBackend,
  isBrowserBackendRuntime,
  isMockDataRuntime,
  isTauriRuntime,
  publishRemotePlayerState,
  sendRemotePlayerCommand,
  type QueuedRemotePlayerCommand,
  type RemoteAudioAnalysisSegment,
  type RemotePlayerState,
} from "./lib/backend";
import { useGlobalMediaKeys } from "./lib/useGlobalMediaKeys";
import { getMockAudioAnalysisSegment, mockAlbums } from "./lib/mockData";
import { filterAndSortAlbums } from "./lib/albumFilters";
import { localizeLibraryText, getArtworkSrc, getAlbumJumpTarget, toI18nError } from "./lib/libraryUtils";
import { makeAlbumTagDraft, isAlbumTagDraftChanged, parseOptionalYear } from "./lib/tagDraftUtils";
import {
  getAlbumQueueTracks,
  getInitialAlbumId,
  getInitialTrack,
  getNextRepeatMode,
  getStoredPlaybackPreferences,
  getToggledQueueTracks,
  isRepeatMode,
  shuffleTracks,
  storePlaybackPreferences,
  type PlaybackPreferences,
  type PlaybackResolutionState,
} from "./lib/playback";
import { getHeapUsageMb, logRenderDiagnostic, releaseAudioSource } from "./lib/renderDiagnostics";
import { isTrackTagDraftChanged, makeTrackTagDraft } from "./lib/trackTagDraftUtils";
import { useRemoteAccess } from "./lib/useRemoteAccess";
import { AlbumBrowser } from "./components/AlbumBrowser";
import { LibrarySidebar } from "./components/LibrarySidebar";
import { LibrarySettingsDialog } from "./components/LibrarySettingsDialog";
import { PlayerBar, type PlayerBarHandle } from "./components/PlayerBar";
import { SelectedAlbumPanel } from "./components/SelectedAlbumPanel";
import { TrackDetailDialog } from "./components/TrackDetailDialog";

const albumPanelSwipeThreshold = 36;
const albumPanelDragTolerance = 8;
const audioAnalysisSampleIntervalMs = 33;
const remoteAudioAnalysisFallbackDurationSeconds = 15 * 60;
const remoteAudioAnalysisDurationPaddingSeconds = 2;
const remotePlayerStateSyncIntervalMs = 250;
const remotePlayerStateTransitDelayMaxSeconds = 5;
const staleRemotePlayerStateToleranceSeconds = 0.05;
const remotePlaybackClockSnapThresholdSeconds = 0.45;
const trackLongPressDelayMs = 520;
const trackLongPressMoveTolerance = 10;
const PlayerVisualizerOverlay = lazy(() => import("./components/PlayerVisualizerOverlay"));

type AlbumPanelDragStart = {
  hasDragged: boolean;
  isCollapsed: boolean;
  pointerY: number;
  scrollTop: number;
};

type TrackLongPressState = {
  pointerX: number;
  pointerY: number;
  timerId: number;
  trackId: number;
};

type SuppressedTrackClick = {
  timerId: number;
  trackId: number;
};

export type RemoteAudioAnalysisPacket = {
  currentTimeAtReceived: number;
  duration: number;
  frameTimecodes: number[];
  frames: number[][];
  receivedAt: number;
  startTime: number;
};

type RemotePlaybackClock = {
  currentTime: number;
  isPlaying: boolean;
  receivedAt: number;
  trackId: number | null;
};

type RemotePlayerStateSnapshot = {
  currentTime: number;
  isPlaying: boolean;
  trackId: number | null;
};

function areNumberArraysEqual(first: number[] | null, second: number[] | null) {
  if (first === second) return true;
  if (!first || !second || first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
}

function getAudioAnalysisTick(timecode: number) {
  return Math.round((timecode * 1000) / audioAnalysisSampleIntervalMs);
}

function getRoundedAudioAnalysisTimecode(timecode: number) {
  return (getAudioAnalysisTick(timecode) * audioAnalysisSampleIntervalMs) / 1000;
}

function estimateRemotePlaybackTime(clock: RemotePlaybackClock | null) {
  if (!clock) return 0;
  const elapsed = clock.isPlaying ? Math.max(0, performance.now() - clock.receivedAt) / 1000 : 0;
  return Math.max(0, clock.currentTime + elapsed);
}

function makeAudioAnalysisPacketFromSegment(
  segment: RemoteAudioAnalysisSegment,
  currentTimeAtReceived: number,
) {
  const frames = segment.frames;
  if (frames.length === 0) return null;

  return {
    currentTimeAtReceived,
    duration: Math.max(audioAnalysisSampleIntervalMs, frames.length * segment.frameIntervalMs),
    frameTimecodes: frames.map((frame) => getRoundedAudioAnalysisTimecode(frame.timecode)),
    frames: frames.map((frame) => frame.values.slice()),
    receivedAt: performance.now(),
    startTime: getRoundedAudioAnalysisTimecode(frames[0]?.timecode ?? 0),
  } satisfies RemoteAudioAnalysisPacket;
}

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerBarRef = useRef<PlayerBarHandle | null>(null);
  const albumsPanelRef = useRef<HTMLElement | null>(null);
  const albumPanelRef = useRef<HTMLElement | null>(null);
  const albumPanelDragStartRef = useRef<AlbumPanelDragStart | null>(null);
  const trackLongPressRef = useRef<TrackLongPressState | null>(null);
  const suppressedTrackClickRef = useRef<SuppressedTrackClick | null>(null);
  const lastLibraryCommandIdRef = useRef(0);
  const lastRemoteCommandIdRef = useRef(0);
  const loadedRemoteAudioAnalysisTrackIdRef = useRef<number | null>(null);
  const lastRemotePlayerStateRef = useRef<RemotePlayerStateSnapshot | null>(null);
  const remoteSyncRequestIdRef = useRef(0);
  const remotePlaybackClockRef = useRef<RemotePlaybackClock | null>(null);
  const playbackResolutionRef = useRef<PlaybackResolutionState | null>(null);
  const renderCountRef = useRef(0);
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const storedTheme = window.localStorage.getItem("musical.theme");
    if (isThemeName(storedTheme)) return storedTheme;
    return "crimson";
  });
  const t = useMemo(() => {
    return (key: TranslationKey, values?: Record<string, string | number>) => translate(locale, key, values);
  }, [locale]);
  const [query, setQuery] = useState("");
  const storedPlaybackPreferences = useMemo(() => getStoredPlaybackPreferences(), []);
  const [libraryPath, setLibraryPath] = useState("");
  const [libraryInfo, setLibraryInfo] = useState<I18nMessage | null>(
    hasRealBackend ? { key: "status.noLibraryScanned" } : { key: "status.webMockMode" },
  );
  const [albums, setAlbums] = useState<Album[]>(hasRealBackend ? [] : mockAlbums);
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(() =>
    hasRealBackend ? null : getInitialAlbumId(mockAlbums, storedPlaybackPreferences.selectedAlbumId),
  );
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [playbackAlbumId, setPlaybackAlbumId] = useState<number | null>(() =>
    hasRealBackend ? null : getInitialAlbumId(mockAlbums, storedPlaybackPreferences.playbackAlbumId),
  );
  const [currentTrack, setCurrentTrack] = useState<Track | null>(() =>
    hasRealBackend ? null : getInitialTrack(mockAlbums, getInitialAlbumId(mockAlbums, storedPlaybackPreferences.playbackAlbumId)),
  );
  const [playbackQueueTrackIds, setPlaybackQueueTrackIds] = useState<number[]>(() => {
    if (hasRealBackend) return [];
    const initialAlbumId = getInitialAlbumId(mockAlbums, storedPlaybackPreferences.playbackAlbumId);
    return mockAlbums.find((album) => album.id === initialAlbumId)?.tracks.map((track) => track.id) ?? [];
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSourceKey, setAudioSourceKey] = useState<string | null>(null);
  const audioAnalysisPacketRef = useRef<RemoteAudioAnalysisPacket | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isShuffle, setIsShuffle] = useState(storedPlaybackPreferences.isShuffle);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(storedPlaybackPreferences.repeatMode);
  const [albumViewMode, setAlbumViewMode] = useState<AlbumViewMode>("large");
  const [albumListMode, setAlbumListMode] = useState<AlbumListMode>("album");
  const [albumSortMode, setAlbumSortMode] = useState<AlbumSortMode>("title");
  const [albumSortDirection, setAlbumSortDirection] = useState<AlbumSortDirection>("asc");
  const [lyricsOnly, setLyricsOnly] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAlbumPanelCollapsed, setIsAlbumPanelCollapsed] = useState(false);
  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
  const [isLibrarySettingsOpen, setIsLibrarySettingsOpen] = useState(false);
  const [isPlayerVisualizerOpen, setIsPlayerVisualizerOpen] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isAlbumTagEditing, setIsAlbumTagEditing] = useState(false);
  const [albumTagDraft, setAlbumTagDraft] = useState<AlbumTagDraft>(() => makeAlbumTagDraft(mockAlbums[0] ?? null));
  const [isSavingAlbumTags, setIsSavingAlbumTags] = useState(false);
  const [albumTagMessage, setAlbumTagMessage] = useState<I18nMessage | null>(null);
  const [detailTrackId, setDetailTrackId] = useState<number | null>(null);
  const [trackDetailTab, setTrackDetailTab] = useState<"info" | "lyrics" | "artwork">("info");
  const [trackLyricsById, setTrackLyricsById] = useState<Record<number, string | null>>({});
  const [trackTagDraft, setTrackTagDraft] = useState<TrackTagDraft>(() => makeTrackTagDraft(null, mockAlbums[0] ?? null));
  const [editingTrackTag, setEditingTrackTag] = useState<keyof TrackTagDraft | null>(null);
  const [isSavingTrackTags, setIsSavingTrackTags] = useState(false);
  const [trackTagMessage, setTrackTagMessage] = useState<I18nMessage | null>(null);
  const [artworkDraftPath, setArtworkDraftPath] = useState("");
  const [artworkPreviewSrc, setArtworkPreviewSrc] = useState("");
  const [isSavingArtwork, setIsSavingArtwork] = useState(false);
  const remoteAccess = useRemoteAccess();
  renderCountRef.current += 1;

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem("musical.locale", locale);
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    window.localStorage.setItem("musical.theme", themeName);
  }, [themeName]);

  useEffect(() => {
    const playbackPreferences: PlaybackPreferences = {
      isShuffle,
      playbackAlbumId,
      repeatMode,
      selectedAlbumId,
    };
    storePlaybackPreferences(playbackPreferences);
  }, [isShuffle, playbackAlbumId, repeatMode, selectedAlbumId]);

  useEffect(() => {
    if (!hasRealBackend) return;
    void refreshLibrary();
  }, []);

  useEffect(() => {
    if (!isLibrarySettingsOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsLibrarySettingsOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isLibrarySettingsOpen]);

  useEffect(() => {
    if (albums.length === 0) {
      setSelectedAlbumId(null);
      setPlaybackAlbumId(null);
      setCurrentTrack(null);
      setPlaybackQueueTrackIds([]);
      setIsPlaying(false);
      return;
    }

    const selectedAlbum = albums.find((album) => album.id === selectedAlbumId) ?? albums[0];
    if (selectedAlbum.id !== selectedAlbumId) {
      setSelectedAlbumId(selectedAlbum.id);
    }

    if (currentTrack && albums.some((album) => album.tracks.some((track) => track.id === currentTrack.id))) {
      if (!playbackAlbumId || !albums.some((album) => album.id === playbackAlbumId)) {
        const currentAlbum = albums.find((album) => album.tracks.some((track) => track.id === currentTrack.id));
        setPlaybackAlbumId(currentAlbum?.id ?? selectedAlbum.id);
      }
      return;
    }

    setPlaybackAlbumId(selectedAlbum.id);
    const nextTrack = selectedAlbum.tracks[0] ?? null;
    setCurrentTrack(nextTrack);
    setPlaybackQueueTrackIds(selectedAlbum.tracks.map((track) => track.id));
  }, [albums, selectedAlbumId, playbackAlbumId, currentTrack]);

  useEffect(() => {
    setPlaybackError(null);
    playerBarRef.current?.resetPosition();
    setAudioSourceKey(null);

    const audio = audioRef.current;
    if (!audio) return;

    releaseAudioSource(audio);
    audioAnalysisPacketRef.current = null;

    if (isTauriRuntime && currentTrack?.filePath) {
      const mediaSrc = getBackendMediaSrc(currentTrack.filePath);
      audio.src = mediaSrc;
      audio.load();
      setAudioSourceKey(currentTrack.filePath);
    }

    return () => {
      releaseAudioSource(audio);
    };
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isTauriRuntime) return;

    if (!audioSourceKey) {
      audio.pause();
      return;
    }

    if (isPlaying) {
      void audio.play().catch((error: unknown) => {
        setIsPlaying(false);
        setPlaybackError(`${String(error)} / ${audio.currentSrc || audio.src}`);
      });
    } else {
      audio.pause();
    }
  }, [audioSourceKey, isPlaying]);

  function clearAudioAnalysisPacket() {
    audioAnalysisPacketRef.current = null;
  }

  const filteredAlbums = useMemo(
    () => filterAndSortAlbums(albums, query, albumSortMode, albumSortDirection, t, lyricsOnly),
    [albumSortDirection, albumSortMode, albums, lyricsOnly, query, t],
  );

  const selectedAlbum =
    albums.find((album) => album.id === selectedAlbumId) ?? filteredAlbums[0] ?? albums[0] ?? null;
  const playbackAlbum =
    albums.find((album) => album.id === playbackAlbumId) ??
    albums.find((album) => album.tracks.some((track) => track.id === currentTrack?.id)) ??
    selectedAlbum;
  const playbackQueueTracks = playbackQueueTrackIds
    .map((trackId) => albums.flatMap((album) => album.tracks).find((track) => track.id === trackId))
    .filter((track): track is Track => Boolean(track));
  const queue = playbackQueueTracks.length > 0 ? playbackQueueTracks : playbackAlbum?.tracks ?? [];
  const currentTrackIndex = currentTrack ? queue.findIndex((track) => track.id === currentTrack.id) : -1;
  playbackResolutionRef.current = {
    currentTrackIndex,
    isShuffle,
    playbackAlbumId: playbackAlbum?.id ?? playbackAlbumId,
    queue,
    repeatMode,
    selectedAlbumId,
  };
  const hasAlbumTagChanges = selectedAlbum ? isAlbumTagDraftChanged(albumTagDraft, selectedAlbum) : false;
  const displayedLibraryPath = libraryPath.trim() || t("scan.selectLibrary");
  const detailAlbum =
    albums.find((album) => album.tracks.some((track) => track.id === detailTrackId)) ?? selectedAlbum;
  const detailTrack =
    detailAlbum?.tracks.find((track) => track.id === detailTrackId) ?? null;
  const detailArtworkSrc = useMemo(
    () => (detailAlbum ? getArtworkSrc(detailAlbum) : ""),
    [detailAlbum?.artworkPath, detailAlbum?.coverUrl],
  );
  const detailLyrics = detailTrack ? trackLyricsById[detailTrack.id] : null;
  const hasTrackTagChanges = detailTrack
    ? isTrackTagDraftChanged(trackTagDraft, detailTrack, detailAlbum)
    : false;

  useEffect(() => {
    logRenderDiagnostic("App committed", {
      albums: albums.length,
      filteredAlbums: filteredAlbums.length,
      heapMb: getHeapUsageMb(),
      isPlaying,
      render: renderCountRef.current,
      selectedAlbumId: selectedAlbum?.id ?? null,
      trackId: currentTrack?.id ?? null,
    });
  });

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.playbackState = currentTrack ? (isPlaying ? "playing" : "paused") : "none";
    navigator.mediaSession.metadata = currentTrack && typeof MediaMetadata !== "undefined"
      ? new MediaMetadata({
          album: playbackAlbum ? localizeLibraryText(playbackAlbum.title, t) : undefined,
          artist: localizeLibraryText(currentTrack.artist, t),
          title: localizeLibraryText(currentTrack.title, t),
        })
      : null;
  }, [currentTrack, isPlaying, playbackAlbum, t]);

  useEffect(() => {
    if (!selectedAlbum || isAlbumTagEditing) return;
    setAlbumTagDraft(makeAlbumTagDraft(selectedAlbum));
    setAlbumTagMessage(null);
  }, [isAlbumTagEditing, selectedAlbum]);

  useEffect(() => {
    if (!detailTrack) return;
    setTrackTagDraft(makeTrackTagDraft(detailTrack, detailAlbum));
    setEditingTrackTag(null);
    setTrackTagMessage(null);
    setArtworkDraftPath("");
    setArtworkPreviewSrc("");
  }, [detailAlbum, detailTrack]);

  useEffect(() => {
    return () => {
      clearTrackLongPress();
      clearSuppressedTrackClick();
    };
  }, []);

  async function refreshLibrary() {
    try {
      const snapshot = await backendInvoke<LibrarySnapshot>("library_snapshot");
      applyLibrarySnapshot(snapshot, { resetPlayback: true });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  function applyLibrarySnapshot(snapshot: LibrarySnapshot, options: { resetPlayback: boolean }) {
    setAlbums(snapshot.albums);
    setTrackLyricsById({});
    setLibraryPath(snapshot.lastScanPath ?? "");
    if (options.resetPlayback) {
      const restoredSelectedAlbumId = getInitialAlbumId(snapshot.albums, storedPlaybackPreferences.selectedAlbumId);
      const restoredPlaybackAlbumId =
        getInitialAlbumId(snapshot.albums, storedPlaybackPreferences.playbackAlbumId) ?? restoredSelectedAlbumId;
      setSelectedAlbumId(restoredSelectedAlbumId);
      setPlaybackAlbumId(restoredPlaybackAlbumId);
      const restoredTrack = getInitialTrack(snapshot.albums, restoredPlaybackAlbumId);
      setCurrentTrack(restoredTrack);
      setPlaybackQueueTrackIds(
        snapshot.albums.find((album) => album.id === restoredPlaybackAlbumId)?.tracks.map((track) => track.id) ?? [],
      );
    }
    setLibraryInfo(
      snapshot.albums.length > 0
        ? { key: "status.loadedAlbums", values: { count: snapshot.albums.length, databasePath: snapshot.databasePath } }
        : { key: "status.noAlbumsIndexed", values: { databasePath: snapshot.databasePath } },
    );
  }

  function sendRemoteCommand(commandType: QueuedRemotePlayerCommand["commandType"], payload?: Record<string, unknown>) {
    if (!isBrowserBackendRuntime) return false;
    void sendRemotePlayerCommand(commandType, payload).catch((error: unknown) => {
      setPlaybackError(String(error));
    });
    return true;
  }

  function findTrackById(trackId: number | null) {
    if (trackId === null) return null;
    for (const album of albums) {
      const track = album.tracks.find((track) => track.id === trackId);
      if (track) return track;
    }
    return null;
  }

  function findAlbumByTrackId(trackId: number | null) {
    if (trackId === null) return null;
    return albums.find((album) => album.tracks.some((track) => track.id === trackId)) ?? null;
  }

  function findTracksByIds(trackIds: number[]) {
    const tracksById = new Map(albums.flatMap((album) => album.tracks).map((track) => [track.id, track]));
    return trackIds.map((trackId) => tracksById.get(trackId)).filter((track): track is Track => Boolean(track));
  }

  function getCommandNumberArray(command: QueuedRemotePlayerCommand, key: string) {
    const value = command.payload?.[key];
    if (!Array.isArray(value)) return null;

    const numbers = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
    return numbers.length === value.length ? numbers : null;
  }

  function applyRemotePlayerState(
    state: RemotePlayerState,
    timing: { receivedAtMs: number; sentAtMs: number | null } = { receivedAtMs: Date.now(), sentAtMs: null },
  ) {
    const now = performance.now();
    const previousClock = remotePlaybackClockRef.current;
    const previousRemoteState = lastRemotePlayerStateRef.current;
    const transitDelaySeconds =
      state.isPlaying && timing.sentAtMs !== null
        ? Math.max(
          0,
          Math.min(
            remotePlayerStateTransitDelayMaxSeconds,
            (timing.receivedAtMs - timing.sentAtMs) / 1000,
          ),
        )
        : 0;
    const correctedStateTime = state.currentTime + transitDelaySeconds;
    const isSameTrack = previousClock?.trackId === state.currentTrackId;
    const isRepeatedRemoteTime =
      previousRemoteState?.trackId === state.currentTrackId &&
      previousRemoteState.isPlaying === state.isPlaying &&
      Math.abs(previousRemoteState.currentTime - state.currentTime) < 0.001;
    const estimatedTime = estimateRemotePlaybackTime(previousClock);
    const shouldKeepEstimatedTime = Boolean(isSameTrack && previousClock?.isPlaying && state.isPlaying) && (
      Math.abs(correctedStateTime - estimatedTime) < remotePlaybackClockSnapThresholdSeconds ||
      (isRepeatedRemoteTime && correctedStateTime < estimatedTime - staleRemotePlayerStateToleranceSeconds)
    );
    const syncedCurrentTime = shouldKeepEstimatedTime ? estimatedTime : correctedStateTime;

    if (previousClock?.trackId !== state.currentTrackId) {
      audioAnalysisPacketRef.current = null;
      loadedRemoteAudioAnalysisTrackIdRef.current = null;
    }
    lastRemotePlayerStateRef.current = {
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      trackId: state.currentTrackId,
    };
    setPlaybackAlbumId(state.playbackAlbumId);
    const syncedTrack = findTrackById(state.currentTrackId);
    setCurrentTrack(syncedTrack);
    setPlaybackQueueTrackIds((currentTrackIds) =>
      areNumberArraysEqual(currentTrackIds, state.queueTrackIds) ? currentTrackIds : state.queueTrackIds,
    );
    setIsPlaying(state.isPlaying);
    setIsShuffle(state.isShuffle);
    setRepeatMode(isRepeatMode(state.repeatMode) ? state.repeatMode : "off");
    remotePlaybackClockRef.current = {
      currentTime: syncedCurrentTime,
      isPlaying: state.isPlaying,
      receivedAt: now,
      trackId: state.currentTrackId,
    };
    if (!state.currentTrackId || !state.isPlaying) {
      audioAnalysisPacketRef.current = null;
    }
    playerBarRef.current?.seekTo(syncedCurrentTime, "remote-sync");
    setVolume(state.volume, "remote-sync");
  }

  function notifyLibraryChanged() {
    void sendRemotePlayerCommand("refresh-library").catch((error: unknown) => {
      setPlaybackError(String(error));
    });
  }

  async function handleScan() {
    if (!hasRealBackend) {
      setLibraryInfo({ key: "status.desktopOnly" });
      return;
    }

    const normalizedPath = libraryPath.trim();
    if (!normalizedPath) {
      setLibraryInfo({ key: "status.enterFolder" });
      return;
    }

    try {
      setIsScanning(true);
      const summary = await backendInvoke<ScanSummary>("scan_music_folder", {
        folderPath: normalizedPath,
      });
      await refreshLibrary();
      notifyLibraryChanged();
      setLibraryInfo({
        key: "status.scanComplete",
        values: { albums: summary.albums, tracks: summary.importedTracks, libraryPath: summary.libraryPath },
      });
      setIsLibrarySettingsOpen(false);
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    } finally {
      setIsScanning(false);
    }
  }

  async function handleChooseFolder() {
    if (!isTauriRuntime) {
      setLibraryInfo({ key: "status.desktopOnly" });
      return;
    }

    try {
      const selectedPath = await openDialog({
        defaultPath: libraryPath || undefined,
        directory: true,
        multiple: false,
      });

      if (typeof selectedPath === "string") {
        setLibraryPath(selectedPath);
      }
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  const selectAlbum = useCallback((album: Album) => {
    setSelectedAlbumId(album.id);
    setSelectedTrackId(null);
    setIsAlbumTagEditing(false);
    setAlbumTagMessage(null);
  }, []);

  const playAlbum = useCallback((album: Album, options: { selectAlbum?: boolean } = {}) => {
    const shouldSelectAlbum = options.selectAlbum ?? true;
    const nextQueue = getAlbumQueueTracks(album, isShuffle);
    const firstTrack = nextQueue[0] ?? null;
    const queueTrackIds = nextQueue.map((track) => track.id);
    if (sendRemoteCommand("play-album", { albumId: album.id, isShuffle, queueTrackIds })) return;

    if (shouldSelectAlbum) setSelectedAlbumId(album.id);
    setPlaybackAlbumId(album.id);
    setPlaybackQueueTrackIds(queueTrackIds);
    setCurrentTrack(firstTrack);
    playerBarRef.current?.resetPosition();
    setIsPlaying(Boolean(firstTrack));
  }, [isShuffle]);

  const playTrack = useCallback((track: Track, albumId = selectedAlbumId) => {
    const album = albums.find((album) => album.id === albumId) ?? findAlbumByTrackId(track.id);
    const nextQueue = album ? getAlbumQueueTracks(album, isShuffle, track) : [track];
    const queueTrackIds = nextQueue.map((track) => track.id);
    if (sendRemoteCommand("play-track", { albumId, trackId: track.id, isShuffle, queueTrackIds })) return;

    setPlaybackAlbumId(album?.id ?? albumId);
    setPlaybackQueueTrackIds(queueTrackIds);
    setCurrentTrack(track);
    setIsPlaying(true);
  }, [albums, isShuffle, selectedAlbumId]);

  const playQueuedTrack = useCallback((track: Track) => {
    const queueTrackIds = queue.map((track) => track.id);
    const album = playbackAlbum ?? findAlbumByTrackId(track.id);
    const albumId = album?.id ?? selectedAlbumId;
    if (sendRemoteCommand("play-track", { albumId, trackId: track.id, isShuffle, queueTrackIds })) return;

    setPlaybackAlbumId(albumId);
    setPlaybackQueueTrackIds(queueTrackIds);
    setCurrentTrack(track);
    playerBarRef.current?.resetPosition();
    setIsPlaying(true);
  }, [isShuffle, playbackAlbum, queue, selectedAlbumId]);

  function selectTrack(track: Track) {
    if (suppressedTrackClickRef.current?.trackId === track.id) {
      clearSuppressedTrackClick();
      return;
    }

    setSelectedTrackId(track.id);
  }

  const openTrackDetail = useCallback((track: Track, tab: "info" | "lyrics" | "artwork" = "info") => {
    setDetailTrackId(track.id);
    setTrackDetailTab(tab);
    if (tab === "lyrics") {
      void loadTrackLyrics(track);
    }
  }, [trackLyricsById]);

  const openTrackLyrics = useCallback((track: Track) => {
    openTrackDetail(track, "lyrics");
  }, [openTrackDetail]);

  const openSelectedAlbumArtworkEditor = useCallback(() => {
    const track = selectedAlbum?.tracks[0];
    if (!track) return;
    openTrackDetail(track, "artwork");
  }, [openTrackDetail, selectedAlbum]);

  function clearTrackLongPress() {
    const longPress = trackLongPressRef.current;
    if (longPress) window.clearTimeout(longPress.timerId);
    trackLongPressRef.current = null;
  }

  function clearSuppressedTrackClick() {
    const suppressedClick = suppressedTrackClickRef.current;
    if (suppressedClick) window.clearTimeout(suppressedClick.timerId);
    suppressedTrackClickRef.current = null;
  }

  function suppressTrackClick(trackId: number) {
    clearSuppressedTrackClick();
    suppressedTrackClickRef.current = {
      timerId: window.setTimeout(clearSuppressedTrackClick, 1000),
      trackId,
    };
  }

  function startTrackLongPress(event: PointerEvent<HTMLButtonElement>, track: Track) {
    if (event.pointerType !== "touch") return;

    clearTrackLongPress();
    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const timerId = window.setTimeout(() => {
      trackLongPressRef.current = null;
      suppressTrackClick(track.id);
      openTrackDetail(track);
    }, trackLongPressDelayMs);

    trackLongPressRef.current = {
      pointerX,
      pointerY,
      timerId,
      trackId: track.id,
    };
  }

  function moveTrackLongPress(event: PointerEvent<HTMLButtonElement>, track: Track) {
    if (event.pointerType !== "touch") return;

    const longPress = trackLongPressRef.current;
    if (!longPress || longPress.trackId !== track.id) return;

    const moveDistance = Math.hypot(event.clientX - longPress.pointerX, event.clientY - longPress.pointerY);
    if (moveDistance > trackLongPressMoveTolerance) clearTrackLongPress();
  }

  function finishTrackLongPress(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "touch") clearTrackLongPress();
  }

  async function loadTrackLyrics(track: Track) {
    if (!track.hasLyrics && !track.lyrics?.trim()) {
      setTrackLyricsById((current) => ({ ...current, [track.id]: null }));
      return;
    }

    if (track.id in trackLyricsById) return;

    if (!hasRealBackend) {
      setTrackLyricsById((current) => ({ ...current, [track.id]: track.lyrics ?? null }));
      return;
    }

    try {
      const lyrics = await backendInvoke<string | null>("track_lyrics", { trackId: track.id });
      setTrackLyricsById((current) => ({ ...current, [track.id]: lyrics }));
    } catch (error) {
      setTrackTagMessage(toI18nError(error));
      setTrackLyricsById((current) => ({ ...current, [track.id]: null }));
    }
  }

  function changeTrackDetailTab(tab: "info" | "lyrics" | "artwork") {
    setTrackDetailTab(tab);
    if (tab === "lyrics" && detailTrack) {
      void loadTrackLyrics(detailTrack);
    }
  }

  function closeTrackDetail() {
    if (isSavingTrackTags || isSavingArtwork) return;
    setDetailTrackId(null);
    setTrackDetailTab("info");
    setEditingTrackTag(null);
    setTrackTagMessage(null);
    setArtworkDraftPath("");
    setArtworkPreviewSrc("");
  }

  function togglePlayback() {
    if (sendRemoteCommand("toggle-playback")) return;

    if (!currentTrack && selectedAlbum) {
      playAlbum(selectedAlbum);
      return;
    }
    setIsPlaying((value) => !value);
  }

  function playPlayback() {
    if (sendRemoteCommand("play")) return;

    if (!currentTrack && selectedAlbum) {
      playAlbum(selectedAlbum);
      return;
    }
    setIsPlaying(Boolean(currentTrack));
  }

  function pausePlayback() {
    if (sendRemoteCommand("pause")) return;

    setIsPlaying(false);
  }

  function playPreviousTrack() {
    if (sendRemoteCommand("previous")) return;

    if (queue.length === 0) return;
    if ((playerBarRef.current?.getCurrentTime() ?? 0) > 3) {
      seekTo(0);
      return;
    }

    const previousIndex = currentTrackIndex > 0 ? currentTrackIndex - 1 : queue.length - 1;
    const previousTrack = queue[previousIndex];
    if (!previousTrack) return;

    setPlaybackAlbumId(playbackAlbum?.id ?? selectedAlbumId);
    setCurrentTrack(previousTrack);
    playerBarRef.current?.resetPosition();
    setIsPlaying(true);
  }

  function playNextTrack(options: { autoplay?: boolean } = {}) {
    if (sendRemoteCommand("next")) return;

    if (queue.length === 0) return;
    const nextTrack = getNextTrack();
    if (!nextTrack) {
      setIsPlaying(false);
      seekTo(0);
      return;
    }

    setCurrentTrack(nextTrack);
    playerBarRef.current?.resetPosition();
    setIsPlaying(options.autoplay ?? true);
  }

  function getNextTrack() {
    if (queue.length === 0) return null;

    if (currentTrackIndex < 0) return queue[0];
    if (currentTrackIndex < queue.length - 1) return queue[currentTrackIndex + 1];
    return repeatMode === "all" ? queue[0] : null;
  }

  function playResolvedTrackFromEnd(nextTrack: Track, state: PlaybackResolutionState, nextQueue: Track[] | null = null) {
    if (nextQueue) {
      setPlaybackQueueTrackIds(nextQueue.map((track) => track.id));
    }
    setPlaybackAlbumId(state.playbackAlbumId ?? findAlbumByTrackId(nextTrack.id)?.id ?? state.selectedAlbumId);
    setCurrentTrack(nextTrack);
    playerBarRef.current?.resetPosition();
    setIsPlaying(true);
  }

  function resolveEndedTrack() {
    const state = playbackResolutionRef.current;
    if (!state) return;

    if (state.repeatMode === "one") {
      seekTo(0);
      setIsPlaying(true);
      return;
    }

    if (state.queue.length === 0) {
      seekTo(0);
      return;
    }

    if (state.currentTrackIndex >= 0 && state.currentTrackIndex < state.queue.length - 1) {
      const nextTrack = state.queue[state.currentTrackIndex + 1];
      if (nextTrack) playResolvedTrackFromEnd(nextTrack, state);
      return;
    }

    if (state.repeatMode !== "all") {
      seekTo(0);
      return;
    }

    if (state.isShuffle) {
      const nextQueue = shuffleTracks(state.queue);
      const nextTrack = nextQueue[0];
      if (nextTrack) playResolvedTrackFromEnd(nextTrack, state, nextQueue);
      return;
    }

    const nextTrack = state.queue[0];
    if (nextTrack) playResolvedTrackFromEnd(nextTrack, state);
  }

  function handleTrackEnded() {
    setIsPlaying(false);
    window.setTimeout(resolveEndedTrack, 0);
  }

  function cycleRepeatMode() {
    const nextRepeatMode = getNextRepeatMode(repeatMode);
    sendRemoteCommand("cycle-repeat", { repeatMode: nextRepeatMode });

    setRepeatMode(nextRepeatMode);
  }

  function changeShuffle(nextShuffle: boolean, source = "programmatic") {
    const albumForQueue = playbackAlbum ?? findAlbumByTrackId(currentTrack?.id ?? null);
    const nextQueueTrackIds = albumForQueue
      ? getToggledQueueTracks(albumForQueue, nextShuffle, currentTrack).map((track) => track.id)
      : playbackQueueTrackIds;

    if (source !== "remote-sync") {
      sendRemoteCommand("toggle-shuffle", { isShuffle: nextShuffle, queueTrackIds: nextQueueTrackIds });
    }

    setIsShuffle(nextShuffle);
    setPlaybackQueueTrackIds(nextQueueTrackIds);
  }

  function toggleShuffle() {
    changeShuffle(!isShuffle);
  }

  function changePlaying(isNextPlaying: boolean) {
    if (sendRemoteCommand(isNextPlaying ? "play" : "pause")) return;

    setIsPlaying(isNextPlaying);
  }

  function toggleMute() {
    if (sendRemoteCommand("toggle-mute")) return;

    playerBarRef.current?.toggleMute();
  }

  function stepVolume(delta: number) {
    if (sendRemoteCommand("volume-step", { delta })) return;

    playerBarRef.current?.stepVolume(delta);
  }

  function seekTo(nextTime: number, source = "programmatic") {
    if (source !== "remote-sync" && sendRemoteCommand("seek", { time: nextTime })) return;

    playerBarRef.current?.seekTo(nextTime, source);
    clearAudioAnalysisPacket();
  }

  function setVolume(nextVolume: number, source = "programmatic") {
    const boundedVolume = Math.min(1, Math.max(0, nextVolume));
    if (source !== "remote-sync" && sendRemoteCommand("set-volume", { volume: boundedVolume })) return;

    playerBarRef.current?.setVolume(boundedVolume);
  }

  function jumpToAlbumLetter(letter: string) {
    const targetAlbum = getAlbumJumpTarget(filteredAlbums, letter, t);
    if (!targetAlbum) return;

    const albumsPanel = albumsPanelRef.current;
    const scrollContainer = albumsPanel?.querySelector<HTMLElement>(".albums-panel-main");
    const targetElement = albumsPanel?.querySelector<HTMLElement>(`[data-album-id="${targetAlbum.id}"]`);
    if (!scrollContainer || !targetElement) return;

    const containerTop = scrollContainer.getBoundingClientRect().top;
    const targetTop = targetElement.getBoundingClientRect().top;
    scrollContainer.scrollTo({
      top: scrollContainer.scrollTop + targetTop - containerTop,
      behavior: "smooth",
    });
  }

  function startAlbumPanelDrag(pointerY: number) {
    albumPanelDragStartRef.current = {
      hasDragged: false,
      isCollapsed: isAlbumPanelCollapsed,
      pointerY,
      scrollTop: albumPanelRef.current?.scrollTop ?? 0,
    };
  }

  function overscrollAlbumPanel(pointerY: number) {
    const dragStart = albumPanelDragStartRef.current;
    if (!dragStart) return;

    const dragDistance = pointerY - dragStart.pointerY;
    if (Math.abs(dragDistance) > albumPanelDragTolerance) dragStart.hasDragged = true;

    if (dragStart.isCollapsed && dragDistance < -albumPanelSwipeThreshold) {
      albumPanelDragStartRef.current = null;
      setIsAlbumPanelCollapsed(false);
    } else if (!dragStart.isCollapsed && dragDistance > dragStart.scrollTop + albumPanelSwipeThreshold) {
      albumPanelDragStartRef.current = null;
      setIsAlbumPanelCollapsed(true);
    }
  }

  function scrollAlbumPanel(deltaY: number) {
    const panel = albumPanelRef.current;
    if (isAlbumPanelCollapsed && deltaY > 18) {
      setIsAlbumPanelCollapsed(false);
    } else if (!isAlbumPanelCollapsed && (panel?.scrollTop ?? 0) + deltaY < -18) {
      setIsAlbumPanelCollapsed(true);
    }
  }

  function finishAlbumPanelDrag(pointerY: number) {
    const dragStart = albumPanelDragStartRef.current;
    albumPanelDragStartRef.current = null;
    if (!dragStart) return;

    const dragDistance = pointerY - dragStart.pointerY;
    if (!dragStart.hasDragged && Math.abs(dragDistance) <= albumPanelDragTolerance) return;

    if (dragDistance > dragStart.scrollTop + albumPanelSwipeThreshold) {
      setIsAlbumPanelCollapsed(true);
    } else if (dragDistance < -albumPanelSwipeThreshold) {
      setIsAlbumPanelCollapsed(false);
    }
  }

  function isAlbumPanelInteractiveTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, [role='button']"));
  }

  function startAlbumPanelPointerDrag(event: PointerEvent<HTMLElement>) {
    if (isAlbumPanelInteractiveTarget(event.target)) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    startAlbumPanelDrag(event.clientY);
  }

  function overscrollAlbumPanelPointer(event: PointerEvent<HTMLElement>) {
    overscrollAlbumPanel(event.clientY);
  }

  function finishAlbumPanelPointerDrag(event: PointerEvent<HTMLElement>) {
    finishAlbumPanelDrag(event.clientY);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function getTouchClientY(event: TouchEvent) {
    return event.changedTouches[0]?.clientY ?? event.touches[0]?.clientY ?? null;
  }

  function startAlbumPanelTouchDrag(event: TouchEvent) {
    if (isAlbumPanelInteractiveTarget(event.target)) return;

    const pointerY = getTouchClientY(event);
    if (pointerY !== null) startAlbumPanelDrag(pointerY);
  }

  function overscrollAlbumPanelTouch(event: TouchEvent) {
    const pointerY = getTouchClientY(event);
    if (pointerY === null) return;

    const dragStart = albumPanelDragStartRef.current;
    const dragDistance = dragStart ? pointerY - dragStart.pointerY : 0;
    if (
      dragStart &&
      (dragStart.isCollapsed || (!dragStart.isCollapsed && dragStart.scrollTop <= 0 && dragDistance > albumPanelDragTolerance))
    ) {
      event.preventDefault();
    }

    overscrollAlbumPanel(pointerY);
  }

  function finishAlbumPanelTouchDrag(event: TouchEvent) {
    const pointerY = getTouchClientY(event);
    if (pointerY !== null) {
      finishAlbumPanelDrag(pointerY);
    } else {
      albumPanelDragStartRef.current = null;
    }
  }

  function startAlbumTagEditing() {
    if (!selectedAlbum) return;
    setAlbumTagDraft(makeAlbumTagDraft(selectedAlbum));
    setAlbumTagMessage(null);
    setIsAlbumTagEditing(true);
  }

  function cancelAlbumTagEditing() {
    setAlbumTagDraft(makeAlbumTagDraft(selectedAlbum));
    setAlbumTagMessage(null);
    setIsAlbumTagEditing(false);
  }

  async function saveAlbumTags() {
    if (!selectedAlbum || !hasAlbumTagChanges || isSavingAlbumTags) return;
    if (!albumTagDraft.album.trim()) {
      setAlbumTagMessage({ key: "tags.albumRequired" });
      return;
    }

    try {
      setIsSavingAlbumTags(true);
      if (!hasRealBackend) {
        setAlbums((currentAlbums) =>
          currentAlbums.map((album) =>
            album.id === selectedAlbum.id
              ? {
                  ...album,
                  title: albumTagDraft.album.trim(),
                  artist: albumTagDraft.albumArtist.trim() || album.artist,
                  year: parseOptionalYear(albumTagDraft.year),
                  genre: albumTagDraft.genre.trim() || null,
                  tracks: album.tracks.map((track) => ({
                    ...track,
                    artist: albumTagDraft.artist.trim() || track.artist,
                  })),
                }
              : album,
          ),
        );
        setAlbumTagMessage({ key: "tags.mockSaved" });
      } else {
        const result = await updateAlbumTags(selectedAlbum.id, albumTagDraft);
        const snapshot = await backendInvoke<LibrarySnapshot>("library_snapshot");
        applyLibrarySnapshot(snapshot, { resetPlayback: false });
        notifyLibraryChanged();
        setSelectedAlbumId(result.albumId);
        setAlbumTagMessage(
          result.failedFiles.length > 0
            ? { key: "tags.partialSaved", values: { updated: result.updatedFiles, failed: result.failedFiles.length } }
            : { key: "tags.saved", values: { updated: result.updatedFiles } },
        );
      }
      setIsAlbumTagEditing(false);
    } catch (error) {
      setAlbumTagMessage(toI18nError(error));
    } finally {
      setIsSavingAlbumTags(false);
    }
  }

  async function saveTrackTags() {
    if (!detailTrack || !detailAlbum || !hasTrackTagChanges || isSavingTrackTags) return;
    if (!trackTagDraft.title.trim()) {
      setTrackTagMessage({ key: "tags.trackTitleRequired" });
      return;
    }
    if (!trackTagDraft.album.trim()) {
      setTrackTagMessage({ key: "tags.albumRequired" });
      return;
    }

    try {
      setIsSavingTrackTags(true);
      if (!hasRealBackend) {
        setAlbums((currentAlbums) =>
          currentAlbums.map((album) => ({
            ...album,
            title: album.id === detailAlbum.id ? trackTagDraft.album.trim() : album.title,
            year: album.id === detailAlbum.id ? parseOptionalYear(trackTagDraft.year) : album.year,
            genre: album.id === detailAlbum.id ? trackTagDraft.genre.trim() || null : album.genre,
            tracks: album.tracks.map((track) =>
              track.id === detailTrack.id
                ? {
                    ...track,
                    title: trackTagDraft.title.trim(),
                    artist: trackTagDraft.artist.trim() || track.artist,
                    trackNumber: parseOptionalYear(trackTagDraft.trackNumber),
                    discNumber: parseOptionalYear(trackTagDraft.discNumber),
                  }
                : track,
            ),
          })),
        );
        setTrackTagMessage({ key: "tags.mockSaved" });
      } else {
        const result = await updateTrackTags(detailTrack.id, trackTagDraft);
        const snapshot = await backendInvoke<LibrarySnapshot>("library_snapshot");
        applyLibrarySnapshot(snapshot, { resetPlayback: false });
        notifyLibraryChanged();
        setSelectedAlbumId(result.albumId);
        setDetailTrackId(result.trackId);
        setTrackTagMessage({ key: "tags.trackSaved" });
      }
      setEditingTrackTag(null);
    } catch (error) {
      setTrackTagMessage(toI18nError(error));
    } finally {
      setIsSavingTrackTags(false);
    }
  }

  async function chooseArtwork() {
    setTrackTagMessage(null);

    if (!isTauriRuntime) {
      setTrackTagMessage({ key: "trackDetail.artworkDesktopOnly" });
      return;
    }

    try {
      const selectedPath = await openDialog({
        filters: [
          {
            name: "Images",
            extensions: ["jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff"],
          },
        ],
        multiple: false,
      });

      if (typeof selectedPath === "string") {
        setArtworkDraftPath(selectedPath);
        setArtworkPreviewSrc(getBackendMediaSrc(selectedPath));
      }
    } catch (error) {
      setTrackTagMessage(toI18nError(error));
    }
  }

  async function saveTrackArtwork() {
    if (!detailTrack || !detailAlbum || isSavingArtwork) return;

    if (!artworkDraftPath.trim()) {
      setTrackTagMessage({ key: "trackDetail.artworkRequired" });
      return;
    }

    try {
      setIsSavingArtwork(true);
      setTrackTagMessage(null);

      const result = await updateTrackArtwork(detailTrack.id, artworkDraftPath);
      const snapshot = await backendInvoke<LibrarySnapshot>("library_snapshot");
      applyLibrarySnapshot(snapshot, { resetPlayback: false });
      notifyLibraryChanged();
      setSelectedAlbumId(result.albumId);
      setDetailTrackId(result.trackId);
      setArtworkDraftPath("");
      setArtworkPreviewSrc("");
      setTrackTagMessage({ key: "tags.artworkSaved" });
    } catch (error) {
      setTrackTagMessage(toI18nError(error));
    } finally {
      setIsSavingArtwork(false);
    }
  }

  function getCommandNumber(command: QueuedRemotePlayerCommand, key: string) {
    const value = command.payload?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function getCommandBoolean(command: QueuedRemotePlayerCommand, key: string) {
    const value = command.payload?.[key];
    return typeof value === "boolean" ? value : null;
  }

  function getCommandRepeatMode(command: QueuedRemotePlayerCommand) {
    const value = command.payload?.repeatMode;
    return isRepeatMode(value) ? value : null;
  }

  function playRemoteAlbum(album: Album, command: QueuedRemotePlayerCommand) {
    const commandQueueTrackIds = getCommandNumberArray(command, "queueTrackIds");
    const commandQueue = commandQueueTrackIds ? findTracksByIds(commandQueueTrackIds) : [];
    const shouldShuffle = getCommandBoolean(command, "isShuffle") ?? isShuffle;
    const nextQueue = commandQueue.length > 0 ? commandQueue : getAlbumQueueTracks(album, shouldShuffle);
    const firstTrack = nextQueue[0] ?? null;

    setSelectedAlbumId(album.id);
    setPlaybackAlbumId(album.id);
    setPlaybackQueueTrackIds(nextQueue.map((track) => track.id));
    setCurrentTrack(firstTrack);
    playerBarRef.current?.resetPosition();
    setIsPlaying(Boolean(firstTrack));
  }

  function playRemoteTrack(track: Track, albumId: number | null, command: QueuedRemotePlayerCommand) {
    const album = albums.find((album) => album.id === albumId) ?? findAlbumByTrackId(track.id);
    const commandQueueTrackIds = getCommandNumberArray(command, "queueTrackIds");
    const commandQueue = commandQueueTrackIds ? findTracksByIds(commandQueueTrackIds) : [];
    const shouldShuffle = getCommandBoolean(command, "isShuffle") ?? isShuffle;
    const nextQueue = commandQueue.length > 0 ? commandQueue : album ? getAlbumQueueTracks(album, shouldShuffle, track) : [track];

    setPlaybackAlbumId(album?.id ?? albumId);
    setPlaybackQueueTrackIds(nextQueue.map((track) => track.id));
    setCurrentTrack(track);
    playerBarRef.current?.resetPosition();
    setIsPlaying(true);
  }

  const handleRemoteCommand = useEffectEvent((command: QueuedRemotePlayerCommand) => {
    switch (command.commandType) {
      case "cycle-repeat":
        setRepeatMode(getCommandRepeatMode(command) ?? getNextRepeatMode(repeatMode));
        break;
      case "next":
        playNextTrack();
        break;
      case "pause":
        pausePlayback();
        break;
      case "play":
        playPlayback();
        break;
      case "play-album": {
        const albumId = getCommandNumber(command, "albumId");
        const album = albums.find((album) => album.id === albumId);
        if (album) playRemoteAlbum(album, command);
        break;
      }
      case "play-track": {
        const trackId = getCommandNumber(command, "trackId");
        const albumId = getCommandNumber(command, "albumId") ?? findAlbumByTrackId(trackId)?.id ?? null;
        const track = findTrackById(trackId);
        if (track) playRemoteTrack(track, albumId, command);
        break;
      }
      case "previous":
        playPreviousTrack();
        break;
      case "refresh-library":
        void refreshLibrary();
        break;
      case "seek": {
        const time = getCommandNumber(command, "time");
        if (time !== null) seekTo(time);
        break;
      }
      case "select-album": {
        const albumId = getCommandNumber(command, "albumId");
        const album = albums.find((album) => album.id === albumId);
        if (album) selectAlbum(album);
        break;
      }
      case "select-track": {
        const trackId = getCommandNumber(command, "trackId");
        const track = findTrackById(trackId);
        if (track) selectTrack(track);
        break;
      }
      case "set-volume": {
        const volume = getCommandNumber(command, "volume");
        if (volume !== null) setVolume(volume);
        break;
      }
      case "toggle-mute":
        toggleMute();
        break;
      case "toggle-playback":
        togglePlayback();
        break;
      case "toggle-shuffle":
        changeShuffle(getCommandBoolean(command, "isShuffle") ?? !isShuffle, "remote-sync");
        break;
      case "volume-step": {
        const delta = getCommandNumber(command, "delta");
        if (delta !== null) stepVolume(delta);
        break;
      }
    }
  });

  const publishCurrentRemotePlayerState = useEffectEvent(() => {
    const state: RemotePlayerState = {
      currentTime: playerBarRef.current?.getCurrentTime() ?? 0,
      currentTrackId: currentTrack?.id ?? null,
      isPlaying,
      isShuffle,
      playbackAlbumId,
      queueTrackIds: queue.map((track) => track.id),
      repeatMode,
      selectedAlbumId,
      volume: playerBarRef.current?.getVolume() ?? 0.85,
    };
    void publishRemotePlayerState(state).catch(() => {
      // State publication is best-effort; playback should not be interrupted.
    });
  });

  const syncRemotePlayerState = useEffectEvent(() => {
    const requestId = remoteSyncRequestIdRef.current + 1;
    remoteSyncRequestIdRef.current = requestId;
    void getRemotePlayerState()
      .then(({ receivedAtMs, sentAtMs, state }) => {
        if (requestId !== remoteSyncRequestIdRef.current) return;
        if (state) applyRemotePlayerState(state, { receivedAtMs, sentAtMs });
      })
      .catch((error: unknown) => {
        if (requestId === remoteSyncRequestIdRef.current) setPlaybackError(String(error));
      });
  });

  const loadRemoteTrackAnalysis = useEffectEvent((track: Track) => {
    const clock = remotePlaybackClockRef.current;
    if (clock?.trackId !== track.id) return;
    if (loadedRemoteAudioAnalysisTrackIdRef.current === track.id) return;

    loadedRemoteAudioAnalysisTrackIdRef.current = track.id;
    const duration = Math.max(
      remoteAudioAnalysisFallbackDurationSeconds,
      (track.durationSeconds ?? 0) + remoteAudioAnalysisDurationPaddingSeconds,
    );

    void getRemoteTrackAnalysisSegment(track.id, 0, duration)
      .then((segment) => {
        if (segment.trackId !== remotePlaybackClockRef.current?.trackId) return;
        const nextPacket = makeAudioAnalysisPacketFromSegment(segment, estimateRemotePlaybackTime(remotePlaybackClockRef.current));
        if (nextPacket) audioAnalysisPacketRef.current = nextPacket;
      })
      .catch(() => {
        if (loadedRemoteAudioAnalysisTrackIdRef.current === track.id) loadedRemoteAudioAnalysisTrackIdRef.current = null;
        // Missing analysis is allowed while the desktop app is still decoding the file or a format is unsupported.
      });
  });

  useEffect(() => {
    if (!isTauriRuntime) return;

    publishCurrentRemotePlayerState();
    const timer = window.setInterval(() => publishCurrentRemotePlayerState(), remotePlayerStateSyncIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime) return;

    const pollCommands = () => {
      void getRemotePlayerCommands(lastRemoteCommandIdRef.current)
        .then(({ commands }) => {
          for (const command of commands) {
            lastRemoteCommandIdRef.current = Math.max(lastRemoteCommandIdRef.current, command.id);
            handleRemoteCommand(command);
          }
        })
        .catch((error: unknown) => setPlaybackError(String(error)));
    };

    pollCommands();
    const timer = window.setInterval(pollCommands, 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isBrowserBackendRuntime) return;

    syncRemotePlayerState();
    const timer = window.setInterval(() => syncRemotePlayerState(), remotePlayerStateSyncIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isBrowserBackendRuntime) return;
    if (!currentTrack || !isPlaying) {
      audioAnalysisPacketRef.current = null;
      loadedRemoteAudioAnalysisTrackIdRef.current = null;
      return;
    }

    loadRemoteTrackAnalysis(currentTrack);
  }, [currentTrack?.id, isPlaying]);

  useEffect(() => {
    if (!isMockDataRuntime || !isPlaying || !currentTrack) {
      if (isMockDataRuntime) audioAnalysisPacketRef.current = null;
      return;
    }

    const duration = Math.max(
      remoteAudioAnalysisFallbackDurationSeconds,
      (currentTrack.durationSeconds ?? 0) + remoteAudioAnalysisDurationPaddingSeconds,
    );
    const segment = getMockAudioAnalysisSegment(currentTrack.id, 0, duration);
    const nextPacket = makeAudioAnalysisPacketFromSegment(segment, playerBarRef.current?.getCurrentTime() ?? 0);
    audioAnalysisPacketRef.current = nextPacket;
  }, [currentTrack?.id, isPlaying]);

  useEffect(() => {
    if (!isBrowserBackendRuntime) return;

    const pollLibraryCommands = () => {
      void getRemotePlayerCommands(lastLibraryCommandIdRef.current)
        .then(({ commands }) => {
          for (const command of commands) {
            lastLibraryCommandIdRef.current = Math.max(lastLibraryCommandIdRef.current, command.id);
            if (command.commandType === "refresh-library") {
              void refreshLibrary();
            }
          }
        })
        .catch((error: unknown) => setPlaybackError(String(error)));
    };

    pollLibraryCommands();
    const timer = window.setInterval(pollLibraryCommands, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const mediaKeyHandlers = useMemo(
    () => ({
      onPlayPlayback: playPlayback,
      onPausePlayback: pausePlayback,
      onTogglePlayback: togglePlayback,
      onPreviousTrack: playPreviousTrack,
      onNextTrack: () => playNextTrack(),
      onSeekPlayback: seekTo,
      onVolumeStep: stepVolume,
      onToggleMute: toggleMute,
      onToggleShuffle: toggleShuffle,
      onCycleRepeat: cycleRepeatMode,
      onToggleSidebar: () => setIsSidebarCollapsed((value) => !value),
      onJumpToAlbumLetter: jumpToAlbumLetter,
    }),
    [currentTrack, currentTrackIndex, filteredAlbums, isPlaying, isShuffle, playbackAlbum?.id, queue, repeatMode, selectedAlbum, selectedAlbumId, t],
  );

  useGlobalMediaKeys(mediaKeyHandlers);

  return (
    <main
      className={[
        "app-shell",
        isSidebarCollapsed ? "sidebar-collapsed" : "",
        isAlbumPanelCollapsed ? "album-panel-collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <audio ref={audioRef} preload="metadata" />
      <LibrarySidebar
        displayedLibraryPath={displayedLibraryPath}
        isLibraryMenuOpen={isLibraryMenuOpen}
        isSidebarCollapsed={isSidebarCollapsed}
        isTauriRuntime={hasRealBackend}
        locale={locale}
        onLibraryMenuOpenChange={setIsLibraryMenuOpen}
        onLocaleChange={setLocale}
        onOpenLibrarySettings={() => setIsLibrarySettingsOpen(true)}
        onSidebarCollapsedChange={setIsSidebarCollapsed}
        onThemeNameChange={setThemeName}
        remoteAccess={remoteAccess}
        t={t}
        themeName={themeName}
      />

      <AlbumBrowser
        albumSortDirection={albumSortDirection}
        albumSortMode={albumSortMode}
        albumListMode={albumListMode}
        albums={filteredAlbums}
        albumViewMode={albumViewMode}
        isPlaying={isPlaying}
        isTauriRuntime={hasRealBackend}
        lyricsOnly={lyricsOnly}
        playbackAlbumId={playbackAlbum?.id ?? null}
        onPausePlayback={pausePlayback}
        onPlayAlbum={playAlbum}
        onListModeChange={setAlbumListMode}
        onLyricsOnlyChange={setLyricsOnly}
        onOpenTrackLyrics={openTrackLyrics}
        onPlayTrack={playTrack}
        onQueryChange={setQuery}
        onSelectAlbum={selectAlbum}
        onSortDirectionChange={setAlbumSortDirection}
        onSortModeChange={setAlbumSortMode}
        onViewModeChange={setAlbumViewMode}
        panelRef={albumsPanelRef}
        query={query}
        selectedAlbumId={selectedAlbum?.id ?? null}
        t={t}
      />

      <SelectedAlbumPanel
        albumPanelRef={albumPanelRef}
        albumTagDraft={albumTagDraft}
        albumTagMessage={albumTagMessage}
        currentTrack={currentTrack}
        hasAlbumTagChanges={hasAlbumTagChanges}
        isAlbumPanelCollapsed={isAlbumPanelCollapsed}
        isAlbumTagEditing={isAlbumTagEditing}
        isSavingAlbumTags={isSavingAlbumTags}
        onAlbumPanelPointerCancel={(event) => {
          if (event.pointerType === "touch") return;
          albumPanelDragStartRef.current = null;
        }}
        onAlbumPanelPointerDown={startAlbumPanelPointerDrag}
        onAlbumPanelPointerMove={overscrollAlbumPanelPointer}
        onAlbumPanelPointerUp={finishAlbumPanelPointerDrag}
        onAlbumPanelTouchCancel={() => {
          albumPanelDragStartRef.current = null;
        }}
        onAlbumPanelTouchEnd={finishAlbumPanelTouchDrag}
        onAlbumPanelTouchMove={overscrollAlbumPanelTouch}
        onAlbumPanelTouchStart={startAlbumPanelTouchDrag}
        onAlbumPanelWheel={scrollAlbumPanel}
        onAlbumTagDraftChange={setAlbumTagDraft}
        onCancelAlbumTagEditing={cancelAlbumTagEditing}
        onFinishTrackLongPress={finishTrackLongPress}
        onMoveTrackLongPress={moveTrackLongPress}
        onOpenSelectedAlbumArtworkEditor={openSelectedAlbumArtworkEditor}
        onOpenTrackDetail={openTrackDetail}
        onPlayTrack={playTrack}
        onSaveAlbumTags={() => void saveAlbumTags()}
        onSelectTrack={selectTrack}
        onStartAlbumTagEditing={startAlbumTagEditing}
        onStartTrackLongPress={startTrackLongPress}
        selectedAlbum={selectedAlbum}
        selectedTrackId={selectedTrackId}
        t={t}
      />

      <PlayerBar
        audioRef={audioRef}
        currentAlbum={playbackAlbum}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isRemoteSynced={isBrowserBackendRuntime}
        isShuffle={isShuffle}
        isTauriRuntime={isTauriRuntime}
        onCycleRepeat={cycleRepeatMode}
        onEnded={handleTrackEnded}
        onNextTrack={() => playNextTrack()}
        onPlaybackError={setPlaybackError}
        onPlayingChange={changePlaying}
        onPreviousTrack={playPreviousTrack}
        onSeek={seekTo}
        onSelectCurrentAlbum={() => {
          if (playbackAlbum) selectAlbum(playbackAlbum);
        }}
        onShuffleChange={changeShuffle}
        onTogglePlayback={togglePlayback}
        onOpenVisualizer={() => setIsPlayerVisualizerOpen(true)}
        onVolumeChange={setVolume}
        playbackError={playbackError}
        queueLength={queue.length}
        queueTracks={queue}
        ref={playerBarRef}
        repeatMode={repeatMode}
        t={t}
      />
      {isPlayerVisualizerOpen ? (
        <Suspense fallback={null}>
          <PlayerVisualizerOverlay
            audioRef={audioRef}
            audioAnalysisPacketRef={audioAnalysisPacketRef}
            currentAlbum={playbackAlbum}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            queueTracks={queue}
            onClose={() => setIsPlayerVisualizerOpen(false)}
            onNextTrack={() => playNextTrack()}
            onPreviousTrack={playPreviousTrack}
            onQueueTrackPlay={playQueuedTrack}
            onTogglePlayback={togglePlayback}
            preferRemoteAudioAnalysis={isBrowserBackendRuntime || isMockDataRuntime}
            remotePlaybackClockRef={remotePlaybackClockRef}
            t={t}
          />
        </Suspense>
      ) : null}
      {isLibrarySettingsOpen ? (
        <LibrarySettingsDialog
          isScanning={isScanning}
          isTauriRuntime={isTauriRuntime}
          libraryInfo={libraryInfo}
          libraryPath={libraryPath}
          onChooseFolder={() => void handleChooseFolder()}
          onClose={() => setIsLibrarySettingsOpen(false)}
          onLibraryPathChange={setLibraryPath}
          onScan={() => void handleScan()}
          t={t}
        />
      ) : null}
      {detailTrack && detailAlbum ? (
        <TrackDetailDialog
          artworkDraftPath={artworkDraftPath}
          artworkPreviewSrc={artworkPreviewSrc}
          detailAlbum={detailAlbum}
          detailArtworkSrc={detailArtworkSrc}
          detailLyrics={detailLyrics}
          detailTrack={detailTrack}
          editingTrackTag={editingTrackTag}
          hasRealBackend={hasRealBackend}
          hasTrackTagChanges={hasTrackTagChanges}
          isSavingArtwork={isSavingArtwork}
          isSavingTrackTags={isSavingTrackTags}
          isTauriRuntime={isTauriRuntime}
          onChangeTab={changeTrackDetailTab}
          onChooseArtwork={() => void chooseArtwork()}
          onClose={closeTrackDetail}
          onSaveArtwork={() => void saveTrackArtwork()}
          onSaveTrackTags={() => void saveTrackTags()}
          onTrackTagDraftChange={setTrackTagDraft}
          onTrackTagEditChange={setEditingTrackTag}
          t={t}
          trackDetailTab={trackDetailTab}
          trackTagDraft={trackTagDraft}
          trackTagMessage={trackTagMessage}
        />
      ) : null}
    </main>
  );
}

export default App;
