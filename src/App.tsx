import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  ArrowDownAZ,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  ListMusic,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Play,
  Repeat,
  Repeat1,
  Save,
  Search,
  Shuffle,
  VolumeX,
  X,
  Volume2,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import "./App.css";
import { getInitialLocale, getLocaleLabel, locales, translate, type Locale, type TranslationKey } from "./i18n";
import { type AlbumTagDraft, updateAlbumTags } from "./lib/tagEditing";
import { useGlobalMediaKeys } from "./lib/useGlobalMediaKeys";

type Track = {
  id: number;
  title: string;
  artist: string;
  durationSeconds?: number;
  durationLabel?: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  filePath?: string;
};

type Album = {
  id: number;
  title: string;
  artist: string;
  year: number | null;
  genre?: string | null;
  artworkPath?: string | null;
  coverUrl?: string;
  tracks: Track[];
};

type LibrarySnapshot = {
  albums: Album[];
  lastScanPath: string | null;
  databasePath: string;
};

type ScanSummary = {
  scannedFiles: number;
  importedTracks: number;
  skippedFiles: number;
  albums: number;
  libraryPath: string;
};

type I18nMessage = {
  key: TranslationKey;
  values?: Record<string, string | number>;
};

type TFunction = (key: TranslationKey, values?: Record<string, string | number>) => string;

type RepeatMode = "off" | "all" | "one";
type AlbumViewMode = "large" | "small" | "list";
type AlbumSortMode = "title" | "artist" | "year-desc" | "year-asc";
type ThemeName = "crimson" | "ocean" | "violet" | "forest" | "amber" | "mono";

const themeOptions = [
  { name: "crimson", labelKey: "theme.crimson", color: "oklch(0.46 0.18 25)" },
  { name: "ocean", labelKey: "theme.ocean", color: "oklch(0.46 0.12 205)" },
  { name: "violet", labelKey: "theme.violet", color: "oklch(0.48 0.18 292)" },
  { name: "forest", labelKey: "theme.forest", color: "oklch(0.43 0.12 145)" },
  { name: "amber", labelKey: "theme.amber", color: "oklch(0.58 0.15 72)" },
  { name: "mono", labelKey: "theme.mono", color: "oklch(0.34 0.01 260)" },
] satisfies { name: ThemeName; labelKey: TranslationKey; color: string }[];

const mockAlbums: Album[] = [
  {
    id: 1,
    title: "Midnight Transit",
    artist: "Circular Moonray",
    year: 2026,
    coverUrl:
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 101, title: "Station Lights", artist: "Circular Moonray", durationLabel: "3:42" },
      { id: 102, title: "Last Train Home", artist: "Circular Moonray", durationLabel: "4:08" },
      { id: 103, title: "Blue Platform", artist: "Circular Moonray", durationLabel: "2:57" },
    ],
  },
  {
    id: 2,
    title: "Room Tone",
    artist: "Astra Field",
    year: 2024,
    coverUrl:
      "https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 201, title: "Soft Machines", artist: "Astra Field", durationLabel: "3:21" },
      { id: 202, title: "Paper Sleeve", artist: "Astra Field", durationLabel: "3:54" },
      { id: 203, title: "Archive Dust", artist: "Astra Field", durationLabel: "4:31" },
    ],
  },
  {
    id: 3,
    title: "North Window",
    artist: "Mica Notes",
    year: 2025,
    coverUrl:
      "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 301, title: "First Snow", artist: "Mica Notes", durationLabel: "2:48" },
      { id: 302, title: "Glass Echo", artist: "Mica Notes", durationLabel: "5:12" },
      { id: 303, title: "Quiet Street", artist: "Mica Notes", durationLabel: "3:36" },
    ],
  },
];

const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const albumsPanelRef = useRef<HTMLElement | null>(null);
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const storedTheme = window.localStorage.getItem("musical.theme");
    return isThemeName(storedTheme) ? storedTheme : "crimson";
  });
  const t = useMemo(() => {
    return (key: TranslationKey, values?: Record<string, string | number>) => translate(locale, key, values);
  }, [locale]);
  const [query, setQuery] = useState("");
  const [libraryPath, setLibraryPath] = useState("");
  const [libraryInfo, setLibraryInfo] = useState<I18nMessage | null>(
    isTauriRuntime ? { key: "status.noLibraryScanned" } : { key: "status.webMockMode" },
  );
  const [albums, setAlbums] = useState<Album[]>(isTauriRuntime ? [] : mockAlbums);
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(
    isTauriRuntime ? null : mockAlbums[0]?.id ?? null,
  );
  const [playbackAlbumId, setPlaybackAlbumId] = useState<number | null>(
    isTauriRuntime ? null : mockAlbums[0]?.id ?? null,
  );
  const [currentTrack, setCurrentTrack] = useState<Track | null>(isTauriRuntime ? null : mockAlbums[0]?.tracks[0] ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() => getTrackDurationSeconds(isTauriRuntime ? null : mockAlbums[0]?.tracks[0] ?? null));
  const [volume, setVolume] = useState(0.85);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [albumViewMode, setAlbumViewMode] = useState<AlbumViewMode>("large");
  const [albumSortMode, setAlbumSortMode] = useState<AlbumSortMode>("title");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isAlbumTagEditing, setIsAlbumTagEditing] = useState(false);
  const [albumTagDraft, setAlbumTagDraft] = useState<AlbumTagDraft>(() => makeAlbumTagDraft(mockAlbums[0] ?? null));
  const [isSavingAlbumTags, setIsSavingAlbumTags] = useState(false);
  const [albumTagMessage, setAlbumTagMessage] = useState<I18nMessage | null>(null);

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
    void refreshLibrary();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : getTrackDurationSeconds(currentTrack));
    };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => handleTrackEnded();
    const handleError = () => {
      setIsPlaying(false);
      setPlaybackError(getAudioErrorMessage(audio, currentTrack));
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
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (albums.length === 0) {
      setSelectedAlbumId(null);
      setPlaybackAlbumId(null);
      setCurrentTrack(null);
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
    setCurrentTrack(selectedAlbum.tracks[0] ?? null);
  }, [albums, selectedAlbumId, playbackAlbumId, currentTrack]);

  useEffect(() => {
    setPlaybackError(null);
    setCurrentTime(0);
    setDuration(getTrackDurationSeconds(currentTrack));

    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.removeAttribute("src");

    if (isTauriRuntime && currentTrack?.filePath) {
      audio.src = convertFileSrc(currentTrack.filePath);
      audio.load();
      if (isPlaying) {
        void audio.play().catch((error: unknown) => {
          setIsPlaying(false);
          setPlaybackError(`${String(error)} / ${audio.src}`);
        });
      }
    }
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isTauriRuntime || !currentTrack?.filePath) return;

    if (isPlaying) {
      void audio.play().catch((error: unknown) => {
        setIsPlaying(false);
        setPlaybackError(`${String(error)} / ${audio.src}`);
      });
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (!isPlaying || (isTauriRuntime && currentTrack?.filePath)) return;
    const mockDuration = duration || getTrackDurationSeconds(currentTrack);
    const timer = window.setInterval(() => {
      setCurrentTime((value) => {
        const nextValue = value + 1;
        if (mockDuration > 0 && nextValue >= mockDuration) {
          window.clearInterval(timer);
          window.setTimeout(() => handleTrackEnded(), 0);
          return mockDuration;
        }
        return nextValue;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [currentTrack, duration, isPlaying]);

  const filteredAlbums = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchingAlbums = normalizedQuery
      ? albums.filter((album) => {
          const searchable = [
            album.title,
            album.artist,
            localizeLibraryText(album.title, t),
            localizeLibraryText(album.artist, t),
            String(album.year ?? ""),
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(normalizedQuery);
        })
      : albums;

    return [...matchingAlbums].sort((firstAlbum, secondAlbum) => compareAlbums(firstAlbum, secondAlbum, albumSortMode, t));
  }, [albumSortMode, albums, query, t]);

  const selectedAlbum =
    albums.find((album) => album.id === selectedAlbumId) ?? filteredAlbums[0] ?? albums[0] ?? null;
  const playbackAlbum =
    albums.find((album) => album.id === playbackAlbumId) ??
    albums.find((album) => album.tracks.some((track) => track.id === currentTrack?.id)) ??
    selectedAlbum;
  const queue = playbackAlbum?.tracks ?? [];
  const currentTrackIndex = currentTrack ? queue.findIndex((track) => track.id === currentTrack.id) : -1;
  const effectiveDuration = duration || getTrackDurationSeconds(currentTrack);
  const seekProgress = effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;
  const hasAlbumTagChanges = selectedAlbum ? isAlbumTagDraftChanged(albumTagDraft, selectedAlbum) : false;

  useEffect(() => {
    if (!selectedAlbum || isAlbumTagEditing) return;
    setAlbumTagDraft(makeAlbumTagDraft(selectedAlbum));
    setAlbumTagMessage(null);
  }, [isAlbumTagEditing, selectedAlbum]);

  async function refreshLibrary() {
    try {
      const snapshot = await invoke<LibrarySnapshot>("library_snapshot");
      applyLibrarySnapshot(snapshot, { resetPlayback: true });
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
  }

  function applyLibrarySnapshot(snapshot: LibrarySnapshot, options: { resetPlayback: boolean }) {
    setAlbums(snapshot.albums);
    setLibraryPath(snapshot.lastScanPath ?? "");
    if (options.resetPlayback) {
      setSelectedAlbumId(snapshot.albums[0]?.id ?? null);
      setPlaybackAlbumId(snapshot.albums[0]?.id ?? null);
      setCurrentTrack(snapshot.albums[0]?.tracks[0] ?? null);
    }
    setLibraryInfo(
      snapshot.albums.length > 0
        ? { key: "status.loadedAlbums", values: { count: snapshot.albums.length, databasePath: snapshot.databasePath } }
        : { key: "status.noAlbumsIndexed", values: { databasePath: snapshot.databasePath } },
    );
  }

  async function handleScan() {
    if (!isTauriRuntime) {
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
      const summary = await invoke<ScanSummary>("scan_music_folder", {
        folderPath: normalizedPath,
      });
      await refreshLibrary();
      setLibraryInfo({
        key: "status.scanComplete",
        values: { albums: summary.albums, tracks: summary.importedTracks, libraryPath: summary.libraryPath },
      });
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

  function selectAlbum(album: Album) {
    setSelectedAlbumId(album.id);
    setIsAlbumTagEditing(false);
    setAlbumTagMessage(null);
  }

  function playAlbum(album: Album) {
    const firstTrack = getAlbumStartTrack(album, isShuffle);
    setSelectedAlbumId(album.id);
    setPlaybackAlbumId(album.id);
    setCurrentTrack(firstTrack);
    setCurrentTime(0);
    setIsPlaying(Boolean(firstTrack));
  }

  function playTrack(track: Track, albumId = selectedAlbumId) {
    setPlaybackAlbumId(albumId);
    setCurrentTrack(track);
    setIsPlaying(true);
  }

  function togglePlayback() {
    if (!currentTrack && selectedAlbum) {
      playAlbum(selectedAlbum);
      return;
    }
    setIsPlaying((value) => !value);
  }

  function playPreviousTrack() {
    if (queue.length === 0) return;
    if (currentTime > 3) {
      seekTo(0);
      return;
    }

    const previousIndex = currentTrackIndex > 0 ? currentTrackIndex - 1 : queue.length - 1;
    playTrack(queue[previousIndex], playbackAlbum?.id ?? selectedAlbumId);
  }

  function playNextTrack(options: { autoplay?: boolean } = {}) {
    if (queue.length === 0) return;
    const nextTrack = getNextTrack();
    if (!nextTrack) {
      setIsPlaying(false);
      seekTo(0);
      return;
    }

    setCurrentTrack(nextTrack);
    setCurrentTime(0);
    setIsPlaying(options.autoplay ?? true);
  }

  function getNextTrack() {
    if (queue.length === 0) return null;
    if (isShuffle && queue.length > 1) {
      const choices = queue.filter((track) => track.id !== currentTrack?.id);
      return choices[Math.floor(Math.random() * choices.length)] ?? queue[0];
    }

    if (currentTrackIndex < 0) return queue[0];
    if (currentTrackIndex < queue.length - 1) return queue[currentTrackIndex + 1];
    return repeatMode === "all" ? queue[0] : null;
  }

  function handleTrackEnded() {
    if (repeatMode === "one") {
      seekTo(0);
      setIsPlaying(true);
      const audio = audioRef.current;
      if (audio && isTauriRuntime && currentTrack?.filePath) {
        void audio.play().catch((error: unknown) => setPlaybackError(String(error)));
      }
      return;
    }

    playNextTrack({ autoplay: true });
  }

  function cycleRepeatMode() {
    setRepeatMode((value) => {
      if (value === "off") return "all";
      if (value === "all") return "one";
      return "off";
    });
  }

  function toggleMute() {
    setVolume((value) => (value > 0 ? 0 : 0.85));
  }

  function stepVolume(delta: number) {
    setVolume((value) => Math.min(1, Math.max(0, value + delta)));
  }

  function seekTo(nextTime: number) {
    const boundedTime = Math.max(0, Math.min(nextTime, effectiveDuration || 0));
    setCurrentTime(boundedTime);

    const audio = audioRef.current;
    if (audio && isTauriRuntime && currentTrack?.filePath) {
      audio.currentTime = boundedTime;
    }
  }

  function prepareTrackTitleMarquee(event: { currentTarget: HTMLElement }) {
    const titleWrap = event.currentTarget.querySelector<HTMLElement>(".track-title-wrap");
    const title = event.currentTarget.querySelector<HTMLElement>(".track-title");
    if (!titleWrap || !title) return;

    const overflowDistance = title.scrollWidth - titleWrap.clientWidth;
    if (overflowDistance > 4) {
      titleWrap.dataset.marquee = "true";
      titleWrap.style.setProperty("--track-title-shift", `-${overflowDistance}px`);
    } else {
      delete titleWrap.dataset.marquee;
      titleWrap.style.removeProperty("--track-title-shift");
    }
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
      if (!isTauriRuntime) {
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
        const snapshot = await invoke<LibrarySnapshot>("library_snapshot");
        applyLibrarySnapshot(snapshot, { resetPlayback: false });
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

  const mediaKeyHandlers = useMemo(
    () => ({
      onTogglePlayback: togglePlayback,
      onPreviousTrack: playPreviousTrack,
      onNextTrack: () => playNextTrack(),
      onVolumeStep: stepVolume,
      onToggleMute: toggleMute,
      onToggleShuffle: () => setIsShuffle((value) => !value),
      onCycleRepeat: cycleRepeatMode,
      onToggleSidebar: () => setIsSidebarCollapsed((value) => !value),
      onJumpToAlbumLetter: jumpToAlbumLetter,
    }),
    [currentTime, currentTrack, currentTrackIndex, effectiveDuration, filteredAlbums, isPlaying, isShuffle, playbackAlbum?.id, queue, repeatMode, selectedAlbum, selectedAlbumId, t],
  );

  useGlobalMediaKeys(mediaKeyHandlers);

  return (
    <main className={isSidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
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

          <Card className="scan-panel">
            <CardContent className="scan-panel-content">
              <label className="search-field">
                <span>{t("scan.folderLabel")}</span>
                <div className="folder-picker-row">
                  <Input
                    onChange={(event) => setLibraryPath(event.currentTarget.value)}
                    placeholder={t("scan.folderPlaceholder")}
                    type="text"
                    value={libraryPath}
                  />
                  <Button
                    className="choose-folder-button"
                    disabled={isScanning}
                    onClick={() => void handleChooseFolder()}
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
            </CardContent>
          </Card>
        </div>

      </section>

      <section className="albums-panel" aria-label={t("library.albumListLabel")} ref={albumsPanelRef}>
        <div className="albums-panel-header">
          <div className="albums-title">
            <Badge variant="secondary">{t("albums.count", { count: filteredAlbums.length })}</Badge>
          </div>
          <div className="album-toolbar">
            <div className="album-sort-field" aria-label={t("sort.label")}>
              <Select value={albumSortMode} onValueChange={(value) => setAlbumSortMode(value as AlbumSortMode)}>
                <SelectTrigger aria-label={t("sort.label")} className="album-sort-trigger" title={t("sort.label")}>
                  <ArrowDownAZ aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="title">{t("sort.title")}</SelectItem>
                  <SelectItem value="artist">{t("sort.artist")}</SelectItem>
                  <SelectItem value="year-desc">{t("sort.yearDesc")}</SelectItem>
                  <SelectItem value="year-asc">{t("sort.yearAsc")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="album-search-field">
              <span className="sr-only">{t("search.label")}</span>
              <div className="search-input-wrap">
                <Search aria-hidden="true" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={t("search.placeholder")}
                  type="search"
                />
              </div>
            </label>
            <div className="view-mode-field" aria-label={t("view.label")}>
              <span className="sr-only">{t("view.label")}</span>
              <Tabs value={albumViewMode} onValueChange={(value) => setAlbumViewMode(value as AlbumViewMode)}>
                <TabsList className="view-mode-buttons">
                  <TabsTrigger value="large" aria-label={t("view.largeIcons")} title={t("view.largeIcons")}>
                    <Maximize2 />
                    <span className="sr-only">{t("view.largeIcons")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="small" aria-label={t("view.smallIcons")} title={t("view.smallIcons")}>
                    <Minimize2 />
                    <span className="sr-only">{t("view.smallIcons")}</span>
                  </TabsTrigger>
                  <TabsTrigger value="list" aria-label={t("view.list")} title={t("view.list")}>
                    <ListMusic />
                    <span className="sr-only">{t("view.list")}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>

        <div className="albums-panel-main">
          <div className={`album-grid ${albumViewMode}`}>
            {filteredAlbums.length === 0 ? (
              <div className="empty-state">{t("library.emptySearch")}</div>
            ) : (
              filteredAlbums.map((album) => {
                const albumTitle = localizeLibraryText(album.title, t);
                const albumArtist = localizeLibraryText(album.artist, t);
                const artworkSrc = getArtworkSrc(album);

                return (
                  <Button
                    className={album.id === selectedAlbum?.id ? "album-card active" : "album-card"}
                    data-album-id={album.id}
                    key={album.id}
                    onClick={() => selectAlbum(album)}
                    variant="outline"
                    type="button"
                  >
                    <span className="album-cover-wrap">
                      {artworkSrc ? (
                        <img alt={t("album.coverAlt", { album: albumTitle })} src={artworkSrc} />
                      ) : (
                        <span className="album-placeholder" aria-hidden="true">
                          {albumTitle.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span
                        aria-label={t("album.playSelected")}
                        className="album-hover-play"
                        onClick={(event) => {
                          event.stopPropagation();
                          playAlbum(album);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            playAlbum(album);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        title={t("album.playSelected")}
                      >
                        <Play aria-hidden="true" />
                      </span>
                    </span>
                    <span>{albumTitle}</span>
                    <small>
                      {albumArtist}
                      {album.year ? ` / ${album.year}` : ""}
                    </small>
                  </Button>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="album-panel" aria-label={t("library.selectedAlbumLabel")}>
        {selectedAlbum ? (
          <>
            {getArtworkSrc(selectedAlbum) ? (
              <img
                className="album-art"
                alt={t("album.artworkAlt", { album: localizeLibraryText(selectedAlbum.title, t) })}
                src={getArtworkSrc(selectedAlbum)}
              />
            ) : (
              <div className="album-art placeholder-art" aria-hidden="true">
                {selectedAlbum.title.charAt(0).toUpperCase()}
              </div>
            )}

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
                  <p className="eyebrow">{selectedAlbum.year ?? t("library.fallbackYear")}</p>
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
              {selectedAlbum.tracks.map((track) => (
                <li key={track.id}>
                  <Button
                    className={track.id === currentTrack?.id ? "active-track" : undefined}
                    onFocus={prepareTrackTitleMarquee}
                    onMouseEnter={prepareTrackTitleMarquee}
                    onClick={() => playTrack(track, selectedAlbum.id)}
                    variant="outline"
                    type="button"
                  >
                    <span className="track-title-wrap">
                      <span className="track-title">
                        {track.trackNumber ? `${track.trackNumber}. ` : ""}
                        {localizeLibraryText(track.title, t)}
                      </span>
                    </span>
                    <small>{formatTrackDuration(track)}</small>
                  </Button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="empty-detail">
            <h2>{t("library.emptyTitle")}</h2>
            <p>{t("library.emptyDescription")}</p>
          </div>
        )}
      </section>

      <section className="player-bar" aria-label={t("player.label")}>
        <div className="player-track">
          <p className="eyebrow">{t("player.nowPlaying")}</p>
          <strong>{currentTrack ? localizeLibraryText(currentTrack.title, t) : t("player.nothingSelected")}</strong>
          <span>{currentTrack ? localizeLibraryText(currentTrack.artist, t) : t("player.pickPrompt")}</span>
          {playbackError ? (
            <small role="alert">{t("player.playbackError", { message: playbackError })}</small>
          ) : null}
        </div>
        <div className="player-main">
          <div className="transport-controls">
            <Button
              aria-label={t("player.previous")}
              className="control-button icon-button"
              disabled={!currentTrack}
              onClick={playPreviousTrack}
              title={t("player.previous")}
              type="button"
              variant="outline"
            >
              <ChevronLeft />
            </Button>
            <Button
              aria-label={currentTrack ? (isPlaying ? t("player.pause") : t("player.play")) : t("player.idle")}
              className="play-button icon-button"
              disabled={!currentTrack}
              onClick={togglePlayback}
              title={currentTrack ? (isPlaying ? t("player.pause") : t("player.play")) : t("player.idle")}
              type="button"
            >
              {isPlaying ? <Pause /> : <Play />}
            </Button>
            <Button
              aria-label={t("player.next")}
              className="control-button icon-button"
              disabled={!currentTrack}
              onClick={() => playNextTrack()}
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
              onValueChange={(value) => seekTo(value[0] ?? 0)}
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
            disabled={queue.length < 2}
            pressed={isShuffle}
            onPressedChange={setIsShuffle}
          >
            <Shuffle />
            {t("player.shuffle")}
          </Toggle>
          <Button className={repeatMode !== "off" ? "option-button active" : "option-button"} onClick={cycleRepeatMode} type="button" variant="outline">
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
              onValueChange={(value) => setVolume(value[0] ?? 0)}
              step={0.01}
              value={[volume]}
            />
          </label>
          <p className="queue-count">
            {t("player.queue")} / {t("player.queueCount", { count: queue.length })}
          </p>
        </div>
      </section>
    </main>
  );
}

function localizeLibraryText(value: string, t: TFunction) {
  if (value === "Unknown Track") return t("data.unknownTrack");
  if (value === "Unknown Album") return t("data.unknownAlbum");
  if (value === "Unknown Artist") return t("data.unknownArtist");
  if (value === "Other Album") return t("data.otherAlbum");
  if (value === "Various Artists") return t("data.variousArtists");
  return value;
}

function getArtworkSrc(album: Album) {
  if (album.coverUrl) return album.coverUrl;
  if (!album.artworkPath) return "";
  return isTauriRuntime ? convertFileSrc(album.artworkPath) : album.artworkPath;
}

function getAlbumStartTrack(album: Album, isShuffle: boolean) {
  if (album.tracks.length === 0) return null;
  if (!isShuffle || album.tracks.length === 1) return album.tracks[0];
  return album.tracks[Math.floor(Math.random() * album.tracks.length)] ?? album.tracks[0];
}

function compareAlbums(firstAlbum: Album, secondAlbum: Album, sortMode: AlbumSortMode, t: TFunction) {
  const titleCompare = localizeLibraryText(firstAlbum.title, t).localeCompare(localizeLibraryText(secondAlbum.title, t), undefined, {
    sensitivity: "base",
    numeric: true,
  });
  const artistCompare = localizeLibraryText(firstAlbum.artist, t).localeCompare(
    localizeLibraryText(secondAlbum.artist, t),
    undefined,
    {
      sensitivity: "base",
      numeric: true,
    },
  );

  if (sortMode === "artist") return artistCompare || titleCompare;

  if (sortMode === "year-desc" || sortMode === "year-asc") {
    const unknownYear = sortMode === "year-desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    const firstYear = firstAlbum.year ?? unknownYear;
    const secondYear = secondAlbum.year ?? unknownYear;
    const yearCompare = sortMode === "year-desc" ? secondYear - firstYear : firstYear - secondYear;
    return yearCompare || titleCompare;
  }

  return titleCompare || artistCompare;
}

function getAlbumJumpTarget(albums: Album[], letter: string, t: TFunction) {
  const targetLetter = letter.toUpperCase();
  const albumKeys = albums
    .map((album) => ({
      album,
      key: getAlbumJumpKey(localizeLibraryText(album.title, t)),
    }))
    .filter((item) => item.key);

  if (albumKeys.length === 0) return null;

  const exactMatch = albumKeys
    .filter((item) => item.key.startsWith(targetLetter))
    .sort((left, right) => left.key.localeCompare(right.key, undefined, { sensitivity: "base", numeric: true }))[0];
  if (exactMatch) return exactMatch.album;

  const sortedAlbums = albumKeys.sort((left, right) =>
    left.key.localeCompare(right.key, undefined, { sensitivity: "base", numeric: true }),
  );
  return sortedAlbums.find((item) => item.key > targetLetter)?.album ?? sortedAlbums[sortedAlbums.length - 1]?.album ?? null;
}

function getAlbumJumpKey(title: string) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/^[^a-zA-Z0-9]+/, "")
    .toUpperCase();
}

function getAudioErrorMessage(audio: HTMLAudioElement, track: Track | null) {
  const codeMessages: Record<number, string> = {
    1: "aborted",
    2: "network or asset protocol error",
    3: "decode error",
    4: "unsupported source or codec",
  };
  const code = audio.error?.code ?? 0;
  const source = audio.currentSrc || audio.src || track?.filePath || "no source";
  return `${codeMessages[code] ?? "unknown audio error"} / ${source}`;
}

function toI18nError(error: unknown): I18nMessage {
  const message = String(error);
  const [key, folderPath, reason] = message.split("\t");

  if (key === "library.error.folderOpen") {
    return { key: "status.folderOpenError", values: { folderPath, reason } };
  }

  if (key === "library.error.notFolder") {
    return { key: "status.notFolderError", values: { folderPath } };
  }

  if (key === "library.error.albumNotFound") {
    return { key: "status.albumNotFound", values: { albumId: folderPath } };
  }

  if (key === "library.error.albumHasNoTracks") {
    return { key: "status.albumHasNoTracks", values: { albumId: folderPath } };
  }

  if (key === "library.error.emptyAlbumTitle") {
    return { key: "status.emptyAlbumTitle" };
  }

  return { key: "status.error", values: { message } };
}

function makeAlbumTagDraft(album: Album | null | undefined): AlbumTagDraft {
  return {
    album: album?.title ?? "",
    albumArtist: album?.artist ?? "",
    artist: album?.artist ?? "",
    year: album?.year ? String(album.year) : "",
    genre: album?.genre ?? "",
  };
}

function isAlbumTagDraftChanged(draft: AlbumTagDraft, album: Album) {
  const normalizedDraft = normalizeAlbumTagDraft(draft);
  const normalizedAlbum = normalizeAlbumTagDraft(makeAlbumTagDraft(album));
  return (
    normalizedDraft.album !== normalizedAlbum.album ||
    normalizedDraft.albumArtist !== normalizedAlbum.albumArtist ||
    normalizedDraft.artist !== normalizedAlbum.artist ||
    normalizedDraft.year !== normalizedAlbum.year ||
    normalizedDraft.genre !== normalizedAlbum.genre
  );
}

function normalizeAlbumTagDraft(draft: AlbumTagDraft) {
  return {
    album: draft.album.trim(),
    albumArtist: draft.albumArtist.trim(),
    artist: draft.artist.trim(),
    year: draft.year.trim(),
    genre: draft.genre.trim(),
  };
}

function parseOptionalYear(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;
  const parsedValue = Number.parseInt(trimmedValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function isThemeName(value: string | null): value is ThemeName {
  return themeOptions.some((theme) => theme.name === value);
}

function formatTrackDuration(track: Track) {
  if (track.durationLabel) return track.durationLabel;
  if (typeof track.durationSeconds === "number") return formatSeconds(track.durationSeconds);
  return "--:--";
}

function getTrackDurationSeconds(track: Track | null) {
  if (!track) return 0;
  if (typeof track.durationSeconds === "number") return track.durationSeconds;
  if (!track.durationLabel) return 0;

  const [minutes, seconds] = track.durationLabel.split(":").map(Number);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0;
  return minutes * 60 + seconds;
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default App;
