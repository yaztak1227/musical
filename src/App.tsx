import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import "./App.css";

type Track = {
  id: number;
  title: string;
  artist: string;
  durationSeconds?: number;
  durationLabel?: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  filePath?: string;
};

type Album = {
  id: number;
  title: string;
  artist: string;
  year: number | null;
  artworkPath?: string | null;
  coverUrl?: string;
  tracks: Track[];
};

type LibrarySnapshot = {
  albums: Album[];
  lastScanPath: string | null;
  databasePath: string;
};

type ScanSummary = {
  scannedFiles: number;
  importedTracks: number;
  skippedFiles: number;
  albums: number;
  libraryPath: string;
};

const mockAlbums: Album[] = [
  {
    id: 1,
    title: "Midnight Transit",
    artist: "Circular Moonray",
    year: 2026,
    coverUrl:
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=640&q=80",
    tracks: [
      { id: 101, title: "Station Lights", artist: "Circular Moonray", durationLabel: "3:42" },
      { id: 102, title: "Last Train Home", artist: "Circular Moonray", durationLabel: "4:08" },
      { id: 103, title: "Blue Platform", artist: "Circular Moonray", durationLabel: "2:57" },
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

const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function App() {
  const [query, setQuery] = useState("");
  const [libraryPath, setLibraryPath] = useState("");
  const [libraryInfo, setLibraryInfo] = useState<string | null>(
    isTauriRuntime ? "No library scanned yet." : "Web mode is using mock albums.",
  );
  const [albums, setAlbums] = useState<Album[]>(isTauriRuntime ? [] : mockAlbums);
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(
    isTauriRuntime ? null : mockAlbums[0]?.id ?? null,
  );
  const [currentTrack, setCurrentTrack] = useState<Track | null>(isTauriRuntime ? null : mockAlbums[0]?.tracks[0] ?? null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime) return;
    void refreshLibrary();
  }, []);

  useEffect(() => {
    if (albums.length === 0) {
      setSelectedAlbumId(null);
      setCurrentTrack(null);
      setIsPlaying(false);
      return;
    }

    const selectedAlbum = albums.find((album) => album.id === selectedAlbumId) ?? albums[0];
    if (selectedAlbum.id !== selectedAlbumId) {
      setSelectedAlbumId(selectedAlbum.id);
    }

    const nextTrack =
      currentTrack && selectedAlbum.tracks.some((track) => track.id === currentTrack.id)
        ? currentTrack
        : selectedAlbum.tracks[0] ?? null;
    setCurrentTrack(nextTrack);
  }, [albums, selectedAlbumId, currentTrack]);

  const filteredAlbums = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return albums;

    return albums.filter((album) => {
      const searchable = [album.title, album.artist, String(album.year ?? "")].join(" ").toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [albums, query]);

  const selectedAlbum =
    albums.find((album) => album.id === selectedAlbumId) ?? filteredAlbums[0] ?? albums[0] ?? null;

  async function refreshLibrary() {
    try {
      const snapshot = await invoke<LibrarySnapshot>("library_snapshot");
      setAlbums(snapshot.albums);
      setLibraryPath(snapshot.lastScanPath ?? "");
      setSelectedAlbumId(snapshot.albums[0]?.id ?? null);
      setCurrentTrack(snapshot.albums[0]?.tracks[0] ?? null);
      setLibraryInfo(
        snapshot.albums.length > 0
          ? `${snapshot.albums.length} albums loaded from ${snapshot.databasePath}`
          : `No albums indexed yet. Database: ${snapshot.databasePath}`,
      );
    } catch (error) {
      setLibraryInfo(String(error));
    }
  }

  async function handleScan() {
    if (!isTauriRuntime) {
      setLibraryInfo("Folder scanning runs in the Tauri desktop app.");
      return;
    }

    const normalizedPath = libraryPath.trim();
    if (!normalizedPath) {
      setLibraryInfo("Enter a local music folder path first.");
      return;
    }

    try {
      setIsScanning(true);
      const summary = await invoke<ScanSummary>("scan_music_folder", {
        folder_path: normalizedPath,
      });
      await refreshLibrary();
      setLibraryInfo(
        `${summary.albums} albums / ${summary.importedTracks} tracks imported from ${summary.libraryPath}`,
      );
    } catch (error) {
      setLibraryInfo(String(error));
    } finally {
      setIsScanning(false);
    }
  }

  function selectAlbum(album: Album) {
    setSelectedAlbumId(album.id);
    setCurrentTrack(album.tracks[0] ?? null);
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
          <p className="section-copy">Scan a local folder, read tags in Rust, and build the album database.</p>
        </div>

        <div className="scan-panel">
          <label className="search-field">
            <span>Music folder</span>
            <input
              onChange={(event) => setLibraryPath(event.currentTarget.value)}
              placeholder="/Users/takumi/Music"
              type="text"
              value={libraryPath}
            />
          </label>

          <div className="scan-actions">
            <button className="scan-button" disabled={isScanning} onClick={() => void handleScan()} type="button">
              {isScanning ? "Scanning..." : "Scan library"}
            </button>
            {libraryInfo ? <p className="info-text">{libraryInfo}</p> : null}
          </div>
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
          {filteredAlbums.length === 0 ? (
            <div className="empty-state">No albums match that search yet.</div>
          ) : (
            filteredAlbums.map((album) => (
              <button
                className={album.id === selectedAlbum?.id ? "album-card active" : "album-card"}
                key={album.id}
                onClick={() => selectAlbum(album)}
                type="button"
              >
                {album.coverUrl || album.artworkPath ? (
                  <img alt={`${album.title} cover`} src={album.coverUrl ?? album.artworkPath ?? ""} />
                ) : (
                  <div className="album-placeholder" aria-hidden="true">
                    {album.title.charAt(0).toUpperCase()}
                  </div>
                )}
                <span>{album.title}</span>
                <small>
                  {album.artist}
                  {album.year ? ` / ${album.year}` : ""}
                </small>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="album-panel" aria-label="Selected album">
        {selectedAlbum ? (
          <>
            {selectedAlbum.coverUrl || selectedAlbum.artworkPath ? (
              <img
                className="album-art"
                alt={`${selectedAlbum.title} artwork`}
                src={selectedAlbum.coverUrl ?? selectedAlbum.artworkPath ?? ""}
              />
            ) : (
              <div className="album-art placeholder-art" aria-hidden="true">
                {selectedAlbum.title.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="album-detail">
              <p className="eyebrow">{selectedAlbum.year ?? "Library"}</p>
              <h2>{selectedAlbum.title}</h2>
              <p>{selectedAlbum.artist}</p>
            </div>

            <ol className="track-list">
              {selectedAlbum.tracks.map((track) => (
                <li key={track.id}>
                  <button onClick={() => playTrack(track)} type="button">
                    <span>
                      {track.trackNumber ? `${track.trackNumber}. ` : ""}
                      {track.title}
                    </span>
                    <small>{formatTrackDuration(track)}</small>
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="empty-detail">
            <h2>Scan a folder to start</h2>
            <p>Once the desktop app indexes a music folder, albums and tracks will appear here.</p>
          </div>
        )}
      </section>

      <section className="player-bar" aria-label="Player">
        <div>
          <p className="eyebrow">Now playing</p>
          <strong>{currentTrack?.title ?? "Nothing selected"}</strong>
          <span>{currentTrack?.artist ?? "Pick an album or scan a folder."}</span>
        </div>
        <button
          className="play-button"
          disabled={!currentTrack}
          onClick={() => setIsPlaying((value) => !value)}
          type="button"
        >
          {currentTrack ? (isPlaying ? "Pause" : "Play") : "Idle"}
        </button>
      </section>
    </main>
  );
}

function formatTrackDuration(track: Track) {
  if (track.durationLabel) return track.durationLabel;
  if (typeof track.durationSeconds === "number") return formatSeconds(track.durationSeconds);
  return "--:--";
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default App;
