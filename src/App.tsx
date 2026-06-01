import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderOpen, ListMusic, PanelLeftClose, PanelLeftOpen, Pencil, Save, ScrollText, X } from "lucide-react";
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
import { useGlobalMediaKeys } from "./lib/useGlobalMediaKeys";
import { mockAlbums } from "./lib/mockData";
import { formatTrackDuration } from "./lib/formatUtils";
import { filterAndSortAlbums } from "./lib/albumFilters";
import { localizeLibraryText, getArtworkSrc, getAlbumStartTrack, getAlbumJumpTarget, toI18nError } from "./lib/libraryUtils";
import { prepareMarquee } from "./lib/marqueeUtils";
import { makeAlbumTagDraft, isAlbumTagDraftChanged, parseOptionalYear } from "./lib/tagDraftUtils";
import { AlbumBrowser } from "./components/AlbumBrowser";
import { PlayerBar, type PlayerBarHandle } from "./components/PlayerBar";

const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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
  const [audioSourceKey, setAudioSourceKey] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [albumViewMode, setAlbumViewMode] = useState<AlbumViewMode>("large");
  const [albumListMode, setAlbumListMode] = useState<AlbumListMode>("album");
  const [albumSortMode, setAlbumSortMode] = useState<AlbumSortMode>("title");
  const [albumSortDirection, setAlbumSortDirection] = useState<AlbumSortDirection>("asc");
  const [lyricsOnly, setLyricsOnly] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
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
    void refreshLibrary();
  }, []);

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
    playerBarRef.current?.resetPosition();
    setAudioSourceKey(null);

    const audio = audioRef.current;
    if (!audio) return;

    releaseAudioSource(audio);

    if (isTauriRuntime && currentTrack?.filePath) {
      audio.src = convertFileSrc(currentTrack.filePath);
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
  const queue = playbackAlbum?.tracks ?? [];
  const currentTrackIndex = currentTrack ? queue.findIndex((track) => track.id === currentTrack.id) : -1;
  const hasAlbumTagChanges = selectedAlbum ? isAlbumTagDraftChanged(albumTagDraft, selectedAlbum) : false;
  const detailAlbum =
    albums.find((album) => album.tracks.some((track) => track.id === detailTrackId)) ?? selectedAlbum;
  const detailTrack =
    detailAlbum?.tracks.find((track) => track.id === detailTrackId) ?? null;
  const selectedAlbumArtworkSrc = useMemo(
    () => (selectedAlbum ? getArtworkSrc(selectedAlbum, isTauriRuntime) : ""),
    [selectedAlbum?.artworkPath, selectedAlbum?.coverUrl],
  );
  const detailArtworkSrc = useMemo(
    () => (detailAlbum ? getArtworkSrc(detailAlbum, isTauriRuntime) : ""),
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
    setTrackLyricsById({});
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

  const selectAlbum = useCallback((album: Album) => {
    setSelectedAlbumId(album.id);
    setIsAlbumTagEditing(false);
    setAlbumTagMessage(null);
  }, []);

  const playAlbum = useCallback((album: Album) => {
    const firstTrack = getAlbumStartTrack(album, isShuffle);
    setSelectedAlbumId(album.id);
    setPlaybackAlbumId(album.id);
    setCurrentTrack(firstTrack);
    playerBarRef.current?.resetPosition();
    setIsPlaying(Boolean(firstTrack));
  }, [isShuffle]);

  const playTrack = useCallback((track: Track, albumId = selectedAlbumId) => {
    setPlaybackAlbumId(albumId);
    setCurrentTrack(track);
    setIsPlaying(true);
  }, [selectedAlbumId]);

  function selectTrack(track: Track, albumId = selectedAlbumId) {
    setPlaybackAlbumId(albumId);
    setCurrentTrack(track);
    playerBarRef.current?.resetPosition();
    setIsPlaying(false);
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

  async function loadTrackLyrics(track: Track) {
    if (!track.hasLyrics && !track.lyrics?.trim()) {
      setTrackLyricsById((current) => ({ ...current, [track.id]: null }));
      return;
    }

    if (track.id in trackLyricsById) return;

    if (!isTauriRuntime) {
      setTrackLyricsById((current) => ({ ...current, [track.id]: track.lyrics ?? null }));
      return;
    }

    try {
      const lyrics = await invoke<string | null>("track_lyrics", { trackId: track.id });
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
    if (!currentTrack && selectedAlbum) {
      playAlbum(selectedAlbum);
      return;
    }
    setIsPlaying((value) => !value);
  }

  function playPreviousTrack() {
    if (queue.length === 0) return;
    if ((playerBarRef.current?.getCurrentTime() ?? 0) > 3) {
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
    playerBarRef.current?.resetPosition();
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
    playerBarRef.current?.toggleMute();
  }

  function stepVolume(delta: number) {
    playerBarRef.current?.stepVolume(delta);
  }

  function seekTo(nextTime: number, source = "programmatic") {
    playerBarRef.current?.seekTo(nextTime, source);
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
      if (!isTauriRuntime) {
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
        const snapshot = await invoke<LibrarySnapshot>("library_snapshot");
        applyLibrarySnapshot(snapshot, { resetPlayback: false });
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
        setArtworkPreviewSrc(convertFileSrc(selectedPath));
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
      const snapshot = await invoke<LibrarySnapshot>("library_snapshot");
      applyLibrarySnapshot(snapshot, { resetPlayback: false });
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
    [currentTrack, currentTrackIndex, filteredAlbums, isPlaying, isShuffle, playbackAlbum?.id, queue, repeatMode, selectedAlbum, selectedAlbumId, t],
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

      <AlbumBrowser
        albumSortDirection={albumSortDirection}
        albumSortMode={albumSortMode}
        albumListMode={albumListMode}
        albums={filteredAlbums}
        albumViewMode={albumViewMode}
        isTauriRuntime={isTauriRuntime}
        lyricsOnly={lyricsOnly}
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

      <section className="album-panel" aria-label={t("library.selectedAlbumLabel")}>
        {selectedAlbum ? (
          <>
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
              {selectedAlbum.tracks.map((track) => (
                <li className={track.id === currentTrack?.id ? "track-list-row active-track-row" : "track-list-row"} key={track.id}>
                  <span className="track-title-cell">
                    <Button
                      className="track-select-button"
                      onFocus={prepareMarquee}
                      onMouseEnter={prepareMarquee}
                      onClick={() => selectTrack(track, selectedAlbum.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        openTrackDetail(track);
                      }}
                      variant="outline"
                      type="button"
                    >
                      <span className="track-title-wrap marquee-wrap">
                        <span className="track-title marquee-text">
                          <span className="track-name">
                            {track.trackNumber ? `${track.trackNumber}. ` : ""}
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

      <PlayerBar
        audioRef={audioRef}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isShuffle={isShuffle}
        isTauriRuntime={isTauriRuntime}
        onCycleRepeat={cycleRepeatMode}
        onEnded={handleTrackEnded}
        onNextTrack={() => playNextTrack()}
        onPlaybackError={setPlaybackError}
        onPlayingChange={setIsPlaying}
        onPreviousTrack={playPreviousTrack}
        onShuffleChange={setIsShuffle}
        onTogglePlayback={togglePlayback}
        playbackError={playbackError}
        queueLength={queue.length}
        ref={playerBarRef}
        repeatMode={repeatMode}
        t={t}
      />
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
                      disabled={!artworkDraftPath || isSavingArtwork || !isTauriRuntime}
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
