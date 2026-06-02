import { type Album } from "../types/audio";

const scrollTestAlbums: Album[] = [
  {
    id: 4,
    title: "Scroll Signal Garden",
    artist: "Lumen Park",
    year: 2023,
    coverUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 401, title: "Green Relay", artist: "Lumen Park", durationLabel: "3:18", hasLyrics: false },
      { id: 402, title: "Blinking Vines", artist: "Lumen Park", durationLabel: "4:02", hasLyrics: false },
      { id: 403, title: "Gate Tone", artist: "Lumen Park", durationLabel: "2:44", hasLyrics: false },
    ],
  },
  {
    id: 5,
    title: "Scroll Harbor Static",
    artist: "Morrow Bay",
    year: 2022,
    coverUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 501, title: "Dock Numbers", artist: "Morrow Bay", durationLabel: "3:33", hasLyrics: false },
      { id: 502, title: "Salt Channel", artist: "Morrow Bay", durationLabel: "4:26", hasLyrics: false },
      { id: 503, title: "Foghorn Loop", artist: "Morrow Bay", durationLabel: "3:05", hasLyrics: false },
    ],
  },
  {
    id: 6,
    title: "Scroll Copper Arcade",
    artist: "Pixel Vale",
    year: 2021,
    coverUrl: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 601, title: "Insert Coin", artist: "Pixel Vale", durationLabel: "2:39", hasLyrics: false },
      { id: 602, title: "High Score Rain", artist: "Pixel Vale", durationLabel: "3:47", hasLyrics: false },
      { id: 603, title: "Cabinet Glow", artist: "Pixel Vale", durationLabel: "4:11", hasLyrics: false },
    ],
  },
  {
    id: 7,
    title: "Scroll Velvet Circuit",
    artist: "Nova Parcel",
    year: 2020,
    coverUrl: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 701, title: "Soft Switch", artist: "Nova Parcel", durationLabel: "3:29", hasLyrics: false },
      { id: 702, title: "Cable Bloom", artist: "Nova Parcel", durationLabel: "3:58", hasLyrics: false },
      { id: 703, title: "Low Voltage", artist: "Nova Parcel", durationLabel: "4:20", hasLyrics: false },
    ],
  },
  {
    id: 8,
    title: "Scroll Paper Observatory",
    artist: "Iris Vector",
    year: 2019,
    coverUrl: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 801, title: "Folded Lens", artist: "Iris Vector", durationLabel: "3:13", hasLyrics: false },
      { id: 802, title: "Star Index", artist: "Iris Vector", durationLabel: "4:41", hasLyrics: false },
      { id: 803, title: "Moon Ledger", artist: "Iris Vector", durationLabel: "2:52", hasLyrics: false },
    ],
  },
  {
    id: 9,
    title: "Scroll Silver Orchard",
    artist: "Juniper Shift",
    year: 2018,
    coverUrl: "https://images.unsplash.com/photo-1473773508845-188df298d2d1?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 901, title: "Branch Signal", artist: "Juniper Shift", durationLabel: "3:50", hasLyrics: false },
      { id: 902, title: "Cider Static", artist: "Juniper Shift", durationLabel: "4:04", hasLyrics: false },
      { id: 903, title: "Night Picking", artist: "Juniper Shift", durationLabel: "3:17", hasLyrics: false },
    ],
  },
  {
    id: 10,
    title: "Scroll Neon Breadcrumbs",
    artist: "Kite Assembly",
    year: 2017,
    coverUrl: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 1001, title: "Corner Map", artist: "Kite Assembly", durationLabel: "3:09", hasLyrics: false },
      { id: 1002, title: "Bright Trail", artist: "Kite Assembly", durationLabel: "4:33", hasLyrics: false },
      { id: 1003, title: "Return Pin", artist: "Kite Assembly", durationLabel: "2:59", hasLyrics: false },
    ],
  },
  {
    id: 11,
    title: "Scroll Analog Meadow",
    artist: "Reed Solstice",
    year: 2016,
    coverUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 1101, title: "Tape Grass", artist: "Reed Solstice", durationLabel: "3:24", hasLyrics: false },
      { id: 1102, title: "Field Monitor", artist: "Reed Solstice", durationLabel: "4:15", hasLyrics: false },
      { id: 1103, title: "Warm Buttons", artist: "Reed Solstice", durationLabel: "3:01", hasLyrics: false },
    ],
  },
  {
    id: 12,
    title: "Scroll Glass District",
    artist: "Metro Bloom",
    year: 2015,
    coverUrl: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 1201, title: "Atrium Steps", artist: "Metro Bloom", durationLabel: "3:45", hasLyrics: false },
      { id: 1202, title: "Window Grid", artist: "Metro Bloom", durationLabel: "4:19", hasLyrics: false },
      { id: 1203, title: "Blue Elevator", artist: "Metro Bloom", durationLabel: "2:48", hasLyrics: false },
    ],
  },
  {
    id: 13,
    title: "Scroll Distant Switchboard",
    artist: "Halo Desk",
    year: 2014,
    coverUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 1301, title: "Line Check", artist: "Halo Desk", durationLabel: "3:31", hasLyrics: false },
      { id: 1302, title: "Hold Music", artist: "Halo Desk", durationLabel: "4:07", hasLyrics: false },
      { id: 1303, title: "After Tone", artist: "Halo Desk", durationLabel: "3:22", hasLyrics: false },
    ],
  },
];

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
        hasLyrics: true,
        lyrics: "Station lights are passing slow\nA signal hums below\nWe wait between the rails\nUntil the city glows",
      },
      { id: 102, title: "Last Train Home", artist: "Circular Moonray", durationLabel: "4:08", hasLyrics: false, lyrics: null },
      { id: 103, title: "Blue Platform", artist: "Circular Moonray", durationLabel: "2:57", hasLyrics: false, lyrics: null },
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
      { id: 201, title: "Soft Machines", artist: "Astra Field", durationLabel: "3:21", hasLyrics: false },
      { id: 202, title: "Paper Sleeve", artist: "Astra Field", durationLabel: "3:54", hasLyrics: false },
      { id: 203, title: "Archive Dust", artist: "Astra Field", durationLabel: "4:31", hasLyrics: false },
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
      { id: 301, title: "First Snow", artist: "Mica Notes", durationLabel: "2:48", hasLyrics: false },
      { id: 302, title: "Glass Echo", artist: "Mica Notes", durationLabel: "5:12", hasLyrics: false },
      { id: 303, title: "Quiet Street", artist: "Mica Notes", durationLabel: "3:36", hasLyrics: false },
    ],
  },
  ...scrollTestAlbums,
];
