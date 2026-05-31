export type Track = {
  id: number;
  title: string;
  artist: string;
  durationSeconds?: number;
  durationLabel?: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  filePath?: string;
  lyrics?: string | null;
};

export type Album = {
  id: number;
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
