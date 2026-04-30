import { useMemo, useState } from "react";
import "./App.css";

type Track = {
  id: number;
  title: string;
  artist: string;
  duration: string;
};

type Album = {
  id: number;
  title: string;
  artist: string;
  year: number;
  coverUrl: string;
  tracks: Track[];
};

const albums: Album[] = [
  {
    id: 1,
    title: "Midnight Transit",
    artist: "Circular Moonray",
    year: 2026,
    coverUrl:
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 101, title: "Station Lights", artist: "Circular Moonray", duration: "3:42" },
      { id: 102, title: "Last Train Home", artist: "Circular Moonray", duration: "4:08" },
      { id: 103, title: "Blue Platform", artist: "Circular Moonray", duration: "2:57" },
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
      { id: 201, title: "Soft Machines", artist: "Astra Field", duration: "3:21" },
      { id: 202, title: "Paper Sleeve", artist: "Astra Field", duration: "3:54" },
      { id: 203, title: "Archive Dust", artist: "Astra Field", duration: "4:31" },
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
      { id: 301, title: "First Snow", artist: "Mica Notes", duration: "2:48" },
      { id: 302, title: "Glass Echo", artist: "Mica Notes", duration: "5:12" },
      { id: 303, title: "Quiet Street", artist: "Mica Notes", duration: "3:36" },
    ],
  },
];

function App() {
  const [query, setQuery] = useState("");
  const [selectedAlbumId, setSelectedAlbumId] = useState(albums[0].id);
  const [currentTrack, setCurrentTrack] = useState<Track>(albums[0].tracks[0]);
  const [isPlaying, setIsPlaying] = useState(false);

  const filteredAlbums = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return albums;

    return albums.filter((album) => {
      const searchable = [album.title, album.artist, String(album.year)].join(" ").toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [query]);

  const selectedAlbum =
    albums.find((album) => album.id === selectedAlbumId) ?? filteredAlbums[0] ?? albums[0];

  function selectAlbum(album: Album) {
    setSelectedAlbumId(album.id);
    setCurrentTrack(album.tracks[0]);
    setIsPlaying(false);
  }

  function playTrack(track: Track) {
    setCurrentTrack(track);
    setIsPlaying(true);
  }

  return (
    <main className="app-shell">
      <section className="library-panel" aria-label="Album library">
        <div className="section-heading">
          <p className="eyebrow">Musical</p>
          <h1>Library</h1>
        </div>

        <label className="search-field">
          <span>Search albums</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Album, artist, year"
            type="search"
          />
        </label>

        <div className="album-grid">
          {filteredAlbums.map((album) => (
            <button
              className={album.id === selectedAlbum.id ? "album-card active" : "album-card"}
              key={album.id}
              onClick={() => selectAlbum(album)}
              type="button"
            >
              <img alt={`${album.title} cover`} src={album.coverUrl} />
              <span>{album.title}</span>
              <small>
                {album.artist} / {album.year}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section className="album-panel" aria-label="Selected album">
        <img className="album-art" alt={`${selectedAlbum.title} artwork`} src={selectedAlbum.coverUrl} />
        <div className="album-detail">
          <p className="eyebrow">{selectedAlbum.year}</p>
          <h2>{selectedAlbum.title}</h2>
          <p>{selectedAlbum.artist}</p>
        </div>

        <ol className="track-list">
          {selectedAlbum.tracks.map((track) => (
            <li key={track.id}>
              <button onClick={() => playTrack(track)} type="button">
                <span>{track.title}</span>
                <small>{track.duration}</small>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="player-bar" aria-label="Player">
        <div>
          <p className="eyebrow">Now playing</p>
          <strong>{currentTrack.title}</strong>
          <span>{currentTrack.artist}</span>
        </div>
        <button className="play-button" onClick={() => setIsPlaying((value) => !value)} type="button">
          {isPlaying ? "Pause" : "Play"}
        </button>
      </section>
    </main>
  );
}

export default App;
