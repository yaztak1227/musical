import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  type CSSProperties,
  type PointerEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { toDataURL } from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderOpen, ListMusic, PanelLeftClose, PanelLeftOpen, Pencil, Play, Save, ScrollText, Settings2, X } from "lucide-react";
import "./App.css";
import { getInitialLocale, getLocaleLabel, locales, translate, type Locale, type TranslationKey } from "./i18n";
import type { Album, Track, LibrarySnapshot, ScanSummary } from "./types/audio";
import {
  themeOptions,
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
  hasRealBackend,
  isBrowserBackendRuntime,
  isTauriRuntime,
  publishRemotePlayerState,
  sendRemotePlayerCommand,
  type QueuedRemotePlayerCommand,
  type RemotePlayerState,
} from "./lib/backend";
import { useGlobalMediaKeys } from "./lib/useGlobalMediaKeys";
import { mockAlbums } from "./lib/mockData";
import { formatTrackDuration } from "./lib/formatUtils";
import { filterAndSortAlbums } from "./lib/albumFilters";
import { localizeLibraryText, getArtworkSrc, getAlbumJumpTarget, toI18nError } from "./lib/libraryUtils";
import { prepareMarquee } from "./lib/marqueeUtils";
import { makeAlbumTagDraft, isAlbumTagDraftChanged, parseOptionalYear } from "./lib/tagDraftUtils";
import { AlbumBrowser } from "./components/AlbumBrowser";
import { PlayerBar, type PlayerBarHandle } from "./components/PlayerBar";

const playbackPreferencesKey = "musical.playbackPreferences";
const publicDevTunnelApiPath = "/api/public-dev-tunnel";
const localDevAccessApiPath = "/api/local-dev-access";
const albumPanelSwipeThreshold = 36;
const albumPanelDragTolerance = 8;
const trackLongPressDelayMs = 520;
const trackLongPressMoveTolerance = 10;

type PlaybackPreferences = {
  isShuffle: boolean;
  playbackAlbumId: number | null;
  repeatMode: RepeatMode;
  selectedAlbumId: number | null;
};

type PublicDevTunnelInfo = {
  enabled: boolean;
  isStarting: boolean;
  url: string | null;
};

type LocalDevAccessInfo = {
  available: boolean;
  enabled: boolean;
  host: string | null;
  port: number;
  url: string | null;
};

type RemoteAccessMode = "off" | "lan" | "open";

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

type PlaybackResolutionState = {
  currentTrackIndex: number;
  isShuffle: boolean;
  playbackAlbumId: number | null;
  queue: Track[];
  repeatMode: RepeatMode;
  selectedAlbumId: number | null;
};

function isPublicDevTunnelInfo(value: unknown): value is PublicDevTunnelInfo {
  const url = (value as Partial<PublicDevTunnelInfo> | null)?.url;
  return (
    typeof value === "object" &&
    value !== null &&
    "enabled" in value &&
    "isStarting" in value &&
    "url" in value &&
    typeof (value as PublicDevTunnelInfo).enabled === "boolean" &&
    typeof (value as PublicDevTunnelInfo).isStarting === "boolean" &&
    (url === null || (typeof url === "string" && url.startsWith("https://")))
  );
}

function isLocalDevAccessInfo(value: unknown): value is LocalDevAccessInfo {
  if (typeof value !== "object" || value === null) return false;

  const info = value as Partial<LocalDevAccessInfo>;
  return (
    typeof info.available === "boolean" &&
    typeof info.enabled === "boolean" &&
    (info.host === null || typeof info.host === "string") &&
    typeof info.port === "number" &&
    Number.isFinite(info.port) &&
    (info.url === null || typeof info.url === "string")
  );
}

function isRepeatMode(value: unknown): value is RepeatMode {
  return value === "off" || value === "all" || value === "one";
}

function parseStoredAlbumId(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function getStoredPlaybackPreferences(): PlaybackPreferences {
  const fallback: PlaybackPreferences = {
    isShuffle: false,
    playbackAlbumId: null,
    repeatMode: "off",
    selectedAlbumId: null,
  };

  try {
    const storedPreferences = window.localStorage.getItem(playbackPreferencesKey);
    if (!storedPreferences) return fallback;

    const parsedPreferences = JSON.parse(storedPreferences) as Partial<Record<keyof PlaybackPreferences, unknown>>;
    return {
      isShuffle: parsedPreferences.isShuffle === true,
      playbackAlbumId: parseStoredAlbumId(parsedPreferences.playbackAlbumId),
      repeatMode: isRepeatMode(parsedPreferences.repeatMode) ? parsedPreferences.repeatMode : "off",
      selectedAlbumId: parseStoredAlbumId(parsedPreferences.selectedAlbumId),
    };
  } catch {
    return fallback;
  }
}

function getInitialAlbumId(albums: Album[], storedAlbumId: number | null) {
  return albums.some((album) => album.id === storedAlbumId) ? storedAlbumId : albums[0]?.id ?? null;
}

function getInitialTrack(albums: Album[], albumId: number | null) {
  return albums.find((album) => album.id === albumId)?.tracks[0] ?? albums[0]?.tracks[0] ?? null;
}

function shuffleTracks(tracks: Track[]) {
  const shuffledTracks = [...tracks];
  for (let index = shuffledTracks.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledTracks[index], shuffledTracks[randomIndex]] = [shuffledTracks[randomIndex], shuffledTracks[index]];
  }
  return shuffledTracks;
}

function getAlbumQueueTracks(album: Album, isShuffle: boolean, startTrack: Track | null = null) {
  if (!isShuffle) return album.tracks;

  if (!startTrack) return shuffleTracks(album.tracks);

  const shuffledRemainder = shuffleTracks(album.tracks.filter((track) => track.id !== startTrack.id));
  return [startTrack, ...shuffledRemainder];
}

function getToggledQueueTracks(album: Album, isShuffle: boolean, currentTrack: Track | null) {
  if (!isShuffle) return album.tracks;
  return getAlbumQueueTracks(album, true, currentTrack);
}

function getNextRepeatMode(repeatMode: RepeatMode): RepeatMode {
  if (repeatMode === "off") return "all";
  if (repeatMode === "all") return "one";
  return "off";
}

function getHeapUsageMb() {
  const performanceWithMemory = performance as Performance & {
    memory?: { usedJSHeapSize: number };
  };

  return performanceWithMemory.memory
    ? Math.round(performanceWithMemory.memory.usedJSHeapSize / 1024 / 1024)
    : null;
}

function logRenderDiagnostic(label: string, payload: Record<string, unknown>) {
  const message = `[render-diagnostics] ${label} ${JSON.stringify(payload)}`;
  const windowWithDiagnostics = window as Window & { __renderDiagnostics?: string[] };
  windowWithDiagnostics.__renderDiagnostics = [...(windowWithDiagnostics.__renderDiagnostics ?? []), message].slice(-300);
  document.documentElement.dataset.renderDiagnostics = JSON.stringify(windowWithDiagnostics.__renderDiagnostics);
  console.debug(message);
}

function releaseAudioSource(audio: HTMLAudioElement) {
  audio.pause();

  try {
    audio.currentTime = 0;
  } catch {
    // Reset can fail when the media pipeline is already detached.
  }

  audio.removeAttribute("src");
  audio.load();
}

const trackTagFields = [
  { key: "title", labelKey: "tags.title" },
  { key: "artist", labelKey: "tags.artist" },
  { key: "album", labelKey: "tags.album" },
  { key: "year", labelKey: "tags.year" },
  { key: "genre", labelKey: "tags.genre" },
  { key: "trackNumber", labelKey: "tags.trackNumber" },
  { key: "discNumber", labelKey: "tags.discNumber" },
] satisfies { key: keyof TrackTagDraft; labelKey: TranslationKey }[];

function makeTrackTagDraft(track: Track | null, album: Album | null): TrackTagDraft {
  return {
    title: track?.title ?? "",
    artist: track?.artist ?? "",
    album: album?.title ?? "",
    year: String(album?.year ?? ""),
    genre: album?.genre ?? "",
    trackNumber: String(track?.trackNumber ?? ""),
    discNumber: String(track?.discNumber ?? ""),
  };
}

function isTrackTagDraftChanged(draft: TrackTagDraft, track: Track, album: Album | null) {
  const original = makeTrackTagDraft(track, album);
  return trackTagFields.some((field) => draft[field.key].trim() !== original[field.key].trim());
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
  const remoteSyncRequestIdRef = useRef(0);
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
  const [isPublicDevApiAvailable, setIsPublicDevApiAvailable] = useState(false);
  const [isPublicDevEnabled, setIsPublicDevEnabled] = useState(false);
  const [isPublicDevStarting, setIsPublicDevStarting] = useState(false);
  const [publicDevUrl, setPublicDevUrl] = useState<string | null>(null);
  const [publicDevQrDataUrl, setPublicDevQrDataUrl] = useState<string | null>(null);
  const [publicDevError, setPublicDevError] = useState<string | null>(null);
  const [isLocalDevEnabled, setIsLocalDevEnabled] = useState(false);
  const [localDevUrl, setLocalDevUrl] = useState<string | null>(null);
  const [localDevQrDataUrl, setLocalDevQrDataUrl] = useState<string | null>(null);
  const [localDevError, setLocalDevError] = useState<string | null>(null);
  const remoteAccessMode: RemoteAccessMode = isPublicDevEnabled || isPublicDevStarting ? "open" : isLocalDevEnabled ? "lan" : "off";
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
    if (!isTauriRuntime) return;
    void initializeRemoteAccessMode();
  }, []);

  useEffect(() => {
    let isActive = true;

    void renderQrCode(publicDevUrl).then((dataUrl) => {
      if (isActive) setPublicDevQrDataUrl(dataUrl);
    }).catch(() => {
      if (isActive) setPublicDevQrDataUrl(null);
    });

    return () => {
      isActive = false;
    };
  }, [publicDevUrl]);

  useEffect(() => {
    let isActive = true;

    void renderQrCode(localDevUrl).then((dataUrl) => {
      if (isActive) setLocalDevQrDataUrl(dataUrl);
    }).catch(() => {
      if (isActive) setLocalDevQrDataUrl(null);
    });

    return () => {
      isActive = false;
    };
  }, [localDevUrl]);

  async function renderQrCode(url: string | null) {
    if (!url) return null;

    return toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 128,
    });
  }

  async function initializeRemoteAccessMode() {
    try {
      const response = await fetch(publicDevTunnelApiPath);
      if (!response.ok) return;

      const tunnelInfo = (await response.json()) as unknown;
      if (!isPublicDevTunnelInfo(tunnelInfo)) return;

      setIsPublicDevApiAvailable(true);
      if (tunnelInfo.enabled || tunnelInfo.isStarting || tunnelInfo.url) {
        await setPublicDevTunnelEnabled(false);
        return;
      }

      setIsPublicDevEnabled(false);
      setIsPublicDevStarting(false);
      setPublicDevUrl(null);
      setPublicDevError(null);
      setIsLocalDevEnabled(false);
      setLocalDevUrl(null);
      setLocalDevError(null);
    } catch {
      setIsPublicDevApiAvailable(false);
    }
  }

  async function setPublicDevTunnelEnabled(enabled: boolean) {
    setPublicDevError(null);
    setIsPublicDevEnabled(enabled);
    setIsPublicDevStarting(enabled);

    try {
      const response = await fetch(publicDevTunnelApiPath, {
        body: JSON.stringify({ enabled }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const tunnelInfo = (await response.json()) as unknown;
      if (!response.ok || !isPublicDevTunnelInfo(tunnelInfo)) {
        const errorMessage =
          typeof tunnelInfo === "object" && tunnelInfo && "error" in tunnelInfo
            ? String((tunnelInfo as { error: unknown }).error)
            : "Unknown error";
        throw new Error(errorMessage);
      }

      setIsPublicDevApiAvailable(true);
      setIsPublicDevEnabled(tunnelInfo.enabled);
      setIsPublicDevStarting(tunnelInfo.isStarting);
      setPublicDevUrl(tunnelInfo.url);
    } catch (error) {
      setIsPublicDevEnabled(false);
      setIsPublicDevStarting(false);
      setPublicDevUrl(null);
      setPublicDevError(String(error instanceof Error ? error.message : error));
    }
  }

  async function setLocalDevAccessEnabled(enabled: boolean) {
    setLocalDevError(null);
    setIsLocalDevEnabled(enabled);

    try {
      const response = await fetch(localDevAccessApiPath, {
        body: JSON.stringify({ enabled }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const accessInfo = (await response.json()) as unknown;
      if (
        !response.ok ||
        !isLocalDevAccessInfo(accessInfo) ||
        (enabled && (!accessInfo.available || !accessInfo.url))
      ) {
        const errorMessage =
          typeof accessInfo === "object" && accessInfo && "error" in accessInfo
            ? String((accessInfo as { error: unknown }).error)
            : "No LAN address is available";
        throw new Error(errorMessage);
      }

      setIsLocalDevEnabled(accessInfo.enabled);
      setLocalDevUrl(accessInfo.url);
    } catch (error) {
      setIsLocalDevEnabled(false);
      setLocalDevUrl(null);
      setLocalDevError(String(error instanceof Error ? error.message : error));
    }
  }

  async function setRemoteAccessMode(nextMode: RemoteAccessMode) {
    if (nextMode === "off") {
      setLocalDevError(null);
      setIsLocalDevEnabled(false);
      setLocalDevUrl(null);
      if (isPublicDevEnabled || isPublicDevStarting || publicDevUrl) {
        await setPublicDevTunnelEnabled(false);
      } else {
        setPublicDevError(null);
        setIsPublicDevEnabled(false);
        setIsPublicDevStarting(false);
        setPublicDevUrl(null);
      }
      return;
    }

    if (nextMode === "lan") {
      if (isPublicDevEnabled || isPublicDevStarting || publicDevUrl) {
        await setPublicDevTunnelEnabled(false);
      } else {
        setPublicDevError(null);
      }
      await setLocalDevAccessEnabled(true);
      return;
    }

    setLocalDevError(null);
    setIsLocalDevEnabled(false);
    setLocalDevUrl(null);
    await setPublicDevTunnelEnabled(true);
  }

  useEffect(() => {
    const playbackPreferences: PlaybackPreferences = {
      isShuffle,
      playbackAlbumId,
      repeatMode,
      selectedAlbumId,
    };
    window.localStorage.setItem(playbackPreferencesKey, JSON.stringify(playbackPreferences));
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

    if (isTauriRuntime && currentTrack?.filePath) {
      audio.src = getBackendMediaSrc(currentTrack.filePath);
      audio.load();
      setAudioSourceKey(currentTrack.filePath);
    }

    return () => releaseAudioSource(audio);
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
  const selectedAlbumArtworkSrc = useMemo(
    () => (selectedAlbum ? getArtworkSrc(selectedAlbum) : ""),
    [selectedAlbum?.artworkPath, selectedAlbum?.coverUrl],
  );
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

  function applyRemotePlayerState(state: RemotePlayerState) {
    setPlaybackAlbumId(state.playbackAlbumId);
    const syncedTrack = findTrackById(state.currentTrackId);
    setCurrentTrack(syncedTrack);
    setPlaybackQueueTrackIds(state.queueTrackIds);
    setIsPlaying(state.isPlaying);
    setIsShuffle(state.isShuffle);
    setRepeatMode(isRepeatMode(state.repeatMode) ? state.repeatMode : "off");
    playerBarRef.current?.seekTo(state.currentTime, "remote-sync");
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
      .then((state) => {
        if (requestId !== remoteSyncRequestIdRef.current) return;
        if (state) applyRemotePlayerState(state);
      })
      .catch((error: unknown) => {
        if (requestId === remoteSyncRequestIdRef.current) setPlaybackError(String(error));
      });
  });

  useEffect(() => {
    if (!isTauriRuntime) return;

    publishCurrentRemotePlayerState();
    const timer = window.setInterval(() => publishCurrentRemotePlayerState(), 500);
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
    const timer = window.setInterval(() => syncRemotePlayerState(), 500);
    return () => window.clearInterval(timer);
  }, []);

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
      <section className="library-panel" aria-label={t("library.controls")}>
        <div className="sidebar-header">
          <p className="eyebrow">{t("app.brand")}</p>
          <Button
            aria-label={isSidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            aria-pressed={isSidebarCollapsed}
            className="sidebar-collapse-button"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            title={isSidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            type="button"
            variant="outline"
          >
            {isSidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          <Button
            aria-expanded={isLibraryMenuOpen}
            className="sidebar-toggle"
            onClick={() => setIsLibraryMenuOpen((value) => !value)}
            type="button"
            variant="outline"
          >
            <ListMusic />
            <span>{t("library.controls")}</span>
          </Button>
        </div>

        <div className="library-menu-content" data-open={isLibraryMenuOpen}>
          <div className="top-row">
            <div className="settings-row">
              <label className="language-field">
                <span>{t("language.label")}</span>
                <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
                  <SelectTrigger aria-label={t("language.label")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map((availableLocale) => (
                      <SelectItem key={availableLocale} value={availableLocale}>
                        {getLocaleLabel(availableLocale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="language-field">
                <span>{t("theme.label")}</span>
                <Select value={themeName} onValueChange={(value) => setThemeName(value as ThemeName)}>
                  <SelectTrigger aria-label={t("theme.label")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {themeOptions.map((theme) => (
                      <SelectItem key={theme.name} value={theme.name}>
                        <span className="theme-option">
                          <span
                            aria-hidden="true"
                            className="theme-swatch"
                            style={{ "--theme-swatch": theme.color } as CSSProperties}
                          />
                          <span>{t(theme.labelKey)}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          </div>

          <Button
            aria-label={t("scan.openLibrarySettings")}
            className="library-path-button"
            disabled={!hasRealBackend}
            onClick={() => setIsLibrarySettingsOpen(true)}
            type="button"
            variant="outline"
          >
            <span className="library-path-copy">
              <span>{t("scan.folderLabel")}</span>
              <strong>{displayedLibraryPath}</strong>
            </span>
            <Settings2 aria-hidden="true" />
          </Button>

          {isTauriRuntime && isPublicDevApiAvailable ? (
            <div className="remote-access-mode" role="group" aria-label={t("remoteAccess.modeLabel")}>
              {(["off", "lan", "open"] as const).map((mode) => (
                <button
                  aria-pressed={remoteAccessMode === mode}
                  className="remote-access-mode-button"
                  data-active={remoteAccessMode === mode}
                  disabled={isPublicDevStarting && mode !== "open"}
                  key={mode}
                  onClick={() => void setRemoteAccessMode(mode)}
                  type="button"
                >
                  {t(`remoteAccess.mode.${mode}`)}
                </button>
              ))}
            </div>
          ) : null}

          {isTauriRuntime && (isLocalDevEnabled || localDevError) && isPublicDevApiAvailable ? (
            <section className="remote-access-panel" aria-label={t("remoteAccess.localLabel")}>
              <div className="remote-access-copy">
                <p className="eyebrow">{t("remoteAccess.localLabel")}</p>
                <p>
                  {localDevError
                    ? t("remoteAccess.localError", { message: localDevError })
                    : localDevUrl
                      ? t("remoteAccess.localDescription")
                      : t("remoteAccess.localStarting")}
                </p>
              </div>
              {localDevUrl ? (
                <>
                  {localDevQrDataUrl ? (
                    <img className="remote-access-qr" src={localDevQrDataUrl} alt={t("remoteAccess.localQrAlt")} />
                  ) : (
                    <div className="remote-access-qr remote-access-qr-loading" aria-hidden="true" />
                  )}
                  <a className="remote-access-link" href={localDevUrl} target="_blank" rel="noreferrer">
                    {t("remoteAccess.openLocalLink")}
                  </a>
                </>
              ) : localDevError ? null : (
                <div className="remote-access-qr remote-access-qr-loading" aria-hidden="true" />
              )}
            </section>
          ) : null}

          {isTauriRuntime && (isPublicDevEnabled || publicDevError) && isPublicDevApiAvailable ? (
            <section className="remote-access-panel" aria-label={t("remoteAccess.label")}>
              <div className="remote-access-copy">
                <p className="eyebrow">{t("remoteAccess.label")}</p>
                <p>
                  {publicDevError
                    ? t("remoteAccess.error", { message: publicDevError })
                    : publicDevUrl
                      ? t("remoteAccess.description")
                      : t("remoteAccess.starting")}
                </p>
              </div>
              {publicDevUrl ? (
                <>
                  {publicDevQrDataUrl ? (
                    <img className="remote-access-qr" src={publicDevQrDataUrl} alt={t("remoteAccess.qrAlt")} />
                  ) : (
                    <div className="remote-access-qr remote-access-qr-loading" aria-hidden="true" />
                  )}
                  <a className="remote-access-link" href={publicDevUrl} target="_blank" rel="noreferrer">
                    {t("remoteAccess.openLink")}
                  </a>
                </>
              ) : publicDevError ? null : (
                <div className="remote-access-qr remote-access-qr-loading" aria-hidden="true" />
              )}
            </section>
          ) : null}
        </div>
      </section>

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

      <section
        aria-label={t("library.selectedAlbumLabel")}
        className={isAlbumPanelCollapsed ? "album-panel collapsed" : "album-panel"}
        data-state={isAlbumPanelCollapsed ? "collapsed" : "expanded"}
        onPointerCancel={(event) => {
          if (event.pointerType === "touch") return;

          albumPanelDragStartRef.current = null;
        }}
        onPointerDown={startAlbumPanelPointerDrag}
        onPointerMove={overscrollAlbumPanelPointer}
        onPointerUp={finishAlbumPanelPointerDrag}
        onTouchCancel={() => {
          albumPanelDragStartRef.current = null;
        }}
        onTouchEnd={finishAlbumPanelTouchDrag}
        onTouchMove={overscrollAlbumPanelTouch}
        onTouchStart={startAlbumPanelTouchDrag}
        onWheel={(event) => scrollAlbumPanel(event.deltaY)}
        ref={albumPanelRef}
      >
        {selectedAlbum ? (
          <>
            <div className="album-artwork-edit-target">
              {selectedAlbumArtworkSrc ? (
                <img
                  className="album-art"
                  alt={t("album.artworkAlt", { album: localizeLibraryText(selectedAlbum.title, t) })}
                  src={selectedAlbumArtworkSrc}
                />
              ) : (
                <div className="album-art placeholder-art" aria-hidden="true">
                  {selectedAlbum.title.charAt(0).toUpperCase()}
                </div>
              )}
              {selectedAlbum.tracks.length > 0 ? (
                <Button
                  aria-label={t("trackDetail.editArtwork")}
                  className="album-artwork-edit-button icon-button"
                  onClick={openSelectedAlbumArtworkEditor}
                  title={t("trackDetail.editArtwork")}
                  type="button"
                  variant="outline"
                >
                  <Pencil />
                </Button>
              ) : null}
            </div>

            <div className="album-detail">
              {isAlbumTagEditing ? (
                <form
                  className="album-tag-form"
                  data-keyboard-scope="text"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveAlbumTags();
                  }}
                >
                  <label>
                    <span>{t("tags.album")}</span>
                    <Input
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        setAlbumTagDraft((value) => ({ ...value, album: nextValue }));
                      }}
                      value={albumTagDraft.album}
                    />
                  </label>
                  <label>
                    <span>{t("tags.albumArtist")}</span>
                    <Input
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        setAlbumTagDraft((value) => ({ ...value, albumArtist: nextValue }));
                      }}
                      value={albumTagDraft.albumArtist}
                    />
                  </label>
                  <label>
                    <span>{t("tags.artist")}</span>
                    <Input
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        setAlbumTagDraft((value) => ({ ...value, artist: nextValue }));
                      }}
                      value={albumTagDraft.artist}
                    />
                  </label>
                  <div className="album-tag-form-row">
                    <label>
                      <span>{t("tags.year")}</span>
                      <Input
                        inputMode="numeric"
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setAlbumTagDraft((value) => ({ ...value, year: nextValue }));
                        }}
                        value={albumTagDraft.year}
                      />
                    </label>
                    <label>
                      <span>{t("tags.genre")}</span>
                      <Input
                        onChange={(event) => {
                          const nextValue = event.currentTarget.value;
                          setAlbumTagDraft((value) => ({ ...value, genre: nextValue }));
                        }}
                        value={albumTagDraft.genre}
                      />
                    </label>
                  </div>
                  <p className="tag-edit-note">{t("tags.albumWide", { count: selectedAlbum.tracks.length })}</p>
                  <div className="album-tag-actions">
                    <Button disabled={!hasAlbumTagChanges || isSavingAlbumTags} type="submit">
                      <Save />
                      {isSavingAlbumTags ? t("tags.saving") : t("tags.save")}
                    </Button>
                    <Button disabled={isSavingAlbumTags} onClick={cancelAlbumTagEditing} type="button" variant="outline">
                      <X />
                      {t("tags.cancel")}
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="eyebrow">{selectedAlbum.yearLabel ?? selectedAlbum.year ?? t("library.fallbackYear")}</p>
                  <button
                    aria-label={t("tags.editSelected")}
                    className="album-title-edit-button"
                    onClick={startAlbumTagEditing}
                    type="button"
                  >
                    <h2>{localizeLibraryText(selectedAlbum.title, t)}</h2>
                    <Pencil aria-hidden="true" />
                  </button>
                  <p>{localizeLibraryText(selectedAlbum.artist, t)}</p>
                  {selectedAlbum.genre ? <p className="album-genre">{selectedAlbum.genre}</p> : null}
                </>
              )}
              {albumTagMessage ? (
                <p className="tag-edit-message" aria-live="polite">
                  {t(albumTagMessage.key, albumTagMessage.values)}
                </p>
              ) : null}
            </div>

            <Separator />
            <ol className="track-list">
              {selectedAlbum.tracks.map((track, trackIndex) => {
                const trackRowClassName = [
                  "track-list-row",
                  track.id === currentTrack?.id ? "active-track-row" : "",
                  track.id === selectedTrackId ? "selected-track-row" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <li className={trackRowClassName} key={track.id}>
                    <span className="track-title-cell">
                      <span className="track-action-slot">
                        <span className="track-number" aria-hidden="true">
                          {track.trackNumber ?? trackIndex + 1}
                        </span>
                        <button
                          aria-label={`${t("player.play")} ${localizeLibraryText(track.title, t)}`}
                          className="track-play-button"
                          onClick={() => playTrack(track, selectedAlbum.id)}
                          title={`${t("player.play")} ${localizeLibraryText(track.title, t)}`}
                          type="button"
                        >
                          <Play aria-hidden="true" />
                        </button>
                      </span>
                      <Button
                        className="track-select-button"
                        onFocus={prepareMarquee}
                        onMouseEnter={prepareMarquee}
                        onClick={() => selectTrack(track)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          openTrackDetail(track);
                        }}
                        onPointerCancel={finishTrackLongPress}
                        onPointerDown={(event) => startTrackLongPress(event, track)}
                        onPointerLeave={finishTrackLongPress}
                        onPointerMove={(event) => moveTrackLongPress(event, track)}
                        onPointerUp={finishTrackLongPress}
                        variant="outline"
                        type="button"
                      >
                        <span className="track-title-wrap marquee-wrap">
                          <span className="track-title marquee-text">
                            <span className="track-name">
                              {localizeLibraryText(track.title, t)}
                            </span>
                          </span>
                        </span>
                      </Button>
                      {track.hasLyrics || track.lyrics?.trim() ? (
                        <button
                          aria-label={t("trackDetail.showLyrics", { track: localizeLibraryText(track.title, t) })}
                          className="track-lyrics-button"
                          onClick={() => openTrackDetail(track, "lyrics")}
                          title={t("trackDetail.lyricsTab")}
                          type="button"
                        >
                          <ScrollText aria-hidden="true" />
                          <span className="sr-only">{t("trackDetail.lyricsTab")}</span>
                        </button>
                      ) : null}
                    </span>
                    <small>{formatTrackDuration(track)}</small>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <div className="empty-detail">
            <h2>{t("library.emptyTitle")}</h2>
            <p>{t("library.emptyDescription")}</p>
          </div>
        )}
      </section>

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
        onVolumeChange={setVolume}
        playbackError={playbackError}
        queueLength={queue.length}
        queueTracks={queue}
        ref={playerBarRef}
        repeatMode={repeatMode}
        t={t}
      />
      {isLibrarySettingsOpen ? (
        <div className="track-detail-backdrop" onMouseDown={() => setIsLibrarySettingsOpen(false)} role="presentation">
          <section
            aria-label={t("scan.libraryDialogLabel")}
            aria-modal="true"
            className="library-settings-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="track-detail-header">
              <div className="track-detail-title">
                <p className="eyebrow">{t("library.controls")}</p>
                <h2>{t("scan.libraryDialogTitle")}</h2>
              </div>
              <Button
                aria-label={t("trackDetail.close")}
                className="icon-button"
                onClick={() => setIsLibrarySettingsOpen(false)}
                type="button"
                variant="outline"
              >
                <X />
              </Button>
            </div>

            <div className="scan-panel-content">
              <label className="search-field">
                <span>{t("scan.folderLabel")}</span>
                <div className="folder-picker-row">
                  <Input
                    data-keyboard-scope="text"
                    onChange={(event) => setLibraryPath(event.currentTarget.value)}
                    placeholder={t("scan.folderPlaceholder")}
                    type="text"
                    value={libraryPath}
                  />
                  <Button
                    className="choose-folder-button"
                    disabled={isScanning || !isTauriRuntime}
                    onClick={() => void handleChooseFolder()}
                    title={!isTauriRuntime ? t("status.desktopOnly") : undefined}
                    variant="outline"
                    type="button"
                  >
                    <FolderOpen />
                    {t("scan.chooseFolder")}
                  </Button>
                </div>
              </label>

              <div className="scan-actions">
                <Button className="scan-button" disabled={isScanning} onClick={() => void handleScan()} type="button">
                  {isScanning ? t("scan.buttonScanning") : t("scan.button")}
                </Button>
                {libraryInfo ? (
                  <p className="info-text" aria-live="polite">
                    {t(libraryInfo.key, libraryInfo.values)}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {detailTrack && detailAlbum ? (
        <div className="track-detail-backdrop" onMouseDown={closeTrackDetail} role="presentation">
          <section
            aria-label={t("trackDetail.label")}
            aria-modal="true"
            className="track-detail-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="track-detail-header">
              <div className="track-detail-title">
                <p className="eyebrow">{localizeLibraryText(detailAlbum.title, t)}</p>
                <h2>{localizeLibraryText(detailTrack.title, t)}</h2>
              </div>
              <Button aria-label={t("trackDetail.close")} className="icon-button" onClick={closeTrackDetail} type="button" variant="outline">
                <X />
              </Button>
            </div>

            <Tabs
              className="track-detail-tabs"
              onValueChange={(value) => changeTrackDetailTab(value as "info" | "lyrics" | "artwork")}
              value={trackDetailTab}
            >
              <TabsList className="track-detail-tab-list">
                <TabsTrigger value="info">{t("trackDetail.infoTab")}</TabsTrigger>
                <TabsTrigger value="lyrics">{t("trackDetail.lyricsTab")}</TabsTrigger>
                <TabsTrigger value="artwork">{t("trackDetail.artworkTab")}</TabsTrigger>
              </TabsList>
              <TabsContent className="track-detail-tab-panel" value="info">
                <div className="track-tag-grid">
                  {trackTagFields.map((field) => (
                    <label className="track-tag-field" key={field.key}>
                      <span>{t(field.labelKey)}</span>
                      {editingTrackTag === field.key ? (
                        <Input
                          autoFocus
                          data-keyboard-scope="text"
                          inputMode={field.key === "year" || field.key === "trackNumber" || field.key === "discNumber" ? "numeric" : undefined}
                          onBlur={() => setEditingTrackTag(null)}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setTrackTagDraft((value) => ({ ...value, [field.key]: nextValue }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setTrackTagDraft(makeTrackTagDraft(detailTrack, detailAlbum));
                              setEditingTrackTag(null);
                            }
                          }}
                          value={trackTagDraft[field.key]}
                        />
                      ) : (
                        <button
                          className="track-tag-value"
                          onClick={() => setEditingTrackTag(field.key)}
                          type="button"
                        >
                          {trackTagDraft[field.key].trim() || t("trackDetail.emptyTag")}
                        </button>
                      )}
                    </label>
                  ))}
                  <div className="track-tag-field readonly">
                    <span>{t("trackDetail.duration")}</span>
                    <strong>{formatTrackDuration(detailTrack)}</strong>
                  </div>
                  <div className="track-tag-field readonly wide">
                    <span>{t("trackDetail.filePath")}</span>
                    <strong>{detailTrack.filePath ?? t("trackDetail.noFilePath")}</strong>
                  </div>
                </div>
                {trackTagMessage ? (
                  <p className="tag-edit-message" aria-live="polite">
                    {t(trackTagMessage.key, trackTagMessage.values)}
                  </p>
                ) : null}
                <div className="album-tag-actions">
                  <Button disabled={!hasTrackTagChanges || isSavingTrackTags} onClick={() => void saveTrackTags()} type="button">
                    <Save />
                    {isSavingTrackTags ? t("tags.saving") : t("tags.save")}
                  </Button>
                  <Button
                    disabled={!hasTrackTagChanges || isSavingTrackTags}
                    onClick={() => {
                      setTrackTagDraft(makeTrackTagDraft(detailTrack, detailAlbum));
                      setEditingTrackTag(null);
                    }}
                    type="button"
                    variant="outline"
                  >
                    <X />
                    {t("tags.cancel")}
                  </Button>
                </div>
              </TabsContent>
              <TabsContent className="track-detail-tab-panel" value="lyrics">
                <pre className="lyrics-panel">{detailLyrics?.trim() || t("trackDetail.noLyrics")}</pre>
              </TabsContent>
              <TabsContent className="track-detail-tab-panel" value="artwork">
                <div className="artwork-edit-panel">
                  <div className="artwork-preview-card">
                    <span>{t("trackDetail.currentArtwork")}</span>
                    {detailArtworkSrc ? (
                      <img
                        alt={t("album.artworkAlt", { album: localizeLibraryText(detailAlbum.title, t) })}
                        src={detailArtworkSrc}
                      />
                    ) : (
                      <div className="artwork-empty-state">{t("trackDetail.noArtwork")}</div>
                    )}
                  </div>
                  <div className="artwork-preview-card">
                    <span>{t("trackDetail.selectedArtwork")}</span>
                    {artworkPreviewSrc ? (
                      <img
                        alt={t("trackDetail.selectedArtwork")}
                        src={artworkPreviewSrc}
                      />
                    ) : (
                      <div className="artwork-empty-state">{t("trackDetail.artworkRequired")}</div>
                    )}
                  </div>
                  <div className="album-tag-actions artwork-actions">
                    <Button disabled={isSavingArtwork} onClick={() => void chooseArtwork()} type="button" variant="outline">
                      <FolderOpen />
                      {t("trackDetail.chooseArtwork")}
                    </Button>
                    <Button
                      disabled={!artworkDraftPath || isSavingArtwork || !hasRealBackend}
                      onClick={() => void saveTrackArtwork()}
                      type="button"
                    >
                      <Save />
                      {isSavingArtwork ? t("tags.saving") : t("trackDetail.saveArtwork")}
                    </Button>
                  </div>
                  {!isTauriRuntime ? <p className="tag-edit-message">{t("trackDetail.artworkDesktopOnly")}</p> : null}
                  {trackTagMessage ? (
                    <p className="tag-edit-message" aria-live="polite">
                      {t(trackTagMessage.key, trackTagMessage.values)}
                    </p>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;
