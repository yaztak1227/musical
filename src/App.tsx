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
  Play,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
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
type ThemeName = "crimson" | "ocean" | "violet";

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
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const storedTheme = window.localStorage.getItem("musical.theme");
    return storedTheme === "ocean" || storedTheme === "violet" ? storedTheme : "crimson";
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

  async function refreshLibrary() {
    try {
      const snapshot = await invoke<LibrarySnapshot>("library_snapshot");
      setAlbums(snapshot.albums);
      setLibraryPath(snapshot.lastScanPath ?? "");
      setSelectedAlbumId(snapshot.albums[0]?.id ?? null);
      setPlaybackAlbumId(snapshot.albums[0]?.id ?? null);
      setCurrentTrack(snapshot.albums[0]?.tracks[0] ?? null);
      setLibraryInfo(
        snapshot.albums.length > 0
          ? { key: "status.loadedAlbums", values: { count: snapshot.albums.length, databasePath: snapshot.databasePath } }
          : { key: "status.noAlbumsIndexed", values: { databasePath: snapshot.databasePath } },
      );
    } catch (error) {
      setLibraryInfo(toI18nError(error));
    }
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

  function seekTo(nextTime: number) {
    const boundedTime = Math.max(0, Math.min(nextTime, effectiveDuration || 0));
    setCurrentTime(boundedTime);

    const audio = audioRef.current;
    if (audio && isTauriRuntime && currentTrack?.filePath) {
      audio.currentTime = boundedTime;
    }
  }

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
                    <SelectItem value="crimson">{t("theme.crimson")}</SelectItem>
                    <SelectItem value="ocean">{t("theme.ocean")}</SelectItem>
                    <SelectItem value="violet">{t("theme.violet")}</SelectItem>
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

      <section className="albums-panel" aria-label={t("library.albumListLabel")}>
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
                      aria-label={t("album.play", { album: albumTitle })}
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
                      title={t("album.play", { album: albumTitle })}
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
              <p className="eyebrow">{selectedAlbum.year ?? t("library.fallbackYear")}</p>
              <h2>{localizeLibraryText(selectedAlbum.title, t)}</h2>
              <p>{localizeLibraryText(selectedAlbum.artist, t)}</p>
            </div>

            <Separator />
            <ol className="track-list">
              {selectedAlbum.tracks.map((track) => (
                <li key={track.id}>
                  <Button
                    className={track.id === currentTrack?.id ? "active-track" : undefined}
                    onClick={() => playTrack(track, selectedAlbum.id)}
                    variant="outline"
                    type="button"
                  >
                    <span>
                      {track.trackNumber ? `${track.trackNumber}. ` : ""}
                      {localizeLibraryText(track.title, t)}
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
            <Volume2 aria-hidden="true" />
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

  return { key: "status.error", values: { message } };
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
