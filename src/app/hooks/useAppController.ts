import { confirm as confirmDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  type PointerEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { getInitialLocale, translate, type Locale, type TranslationKey } from "../../i18n";
import type { Album, EntityId, Track, LibrarySnapshot, Playlist } from "../../types/audio";
import {
  type AlbumListMode,
  type AlbumSortDirection,
  type AlbumSortMode,
  type AlbumViewMode,
  type I18nMessage,
  type RepeatMode,
  type ThemeName,
  isThemeName,
} from "../../types/app";
import {
  type AlbumTagDraft,
  type TrackTagDraft,
} from "../../lib/tagEditing";
import { checkAppUpdate, installAppUpdate, type AvailableAppUpdate } from "../../lib/appUpdates";
import {
  getBackendMediaSrc,
  hasRealBackend,
  isBrowserBackendRuntime,
  isMockDataRuntime,
  isTauriRuntime,
  type QueuedRemotePlayerCommand,
  type RemotePlayerState,
} from "../../lib/backend";
import { useGlobalMediaKeys } from "../../lib/useGlobalMediaKeys";
import { getMockAudioAnalysisSegment, mockAlbums } from "../../lib/mockData";
import { filterAndSortAlbums } from "../../lib/albumFilters";
import { getArtworkSrc, getAlbumJumpTarget, toI18nError } from "../../lib/libraryUtils";
import { makeAlbumTagDraft } from "../../lib/tagDraftUtils";
import {
  getAlbumQueueTracks,
  getInitialAlbumId,
  getInitialTrack,
  getNextRepeatMode,
  getNextTrack,
  getStoredPlaybackPreferences,
  getToggledQueueTracks,
  isRepeatMode,
  resolveEndedTrack,
  shuffleTracks,
  storePlaybackPreferences,
  type PlaybackPreferences,
  type PlaybackResolutionState,
} from "../../lib/playback";
import { getHeapUsageMb, logRenderDiagnostic } from "../../lib/renderDiagnostics";
import { makeTrackTagDraft } from "../../lib/trackTagDraftUtils";
import { useRemoteAccess } from "../../lib/useRemoteAccess";
import { getMcpSettings, setMcpEnabled } from "../../lib/mcpSettings";
import { type LibrarySidebarSection, type LibrarySidebarSectionState } from "../../components/LibrarySidebar";
import { type PlayerBarHandle } from "../../components/PlayerBar";
import {
  makeAudioAnalysisPacketFromFrames,
  makeAudioAnalysisPacketFromSegment,
  mergeRemoteAudioAnalysisFrames,
  rebaseAudioAnalysisPacketPlaybackTime,
  type RemoteAudioAnalysisFrameEntry,
  type RemoteAudioAnalysisPacket,
} from "../../features/remote-player/domain/audioAnalysisPacket";
import {
  estimateRemotePlaybackTime,
  getRemotePlayerStateAgeSeconds,
  type RemotePlaybackClock,
  type RemotePlayerTiming,
} from "../../features/remote-player/domain/remotePlaybackClock";
import {
  getCommandBoolean,
  getCommandEntityId,
  getCommandEntityIdArray,
  getCommandNumber,
  getCommandRepeatMode,
} from "../../features/remote-player/domain/remoteCommand";
import {
  getStoredLibraryMenuOpen,
  getStoredLibrarySidebarSectionState,
  getStoredSidebarCollapsed,
  getStoredThemeName,
  storeLibraryMenuOpen,
  storeLibrarySidebarSectionState,
  storeLocale,
  storeSidebarCollapsed,
  storeThemeName,
} from "../../features/preferences/infrastructure/localStoragePreferencesRepository";
import {
  findAlbumByTrackId as findAlbumByTrackIdInLibrary,
  findTrackById as findTrackByIdInLibrary,
  findTracksByIds as findTracksByIdsInLibrary,
} from "../../features/library/domain/librarySelection";
import {
  addTracksToPlaylist,
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  loadLibrarySnapshot,
  loadTrackLyrics as loadTrackLyricsFromRepository,
  removePlaylistTrack,
  renamePlaylist,
  reorderPlaylistTrack,
  scanMusicFolder,
  updatePlaylistArtwork,
} from "../../features/library/infrastructure/tauriLibraryRepository";
import {
  loadTrackAudioSource,
  pauseHtmlAudio,
  playHtmlAudio,
  releaseTrackAudioSource,
} from "../../features/playback/infrastructure/htmlAudioPlayer";
import { updateMediaSessionMetadata } from "../../features/playback/infrastructure/mediaSessionAdapter";
import {
  getRemotePlayerCommands,
  getRemotePlayerState,
  getRemoteTrackAnalysisSegment,
  publishRemotePlayerState,
  sendRemotePlayerCommand,
} from "../../features/remote-player/infrastructure/remotePlayerRepository";
import { updateAlbumTags } from "../../features/tag-editing/application/updateAlbumTags";
import { updateTrackArtwork } from "../../features/tag-editing/application/updateTrackArtwork";
import { updateTrackTags } from "../../features/tag-editing/application/updateTrackTags";
import { updateTrackUserState } from "../../features/tag-editing/application/updateTrackUserState";
import {
  albumPanelDragTolerance,
  albumPanelSwipeThreshold,
  audioAnalysisSampleIntervalMs,
  libraryCommandPollIntervalMs,
  playerCommandPollIntervalMs,
  remoteAudioAnalysisChunkDurationSeconds,
  remoteAudioAnalysisDurationPaddingSeconds,
  remoteAudioAnalysisFallbackDurationSeconds,
  remoteAudioAnalysisMaxCachedPackets,
  remotePlaybackClockSnapThresholdSeconds,
  remotePlayerStateSyncIntervalMs,
  remotePlayerStateTransitDelayMaxSeconds,
  staleRemotePlayerStateToleranceSeconds,
  trackLongPressDelayMs,
  trackLongPressMoveTolerance,
} from "./useAppControllerConfig";
import type {
  AlbumPanelDragStart,
  BackgroundAnalysisStatusPayload,
  LibraryLoadProgressPayload,
  LibraryScanProgressPayload,
  RemoteAudioAnalysisLoadState,
  RemotePlayerStateSnapshot,
  SuppressedTrackClick,
  TrackLongPressState,
} from "./useAppControllerTypes";
import { areEntityIdArraysEqual, getHeapTotalUsageMb, waitForNextPaint } from "./useAppControllerUtils";
import {
  hasAlbumTagChanges as getHasAlbumTagChanges,
  hasTrackTagChanges as getHasTrackTagChanges,
  parseOptionalYear,
} from "../../features/tag-editing/domain/tagValidation";

export function useAppController() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerBarRef = useRef<PlayerBarHandle | null>(null);
  const albumsPanelRef = useRef<HTMLElement | null>(null);
  const albumPanelRef = useRef<HTMLElement | null>(null);
  const albumPanelDragStartRef = useRef<AlbumPanelDragStart | null>(null);
  const trackLongPressRef = useRef<TrackLongPressState | null>(null);
  const suppressedTrackClickRef = useRef<SuppressedTrackClick | null>(null);
  const lastLibraryCommandIdRef = useRef(0);
  const lastRemoteCommandIdRef = useRef(0);
  const remoteAudioAnalysisLoadStateRef = useRef<RemoteAudioAnalysisLoadState | null>(null);
  const remoteAudioAnalysisPacketsByTrackRef = useRef(new Map<EntityId, RemoteAudioAnalysisPacket>());
  const activeRemoteAudioAnalysisWarmupsRef = useRef(new Set<EntityId>());
  const loadedRemoteAudioAnalysisTrackIdRef = useRef<EntityId | null>(null);
  const lastRemotePlayerStateRef = useRef<RemotePlayerStateSnapshot | null>(null);
  const remoteSyncRequestIdRef = useRef(0);
  const remotePlaybackClockRef = useRef<RemotePlaybackClock | null>(null);
  const playbackResolutionRef = useRef<PlaybackResolutionState | null>(null);
  const renderCountRef = useRef(0);
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());
  const [themeName, setThemeName] = useState<ThemeName>(() => getStoredThemeName(isThemeName));
  const t = useMemo(() => {
    return (key: TranslationKey, values?: Record<string, string | number>) => translate(locale, key, values);
  }, [locale]);
  const [query, setQuery] = useState("");
  const storedPlaybackPreferences = useMemo(() => getStoredPlaybackPreferences(), []);
  const [libraryPath, setLibraryPath] = useState("");
  const [libraryInfo, setLibraryInfo] = useState<I18nMessage | null>(
    hasRealBackend ? { key: "status.noLibraryScanned" } : { key: "status.webMockMode" },
  );
  const [updateInfo, setUpdateInfo] = useState<I18nMessage | null>(null);
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [availableAppUpdate, setAvailableAppUpdate] = useState<AvailableAppUpdate | null>(null);
  const [isMcpEnabled, setIsMcpEnabled] = useState(false);
  const [mcpUrl, setMcpUrl] = useState<string | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [albums, setAlbums] = useState<Album[]>(hasRealBackend ? [] : mockAlbums);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<EntityId | null>(() =>
    hasRealBackend ? null : getInitialAlbumId(mockAlbums, storedPlaybackPreferences.selectedAlbumId),
  );
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<EntityId | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<EntityId | null>(null);
  const [playbackAlbumId, setPlaybackAlbumId] = useState<EntityId | null>(() =>
    hasRealBackend ? null : getInitialAlbumId(mockAlbums, storedPlaybackPreferences.playbackAlbumId),
  );
  const [playbackPlaylistId, setPlaybackPlaylistId] = useState<EntityId | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(() =>
    hasRealBackend ? null : getInitialTrack(mockAlbums, getInitialAlbumId(mockAlbums, storedPlaybackPreferences.playbackAlbumId)),
  );
  const [playbackQueueTrackIds, setPlaybackQueueTrackIds] = useState<EntityId[]>(() => {
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => getStoredSidebarCollapsed());
  const [isAlbumPanelCollapsed, setIsAlbumPanelCollapsed] = useState(false);
  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(() => getStoredLibraryMenuOpen());
  const [librarySidebarSectionState, setLibrarySidebarSectionState] = useState<LibrarySidebarSectionState>(() =>
    getStoredLibrarySidebarSectionState(),
  );
  const [isLibrarySettingsOpen, setIsLibrarySettingsOpen] = useState(false);
  const [isPlayerVisualizerOpen, setIsPlayerVisualizerOpen] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isAlbumTagEditing, setIsAlbumTagEditing] = useState(false);
  const [albumTagDraft, setAlbumTagDraft] = useState<AlbumTagDraft>(() => makeAlbumTagDraft(mockAlbums[0] ?? null));
  const [isSavingAlbumTags, setIsSavingAlbumTags] = useState(false);
  const [albumTagMessage, setAlbumTagMessage] = useState<I18nMessage | null>(null);
  const [detailTrackId, setDetailTrackId] = useState<EntityId | null>(null);
  const [trackDetailTab, setTrackDetailTab] = useState<"info" | "lyrics" | "artwork">("info");
  const [trackLyricsById, setTrackLyricsById] = useState<Record<string, string | null>>({});
  const [trackTagDraft, setTrackTagDraft] = useState<TrackTagDraft>(() => makeTrackTagDraft(null, mockAlbums[0] ?? null));
  const [editingTrackTag, setEditingTrackTag] = useState<keyof TrackTagDraft | null>(null);
  const [isSavingTrackTags, setIsSavingTrackTags] = useState(false);
  const [isSavingTrackUserState, setIsSavingTrackUserState] = useState(false);
  const [trackTagMessage, setTrackTagMessage] = useState<I18nMessage | null>(null);
  const [artworkDraftPath, setArtworkDraftPath] = useState("");
  const [artworkPreviewSrc, setArtworkPreviewSrc] = useState("");
  const [isSavingArtwork, setIsSavingArtwork] = useState(false);
  const [isSavingPlaylistArtwork, setIsSavingPlaylistArtwork] = useState(false);
  const remoteAccess = useRemoteAccess();
  renderCountRef.current += 1;

  useEffect(() => {
    document.documentElement.lang = locale;
    storeLocale(locale);
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    storeThemeName(themeName);
  }, [themeName]);

  useEffect(() => {
    storeSidebarCollapsed(isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  useEffect(() => {
    storeLibraryMenuOpen(isLibraryMenuOpen);
  }, [isLibraryMenuOpen]);

  useEffect(() => {
    storeLibrarySidebarSectionState(librarySidebarSectionState);
  }, [librarySidebarSectionState]);

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
    if (!isTauriRuntime) return;

    const unlistenLoad = listen<LibraryLoadProgressPayload>("musical-library-load-progress", (event) => {
      const payload = event.payload;
      if (payload.status === "completed") return;

      if (payload.status === "opening") {
        setLibraryInfo({ key: "status.libraryLoadOpening" });
        return;
      }

      if (payload.status === "assets") {
        setLibraryInfo({ key: "status.libraryLoadAssets", values: { albums: payload.total, tracks: payload.tracks } });
        return;
      }

      setLibraryInfo({
        key: "status.libraryLoadAlbums",
        values: {
          albums: payload.processed,
          total: payload.total,
          tracks: payload.tracks,
        },
      });
    });

    const unlistenScan = listen<LibraryScanProgressPayload>("musical-library-scan-progress", (event) => {
      const payload = event.payload;
      if (payload.status === "completed") return;

      if (payload.status === "discovering") {
        setLibraryInfo({ key: "status.scanDiscovering", values: { libraryPath: payload.libraryPath } });
        return;
      }

      if (payload.status === "writing") {
        setLibraryInfo({
          key: "status.scanWriting",
          values: { imported: payload.imported, skipped: payload.skipped },
        });
        return;
      }

      setLibraryInfo({
        key: "status.scanReading",
        values: {
          imported: payload.imported,
          processed: payload.processed,
          skipped: payload.skipped,
          total: payload.total,
        },
      });
    });

    const unlisten = listen<BackgroundAnalysisStatusPayload>("musical-analysis-status", (event) => {
      const payload = event.payload;
      if (payload.status === "started") {
        setLibraryInfo({ key: "status.analysisStarted", values: { tracks: payload.total } });
      } else {
        setLibraryInfo({
          key: "status.analysisComplete",
          values: { completed: payload.completed, failed: payload.failed, total: payload.total },
        });
      }
    });

    return () => {
      void unlistenLoad.then((dispose) => dispose());
      void unlistenScan.then((dispose) => dispose());
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime) return;

    void getMcpSettings()
      .then((settings) => {
        setIsMcpEnabled(settings?.enabled ?? false);
        setMcpUrl(settings?.url ?? null);
        setMcpError(null);
      })
      .catch((error: unknown) => {
        setIsMcpEnabled(false);
        setMcpUrl(null);
        setMcpError(String(error));
      });
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
      setPlaybackPlaylistId(null);
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
    setPlaybackPlaylistId(null);
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

    const nextAudioSourceKey = loadTrackAudioSource(audio, currentTrack, isTauriRuntime);
    audioAnalysisPacketRef.current = null;
    if (nextAudioSourceKey) setAudioSourceKey(nextAudioSourceKey);

    return () => {
      releaseTrackAudioSource(audio);
    };
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isTauriRuntime) return;

    if (!audioSourceKey) {
      pauseHtmlAudio(audio);
      return;
    }

    if (isPlaying) {
      void playHtmlAudio(audio).catch((error: unknown) => {
        setIsPlaying(false);
        setPlaybackError(`${String(error)} / ${audio.currentSrc || audio.src}`);
      });
    } else {
      pauseHtmlAudio(audio);
    }
  }, [audioSourceKey, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isTauriRuntime || !audioSourceKey || !isPlaying) return;

    const timer = window.setInterval(() => {
      if (!audio.paused || audio.ended) return;
      void playHtmlAudio(audio).catch((error: unknown) => {
        setIsPlaying(false);
        setPlaybackError(`${String(error)} / ${audio.currentSrc || audio.src}`);
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [audioSourceKey, isPlaying, isTauriRuntime]);

  function clearAudioAnalysisPacket() {
    audioAnalysisPacketRef.current = null;
  }

  function getRemoteAudioAnalysisRetainedTrackIds(trackId: EntityId | null = null) {
    const retainedTrackIds = new Set<EntityId>();
    if (trackId != null) retainedTrackIds.add(trackId);
    if (currentTrack?.id != null) retainedTrackIds.add(currentTrack.id);
    if (loadedRemoteAudioAnalysisTrackIdRef.current != null) {
      retainedTrackIds.add(loadedRemoteAudioAnalysisTrackIdRef.current);
    }
    if (remotePlaybackClockRef.current?.trackId != null) {
      retainedTrackIds.add(remotePlaybackClockRef.current.trackId);
    }

    const anchorTrackIndex =
      currentTrackIndex >= 0
        ? currentTrackIndex
        : trackId != null
          ? queue.findIndex((track) => track.id === trackId)
          : -1;
    if (anchorTrackIndex >= 0) {
      const lastRetainedQueueIndex = Math.min(queue.length - 1, anchorTrackIndex + 1);
      for (let index = Math.max(0, anchorTrackIndex - 1); index <= lastRetainedQueueIndex; index += 1) {
        retainedTrackIds.add(queue[index].id);
      }
    }

    return retainedTrackIds;
  }

  function logRemoteAudioAnalysisCacheDiagnostic(label: string, purgedTrackIds: EntityId[]) {
    const payload = {
      audioAnalysisPacketsCached: remoteAudioAnalysisPacketsByTrackRef.current.size,
      jsHeapTotalMb: getHeapTotalUsageMb(),
      jsHeapUsedMb: getHeapUsageMb(),
      purgedAudioAnalysisPackets: purgedTrackIds.length,
      purgedTrackIds,
    };
    logRenderDiagnostic(label, payload);
    console.debug(`[remote-audio-analysis] ${label} ${JSON.stringify(payload)}`);
  }

  function purgeRemoteAudioAnalysisPackets(retainTrackId: EntityId | null = null) {
    const packetsByTrack = remoteAudioAnalysisPacketsByTrackRef.current;
    if (packetsByTrack.size <= remoteAudioAnalysisMaxCachedPackets) return;

    const retainedTrackIds = getRemoteAudioAnalysisRetainedTrackIds(retainTrackId);
    const purgedTrackIds: EntityId[] = [];
    while (packetsByTrack.size > remoteAudioAnalysisMaxCachedPackets) {
      const purgeTrackId =
        [...packetsByTrack.keys()].find((trackId) => !retainedTrackIds.has(trackId)) ??
        packetsByTrack.keys().next().value;
      if (purgeTrackId == null) break;
      packetsByTrack.delete(purgeTrackId);
      purgedTrackIds.push(purgeTrackId);
    }

    if (purgedTrackIds.length === 0) return;
    logRemoteAudioAnalysisCacheDiagnostic("Remote audio analysis cache purged", purgedTrackIds);
  }

  function clearRemoteAudioAnalysisPacketCache() {
    const packetsByTrack = remoteAudioAnalysisPacketsByTrackRef.current;
    if (packetsByTrack.size === 0) return;

    const purgedTrackIds = [...packetsByTrack.keys()];
    packetsByTrack.clear();
    logRemoteAudioAnalysisCacheDiagnostic("Remote audio analysis cache cleared", purgedTrackIds);
  }

  const filteredAlbums = useMemo(
    () => filterAndSortAlbums(albums, query, albumSortMode, albumSortDirection, t, lyricsOnly),
    [albumSortDirection, albumSortMode, albums, lyricsOnly, query, t],
  );
  const selectedAlbum =
    albums.find((album) => album.id === selectedAlbumId) ?? filteredAlbums[0] ?? albums[0] ?? null;
  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const selectedAlbumTrackEntries = useMemo(
    () => selectedAlbum?.tracks.map((track, trackIndex) => ({ album: selectedAlbum, track, trackIndex })) ?? [],
    [selectedAlbum],
  );
  const selectedPlaylistTrackEntries = useMemo(
    () =>
      selectedPlaylist?.tracks.map((track, trackIndex) => ({
        album: findAlbumByTrackId(track.id),
        track,
        trackIndex,
      })) ?? [],
    [albums, selectedPlaylist],
  );
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
  const hasAlbumTagChanges = getHasAlbumTagChanges(albumTagDraft, selectedAlbum);
  const displayedLibraryPath = libraryPath.trim() || t("scan.selectLibrary");
  const detailAlbum =
    albums.find((album) => album.tracks.some((track) => track.id === detailTrackId)) ?? selectedAlbum;
  const detailTrack =
    detailAlbum?.tracks.find((track) => track.id === detailTrackId) ?? null;
  const detailArtworkSrc = useMemo(
    () => (detailAlbum ? getArtworkSrc(detailAlbum) : ""),
    [detailAlbum?.artworkPath, detailAlbum?.coverUrl],
  );
  const detailLyrics = detailTrack ? trackLyricsById[String(detailTrack.id)] : null;
  const currentLyrics = currentTrack ? trackLyricsById[String(currentTrack.id)] : null;
  const hasTrackTagChanges = getHasTrackTagChanges(trackTagDraft, detailTrack, detailAlbum);

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
    updateMediaSessionMetadata({ currentTrack, isPlaying, playbackAlbum, t });
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
  }, [detailAlbum?.id, detailTrack?.id]);

  useEffect(() => {
    return () => {
      clearTrackLongPress();
      clearSuppressedTrackClick();
    };
  }, []);

  async function refreshLibrary() {
    try {
      setLibraryInfo({ key: "status.libraryLoadOpening" });
      const snapshot = await loadLibrarySnapshot();
      setLibraryInfo({
        key: "status.libraryLoadApplying",
        values: {
          albums: snapshot.albums.length,
          tracks: snapshot.albums.reduce((total, album) => total + album.tracks.length, 0),
        },
      });
      await waitForNextPaint();
      applyLibrarySnapshot(snapshot, { resetPlayback: true });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  async function changeMcpEnabled(enabled: boolean) {
    setIsMcpEnabled(enabled);
    setMcpError(null);

    try {
      const settings = await setMcpEnabled(enabled);
      setIsMcpEnabled(settings.enabled);
      setMcpUrl(settings.url);
    } catch (error) {
      setIsMcpEnabled(!enabled);
      setMcpError(String(error));
    }
  }

  function changeLibrarySidebarSectionOpen(section: LibrarySidebarSection, isOpen: boolean) {
    setLibrarySidebarSectionState((state) => ({
      ...state,
      [section]: isOpen,
    }));
  }

  function applyLibrarySnapshot(snapshot: LibrarySnapshot, options: { resetPlayback: boolean }) {
    setAlbums(snapshot.albums);
    applyPlaylistSnapshot(snapshot);
    clearRemoteAudioAnalysisPacketCache();
    setTrackLyricsById({});
    if (options.resetPlayback) {
      const restoredSelectedAlbumId = getInitialAlbumId(snapshot.albums, storedPlaybackPreferences.selectedAlbumId);
      const restoredPlaybackAlbumId =
        getInitialAlbumId(snapshot.albums, storedPlaybackPreferences.playbackAlbumId) ?? restoredSelectedAlbumId;
      setSelectedAlbumId(restoredSelectedAlbumId);
      setPlaybackAlbumId(restoredPlaybackAlbumId);
      setPlaybackPlaylistId(null);
      const restoredTrack = getInitialTrack(snapshot.albums, restoredPlaybackAlbumId);
      setCurrentTrack(restoredTrack);
      setPlaybackQueueTrackIds(
        snapshot.albums.find((album) => album.id === restoredPlaybackAlbumId)?.tracks.map((track) => track.id) ?? [],
      );
    }
    setLibraryLoadedInfo(snapshot);
  }

  function applyPlaylistSnapshot(snapshot: LibrarySnapshot) {
    setPlaylists(snapshot.playlists ?? []);
    setSelectedPlaylistId((playlistId) =>
      playlistId && snapshot.playlists?.some((playlist) => playlist.id === playlistId) ? playlistId : null,
    );
    setLibraryPath(snapshot.lastScanPath ?? "");
    setLibraryLoadedInfo(snapshot);
  }

  function setLibraryLoadedInfo(snapshot: LibrarySnapshot) {
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

  function findTrackById(trackId: EntityId | null) {
    return findTrackByIdInLibrary(albums, trackId);
  }

  function findAlbumByTrackId(trackId: EntityId | null) {
    return findAlbumByTrackIdInLibrary(albums, trackId);
  }

  function findTracksByIds(trackIds: EntityId[]) {
    return findTracksByIdsInLibrary(albums, trackIds);
  }

  function applyTrackUserState(trackId: EntityId, isFavorite: boolean, rating: number | null) {
    setAlbums((currentAlbums) =>
      currentAlbums.map((album) => ({
        ...album,
        tracks: album.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                isFavorite,
                rating,
              }
            : track,
        ),
      })),
    );
    setCurrentTrack((track) => (track?.id === trackId ? { ...track, isFavorite, rating } : track));
  }

  function applyRemotePlayerState(
    state: RemotePlayerState,
    timing: RemotePlayerTiming | null = null,
  ) {
    const now = performance.now();
    const previousClock = remotePlaybackClockRef.current;
    const previousRemoteState = lastRemotePlayerStateRef.current;
    const stateAgeSeconds = state.isPlaying && timing
      ? getRemotePlayerStateAgeSeconds(timing, remotePlayerStateTransitDelayMaxSeconds)
      : 0;
    const correctedStateTime = state.currentTime + stateAgeSeconds;
    const isSameTrack = previousClock?.trackId === state.currentTrackId;
    const isRepeatedRemoteTime =
      previousRemoteState?.trackId === state.currentTrackId &&
      previousRemoteState.isPlaying === state.isPlaying &&
      Math.abs(previousRemoteState.currentTime - state.currentTime) < 0.001;
    const estimatedTime = estimateRemotePlaybackTime(previousClock, now);
    const shouldKeepEstimatedTime = Boolean(isSameTrack && previousClock?.isPlaying && state.isPlaying) && (
      Math.abs(correctedStateTime - estimatedTime) < remotePlaybackClockSnapThresholdSeconds ||
      (isRepeatedRemoteTime && correctedStateTime < estimatedTime - staleRemotePlayerStateToleranceSeconds)
    );
    const syncedCurrentTime = shouldKeepEstimatedTime ? estimatedTime : correctedStateTime;

    if (previousClock?.trackId !== state.currentTrackId) {
      audioAnalysisPacketRef.current = null;
      remoteAudioAnalysisLoadStateRef.current = null;
      loadedRemoteAudioAnalysisTrackIdRef.current = null;
    }
    lastRemotePlayerStateRef.current = {
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      trackId: state.currentTrackId,
    };
    if (playbackAlbumId !== state.playbackAlbumId) {
      setPlaybackAlbumId(state.playbackAlbumId);
    }
    if (playbackPlaylistId !== null) {
      setPlaybackPlaylistId(null);
    }

    const syncedTrack = findTrackById(state.currentTrackId);
    if (currentTrack?.id !== syncedTrack?.id) {
      setCurrentTrack(syncedTrack);
    }
    if (!areEntityIdArraysEqual(playbackQueueTrackIds, state.queueTrackIds)) {
      setPlaybackQueueTrackIds(state.queueTrackIds);
    }

    if (isPlaying !== state.isPlaying) {
      setIsPlaying(state.isPlaying);
    }
    if (isShuffle !== state.isShuffle) {
      setIsShuffle(state.isShuffle);
    }

    const syncedRepeatMode = isRepeatMode(state.repeatMode) ? state.repeatMode : "off";
    if (repeatMode !== syncedRepeatMode) {
      setRepeatMode(syncedRepeatMode);
    }

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
    if (Math.abs((playerBarRef.current?.getVolume() ?? 0.85) - state.volume) > 0.001) {
      setVolume(state.volume, "remote-sync");
    }
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
      const summary = await scanMusicFolder(normalizedPath);
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

  async function handleCheckForUpdate() {
    if (availableAppUpdate) {
      await confirmAndInstallAppUpdate(availableAppUpdate);
      return;
    }

    setIsCheckingForUpdate(true);
    setUpdateInfo({ key: "updates.checking" });

    try {
      const result = await checkAppUpdate();
      if (result.status === "unsupported") {
        setAvailableAppUpdate(null);
        setUpdateInfo({ key: "updates.desktopOnly" });
      } else if (result.status === "none") {
        setAvailableAppUpdate(null);
        setUpdateInfo({ key: "updates.none" });
      } else {
        setAvailableAppUpdate(result);
        setUpdateInfo({ key: "updates.available", values: { version: result.version } });
        setIsCheckingForUpdate(false);
        await confirmAndInstallAppUpdate(result);
      }
    } catch (error) {
      setUpdateInfo(toI18nError(error));
    } finally {
      setIsCheckingForUpdate(false);
    }
  }

  async function confirmAndInstallAppUpdate(appUpdate: AvailableAppUpdate) {
    const shouldInstall = await confirmDialog(t("updates.confirmMessage", { version: appUpdate.version }), {
      cancelLabel: t("updates.confirmLater"),
      kind: "info",
      okLabel: t("updates.confirmInstall"),
      title: t("updates.confirmTitle"),
    });

    if (!shouldInstall) {
      setUpdateInfo({ key: "updates.postponed", values: { version: appUpdate.version } });
      return;
    }

    setIsCheckingForUpdate(true);
    setUpdateInfo({ key: "updates.installing" });
    try {
      const installResult = await installAppUpdate(appUpdate.update);
      setAvailableAppUpdate(null);
      setUpdateInfo({ key: "updates.installed", values: { version: installResult.version } });
    } catch (error) {
      setUpdateInfo(toI18nError(error));
    } finally {
      setIsCheckingForUpdate(false);
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
    setSelectedPlaylistId(null);
    setSelectedTrackId(null);
    setIsAlbumTagEditing(false);
    setAlbumTagMessage(null);
  }, []);

  const selectPlaylist = useCallback((playlist: Playlist) => {
    setSelectedPlaylistId(playlist.id);
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
    setPlaybackPlaylistId(null);
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
    setPlaybackPlaylistId(null);
    setPlaybackQueueTrackIds(queueTrackIds);
    setCurrentTrack(track);
    setIsPlaying(true);
  }, [albums, isShuffle, selectedAlbumId]);

  const playPlaylist = useCallback((playlist: Playlist) => {
    const queueTracks = playlist.tracks;
    const firstTrack = queueTracks[0] ?? null;
    if (!firstTrack) return;
    const firstAlbum = firstTrack ? findAlbumByTrackId(firstTrack.id) : null;
    const queueTrackIds = queueTracks.map((track) => track.id);
    if (sendRemoteCommand("play-track", {
      albumId: firstAlbum?.id ?? null,
      trackId: firstTrack.id,
      isShuffle: false,
      queueTrackIds,
    })) return;

    setPlaybackAlbumId(firstAlbum?.id ?? null);
    setPlaybackPlaylistId(playlist.id);
    setPlaybackQueueTrackIds(queueTrackIds);
    setCurrentTrack(firstTrack);
    playerBarRef.current?.resetPosition();
    setIsPlaying(Boolean(firstTrack));
  }, [albums]);

  async function createEmptyPlaylist(name = t("playlists.defaultName")) {
    const playlistName = name.trim();
    if (!playlistName) {
      setLibraryInfo({ key: "status.emptyPlaylistName" });
      return;
    }

    try {
      if (!hasRealBackend) {
        const playlistId = `mock-playlist-${Date.now()}`;
        setPlaylists((currentPlaylists) => [
          ...currentPlaylists,
          {
            id: playlistId,
            name: playlistName,
            filePath: "",
            artworkPath: null,
            missingTrackPaths: [],
            trackCount: 0,
            tracks: [],
          },
        ]);
        setSelectedPlaylistId(playlistId);
        setLibraryInfo({ key: "status.playlistSaved" });
        return;
      }

      const previousPlaylistIds = new Set(playlists.map((playlist) => playlist.id));
      const snapshot = await createPlaylist(playlistName);
      applyPlaylistSnapshot(snapshot);
      setSelectedPlaylistId(
        snapshot.playlists.find((playlist) => !previousPlaylistIds.has(playlist.id))?.id ??
          snapshot.playlists[snapshot.playlists.length - 1]?.id ??
          null,
      );
      notifyLibraryChanged();
      setLibraryInfo({ key: "status.playlistSaved" });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  async function addTrackToSelectedPlaylist(track: Track, playlist: Playlist) {
    try {
      if (!hasRealBackend) {
        setPlaylists((currentPlaylists) =>
          currentPlaylists.map((currentPlaylist) => {
            if (currentPlaylist.id !== playlist.id || currentPlaylist.tracks.some((playlistTrack) => playlistTrack.id === track.id)) {
              return currentPlaylist;
            }
            const tracks = [...currentPlaylist.tracks, track];
            return {
              ...currentPlaylist,
              trackCount: tracks.length,
              tracks,
            };
          }),
        );
        setLibraryInfo({ key: "status.playlistTrackAdded" });
        return;
      }

      const snapshot = await addTrackToPlaylist(playlist.id, track.id);
      applyPlaylistSnapshot(snapshot);
      notifyLibraryChanged();
      setLibraryInfo({ key: "status.playlistTrackAdded" });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  async function addTracksToSelectedPlaylist(tracks: Track[], playlist: Playlist) {
    const trackIds = tracks.map((track) => track.id);
    if (trackIds.length === 0) return;

    try {
      if (!hasRealBackend) {
        setPlaylists((currentPlaylists) =>
          currentPlaylists.map((currentPlaylist) => {
            if (currentPlaylist.id !== playlist.id) return currentPlaylist;
            const existingIds = new Set(currentPlaylist.tracks.map((track) => String(track.id)));
            const nextTracks = [
              ...currentPlaylist.tracks,
              ...tracks.filter((track) => !existingIds.has(String(track.id))),
            ];
            return { ...currentPlaylist, trackCount: nextTracks.length, tracks: nextTracks };
          }),
        );
        setLibraryInfo({ key: "status.playlistTrackAdded" });
        return;
      }

      const snapshot = await addTracksToPlaylist(playlist.id, trackIds);
      applyPlaylistSnapshot(snapshot);
      setSelectedPlaylistId(playlist.id);
      notifyLibraryChanged();
      setLibraryInfo({ key: "status.playlistTrackAdded" });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  async function renameSelectedPlaylist(playlist: Playlist, name: string) {
    const playlistName = name.trim();
    if (!playlistName) {
      setLibraryInfo({ key: "status.emptyPlaylistName" });
      return;
    }

    try {
      if (!hasRealBackend) {
        setPlaylists((currentPlaylists) =>
          currentPlaylists.map((currentPlaylist) =>
            currentPlaylist.id === playlist.id ? { ...currentPlaylist, name: playlistName } : currentPlaylist,
          ),
        );
        setLibraryInfo({ key: "status.playlistSaved" });
        return;
      }

      const snapshot = await renamePlaylist(playlist.id, playlistName);
      applyPlaylistSnapshot(snapshot);
      setSelectedPlaylistId(playlist.id);
      notifyLibraryChanged();
      setLibraryInfo({ key: "status.playlistSaved" });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  async function deleteSelectedPlaylist(playlist: Playlist) {
    try {
      if (!hasRealBackend) {
        setPlaylists((currentPlaylists) => currentPlaylists.filter((currentPlaylist) => currentPlaylist.id !== playlist.id));
        setSelectedPlaylistId(null);
        setPlaybackPlaylistId((playlistId) => (playlistId === playlist.id ? null : playlistId));
        setLibraryInfo({ key: "status.playlistDeleted" });
        return;
      }

      const snapshot = await deletePlaylist(playlist.id);
      applyPlaylistSnapshot(snapshot);
      setSelectedPlaylistId(null);
      setPlaybackPlaylistId((playlistId) => (playlistId === playlist.id ? null : playlistId));
      notifyLibraryChanged();
      setLibraryInfo({ key: "status.playlistDeleted" });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  async function removeTrackFromSelectedPlaylist(playlist: Playlist, trackIndex: number) {
    try {
      if (!hasRealBackend) {
        setPlaylists((currentPlaylists) =>
          currentPlaylists.map((currentPlaylist) => {
            if (currentPlaylist.id !== playlist.id) return currentPlaylist;
            const tracks = currentPlaylist.tracks.filter((_, index) => index !== trackIndex);
            return { ...currentPlaylist, trackCount: tracks.length, tracks };
          }),
        );
        setLibraryInfo({ key: "status.playlistTrackRemoved" });
        return;
      }

      const snapshot = await removePlaylistTrack(playlist.id, trackIndex);
      applyPlaylistSnapshot(snapshot);
      setSelectedPlaylistId(playlist.id);
      notifyLibraryChanged();
      setLibraryInfo({ key: "status.playlistTrackRemoved" });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  async function reorderTrackInSelectedPlaylist(playlist: Playlist, fromIndex: number, toIndex: number) {
    try {
      if (!hasRealBackend) {
        setPlaylists((currentPlaylists) =>
          currentPlaylists.map((currentPlaylist) => {
            if (currentPlaylist.id !== playlist.id) return currentPlaylist;
            const tracks = [...currentPlaylist.tracks];
            const [track] = tracks.splice(fromIndex, 1);
            if (!track) return currentPlaylist;
            tracks.splice(toIndex, 0, track);
            return { ...currentPlaylist, tracks };
          }),
        );
        setLibraryInfo({ key: "status.playlistSaved" });
        return;
      }

      const snapshot = await reorderPlaylistTrack(playlist.id, fromIndex, toIndex);
      applyPlaylistSnapshot(snapshot);
      setSelectedPlaylistId(playlist.id);
      notifyLibraryChanged();
      setLibraryInfo({ key: "status.playlistSaved" });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  async function reloadPlaylists() {
    try {
      const snapshot = hasRealBackend ? await loadLibrarySnapshot() : { albums, playlists, lastScanPath: libraryPath || null, databasePath: "" };
      applyPlaylistSnapshot(snapshot);
      notifyLibraryChanged();
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  function openAlbumFromPlaylist(album: Album) {
    setAlbumViewMode("large");
    selectAlbum(album);
  }

  function openPlaylistAddTracks() {
    setAlbumViewMode("large");
    setSelectedPlaylistId(null);
  }

  const playQueuedTrack = useCallback((track: Track) => {
    const queueTrackIds = queue.map((track) => track.id);
    const album = playbackAlbum ?? findAlbumByTrackId(track.id);
    const albumId = album?.id ?? selectedAlbumId;
    if (sendRemoteCommand("play-track", { albumId, trackId: track.id, isShuffle, queueTrackIds })) return;

    setPlaybackAlbumId(albumId);
    setPlaybackPlaylistId(null);
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

  function suppressTrackClick(trackId: EntityId) {
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
      setTrackLyricsById((current) => ({ ...current, [String(track.id)]: null }));
      return;
    }

    if (track.id in trackLyricsById) return;

    if (!hasRealBackend) {
      setTrackLyricsById((current) => ({ ...current, [String(track.id)]: track.lyrics ?? null }));
      return;
    }

    try {
      const lyrics = await loadTrackLyricsFromRepository(track.id);
      setTrackLyricsById((current) => ({ ...current, [String(track.id)]: lyrics }));
    } catch (error) {
      setTrackTagMessage(toI18nError(error));
      setTrackLyricsById((current) => ({ ...current, [String(track.id)]: null }));
    }
  }

  function changeTrackDetailTab(tab: "info" | "lyrics" | "artwork") {
    setTrackDetailTab(tab);
    if (tab === "lyrics" && detailTrack) {
      void loadTrackLyrics(detailTrack);
    }
  }

  useEffect(() => {
    if (!isPlayerVisualizerOpen || !currentTrack) return;
    void loadTrackLyrics(currentTrack);
  }, [currentTrack, isPlayerVisualizerOpen]);

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
    const nextTrack = getNextTrack({ currentTrackIndex, queue, repeatMode });
    if (!nextTrack) {
      setIsPlaying(false);
      seekTo(0);
      return;
    }

    setCurrentTrack(nextTrack);
    playerBarRef.current?.resetPosition();
    setIsPlaying(options.autoplay ?? true);
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

  function resolveEndedPlayback() {
    const state = playbackResolutionRef.current;
    const resolution = resolveEndedTrack(state, shuffleTracks);

    if (resolution.type === "restart-track") {
      seekTo(0);
      setIsPlaying(true);
      return;
    }

    if (resolution.type === "stop-at-start") {
      seekTo(0);
      return;
    }

    if (resolution.type === "play-track" && state) {
      playResolvedTrackFromEnd(resolution.track, state, resolution.nextQueue);
    }
  }

  function handleTrackEnded() {
    setIsPlaying(false);
    window.setTimeout(resolveEndedPlayback, 0);
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
        const snapshot = await loadLibrarySnapshot();
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
        const snapshot = await loadLibrarySnapshot();
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

  async function saveTrackUserState(nextIsFavorite: boolean, nextRating: number | null) {
    if (!detailTrack || isSavingTrackUserState) return;

    try {
      setIsSavingTrackUserState(true);
      setTrackTagMessage(null);

      if (!hasRealBackend) {
        applyTrackUserState(detailTrack.id, nextIsFavorite, nextRating);
        setTrackTagMessage({ key: "trackDetail.userStateSaved" });
        return;
      }

      const result = await updateTrackUserState(detailTrack.id, nextIsFavorite, nextRating);
      applyTrackUserState(result.trackId, result.isFavorite, result.rating);
      notifyLibraryChanged();
      setTrackTagMessage({ key: "trackDetail.userStateSaved" });
    } catch (error) {
      setTrackTagMessage(toI18nError(error));
    } finally {
      setIsSavingTrackUserState(false);
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

  async function choosePlaylistArtwork(playlist: Playlist) {
    if (isSavingPlaylistArtwork) return;

    if (!isTauriRuntime) {
      setLibraryInfo({ key: "trackDetail.artworkDesktopOnly" });
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

      if (typeof selectedPath !== "string") return;

      setIsSavingPlaylistArtwork(true);
      setLibraryInfo(null);

      if (!hasRealBackend) {
        setPlaylists((currentPlaylists) =>
          currentPlaylists.map((currentPlaylist) =>
            currentPlaylist.id === playlist.id
              ? { ...currentPlaylist, artworkPath: selectedPath }
              : currentPlaylist,
          ),
        );
        setLibraryInfo({ key: "tags.artworkSaved" });
        return;
      }

      const result = await updatePlaylistArtwork(playlist.id, selectedPath);
      const snapshot = await loadLibrarySnapshot();
      applyPlaylistSnapshot(snapshot);
      setSelectedPlaylistId(result.playlistId);
      notifyLibraryChanged();
      setLibraryInfo({ key: "tags.artworkSaved" });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    } finally {
      setIsSavingPlaylistArtwork(false);
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
      const snapshot = await loadLibrarySnapshot();
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

  function playRemoteAlbum(album: Album, command: QueuedRemotePlayerCommand) {
    const commandQueueTrackIds = getCommandEntityIdArray(command, "queueTrackIds");
    const commandQueue = commandQueueTrackIds ? findTracksByIds(commandQueueTrackIds) : [];
    const shouldShuffle = getCommandBoolean(command, "isShuffle") ?? isShuffle;
    const nextQueue = commandQueue.length > 0 ? commandQueue : getAlbumQueueTracks(album, shouldShuffle);
    const firstTrack = nextQueue[0] ?? null;

    setSelectedAlbumId(album.id);
    setPlaybackAlbumId(album.id);
    setPlaybackPlaylistId(null);
    setPlaybackQueueTrackIds(nextQueue.map((track) => track.id));
    setCurrentTrack(firstTrack);
    playerBarRef.current?.resetPosition();
    setIsPlaying(Boolean(firstTrack));
  }

  function playRemoteTrack(track: Track, albumId: EntityId | null, command: QueuedRemotePlayerCommand) {
    const album = albums.find((album) => album.id === albumId) ?? findAlbumByTrackId(track.id);
    const commandQueueTrackIds = getCommandEntityIdArray(command, "queueTrackIds");
    const commandQueue = commandQueueTrackIds ? findTracksByIds(commandQueueTrackIds) : [];
    const shouldShuffle = getCommandBoolean(command, "isShuffle") ?? isShuffle;
    const nextQueue = commandQueue.length > 0 ? commandQueue : album ? getAlbumQueueTracks(album, shouldShuffle, track) : [track];

    setPlaybackAlbumId(album?.id ?? albumId);
    setPlaybackPlaylistId(null);
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
        const albumId = getCommandEntityId(command, "albumId");
        const album = albums.find((album) => album.id === albumId);
        if (album) playRemoteAlbum(album, command);
        break;
      }
      case "play-track": {
        const trackId = getCommandEntityId(command, "trackId");
        const albumId = getCommandEntityId(command, "albumId") ?? findAlbumByTrackId(trackId)?.id ?? null;
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
        const albumId = getCommandEntityId(command, "albumId");
        const album = albums.find((album) => album.id === albumId);
        if (album) selectAlbum(album);
        break;
      }
      case "select-track": {
        const trackId = getCommandEntityId(command, "trackId");
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
      .then(({ clientReceivedAtMs, clientRequestedAtMs, responseSentAtMs, state, stateCapturedAtMs }) => {
        if (requestId !== remoteSyncRequestIdRef.current) return;
        if (state) {
          applyRemotePlayerState(state, {
            clientReceivedAtMs,
            clientRequestedAtMs,
            responseSentAtMs,
            stateCapturedAtMs,
          });
        }
      })
      .catch((error: unknown) => {
        if (requestId === remoteSyncRequestIdRef.current) setPlaybackError(String(error));
      });
  });

  const loadTrackAnalysis = useEffectEvent((track: Track) => {
    const clock = remotePlaybackClockRef.current;
    if (isBrowserBackendRuntime && clock && clock.trackId !== track.id) return;

    const cachedPacket = remoteAudioAnalysisPacketsByTrackRef.current.get(track.id);
    if (cachedPacket) {
      remoteAudioAnalysisPacketsByTrackRef.current.delete(track.id);
      remoteAudioAnalysisPacketsByTrackRef.current.set(track.id, cachedPacket);
      audioAnalysisPacketRef.current = rebaseAudioAnalysisPacketPlaybackTime(
        cachedPacket,
        isTauriRuntime
          ? playerBarRef.current?.getCurrentTime() ?? 0
          : estimateRemotePlaybackTime(remotePlaybackClockRef.current, performance.now()),
        performance.now(),
      );
      loadedRemoteAudioAnalysisTrackIdRef.current = track.id;
      purgeRemoteAudioAnalysisPackets(track.id);
      return;
    }

    if (remoteAudioAnalysisLoadStateRef.current?.trackId === track.id) return;

    const duration = Math.max(
      remoteAudioAnalysisFallbackDurationSeconds,
      (track.durationSeconds ?? 0) + remoteAudioAnalysisDurationPaddingSeconds,
    );
    const requestId = (remoteAudioAnalysisLoadStateRef.current?.requestId ?? 0) + 1;
    const chunkCount = Math.max(1, Math.ceil(duration / remoteAudioAnalysisChunkDurationSeconds));
    remoteAudioAnalysisLoadStateRef.current = { requestId, trackId: track.id };
    loadedRemoteAudioAnalysisTrackIdRef.current = null;

    void (async () => {
      let frames: RemoteAudioAnalysisFrameEntry[] = [];
      let frameIntervalMs = audioAnalysisSampleIntervalMs;

      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        if (
          remoteAudioAnalysisLoadStateRef.current?.requestId !== requestId ||
          (isBrowserBackendRuntime && remotePlaybackClockRef.current && remotePlaybackClockRef.current.trackId !== track.id)
        ) {
          return;
        }

        const from = chunkIndex * remoteAudioAnalysisChunkDurationSeconds;
        const chunkDuration = Math.min(remoteAudioAnalysisChunkDurationSeconds, duration - from);
        const segment = await getRemoteTrackAnalysisSegment(track.id, from, chunkDuration, duration);
        if (
          segment.trackId !== track.id ||
          remoteAudioAnalysisLoadStateRef.current?.requestId !== requestId ||
          (isBrowserBackendRuntime && remotePlaybackClockRef.current && remotePlaybackClockRef.current.trackId !== track.id)
        ) {
          return;
        }

        frameIntervalMs = segment.frameIntervalMs;
        frames = mergeRemoteAudioAnalysisFrames(frames, segment.frames, audioAnalysisSampleIntervalMs);
        const partialPacket = makeAudioAnalysisPacketFromFrames(
          track.id,
          frames,
          frameIntervalMs,
          isTauriRuntime
            ? playerBarRef.current?.getCurrentTime() ?? 0
            : estimateRemotePlaybackTime(remotePlaybackClockRef.current, performance.now()),
          audioAnalysisSampleIntervalMs,
          performance.now(),
        );
        if (partialPacket) audioAnalysisPacketRef.current = partialPacket;

        if (segment.isComplete) break;
      }

      if (
        remoteAudioAnalysisLoadStateRef.current?.requestId !== requestId ||
        (isBrowserBackendRuntime && remotePlaybackClockRef.current && remotePlaybackClockRef.current.trackId !== track.id)
      ) {
        return;
      }

      const completePacket = makeAudioAnalysisPacketFromFrames(
        track.id,
        frames,
        frameIntervalMs,
        isTauriRuntime
          ? playerBarRef.current?.getCurrentTime() ?? 0
          : estimateRemotePlaybackTime(remotePlaybackClockRef.current, performance.now()),
        audioAnalysisSampleIntervalMs,
        performance.now(),
      );
      if (completePacket) {
        remoteAudioAnalysisPacketsByTrackRef.current.set(track.id, completePacket);
        purgeRemoteAudioAnalysisPackets(track.id);
        audioAnalysisPacketRef.current = completePacket;
        loadedRemoteAudioAnalysisTrackIdRef.current = track.id;
      }
      remoteAudioAnalysisLoadStateRef.current = null;
    })().catch(() => {
      if (remoteAudioAnalysisLoadStateRef.current?.requestId === requestId) {
        remoteAudioAnalysisLoadStateRef.current = null;
      }
      // Partial analysis is intentionally not cached unless every chunk completes.
    });
  });

  const warmTrackAnalysisCache = useEffectEvent((track: Track | null) => {
    if (!track || activeRemoteAudioAnalysisWarmupsRef.current.has(track.id)) return;

    const duration = Math.max(
      remoteAudioAnalysisFallbackDurationSeconds,
      (track.durationSeconds ?? 0) + remoteAudioAnalysisDurationPaddingSeconds,
    );
    activeRemoteAudioAnalysisWarmupsRef.current.add(track.id);
    void getRemoteTrackAnalysisSegment(track.id, 0, duration, duration)
      .catch(() => {
        // Cache warmup is best-effort; playback and browser sync should keep running.
      })
      .finally(() => {
        activeRemoteAudioAnalysisWarmupsRef.current.delete(track.id);
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
    const timer = window.setInterval(pollCommands, playerCommandPollIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isBrowserBackendRuntime) return;

    syncRemotePlayerState();
    const timer = window.setInterval(() => syncRemotePlayerState(), remotePlayerStateSyncIntervalMs);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isBrowserBackendRuntime && !isTauriRuntime) return;
    if (!currentTrack || !isPlaying) {
      audioAnalysisPacketRef.current = null;
      remoteAudioAnalysisLoadStateRef.current = null;
      loadedRemoteAudioAnalysisTrackIdRef.current = null;
      clearRemoteAudioAnalysisPacketCache();
      return;
    }

    loadTrackAnalysis(currentTrack);
  }, [currentTrack?.id, isPlaying]);

  useEffect(() => {
    if (!isTauriRuntime || !currentTrack || !isPlaying) return;

    const currentTrackIndex = queue.findIndex((track) => track.id === currentTrack.id);
    const nextTrack = currentTrackIndex >= 0 ? queue[currentTrackIndex + 1] ?? null : null;
    warmTrackAnalysisCache(currentTrack);
    warmTrackAnalysisCache(nextTrack);
  }, [currentTrack?.id, isPlaying, queue]);

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
    const nextPacket = makeAudioAnalysisPacketFromSegment(
      segment,
      playerBarRef.current?.getCurrentTime() ?? 0,
      audioAnalysisSampleIntervalMs,
      performance.now(),
    );
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
    const timer = window.setInterval(pollLibraryCommands, libraryCommandPollIntervalMs);
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

  const libraryWorkerInfo: I18nMessage = isScanning
    ? { key: "status.workerLibraryScan" }
    : { key: "status.workerIdle" };
  const shouldShowLibraryStatus =
    libraryInfo !== null &&
    hasRealBackend &&
    (libraryInfo.key !== "status.loadedAlbums" || libraryWorkerInfo.key !== "status.workerIdle");

  return {
    albumListMode,
    albumPanelDragStartRef,
    albumPanelRef,
    albumSortDirection,
    albumSortMode,
    albumTagDraft,
    albumTagMessage,
    albumViewMode,
    albumsPanelRef,
    addTracksToSelectedPlaylist,
    addTrackToSelectedPlaylist,
    applyRemotePlayerState,
    artworkDraftPath,
    artworkPreviewSrc,
    audioAnalysisPacketRef,
    audioRef,
    availableAppUpdate,
    cancelAlbumTagEditing,
    changeLibrarySidebarSectionOpen,
    changeMcpEnabled,
    changePlaying,
    changeShuffle,
    changeTrackDetailTab,
    chooseArtwork,
    choosePlaylistArtwork,
    closeTrackDetail,
    currentLyrics,
    currentTrack,
    cycleRepeatMode,
    deleteSelectedPlaylist,
    detailAlbum,
    detailArtworkSrc,
    detailLyrics,
    detailTrack,
    displayedLibraryPath,
    editingTrackTag,
    filteredAlbums,
    finishAlbumPanelPointerDrag,
    finishAlbumPanelTouchDrag,
    finishTrackLongPress,
    handleCheckForUpdate,
    handleChooseFolder,
    handleScan,
    handleTrackEnded,
    hasAlbumTagChanges,
    hasRealBackend,
    hasTrackTagChanges,
    isAlbumPanelCollapsed,
    isAlbumTagEditing,
    isBrowserBackendRuntime,
    isCheckingForUpdate,
    isLibraryMenuOpen,
    isLibrarySettingsOpen,
    isMcpEnabled,
    isMockDataRuntime,
    isPlayerVisualizerOpen,
    isPlaying,
    isSavingAlbumTags,
    isSavingArtwork,
    isSavingPlaylistArtwork,
    isSavingTrackTags,
    isSavingTrackUserState,
    isScanning,
    isShuffle,
    isSidebarCollapsed,
    isTauriRuntime,
    libraryInfo,
    libraryPath,
    librarySidebarSectionState,
    libraryWorkerInfo,
    locale,
    lyricsOnly,
    mcpError,
    mcpUrl,
    moveTrackLongPress,
    openSelectedAlbumArtworkEditor,
    openAlbumFromPlaylist,
    openPlaylistAddTracks,
    openTrackDetail,
    openTrackLyrics,
    overscrollAlbumPanelPointer,
    overscrollAlbumPanelTouch,
    pausePlayback,
    playAlbum,
    playNextTrack,
    playPlayback,
    playPlaylist,
    playPreviousTrack,
    playQueuedTrack,
    playTrack,
    playbackAlbum,
    playbackError,
    playbackPlaylist: playlists.find((playlist) => playlist.id === playbackPlaylistId) ?? null,
    playerBarRef,
    playlists,
    query,
    queue,
    remoteAccess,
    remotePlaybackClockRef,
    reloadPlaylists,
    removeTrackFromSelectedPlaylist,
    renameSelectedPlaylist,
    repeatMode,
    reorderTrackInSelectedPlaylist,
    saveAlbumTags,
    saveTrackArtwork,
    saveTrackTags,
    saveTrackUserState,
    scrollAlbumPanel,
    seekTo,
    selectAlbum,
    selectedAlbum,
    selectedAlbumTrackEntries,
    selectedPlaylist,
    selectedPlaylistId,
    selectedPlaylistTrackEntries,
    selectedTrackId,
    selectTrack,
    selectPlaylist,
    createEmptyPlaylist,
    setAlbumListMode,
    setAlbumSortDirection,
    setAlbumSortMode,
    setAlbumTagDraft,
    setAlbumViewMode,
    setArtworkDraftPath,
    setIsLibraryMenuOpen,
    setIsLibrarySettingsOpen,
    setIsPlayerVisualizerOpen,
    setIsSidebarCollapsed,
    setLocale,
    setLyricsOnly,
    setPlaybackError,
    setQuery,
    setThemeName,
    setTrackTagDraft,
    setEditingTrackTag,
    setLibraryPath,
    setVolume,
    shouldShowLibraryStatus,
    startAlbumPanelPointerDrag,
    startAlbumPanelTouchDrag,
    startAlbumTagEditing,
    startTrackLongPress,
    t,
    themeName,
    togglePlayback,
    trackDetailTab,
    trackTagDraft,
    trackTagMessage,
    updateInfo,
  };
}

export type AppController = ReturnType<typeof useAppController>;
