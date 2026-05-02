use lofty::{
    file::{AudioFile, TaggedFileExt},
    read_from_path,
    tag::Accessor,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

const DATABASE_NAME: &str = "musical.sqlite3";
const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "m4a", "mp4", "ogg", "opus", "wav", "aif", "aiff"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub albums: Vec<AlbumRecord>,
    pub last_scan_path: Option<String>,
    pub database_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumRecord {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub year: Option<i64>,
    pub artwork_path: Option<String>,
    pub tracks: Vec<TrackRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackRecord {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub duration_seconds: i64,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub scanned_files: usize,
    pub imported_tracks: usize,
    pub skipped_files: usize,
    pub albums: usize,
    pub library_path: String,
}

#[derive(Debug)]
struct PendingAlbum {
    title: String,
    artist: String,
    year: Option<i64>,
    tracks: Vec<PendingTrack>,
}

#[derive(Debug)]
struct PendingTrack {
    title: String,
    artist: String,
    duration_seconds: i64,
    track_number: Option<i64>,
    disc_number: Option<i64>,
    file_path: String,
}

pub fn load_snapshot(app: &AppHandle) -> Result<LibrarySnapshot, String> {
    let database_path = app_database_path(app)?;
    let connection = open_database(&database_path)?;
    read_snapshot(&connection, &database_path)
}

pub fn scan_folder(app: &AppHandle, folder_path: &str) -> Result<ScanSummary, String> {
    let canonical_root = fs::canonicalize(folder_path)
        .map_err(|error| format!("Could not open folder `{folder_path}`: {error}"))?;

    if !canonical_root.is_dir() {
        return Err(format!("`{}` is not a folder.", canonical_root.display()));
    }

    let database_path = app_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    let mut pending_albums: HashMap<String, PendingAlbum> = HashMap::new();
    let mut scanned_files = 0usize;
    let mut imported_tracks = 0usize;
    let mut skipped_files = 0usize;

    for entry in WalkDir::new(&canonical_root)
        .follow_links(true)
        .into_iter()
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if !entry.file_type().is_file() || !is_supported_audio_file(path) {
            continue;
        }

        scanned_files += 1;

        let tagged_file = match read_from_path(path) {
            Ok(file) => file,
            Err(_) => {
                skipped_files += 1;
                continue;
            }
        };

        let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
        let file_stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Unknown Track")
            .to_owned();
        let folder_name = path
            .parent()
            .and_then(Path::file_name)
            .and_then(|value| value.to_str())
            .unwrap_or("Unknown Album")
            .to_owned();

        let title = tag
            .and_then(|value| value.title().map(|text| text.into_owned()))
            .unwrap_or(file_stem);
        let artist = tag
            .and_then(|value| value.artist().map(|text| text.into_owned()))
            .unwrap_or_else(|| "Unknown Artist".to_owned());
        let album_title = tag
            .and_then(|value| value.album().map(|text| text.into_owned()))
            .unwrap_or(folder_name);
        let year = tag
            .and_then(|value| value.date())
            .map(|timestamp| i64::from(timestamp.year));
        let track_number = tag.and_then(|value| value.track()).map(i64::from);
        let disc_number = tag.and_then(|value| value.disk()).map(i64::from);
        let duration_seconds = tagged_file.properties().duration().as_secs() as i64;
        let file_path = path.to_string_lossy().into_owned();

        let album_key = format!(
            "{}::{}::{}",
            album_title.to_lowercase(),
            artist.to_lowercase(),
            year.unwrap_or_default()
        );

        let pending_album = pending_albums
            .entry(album_key)
            .or_insert_with(|| PendingAlbum {
                title: album_title.clone(),
                artist: artist.clone(),
                year,
                tracks: Vec::new(),
            });

        pending_album.tracks.push(PendingTrack {
            title,
            artist,
            duration_seconds,
            track_number,
            disc_number,
            file_path,
        });
        imported_tracks += 1;
    }

    write_library(
        &mut connection,
        &canonical_root,
        pending_albums.into_values().collect(),
    )?;

    Ok(ScanSummary {
        scanned_files,
        imported_tracks,
        skipped_files,
        albums: count_albums(&connection)?,
        library_path: canonical_root.to_string_lossy().into_owned(),
    })
}

fn read_snapshot(connection: &Connection, database_path: &Path) -> Result<LibrarySnapshot, String> {
    let last_scan_path = connection
        .query_row(
            "SELECT value FROM library_settings WHERE key = 'last_scan_path'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_error_string)?;

    let mut album_statement = connection
        .prepare(
            "SELECT id, title, artist, year, artwork_path
             FROM albums
             ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE, year",
        )
        .map_err(to_error_string)?;

    let albums = album_statement
        .query_map([], |row| {
            Ok(AlbumRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                year: row.get(3)?,
                artwork_path: row.get(4)?,
                tracks: Vec::new(),
            })
        })
        .map_err(to_error_string)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error_string)?;

    let mut hydrated_albums = Vec::with_capacity(albums.len());
    for mut album in albums {
        album.tracks = load_tracks(connection, album.id)?;
        hydrated_albums.push(album);
    }

    Ok(LibrarySnapshot {
        albums: hydrated_albums,
        last_scan_path,
        database_path: database_path.to_string_lossy().into_owned(),
    })
}

fn load_tracks(connection: &Connection, album_id: i64) -> Result<Vec<TrackRecord>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, title, artist, duration_seconds, track_number, disc_number, file_path
             FROM tracks
             WHERE album_id = ?1
             ORDER BY COALESCE(disc_number, 0), COALESCE(track_number, 0), title COLLATE NOCASE",
        )
        .map_err(to_error_string)?;

    let rows = statement
        .query_map([album_id], |row| {
            Ok(TrackRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                duration_seconds: row.get(3)?,
                track_number: row.get(4)?,
                disc_number: row.get(5)?,
                file_path: row.get(6)?,
            })
        })
        .map_err(to_error_string)?;

    rows.collect::<Result<Vec<_>, _>>().map_err(to_error_string)
}

fn write_library(
    connection: &mut Connection,
    canonical_root: &Path,
    mut albums: Vec<PendingAlbum>,
) -> Result<(), String> {
    albums.sort_by(|left, right| {
        (&left.artist, &left.title, left.year.unwrap_or_default()).cmp(&(
            &right.artist,
            &right.title,
            right.year.unwrap_or_default(),
        ))
    });

    let root_string = canonical_root.to_string_lossy().into_owned();
    let transaction = connection.transaction().map_err(to_error_string)?;
    transaction
        .execute_batch(
            "
            DELETE FROM tracks;
            DELETE FROM albums;
            DELETE FROM library_settings;
            ",
        )
        .map_err(to_error_string)?;

    transaction
        .execute(
            "INSERT INTO library_settings (key, value) VALUES ('last_scan_path', ?1)",
            [root_string.as_str()],
        )
        .map_err(to_error_string)?;

    for album in albums {
        let album_key = format!(
            "{}::{}::{}::{}",
            root_string,
            album.title.to_lowercase(),
            album.artist.to_lowercase(),
            album.year.unwrap_or_default()
        );

        transaction
            .execute(
                "INSERT INTO albums (title, artist, year, artwork_path, source_root, album_key)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    album.title,
                    album.artist,
                    album.year,
                    Option::<String>::None,
                    root_string,
                    album_key
                ],
            )
            .map_err(to_error_string)?;
        let album_id = transaction.last_insert_rowid();

        let mut tracks = album.tracks;
        tracks.sort_by(|left, right| {
            (
                left.disc_number.unwrap_or_default(),
                left.track_number.unwrap_or_default(),
                &left.title,
            )
                .cmp(&(
                    right.disc_number.unwrap_or_default(),
                    right.track_number.unwrap_or_default(),
                    &right.title,
                ))
        });

        for track in tracks {
            transaction
                .execute(
                    "INSERT INTO tracks (
                        album_id,
                        title,
                        artist,
                        duration_seconds,
                        track_number,
                        disc_number,
                        file_path
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        album_id,
                        track.title,
                        track.artist,
                        track.duration_seconds,
                        track.track_number,
                        track.disc_number,
                        track.file_path
                    ],
                )
                .map_err(to_error_string)?;
        }
    }

    transaction.commit().map_err(to_error_string)
}

fn count_albums(connection: &Connection) -> Result<usize, String> {
    connection
        .query_row("SELECT COUNT(*) FROM albums", [], |row| row.get::<_, i64>(0))
        .map(|count| count as usize)
        .map_err(to_error_string)
}

fn app_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(to_error_string)?;
    fs::create_dir_all(&app_data_dir).map_err(to_error_string)?;
    Ok(app_data_dir.join(DATABASE_NAME))
}

fn open_database(database_path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(database_path).map_err(to_error_string)?;
    connection
        .execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS library_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS albums (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                year INTEGER,
                artwork_path TEXT,
                source_root TEXT NOT NULL,
                album_key TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL,
                track_number INTEGER,
                disc_number INTEGER,
                file_path TEXT NOT NULL UNIQUE
            );
            ",
        )
        .map_err(to_error_string)?;
    Ok(connection)
}

fn is_supported_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            let extension = value.to_ascii_lowercase();
            AUDIO_EXTENSIONS.iter().any(|allowed| *allowed == extension)
        })
        .unwrap_or(false)
}

fn to_error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}
