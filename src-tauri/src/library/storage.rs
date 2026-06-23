use crate::app_settings;
use jwalk::WalkDir;
use lofty::tag::Tag;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Manager};
use unicode_normalization::UnicodeNormalization;

use super::{
    to_error_string, ARTWORK_DIR_NAME, AUDIO_EXTENSIONS, DATABASE_NAME, MUSICAL_DIR_NAME,
    PLAYLIST_DIR_NAME, PLAYLIST_EXTENSION, SCHEMA_VERSION,
};

pub(super) fn count_albums(connection: &Connection) -> Result<usize, String> {
    connection
        .query_row("SELECT COUNT(*) FROM albums", [], |row| {
            row.get::<_, i64>(0)
        })
        .map(|count| count as usize)
        .map_err(to_error_string)
}

pub(super) fn app_database_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let settings = app_settings::load(app)?;
    let Some(last_library_path) = settings.last_library_path else {
        return Ok(None);
    };
    let root = PathBuf::from(last_library_path);
    Ok(root.is_dir().then(|| database_path_for_root(&root)))
}

pub(super) fn required_app_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    app_database_path(app)?.ok_or_else(|| "library.error.noLibraryScanned".to_owned())
}

pub(super) fn current_library_root(app: &AppHandle) -> Result<PathBuf, String> {
    let settings = app_settings::load(app)?;
    settings
        .last_library_path
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .ok_or_else(|| "library.error.noLibraryScanned".to_owned())
}

pub(super) fn musical_dir_for_root(root: &Path) -> PathBuf {
    root.join(MUSICAL_DIR_NAME)
}

pub(super) fn database_path_for_root(root: &Path) -> PathBuf {
    musical_dir_for_root(root).join(DATABASE_NAME)
}

#[cfg(windows)]
pub(super) fn normalize_windows_extended_path(path: PathBuf) -> PathBuf {
    let path_text = path.to_string_lossy();
    PathBuf::from(normalize_windows_extended_path_string(
        path_text.into_owned(),
    ))
}

#[cfg(not(windows))]
pub(super) fn normalize_windows_extended_path(path: PathBuf) -> PathBuf {
    path
}

#[cfg(windows)]
pub(super) fn normalize_windows_extended_path_string(path: String) -> String {
    if let Some(stripped) = path.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{stripped}");
    }
    if let Some(stripped) = path.strip_prefix(r"\\?\") {
        return stripped.to_owned();
    }
    path
}

#[cfg(not(windows))]
pub(super) fn normalize_windows_extended_path_string(path: String) -> String {
    path
}

pub(super) fn artwork_cache_dir_for_root(root: &Path) -> Result<PathBuf, String> {
    Ok(musical_dir_for_root(root).join(ARTWORK_DIR_NAME))
}

pub(super) fn playlist_dir_for_root(root: &Path) -> PathBuf {
    musical_dir_for_root(root).join(PLAYLIST_DIR_NAME)
}

pub(super) fn playlist_track_path(library_root: &Path, file_path: &str) -> String {
    let path = Path::new(file_path);
    path.strip_prefix(library_root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
        .trim_start_matches('/')
        .nfc()
        .collect()
}

pub(super) fn unique_playlist_id(name: &str, playlist_dir: &Path) -> String {
    let base = sanitize_playlist_file_stem(name);
    let mut candidate = base.clone();
    let mut suffix = 2usize;
    while playlist_dir
        .join(format!("{candidate}.{PLAYLIST_EXTENSION}"))
        .exists()
    {
        candidate = format!("{base}-{suffix}");
        suffix += 1;
    }
    candidate
}

pub(super) fn sanitize_playlist_file_stem(name: &str) -> String {
    let mut stem = name
        .trim()
        .nfc()
        .collect::<String>()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character.to_ascii_lowercase()
            } else if character.is_whitespace()
                || matches!(
                    character,
                    '.' | '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
                )
            {
                '-'
            } else {
                character
            }
        })
        .collect::<String>();
    while stem.contains("--") {
        stem = stem.replace("--", "-");
    }
    let stem = stem.trim_matches('-').to_owned();
    if stem.is_empty() {
        format!("playlist-{}", unix_timestamp_millis().unwrap_or(0))
    } else {
        stem
    }
}

#[cfg(windows)]
pub(super) fn hide_directory_best_effort(path: &Path) {
    use std::process::Command;
    let _ = Command::new("attrib").arg("+h").arg(path).status();
}

#[cfg(not(windows))]
pub(super) fn hide_directory_best_effort(_path: &Path) {}

pub(super) fn allow_asset_directory(app: &AppHandle, path: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(path, true)
        .map_err(to_error_string)
}

pub(super) fn open_database(database_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent).map_err(to_error_string)?;
    }
    let should_initialize = if database_path.exists() {
        if database_schema_is_current(database_path)? {
            false
        } else {
            fs::remove_file(database_path).map_err(to_error_string)?;
            true
        }
    } else {
        true
    };
    let connection = open_database_connection(database_path)?;
    if !should_initialize {
        return Ok(connection);
    }
    initialize_database(&connection, database_path)?;
    Ok(connection)
}

fn initialize_database(connection: &Connection, database_path: &Path) -> Result<(), String> {
    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS schema_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS library_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS albums (
                group_key TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                year INTEGER,
                year_label TEXT,
                genre TEXT,
                artwork_path TEXT
            );

            CREATE TABLE IF NOT EXISTS tracks (
                uuid TEXT PRIMARY KEY,
                album_group_key TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL,
                track_number INTEGER,
                disc_number INTEGER,
                file_path TEXT NOT NULL UNIQUE,
                file_mtime INTEGER NOT NULL DEFAULT 0,
                file_size INTEGER NOT NULL DEFAULT 0,
                file_md5 TEXT NOT NULL DEFAULT '',
                lyrics TEXT
            );

            CREATE TABLE IF NOT EXISTS track_user_state (
                track_uuid TEXT PRIMARY KEY,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                rating INTEGER CHECK (rating BETWEEN 1 AND 5 OR rating IS NULL),
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlists (
                uuid TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_uuid TEXT NOT NULL REFERENCES playlists(uuid) ON DELETE CASCADE,
                track_uuid TEXT NOT NULL,
                position INTEGER NOT NULL,
                added_at TEXT NOT NULL,
                PRIMARY KEY (playlist_uuid, track_uuid)
            );
            ",
        )
        .map_err(|error| {
            format!(
                "library.error.schemaCreate\t{}\t{error}",
                database_path.display()
            )
        })?;
    connection
        .execute(
            "INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [SCHEMA_VERSION],
        )
        .map_err(|error| {
            format!(
                "library.error.schemaVersionWrite\t{}\t{error}",
                database_path.display()
            )
        })?;
    Ok(())
}

pub(super) fn open_database_for_read(database_path: &Path) -> Result<Connection, String> {
    if database_path.exists() && database_schema_is_current(database_path)? {
        return open_database_read_connection(database_path);
    }
    open_database(database_path)
}

pub(super) fn open_database_read_connection(database_path: &Path) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_PRIVATE_CACHE,
    )
    .map_err(to_error_string)?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(to_error_string)?;
    Ok(connection)
}

pub(super) fn open_database_connection(database_path: &Path) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_PRIVATE_CACHE,
    )
    .map_err(to_error_string)?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(to_error_string)?;
    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            ",
        )
        .map_err(to_error_string)?;
    Ok(connection)
}

fn database_schema_is_current(database_path: &Path) -> Result<bool, String> {
    let connection = open_database_read_connection(database_path)?;
    let has_schema_meta = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(to_error_string)?
        > 0;
    if !has_schema_meta {
        return Ok(false);
    }
    let version = connection
        .query_row(
            "SELECT value FROM schema_meta WHERE key = 'schema_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_error_string)?;
    Ok(version.as_deref() == Some(SCHEMA_VERSION))
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

pub(super) fn find_audio_files(root: &Path) -> (Vec<PathBuf>, usize) {
    let mut audio_files = Vec::new();
    let mut skipped_entries = 0usize;
    let musical_dir = musical_dir_for_root(root);

    for entry_result in WalkDir::new(root).follow_links(true) {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => {
                skipped_entries += 1;
                continue;
            }
        };

        let path = entry.path();
        if path.starts_with(&musical_dir) {
            continue;
        }

        if entry.file_type().is_file() && is_supported_audio_file(&path) {
            audio_files.push(path);
        }
    }

    audio_files.sort_by_cached_key(|path| path.to_string_lossy().to_lowercase());
    (audio_files, skipped_entries)
}

pub(super) fn track_uuid(library_root: &Path, file_path: &Path) -> Result<String, String> {
    let relative = file_path
        .strip_prefix(library_root)
        .map_err(to_error_string)?
        .to_string_lossy()
        .replace('\\', "/");
    Ok(relative.trim_start_matches('/').nfc().collect())
}

pub(super) fn read_rating(tag: &Tag) -> Option<i64> {
    tag.ratings()
        .next()
        .map(|rating| rating.rating as i64)
        .filter(|rating| (1..=5).contains(rating))
}

pub(super) fn normalize_group_key(value: &str) -> String {
    value.trim().nfc().collect::<String>().to_lowercase()
}

pub(super) fn file_fingerprint(uuid: &str, file_mtime: i64, file_size: i64) -> String {
    format!("meta:{uuid}:{file_mtime}:{file_size}")
}

pub(super) fn unix_timestamp_millis() -> Result<i64, String> {
    Ok(UNIX_EPOCH.elapsed().map_err(to_error_string)?.as_millis() as i64)
}
