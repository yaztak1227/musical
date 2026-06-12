import type { TvSessionSnapshot } from "../domain/tvDisplayMessage";

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
};
