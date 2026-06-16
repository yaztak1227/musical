const localeFiles = import.meta.glob("./locales/*.xml", {
  eager: true,
  query: "?raw",
  import: "default",
});

export type Locale = string;

export const translationKeys = [
  "app.brand",
  "app.title",
  "app.description",
  "language.label",
  "theme.label",
  "theme.crimson",
  "theme.ocean",
  "theme.violet",
  "theme.forest",
  "theme.amber",
  "theme.mono",
  "scan.folderLabel",
  "scan.folderPlaceholder",
  "scan.selectLibrary",
  "scan.openLibrarySettings",
  "scan.libraryDialogLabel",
  "scan.libraryDialogTitle",
  "scan.chooseFolder",
  "scan.button",
  "scan.buttonScanning",
  "updates.label",
  "updates.check",
  "updates.start",
  "updates.checking",
  "updates.available",
  "updates.confirmTitle",
  "updates.confirmMessage",
  "updates.confirmInstall",
  "updates.confirmLater",
  "updates.postponed",
  "updates.installing",
  "updates.installed",
  "updates.none",
  "updates.desktopOnly",
  "mcp.label",
  "mcp.description",
  "mcp.running",
  "mcp.stopped",
  "mcp.error",
  "search.label",
  "search.placeholder",
  "search.lyricsFilter",
  "filters.toggle",
  "view.label",
  "view.largeIcons",
  "view.smallIcons",
  "view.list",
  "listMode.albums",
  "listMode.tracks",
  "listMode.albumTable",
  "listMode.trackTable",
  "listMode.trackCount",
  "sort.label",
  "sort.title",
  "sort.artist",
  "sort.year",
  "sort.ascending",
  "sort.descending",
  "sort.toggleDirection",
  "sort.yearDesc",
  "sort.yearAsc",
  "albums.heading",
  "albums.count",
  "albums.scrollIndexLabel",
  "albums.jumpToIndex",
  "sidebar.collapse",
  "sidebar.expand",
  "sidebar.section.appearance",
  "sidebar.section.settings",
  "sidebar.section.remote",
  "remoteAccess.label",
  "remoteAccess.modeLabel",
  "remoteAccess.mode.off",
  "remoteAccess.mode.lan",
  "remoteAccess.mode.open",
  "remoteAccess.localLabel",
  "remoteAccess.localSetting",
  "remoteAccess.localDescription",
  "remoteAccess.localStarting",
  "remoteAccess.localError",
  "remoteAccess.openLocalLink",
  "remoteAccess.localQrAlt",
  "remoteAccess.setting",
  "remoteAccess.description",
  "remoteAccess.starting",
  "remoteAccess.error",
  "remoteAccess.openLink",
  "remoteAccess.qrAlt",
  "library.albumListLabel",
  "library.controls",
  "library.selectedAlbumLabel",
  "library.fallbackYear",
  "library.emptySearch",
  "library.emptyTitle",
  "library.emptyDescription",
  "album.coverAlt",
  "album.artworkAlt",
  "album.play",
  "album.playSelected",
  "tags.album",
  "tags.albumArtist",
  "tags.title",
  "tags.artist",
  "tags.year",
  "tags.genre",
  "tags.trackNumber",
  "tags.discNumber",
  "tags.albumWide",
  "tags.save",
  "tags.saving",
  "tags.cancel",
  "tags.saved",
  "tags.partialSaved",
  "tags.mockSaved",
  "tags.albumRequired",
  "tags.trackTitleRequired",
  "tags.trackSaved",
  "tags.artworkSaved",
  "tags.editSelected",
  "trackDetail.label",
  "trackDetail.close",
  "trackDetail.infoTab",
  "trackDetail.lyricsTab",
  "trackDetail.artworkTab",
  "trackDetail.showLyrics",
  "trackDetail.currentArtwork",
  "trackDetail.selectedArtwork",
  "trackDetail.noArtwork",
  "trackDetail.editArtwork",
  "trackDetail.chooseArtwork",
  "trackDetail.saveArtwork",
  "trackDetail.artworkDesktopOnly",
  "trackDetail.artworkRequired",
  "trackDetail.emptyTag",
  "trackDetail.duration",
  "trackDetail.filePath",
  "trackDetail.noFilePath",
  "trackDetail.noLyrics",
  "trackDetail.favorite",
  "trackDetail.notFavorite",
  "trackDetail.addFavorite",
  "trackDetail.removeFavorite",
  "trackDetail.rating",
  "trackDetail.setRating",
  "trackDetail.clearRating",
  "trackDetail.userStateSaved",
  "trackDetail.userStateSummary",
  "data.unknownTrack",
  "data.unknownAlbum",
  "data.unknownArtist",
  "data.otherAlbum",
  "data.variousArtists",
  "player.label",
  "player.nowPlaying",
  "player.nothingSelected",
  "player.pickPrompt",
  "player.showCurrentAlbum",
  "player.previous",
  "player.play",
  "player.pause",
  "player.next",
  "player.idle",
  "player.seek",
  "player.options",
  "player.volume",
  "player.shuffle",
  "player.repeat",
  "player.repeatOff",
  "player.repeatAll",
  "player.repeatOne",
  "player.queue",
  "player.queueCount",
  "player.queueToggle",
  "player.lyrics",
  "player.openVisualizer",
  "player.closeVisualizer",
  "player.visualizerLabel",
  "player.visualizerMode",
  "player.visualizerWave",
  "player.visualizerSpectrum",
  "player.visualizerCircle",
  "player.chibiMode",
  "player.playbackError",
  "tvDisplay.nowPlaying",
  "tvDisplay.playingOnTv",
  "tvDisplay.readyOnTv",
  "tvDisplay.progress",
  "tvDisplay.transport",
  "tvDisplay.play",
  "tvDisplay.pause",
  "tvDisplay.rewind",
  "tvDisplay.forward",
  "tvDisplay.volumeDown",
  "tvDisplay.localPlayer",
  "tvDisplay.noAudioSource",
  "tvDisplay.audioError",
  "tvDisplay.nextTrack",
  "tvDisplay.albums",
  "tvDisplay.tracks",
  "tvDisplay.selectedTrack",
  "tvDisplay.libraryError",
  "tvDisplay.lyrics",
  "tvDisplay.queue",
  "tvDisplay.visualizer",
  "tvDisplay.memoryUsage",
  "status.noLibraryScanned",
  "status.webMockMode",
  "status.loadedAlbums",
  "status.noAlbumsIndexed",
  "status.desktopOnly",
  "status.enterFolder",
  "status.scanDiscovering",
  "status.scanReading",
  "status.scanWriting",
  "status.scanComplete",
  "status.libraryLoadOpening",
  "status.libraryLoadAlbums",
  "status.libraryLoadAssets",
  "status.libraryLoadApplying",
  "status.workerIdle",
  "status.workerLibraryScan",
  "status.analysisStarted",
  "status.analysisComplete",
  "status.folderOpenError",
  "status.notFolderError",
  "status.albumNotFound",
  "status.albumHasNoTracks",
  "status.trackNotFound",
  "status.emptyTrackTitle",
  "status.emptyAlbumTitle",
  "status.emptyArtworkPath",
  "status.unsupportedArtwork",
  "status.invalidRating",
  "status.error",
] as const;

export type TranslationKey = (typeof translationKeys)[number];

type TranslationValues = Record<string, string | number>;
type TranslationMap = Record<TranslationKey, string>;
type PartialTranslationMap = Partial<Record<TranslationKey, string>>;

type LocaleResource = {
  label: string;
  messages: TranslationMap;
};

type ParsedLocaleResource = {
  label: string;
  messages: PartialTranslationMap;
};

const parsedLocaleEntries = Object.entries(localeFiles)
  .map(([filePath, xml]) => parseLocaleXml(String(xml), filePath))
  .sort(([leftLocale], [rightLocale]) => leftLocale.localeCompare(rightLocale));

const englishMessages = makeEnglishBaseMessages(parsedLocaleEntries);
const localeEntries = parsedLocaleEntries.map(
  ([locale, resource]) =>
    [
      locale,
      {
        label: resource.label,
        messages: {
          ...englishMessages,
          ...resource.messages,
        },
      },
    ] as [Locale, LocaleResource],
);

const localeResources = Object.fromEntries(localeEntries) as Record<Locale, LocaleResource>;

export const locales = localeEntries.map(([locale]) => locale);

export function getInitialLocale(): Locale {
  const storedLocale = window.localStorage.getItem("musical.locale");
  if (isLocale(storedLocale)) return storedLocale;

  const browserLocale = window.navigator.language.split("-")[0];
  return isLocale(browserLocale) ? browserLocale : "en";
}

export function getLocaleLabel(locale: Locale) {
  return localeResources[locale]?.label ?? locale;
}

export function translate(locale: Locale, key: TranslationKey, values: TranslationValues = {}) {
  const template = localeResources[locale]?.messages[key] ?? localeResources.en?.messages[key] ?? key;
  return Object.entries(values).reduce(
    (message, [name, value]) => message.split(`{${name}}`).join(String(value)),
    template,
  );
}

function parseLocaleXml(xml: string, filePath: string): [Locale, ParsedLocaleResource] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new Error(`Invalid locale XML in ${filePath}: ${parserError.textContent ?? "unknown parse error"}`);
  }

  const resourceElement = document.querySelector("resources");
  const locale = resourceElement?.getAttribute("locale") ?? getLocaleFromPath(filePath);
  const label = resourceElement?.getAttribute("label") ?? locale;
  const messages = new Map<string, string>();
  document.querySelectorAll("message[key]").forEach((message) => {
    const key = message.getAttribute("key");
    if (key) messages.set(key, message.textContent ?? "");
  });

  return [
    locale,
    {
      label,
      messages: Object.fromEntries(
        translationKeys.flatMap((key) => {
          const value = messages.get(key);
          return value === undefined ? [] : [[key, value]];
        }),
      ) as PartialTranslationMap,
    },
  ];
}

function makeEnglishBaseMessages(localeEntries: Array<[Locale, ParsedLocaleResource]>) {
  const englishResource = localeEntries.find(([locale]) => locale === "en")?.[1];
  return Object.fromEntries(
    translationKeys.map((key) => [key, englishResource?.messages[key] ?? key]),
  ) as TranslationMap;
}

function getLocaleFromPath(filePath: string) {
  return filePath.split("/").pop()?.replace(/\.xml$/, "") || "en";
}

function isLocale(value: string | null): value is string {
  return locales.some((locale) => locale === value);
}
