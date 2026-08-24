export type EntityId = string | number;

export type Track = {
  id: EntityId;
  uuid?: string;
  title: string;
  artist: string;
  durationSeconds?: number;
  durationLabel?: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  filePath?: string;
  hasLyrics?: boolean;
  isFavorite?: boolean;
  lyrics?: string | null;
  rating?: number | null;
};

export type Album = {
  id: EntityId;
  groupKey?: string;
  title: string;
  artist: string;
  year: number | null;
  yearLabel?: string | null;
  genre?: string | null;
  artworkPath?: string | null;
  coverUrl?: string;
  tracks: Track[];
};

export type Playlist = {
  id: EntityId;
  name: string;
  filePath: string;
  artworkPath?: string | null;
  trackCount: number;
  missingTrackPaths: string[];
  trackIndexes?: number[];
  tracks: Track[];
};

export type PlaybackSource =
  | { type: "album"; album: Album }
  | { type: "playlist"; playlist: Playlist };

export type LibrarySnapshot = {
  albums: Album[];
  playlists: Playlist[];
  lastScanPath: string | null;
  databasePath: string;
};

export type ScanSummary = {
  scannedFiles: number;
  importedTracks: number;
  skippedFiles: number;
  albums: number;
  libraryPath: string;
};
