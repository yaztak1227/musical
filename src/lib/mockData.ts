import { type Album } from "../types/audio";

export const mockAlbums: Album[] = [
  {
    id: 1,
    title: "Midnight Transit",
    artist: "Circular Moonray",
    year: 2026,
    coverUrl:
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=640&q=80",
    tracks: [
      {
        id: 101,
        title: "Station Lights",
        artist: "Circular Moonray",
        durationLabel: "3:42",
        lyrics: "Station lights are passing slow\nA signal hums below\nWe wait between the rails\nUntil the city glows",
      },
      { id: 102, title: "Last Train Home", artist: "Circular Moonray", durationLabel: "4:08", lyrics: null },
      { id: 103, title: "Blue Platform", artist: "Circular Moonray", durationLabel: "2:57", lyrics: null },
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
