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

export type LibrarySnapshot = {
  albums: Album[];
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
