import type { TvSessionSnapshot } from "../domain/tvDisplayMessage";
import type { LibrarySnapshot } from "../../../types/audio";

const now = new Date().toISOString();

export const mockTvSessionSnapshot: TvSessionSnapshot = {
  player: {
    trackId: "mock-101",
    title: "Station Lights",
    artist: "Transit Ensemble",
    album: "Midnight Transit",
    artworkUrl: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=960&q=85",
    audioUrl: "",
    isPlaying: true,
    durationSeconds: 222,
    positionSeconds: 84,
    updatedAt: now,
  },
  lyrics: {
    trackId: "mock-101",
    mode: "synced",
    activeLineId: "line-3",
    lines: [
      { id: "line-1", text: "Station lights are passing slow", startSeconds: 66, endSeconds: 72 },
      { id: "line-2", text: "A signal hums below", startSeconds: 72, endSeconds: 78 },
      { id: "line-3", text: "We wait between the rails", startSeconds: 78, endSeconds: 86 },
      { id: "line-4", text: "Until the city glows", startSeconds: 86, endSeconds: 94 },
      { id: "line-5", text: "Footsteps fold into the rain", startSeconds: 94, endSeconds: 102 },
    ],
  },
  queue: {
    currentTrackId: "mock-101",
    items: [
      {
        trackId: "mock-101",
        title: "Station Lights",
        artist: "Transit Ensemble",
        album: "Midnight Transit",
        artworkUrl: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=320&q=80",
        isCurrent: true,
      },
      {
        trackId: "mock-102",
        title: "Last Train Home",
        artist: "Transit Ensemble",
        album: "Midnight Transit",
        isCurrent: false,
      },
      {
        trackId: "mock-201",
        title: "Soft Machines",
        artist: "Astra Field",
        album: "Room Tone",
        isCurrent: false,
      },
    ],
  },
  analysis: {
    trackId: "mock-101",
    frameIntervalMs: 50,
    frames: Array.from({ length: 120 }, (_, frameIndex) => ({
      timeMs: frameIndex * 50,
      bands: Array.from({ length: 32 }, (_, bandIndex) => {
        const wave = Math.sin(frameIndex * 0.18 + bandIndex * 0.42) * 0.5 + 0.5;
        const center = 1 - Math.abs(bandIndex / 31 - 0.5) * 0.75;
        return Math.max(0.08, Math.min(1, wave * center));
      }),
    })),
    isComplete: false,
  },
};

export const mockTvLibrarySnapshot: LibrarySnapshot = {
  albums: [],
  databasePath: "mock.sqlite3",
  lastScanPath: "/music",
  playlists: [
    {
      id: "playlist-road-set",
      name: "Road Set",
      filePath: "/music/.musical/playlist/road-set.mplaylist",
      artworkPath: null,
      missingTrackPaths: [],
      trackCount: 2,
      tracks: [
        {
          id: "station-lights",
          title: "Station Lights",
          artist: "Transit Ensemble",
          durationSeconds: 202,
          filePath: "/music/station-lights.mp3",
          hasLyrics: false,
          isFavorite: false,
          rating: null,
        },
        {
          id: "last-train-home",
          title: "Last Train Home",
          artist: "Transit Ensemble",
          durationSeconds: 191,
          filePath: "/music/last-train-home.mp3",
          hasLyrics: false,
          isFavorite: false,
          rating: null,
        },
      ],
    },
  ],
};
