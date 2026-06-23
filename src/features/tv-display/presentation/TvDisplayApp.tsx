import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, CalendarDays, Disc3, FileText, ListMusic, Pause, Play, SkipBack, SkipForward, StepBack, StepForward, UserRound } from "lucide-react";
import { getInitialLocale, translate } from "../../../i18n";
import type { TvAudioAnalysisFrame, TvCandidatePrompt, TvCommandResult, TvDisplayMessage, TvLyricsState, TvQueueState, TvSessionSnapshot } from "../domain/tvDisplayMessage";
import { mockTvSessionSnapshot } from "../infrastructure/mockTvDisplayState";
import type { Album, LibrarySnapshot, Playlist, Track } from "../../../types/audio";
import type { AlbumSortDirection, AlbumSortMode } from "../../../types/app";
import { compareAlbums, getArtworkSrc } from "../../../lib/libraryUtils";
import { FireTvPlayerVisualizer } from "./FireTvPlayerVisualizer";

type TvDisplayAppProps = {
  snapshot?: TvSessionSnapshot;
};

type FireTvRemoteKeyEvent = CustomEvent<{ key?: string }>;
type FireTvTabEvent = CustomEvent<{ tab?: TvSurfaceTab }>;
type FireTvDiagnosticsEvent = CustomEvent<{ memory?: FireTvMemoryInfo }>;
type TvSurfaceTab = "player" | "albums" | "tracks";
type TvCollectionMode = "albums" | "playlists";
type TvSidePanelMode = "queue" | "lyrics";
type FocusZone = "controls" | "collectionTabs" | "albums" | "albumSort" | "tracks" | "sidePanelTabs" | "sidePanel" | "prompt";
type FireTvMemoryInfo = {
  availableMb?: number;
  maxMb: number;
  totalMb: number;
  usedMb: number;
};
type TvDisplayEnvelope = {
  id: string;
  message: TvDisplayMessage;
  sentAt: string;
  sessionId: string;
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

const controlCount = 3;
const collectionTabs: TvCollectionMode[] = ["albums", "playlists"];
const tvAlbumSortModes: AlbumSortMode[] = ["title", "artist", "year"];
const albumGridColumns = 4;
const visibleAlbumRows = 2;
const visibleAlbumCount = albumGridColumns * visibleAlbumRows;
const visibleTrackCount = 7;
const visibleQueueCount = 3;
const sidePanelModes: TvSidePanelMode[] = ["queue", "lyrics"];

export function TvDisplayApp({ snapshot = mockTvSessionSnapshot }: TvDisplayAppProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const pendingAutoplayRef = useRef(false);
  const [sessionSnapshot, setSessionSnapshot] = useState<TvSessionSnapshot>(snapshot);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [playlists, setPlaylists] = useState<Album[]>([]);
  const [collectionMode, setCollectionMode] = useState<TvCollectionMode>("albums");
  const [selectedAlbumIndex, setSelectedAlbumIndex] = useState(0);
  const [focusedAlbumIndex, setFocusedAlbumIndex] = useState(0);
  const [albumSortMode, setAlbumSortMode] = useState<AlbumSortMode>("title");
  const [albumSortDirection, setAlbumSortDirection] = useState<AlbumSortDirection>("asc");
  const [focusedSortIndex, setFocusedSortIndex] = useState(0);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [focusedTrackIndex, setFocusedTrackIndex] = useState(0);
  const [focusedQueueIndex, setFocusedQueueIndex] = useState(0);
  const [focusedPromptIndex, setFocusedPromptIndex] = useState(0);
  const [focusZone, setFocusZone] = useState<FocusZone>("albums");
  const [focusedControlIndex, setFocusedControlIndex] = useState(1);
  const [sidePanelMode, setSidePanelMode] = useState<TvSidePanelMode>("queue");
  const [focusedSidePanelMode, setFocusedSidePanelMode] = useState<TvSidePanelMode>("queue");
  const [activeSurfaceTab, setActiveSurfaceTab] = useState<TvSurfaceTab>(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return tab === "albums" || tab === "tracks" ? tab : "player";
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(sessionSnapshot.player.durationSeconds);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [analysisFrames, setAnalysisFrames] = useState<TvAudioAnalysisFrame[]>(sessionSnapshot.analysis?.frames ?? []);
  const [trackLyrics, setTrackLyrics] = useState<TvLyricsState | null>(sessionSnapshot.lyrics ?? null);
  const [activePrompt, setActivePrompt] = useState<TvCandidatePrompt | null>(sessionSnapshot.activePrompt ?? null);
  const [commandResult, setCommandResult] = useState<TvCommandResult | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [memoryInfo, setMemoryInfo] = useState<FireTvMemoryInfo | null>(null);
  const currentTimeRef = useRef(currentTime);
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const libraryId = useMemo(() => urlParams.get("libraryId")?.trim() || null, [urlParams]);
  const sessionId = useMemo(() => urlParams.get("sessionId")?.trim() || null, [urlParams]);
  const locale = useMemo(() => getInitialLocale(), []);
  const t = useCallback((key: string) => translate(locale, key as never), [locale]);

  const sortedAlbums = useMemo(() => sortTvCollections(albums, albumSortMode, albumSortDirection, t), [albumSortDirection, albumSortMode, albums, t]);
  const sortedPlaylists = useMemo(() => sortTvCollections(playlists, albumSortMode, albumSortDirection, t), [albumSortDirection, albumSortMode, playlists, t]);
  const activeCollections = collectionMode === "albums" ? sortedAlbums : sortedPlaylists;
  const collectionCount = activeCollections.length;
  const collectionTabIndex = collectionTabs.indexOf(collectionMode);
  const focusedSortMode = tvAlbumSortModes[focusedSortIndex] ?? "title";
  const focusedCollection = activeCollections[focusedAlbumIndex] ?? null;
  const selectedCollection = activeCollections[selectedAlbumIndex] ?? null;
  const selectedAlbum = selectedCollection;
  const currentTrack = selectedAlbum?.tracks[selectedTrackIndex] ?? null;
  const focusedTrack = selectedAlbum?.tracks[focusedTrackIndex] ?? null;
  const visibleAlbumStartIndex = getWindowStart(focusedAlbumIndex, activeCollections.length, visibleAlbumCount, albumGridColumns);
  const visibleTrackStartIndex = getTrackWindowStart(focusedTrackIndex, selectedAlbum?.tracks.length ?? 0);
  const audioUrl = currentTrack?.filePath ? makeMediaStreamUrl(currentTrack.filePath) : "";
  const player = makePlayerState(selectedAlbum, currentTrack, isPlaying, duration, currentTime, sessionSnapshot);
  const queue = selectedAlbum && currentTrack ? makeQueueState(selectedAlbum, currentTrack) : sessionSnapshot.queue;
  const lyrics = trackLyrics ?? sessionSnapshot.lyrics;
  const lyricsLines = visibleLyricsLines(lyrics, currentTime);
  const queueItems = queue?.items ?? [];
  const visibleQueueStartIndex = getQueueWindowStart(focusedQueueIndex, queueItems.length);
  const effectiveDuration = duration || player.durationSeconds;
  const progress = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const playerArtworkUrl = selectedAlbum ? getArtworkSrc(selectedAlbum) || player.artworkUrl : player.artworkUrl;
  const playerStyle = playerArtworkUrl
    ? ({ "--tv-player-artwork-bg": `url("${playerArtworkUrl.replace(/"/g, '\\"')}")` } as CSSProperties)
    : undefined;
  const previousTrack = getPreviousQueueItem(queue);
  const nextTrack = getNextQueueItem(queue);
  const sortDirectionLabel = albumSortDirection === "asc" ? t("sort.ascending") : t("sort.descending");
  const hasLyrics = (lyrics?.lines.length ?? 0) > 0;
  const isSidePanelOpen = activeSurfaceTab === "player";

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (!sessionId) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/tv/sessions/${encodeURIComponent(sessionId)}`);
    sessionSocketRef.current = socket;
    setSessionStatus(t("tvDisplay.sessionConnecting"));

    socket.addEventListener("open", () => {
      setSessionStatus(t("tvDisplay.sessionConnected"));
      socket.send(JSON.stringify({ type: "client_ready", sessionId }));
    });
    socket.addEventListener("message", (event) => {
      const message = parseTvDisplayMessage(event.data);
      if (message) applyTvDisplayMessage(message);
    });
    socket.addEventListener("close", () => {
      if (sessionSocketRef.current === socket) setSessionStatus(t("tvDisplay.sessionDisconnected"));
    });
    socket.addEventListener("error", () => setSessionStatus(t("tvDisplay.sessionError")));

    return () => {
      if (sessionSocketRef.current === socket) sessionSocketRef.current = null;
      socket.close();
    };
  }, [sessionId, t]);

  useEffect(() => {
    let isActive = true;

    async function loadLibrary() {
      try {
        const librarySnapshot = await fetchJson<LibrarySnapshot>(librarySnapshotPath(libraryId));
        if (!isActive) return;
        const nextCollections = makeTvCollections(librarySnapshot, t);
        setAlbums(nextCollections.albums);
        setPlaylists(nextCollections.playlists);
        setLibraryError(null);
      } catch {
        if (!isActive) return;
        setAlbums([]);
        setPlaylists([]);
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
    setSelectedAlbumIndex((index) => clampIndex(index, collectionCount));
    setFocusedAlbumIndex((index) => clampIndex(index, collectionCount));
  }, [collectionCount]);

  useEffect(() => {
    const trackCount = selectedAlbum?.tracks.length ?? 0;
    setSelectedTrackIndex((index) => clampIndex(index, trackCount));
    setFocusedTrackIndex((index) => clampIndex(index, trackCount));
  }, [selectedAlbum]);

  useEffect(() => {
    setFocusedQueueIndex((index) => clampIndex(index, queueItems.length));
  }, [queueItems.length]);

  useEffect(() => {
    setFocusZone(activeSurfaceTab === "player" ? "controls" : activeSurfaceTab);
  }, [activeSurfaceTab]);

  useEffect(() => {
    if (!hasLyrics && sidePanelMode === "lyrics") setSidePanelMode("queue");
    if (!hasLyrics && focusedSidePanelMode === "lyrics") setFocusedSidePanelMode("queue");
  }, [focusedSidePanelMode, hasLyrics, sidePanelMode]);

  useEffect(() => {
    const handleRemoteKey = (key: string | undefined) => {
      if (activePrompt && /^[1-9]$/.test(key ?? "")) {
        choosePromptCandidate(Number(key) - 1);
      } else if (key === "ArrowLeft" || key === "ArrowRight") {
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
      reportPlayerEvent("ended", player.trackId, audio.currentTime);
      void playAdjacentTrack(1);
    };
    const handleError = () => {
      setIsPlaying(false);
      setPlaybackError(t("tvDisplay.audioError"));
      reportPlayerEvent("error", player.trackId, audio.currentTime);
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
  }, [t, selectedAlbum, selectedTrackIndex, player.trackId]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(currentTrack?.durationSeconds ?? 0);
    setAnalysisFrames([]);
  }, [currentTrack?.id, currentTrack?.durationSeconds]);

  useEffect(() => {
    const trackId = currentTrack?.id;
    if (!trackId) {
      setTrackLyrics(sessionSnapshot.lyrics ?? null);
      return;
    }
    let isActive = true;
    async function loadLyrics() {
      try {
        const response = await fetchJson<string | null>(`/api/track_lyrics?${new URLSearchParams({ trackId: String(trackId) }).toString()}`);
        if (!isActive) return;
        setTrackLyrics({
          lines: parsePlainLyrics(response ?? ""),
          mode: "plain",
          trackId: String(trackId),
        });
      } catch {
        if (isActive) setTrackLyrics(null);
      }
    }
    void loadLyrics();
    return () => {
      isActive = false;
    };
  }, [currentTrack?.id, sessionSnapshot.lyrics]);

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

  function applyTvDisplayMessage(message: TvDisplayMessage) {
    if (message.type === "session_snapshot") {
      setSessionSnapshot(message.snapshot);
      setTrackLyrics(message.snapshot.lyrics ?? null);
      setActivePrompt(message.snapshot.activePrompt ?? null);
      setAnalysisFrames(message.snapshot.analysis?.frames ?? []);
      setDuration(message.snapshot.player.durationSeconds);
      setCurrentTime(message.snapshot.player.positionSeconds);
      setIsPlaying(message.snapshot.player.isPlaying);
    } else if (message.type === "player_state") {
      setSessionSnapshot((current) => ({ ...current, player: message.state }));
      setDuration(message.state.durationSeconds);
      setCurrentTime(message.state.positionSeconds);
      setIsPlaying(message.state.isPlaying);
    } else if (message.type === "lyrics_state") {
      setTrackLyrics(message.state);
      setSessionSnapshot((current) => ({ ...current, lyrics: message.state }));
    } else if (message.type === "queue_state") {
      setSessionSnapshot((current) => ({ ...current, queue: message.state }));
    } else if (message.type === "analysis_packet") {
      setAnalysisFrames(message.packet.frames);
      setSessionSnapshot((current) => ({ ...current, analysis: message.packet }));
    } else if (message.type === "candidate_prompt") {
      setActivePrompt(message.prompt);
      setFocusedPromptIndex(0);
      setFocusZone("prompt");
    } else if (message.type === "command_result") {
      setCommandResult(message.result);
      window.setTimeout(() => setCommandResult(null), 4200);
    } else if (message.type === "session_ready") {
      setSessionStatus(t("tvDisplay.sessionConnected"));
    } else if (message.type === "session_closed") {
      setSessionStatus(message.reason || t("tvDisplay.sessionDisconnected"));
    }
  }

  function sendTvClientMessage(message: unknown) {
    const socket = sessionSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return;
    }
    void fetch("/api/tv/player_event", {
      body: JSON.stringify({ sessionId, event: message }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch(() => undefined);
  }

  function reportPlayerEvent(type: string, trackId: string | null, positionSeconds = currentTime) {
    if (!trackId) return;
    sendTvClientMessage({
      type: "player_event",
      event: { type, trackId, positionSeconds },
    });
  }

  function choosePromptCandidate(index: number) {
    const candidate = activePrompt?.candidates[index];
    if (!activePrompt || !candidate) return;
    sendTvClientMessage({
      type: "candidate_selection",
      promptId: activePrompt.id,
      candidateId: candidate.id,
    });
    setCommandResult({
      createdAt: new Date().toISOString(),
      detail: candidate.description,
      id: `candidate-${activePrompt.id}-${candidate.id}`,
      status: "success",
      title: candidate.label,
    });
    setActivePrompt(null);
    setFocusZone(activeSurfaceTab === "player" ? "controls" : activeSurfaceTab);
  }

  function setPlayerSidePanel(mode: TvSidePanelMode) {
    if (mode === "lyrics" && !hasLyrics) return;
    setSidePanelMode(mode);
    setFocusedSidePanelMode(mode);
  }

  function moveSidePanelTabFocus(delta: number) {
    const availableModes = hasLyrics ? sidePanelModes : sidePanelModes.filter((mode) => mode !== "lyrics");
    const currentIndex = availableModes.indexOf(focusedSidePanelMode);
    setFocusedSidePanelMode(availableModes[(currentIndex + delta + availableModes.length) % availableModes.length]);
  }

  function moveHorizontal(delta: number) {
    if (activePrompt) {
      setFocusedPromptIndex((index) => clamp(index + delta, 0, Math.max(0, activePrompt.candidates.length - 1)));
    } else if (activeSurfaceTab === "player") {
      if (focusZone === "sidePanelTabs") {
        moveSidePanelTabFocus(delta);
        return;
      }
      setFocusedControlIndex((index) => clamp(index + delta, 0, controlCount - 1));
    } else if (activeSurfaceTab === "albums") {
      if (focusZone === "collectionTabs") {
        if (delta > 0) setFocusZone("albums");
        return;
      }
      if (focusZone === "albumSort") {
        if (delta < 0) setFocusZone("albums");
        return;
      }
      if (delta < 0 && focusedAlbumIndex % albumGridColumns === 0) {
        setFocusZone("collectionTabs");
        return;
      }
      if (delta > 0 && focusedAlbumIndex % albumGridColumns === albumGridColumns - 1) {
        setFocusZone("albumSort");
        return;
      }
      setFocusedAlbumIndex((index) => clamp(index + delta, 0, Math.max(0, activeCollections.length - 1)));
    } else if (activeSurfaceTab === "tracks") {
      setFocusedTrackIndex((index) => clamp(index + delta, 0, Math.max(0, (selectedAlbum?.tracks.length ?? 1) - 1)));
    }
  }

  function moveVertical(delta: number) {
    if (activePrompt) {
      setFocusedPromptIndex((index) => clamp(index + delta, 0, Math.max(0, activePrompt.candidates.length - 1)));
      return;
    }
    if (activeSurfaceTab === "player") {
      if (focusZone === "controls") {
        setFocusedSidePanelMode(sidePanelMode);
        setFocusZone("sidePanelTabs");
        return;
      }
      if (focusZone === "sidePanelTabs") {
        setFocusZone(delta < 0 ? "controls" : "sidePanel");
        return;
      }
      if (sidePanelMode === "queue") {
        if (delta < 0 && focusedQueueIndex === 0) {
          setFocusedSidePanelMode(sidePanelMode);
          setFocusZone("sidePanelTabs");
          return;
        }
        setFocusedQueueIndex((index) => clamp(index + delta, 0, Math.max(0, queueItems.length - 1)));
        return;
      }
      if (sidePanelMode === "lyrics") {
        setFocusZone(delta < 0 ? "sidePanelTabs" : "controls");
      }
      return;
    }
    if (activeSurfaceTab === "albums") {
      if (focusZone === "collectionTabs") {
        setCollectionMode(collectionTabs[clamp(collectionTabIndex + delta, 0, collectionTabs.length - 1)]);
        return;
      }
      if (focusZone === "albumSort") {
        setFocusedSortIndex((index) => clamp(index + delta, 0, tvAlbumSortModes.length - 1));
        return;
      }
      setFocusedAlbumIndex((index) => clamp(index + delta * albumGridColumns, 0, Math.max(0, activeCollections.length - 1)));
      return;
    }
    if (activeSurfaceTab === "tracks") {
      setFocusedTrackIndex((index) => clamp(index + delta, 0, Math.max(0, (selectedAlbum?.tracks.length ?? 1) - 1)));
      return;
    }
  }

  async function activateFocusedItem() {
    if (activePrompt) {
      choosePromptCandidate(focusedPromptIndex);
    } else if (activeSurfaceTab === "player") {
      if (focusZone === "sidePanelTabs") {
        setPlayerSidePanel(focusedSidePanelMode);
        return;
      }
      if (focusZone === "sidePanel") {
        if (sidePanelMode === "queue") await playQueueItem(focusedQueueIndex);
        return;
      }
      await activateControl(focusedControlIndex);
    } else if (activeSurfaceTab === "albums") {
      if (focusZone === "collectionTabs") {
        setFocusZone("albums");
        return;
      }
      if (focusZone === "albumSort") {
        applyAlbumSortMode(focusedSortMode);
        return;
      }
      await playAlbum(focusedAlbumIndex);
    } else if (activeSurfaceTab === "tracks") {
      await playTrack(focusedTrackIndex);
    }
  }

  async function activateControl(index: number) {
    if (index === 0) seekBy(-15);
    if (index === 1) await togglePlayback();
    if (index === 2) seekBy(15);
  }

  async function playAlbum(albumIndex: number) {
    const nextAlbum = activeCollections[albumIndex];
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

  async function playQueueItem(queueIndex: number) {
    const item = queueItems[queueIndex];
    if (!item) return;
    const trackIndex = selectedAlbum?.tracks.findIndex((track) => String(track.id) === String(item.trackId)) ?? -1;
    if (trackIndex >= 0) {
      await playTrack(trackIndex);
      return;
    }
    sendTvClientMessage({
      type: "player_event",
      event: { type: "queue_select", trackId: item.trackId, positionSeconds: 0 },
    });
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
      reportPlayerEvent("play", player.trackId, audio.currentTime);
    } catch {
      setIsPlaying(false);
      setPlaybackError(t("tvDisplay.audioError"));
      reportPlayerEvent("error", player.trackId, audio.currentTime);
    }
  }

  function pauseAudio() {
    const audio = audioRef.current;
    audio?.pause();
    setIsPlaying(false);
    reportPlayerEvent("pause", player.trackId, audio?.currentTime ?? currentTime);
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
    reportPlayerEvent("seek", player.trackId, nextTime);
  }

  function applyAlbumSortMode(sortMode: AlbumSortMode) {
    const nextDirection = sortMode === albumSortMode ? (albumSortDirection === "asc" ? "desc" : "asc") : albumSortDirection;
    const nextCollections = sortTvCollections(collectionMode === "albums" ? albums : playlists, sortMode, nextDirection, t);
    const selectedCollectionId = selectedCollection?.id;
    const focusedCollectionId = focusedCollection?.id;
    setAlbumSortMode(sortMode);
    setAlbumSortDirection(nextDirection);
    if (selectedCollectionId) setSelectedAlbumIndex(findCollectionIndex(nextCollections, selectedCollectionId));
    if (focusedCollectionId) setFocusedAlbumIndex(findCollectionIndex(nextCollections, focusedCollectionId));
  }

  return (
    <main className={`tv-display-shell tv-display-${activeSurfaceTab}${isSidePanelOpen ? " tv-display-side-panel-open" : ""}`} style={playerStyle}>
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
            <button className={focusedControlIndex === 0 && focusZone === "controls" ? "is-focused" : ""} type="button" onClick={() => seekBy(-15)}>
              <SkipBack aria-hidden="true" size={24} />
              <span>{t("tvDisplay.rewind")}</span>
            </button>
            <button className={focusedControlIndex === 1 && focusZone === "controls" ? "tv-play-control is-focused" : "tv-play-control"} type="button" onClick={() => void togglePlayback()}>
              {isPlaying ? <Pause aria-hidden="true" size={32} /> : <Play aria-hidden="true" size={32} />}
              <span>{isPlaying ? t("tvDisplay.pause") : t("tvDisplay.play")}</span>
            </button>
            <button className={focusedControlIndex === 2 && focusZone === "controls" ? "is-focused" : ""} type="button" onClick={() => seekBy(15)}>
              <SkipForward aria-hidden="true" size={24} />
              <span>{t("tvDisplay.forward")}</span>
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
        {isSidePanelOpen ? (
          <aside className={focusZone === "sidePanel" || focusZone === "sidePanelTabs" ? "tv-player-side-panel is-zone-focused" : "tv-player-side-panel"} aria-label={sidePanelMode === "queue" ? t("tvDisplay.queue") : t("tvDisplay.lyrics")}>
            <div className={focusZone === "sidePanelTabs" ? "tv-side-panel-tabs is-zone-focused" : "tv-side-panel-tabs"} aria-label={t("tvDisplay.queue")}>
              <button
                className={`${sidePanelMode === "queue" ? "is-selected " : ""}${focusedSidePanelMode === "queue" && focusZone === "sidePanelTabs" ? "is-focused" : ""}`}
                type="button"
                onClick={() => setPlayerSidePanel("queue")}
              >
                <ListMusic aria-hidden="true" size={22} />
                <span>{t("tvDisplay.queue")}</span>
              </button>
              <button
                aria-disabled={!hasLyrics}
                className={`${sidePanelMode === "lyrics" ? "is-selected " : ""}${focusedSidePanelMode === "lyrics" && focusZone === "sidePanelTabs" ? "is-focused " : ""}${!hasLyrics ? "is-disabled" : ""}`}
                type="button"
                onClick={() => setPlayerSidePanel("lyrics")}
              >
                <FileText aria-hidden="true" size={22} />
                <span>{t("tvDisplay.lyrics")}</span>
              </button>
            </div>
            <div className="tv-panel-heading">
              <h2>{sidePanelMode === "queue" ? t("tvDisplay.queue") : t("tvDisplay.lyrics")}</h2>
              <small>{sidePanelMode === "queue" ? t("tvDisplay.queueCount").replace("{count}", String(queueItems.length)) : player.title}</small>
            </div>
            {sidePanelMode === "queue" ? (
              queueItems.length > 0 ? (
                <ol className="tv-side-queue-list">
                  {queueItems.slice(visibleQueueStartIndex, visibleQueueStartIndex + visibleQueueCount).map((item, index) => {
                    const queueIndex = visibleQueueStartIndex + index;
                    return (
                      <li className={`${item.isCurrent ? "is-current " : ""}${focusZone === "sidePanel" && focusedQueueIndex === queueIndex ? "is-focused" : ""}`} key={`${item.trackId}-${queueIndex}`}>
                        <button type="button" onClick={() => void playQueueItem(queueIndex)}>
                          <span>{item.title}</span>
                          <small>
                            {item.artist}
                            {item.album ? ` / ${item.album}` : ""}
                          </small>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="tv-empty-state">{t("tvDisplay.queueEmpty")}</p>
              )
            ) : lyricsLines.length > 0 ? (
              <div className="tv-lyrics-lines">
                {lyricsLines.map((line) => (
                  <p className={line.className} key={line.id}>
                    {line.text}
                  </p>
                ))}
              </div>
            ) : (
              <p className="tv-empty-state">{t("tvDisplay.noLyrics")}</p>
            )}
          </aside>
        ) : null}
        {memoryInfo ? (
          <div className="tv-memory-diagnostics" aria-label={t("tvDisplay.memoryUsage")}>
            <span>{t("tvDisplay.memoryUsage")}</span>
            <strong>
              {memoryInfo.usedMb}/{memoryInfo.maxMb} MB
            </strong>
          </div>
        ) : null}
        {sessionStatus ? <p className="tv-session-status">{sessionStatus}</p> : null}
      </section>

      {activeSurfaceTab === "albums" ? (
        <section className="tv-tab-content tv-albums-view">
          <div className="tv-collection-layout">
          <nav className={focusZone === "collectionTabs" ? "tv-collection-tabs is-zone-focused" : "tv-collection-tabs"} aria-label={t("tvDisplay.collectionType")}>
            <button
              className={`${collectionMode === "albums" ? "is-selected " : ""}${focusZone === "collectionTabs" && collectionMode === "albums" ? "is-focused" : ""}`}
              type="button"
              onClick={() => {
                setCollectionMode("albums");
                setFocusZone("collectionTabs");
              }}
            >
              <span>{t("tvDisplay.albums")}</span>
            </button>
            <button
              className={`${collectionMode === "playlists" ? "is-selected " : ""}${focusZone === "collectionTabs" && collectionMode === "playlists" ? "is-focused" : ""}`}
              type="button"
              onClick={() => {
                setCollectionMode("playlists");
                setFocusZone("collectionTabs");
              }}
            >
              <span>{t("tvDisplay.playlists")}</span>
            </button>
          </nav>
          <div
            className={`${focusZone === "albums" ? "tv-panel tv-album-browser is-zone-focused" : "tv-panel tv-album-browser"} ${
              collectionMode === "albums" ? "is-album-collection" : "is-playlist-collection"
            }`}
            aria-label={collectionMode === "albums" ? t("tvDisplay.albums") : t("tvDisplay.playlists")}
          >
          <div className="tv-panel-heading">
            <h2>{collectionMode === "albums" ? t("tvDisplay.albums") : t("tvDisplay.playlists")}</h2>
            <small>
              {collectionCount > 0
                ? (collectionMode === "albums" ? t("albums.count") : t("playlists.count")).replace("{count}", String(collectionCount))
                : t("status.noLibraryScanned")}
            </small>
          </div>
          {focusedCollection ? (
            <p className="tv-focused-album-title">
              {focusedCollection.title} / {focusedCollection.artist}
            </p>
          ) : null}
          <div className="tv-album-rail">
            {activeCollections.slice(visibleAlbumStartIndex, visibleAlbumStartIndex + visibleAlbumCount).map((album, index) => {
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
          <div className={focusZone === "albumSort" ? "tv-album-sort-rail is-zone-focused" : "tv-album-sort-rail"} aria-label={t("sort.label")}>
            {tvAlbumSortModes.map((sortMode, index) => {
              const isSelected = sortMode === albumSortMode;
              const isFocused = focusZone === "albumSort" && focusedSortIndex === index;
              const label = getSortModeLabel(sortMode, t);
              return (
                <button
                  aria-label={`${label} / ${sortDirectionLabel}`}
                  className={`${isSelected ? "is-selected " : ""}${isFocused ? "is-focused" : ""}`}
                  key={sortMode}
                  title={`${label} / ${sortDirectionLabel}`}
                  type="button"
                  onClick={() => {
                    setFocusZone("albumSort");
                    setFocusedSortIndex(index);
                    applyAlbumSortMode(sortMode);
                  }}
                >
                  {sortMode === "title" ? <Disc3 aria-hidden="true" size={24} /> : null}
                  {sortMode === "artist" ? <UserRound aria-hidden="true" size={24} /> : null}
                  {sortMode === "year" ? <CalendarDays aria-hidden="true" size={24} /> : null}
                  {isSelected ? (
                    <span className="tv-album-sort-direction" aria-hidden="true">
                      {albumSortDirection === "asc" ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
                    </span>
                  ) : null}
                  <span className="sr-only">{label}</span>
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

      {activePrompt ? (
        <section className="tv-candidate-prompt" aria-label={activePrompt.title}>
          <div className="tv-panel tv-prompt-panel is-zone-focused">
            <div className="tv-panel-heading">
              <h2>{activePrompt.title}</h2>
              <small>{t("tvDisplay.chooseCandidate")}</small>
            </div>
            <div className="tv-candidate-list">
              {activePrompt.candidates.map((candidate, index) => (
                <button
                  className={focusedPromptIndex === index ? "is-focused" : ""}
                  key={candidate.id}
                  type="button"
                  onClick={() => choosePromptCandidate(index)}
                >
                  <strong>{candidate.shortcutNumber ?? index + 1}</strong>
                  <span>{candidate.label}</span>
                  {candidate.description ? <small>{candidate.description}</small> : null}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {commandResult ? (
        <aside className={`tv-command-result is-${commandResult.status}`}>
          <strong>{commandResult.title}</strong>
          {commandResult.detail ? <span>{commandResult.detail}</span> : null}
        </aside>
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

function parseTvDisplayMessage(rawData: unknown): TvDisplayMessage | null {
  try {
    const rawText = typeof rawData === "string" ? rawData : "";
    const parsed = JSON.parse(rawText) as TvDisplayEnvelope | TvDisplayMessage;
    if ("message" in parsed) return parsed.message;
    return parsed;
  } catch {
    return null;
  }
}

function parsePlainLyrics(lyrics: string): TvLyricsState["lines"] {
  return lyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `line-${index}`, text }));
}

function visibleLyricsLines(lyrics: TvLyricsState | undefined, currentTimeSeconds: number) {
  const lines = lyrics?.lines ?? [];
  if (lines.length === 0) return [];
  const activeIndex = activeLyricsIndex(lines, currentTimeSeconds);
  const start = clamp(activeIndex - 3, 0, Math.max(0, lines.length - 7));
  return lines.slice(start, start + 7).map((line, index) => {
    const sourceIndex = start + index;
    return {
      className: sourceIndex === activeIndex ? "is-active" : sourceIndex < activeIndex ? "is-past" : "",
      id: line.id,
      text: line.text,
    };
  });
}

function activeLyricsIndex(lines: TvLyricsState["lines"], currentTimeSeconds: number) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (typeof line?.startSeconds === "number" && line.startSeconds <= currentTimeSeconds) return index;
  }
  return 0;
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

function makeTvCollections(snapshot: LibrarySnapshot, t: (key: string) => string): { albums: Album[]; playlists: Album[] } {
  const albums = snapshot.albums
    .filter((album) => album.tracks.length > 0)
    .sort((firstAlbum, secondAlbum) => compareAlbums(firstAlbum, secondAlbum, "title", "asc", t));
  const playlistAlbums = snapshot.playlists
    .filter((playlist) => playlist.tracks.length > 0)
    .map((playlist: Playlist) => ({
      id: `playlist:${playlist.id}`,
      groupKey: `playlist:${playlist.id}`,
      title: playlist.name,
      artist: t("view.playlists"),
      year: null,
      yearLabel: null,
      genre: null,
      artworkPath: playlist.artworkPath ?? null,
      tracks: playlist.tracks,
    }))
    .sort((firstAlbum, secondAlbum) => compareAlbums(firstAlbum, secondAlbum, "title", "asc", t));
  return { albums, playlists: playlistAlbums };
}

function sortTvCollections(
  collections: Album[],
  sortMode: AlbumSortMode,
  sortDirection: AlbumSortDirection,
  t: (key: string) => string,
) {
  return [...collections].sort((firstAlbum, secondAlbum) => compareAlbums(firstAlbum, secondAlbum, sortMode, sortDirection, t));
}

function findCollectionIndex(collections: Album[], collectionId: Album["id"]) {
  return Math.max(0, collections.findIndex((collection) => collection.id === collectionId));
}

function getSortModeLabel(sortMode: AlbumSortMode, t: (key: string) => string) {
  if (sortMode === "artist") return t("sort.artist");
  if (sortMode === "year") return t("sort.year");
  return t("sort.title");
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
  const lastRowStart = Math.floor((length - 1) / step) * step;
  return clamp(alignedStart, 0, lastRowStart);
}

function getTrackWindowStart(focusedIndex: number, length: number) {
  if (length <= visibleTrackCount) return 0;
  return clamp(focusedIndex - 1, 0, length - visibleTrackCount);
}

function getQueueWindowStart(focusedIndex: number, length: number) {
  if (length <= visibleQueueCount) return 0;
  return clamp(focusedIndex - 1, 0, length - visibleQueueCount);
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
