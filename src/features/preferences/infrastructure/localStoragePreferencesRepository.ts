import type { Locale } from "@/i18n";
import type { ThemeName } from "@/types/app";
import type { PlaybackPreferences } from "@/features/playback/domain/playbackPreferences";
import { isRepeatMode } from "@/features/playback/domain/playbackPreferences";
import type { RemoteAccessMode } from "@/lib/remoteAccess";

export type LibrarySidebarSectionStateValue = {
  appearance: boolean;
  remote: boolean;
  settings: boolean;
};

const storageKeys = {
  libraryMenuOpen: "musical.libraryMenuOpen",
  librarySidebarSections: "musical.librarySidebarSections",
  locale: "musical.locale",
  playbackPreferences: "musical.playbackPreferences",
  mcpEnabled: "musical.mcpEnabled",
  remoteAccessGlobalIp: "musical.remoteAccessGlobalIp",
  remoteAccessMode: "musical.remoteAccessMode",
  sidebarCollapsed: "musical.sidebarCollapsed",
  theme: "musical.theme",
} as const;

export const defaultLibrarySidebarSectionState = {
  appearance: true,
  settings: true,
  remote: false,
} satisfies LibrarySidebarSectionStateValue;

export function getStoredThemeName(isThemeName: (value: string | null) => value is ThemeName) {
  const storedTheme = window.localStorage.getItem(storageKeys.theme);
  return isThemeName(storedTheme) ? storedTheme : "crimson";
}

export function storeLocale(locale: Locale) {
  window.localStorage.setItem(storageKeys.locale, locale);
}

export function storeThemeName(themeName: ThemeName) {
  window.localStorage.setItem(storageKeys.theme, themeName);
}

export function getStoredSidebarCollapsed() {
  return window.localStorage.getItem(storageKeys.sidebarCollapsed) === "true";
}

export function storeSidebarCollapsed(isCollapsed: boolean) {
  window.localStorage.setItem(storageKeys.sidebarCollapsed, String(isCollapsed));
}

export function getStoredMcpEnabled() {
  return window.localStorage.getItem(storageKeys.mcpEnabled) === "true";
}

export function storeMcpEnabled(enabled: boolean) {
  window.localStorage.setItem(storageKeys.mcpEnabled, String(enabled));
}

export function getStoredRemoteAccessMode(): RemoteAccessMode {
  const mode = window.localStorage.getItem(storageKeys.remoteAccessMode);
  return mode === "lan" || mode === "open" ? mode : "off";
}

export function getStoredRemoteAccessGlobalIp() {
  return window.localStorage.getItem(storageKeys.remoteAccessGlobalIp);
}

export function storeRemoteAccessMode(mode: RemoteAccessMode) {
  window.localStorage.setItem(storageKeys.remoteAccessMode, mode);
}

export function storeRemoteAccessGlobalIp(globalIp: string | null) {
  if (globalIp) {
    window.localStorage.setItem(storageKeys.remoteAccessGlobalIp, globalIp);
  } else {
    window.localStorage.removeItem(storageKeys.remoteAccessGlobalIp);
  }
}

export function getStoredLibraryMenuOpen() {
  return window.localStorage.getItem(storageKeys.libraryMenuOpen) === "true";
}

export function storeLibraryMenuOpen(isOpen: boolean) {
  window.localStorage.setItem(storageKeys.libraryMenuOpen, String(isOpen));
}

export function getStoredLibrarySidebarSectionState(): LibrarySidebarSectionStateValue {
  const storedValue = window.localStorage.getItem(storageKeys.librarySidebarSections);
  if (!storedValue) return defaultLibrarySidebarSectionState;

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<Record<keyof LibrarySidebarSectionStateValue | "library", unknown>>;
    const legacyLibraryValue = parsedValue.library;
    return {
      appearance: typeof parsedValue.appearance === "boolean" ? parsedValue.appearance : defaultLibrarySidebarSectionState.appearance,
      settings:
        typeof parsedValue.settings === "boolean"
          ? parsedValue.settings
          : typeof legacyLibraryValue === "boolean"
            ? legacyLibraryValue
            : defaultLibrarySidebarSectionState.settings,
      remote: typeof parsedValue.remote === "boolean" ? parsedValue.remote : defaultLibrarySidebarSectionState.remote,
    };
  } catch {
    return defaultLibrarySidebarSectionState;
  }
}

export function storeLibrarySidebarSectionState(state: LibrarySidebarSectionStateValue) {
  window.localStorage.setItem(storageKeys.librarySidebarSections, JSON.stringify(state));
}

export function getStoredPlaybackPreferences(): PlaybackPreferences {
  const fallback: PlaybackPreferences = {
    isShuffle: false,
    playbackAlbumId: null,
    repeatMode: "off",
    selectedAlbumId: null,
  };

  try {
    const storedPreferences = window.localStorage.getItem(storageKeys.playbackPreferences);
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

export function storePlaybackPreferences(playbackPreferences: PlaybackPreferences) {
  window.localStorage.setItem(storageKeys.playbackPreferences, JSON.stringify(playbackPreferences));
}

function parseStoredAlbumId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return typeof value === "string" && value.trim() ? value : null;
}
