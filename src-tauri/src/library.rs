use encoding_rs::{SHIFT_JIS, UTF_8, WINDOWS_1252};
use jwalk::WalkDir;
use lofty::{
    config::WriteOptions,
    file::{AudioFile, TaggedFileExt},
    picture::{MimeType, Picture, PictureType},
    read_from_path,
    tag::{items::Timestamp, Accessor, ItemKey, Tag},
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeSet, HashMap},
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const DATABASE_NAME: &str = "musical.sqlite3";
const ARTWORK_DIR_NAME: &str = "artwork";
const AUDIO_EXTENSIONS: &[&str] = &[
    "aac", "aif", "aiff", "alac", "ape", "flac", "m4a", "m4b", "mka", "mp3", "mp4", "oga", "ogg",
    "opus", "wav", "wma",
];
const OTHER_ALBUM_TITLE: &str = "Other Album";
const VARIOUS_ARTISTS: &str = "Various Artists";

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
    pub year_label: Option<String>,
    pub genre: Option<String>,
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
    pub has_lyrics: bool,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumTagUpdateRequest {
    pub album_id: i64,
    pub album_title: String,
    pub album_artist: String,
    pub artist: String,
    pub year: Option<i64>,
    pub genre: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackTagUpdateRequest {
    pub track_id: i64,
    pub title: String,
    pub artist: String,
    pub album_title: String,
    pub year: Option<i64>,
    pub genre: String,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackArtworkUpdateRequest {
    pub track_id: i64,
    pub artwork_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumTagUpdateResult {
    pub album_id: i64,
    pub updated_files: usize,
    pub failed_files: Vec<TagWriteFailure>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackTagUpdateResult {
    pub track_id: i64,
    pub album_id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackArtworkUpdateResult {
    pub track_id: i64,
    pub album_id: i64,
    pub artwork_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagWriteFailure {
    pub file_path: String,
    pub reason: String,
}

#[derive(Debug)]
struct PendingAlbum {
    title: String,
    artist: String,
    artists: BTreeSet<String>,
    year: Option<i64>,
    years: BTreeSet<i64>,
    genre: Option<String>,
    artwork_path: Option<String>,
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
    lyrics: Option<String>,
}

#[derive(Debug)]
struct ExistingTrack {
    id: i64,
    album_id: i64,
    file_path: String,
}

#[derive(Debug)]
struct ExistingAlbum {
    id: i64,
    artist: String,
    source_root: String,
}

pub fn load_snapshot(app: &AppHandle) -> Result<LibrarySnapshot, String> {
    let database_path = app_database_path(app)?;
    let connection = open_database(&database_path)?;
    let snapshot = read_snapshot(&connection, &database_path)?;

    if let Some(last_scan_path) = &snapshot.last_scan_path {
        let path = Path::new(last_scan_path);
        if path.is_dir() {
            allow_asset_directory(app, path)?;
        }
    }
    let artwork_dir = artwork_cache_dir(app)?;
    if artwork_dir.is_dir() {
        allow_asset_directory(app, &artwork_dir)?;
    }

    Ok(snapshot)
}

pub fn load_track_lyrics(app: &AppHandle, track_id: i64) -> Result<Option<String>, String> {
    let database_path = app_database_path(app)?;
    let connection = open_database(&database_path)?;

    connection
        .query_row("SELECT lyrics FROM tracks WHERE id = ?1", [track_id], |row| {
            row.get::<_, Option<String>>(0)
        })
        .optional()
        .map_err(to_error_string)?
        .ok_or_else(|| format!("library.error.trackNotFound\t{track_id}"))
}

pub fn scan_folder(app: &AppHandle, folder_path: &str) -> Result<ScanSummary, String> {
    let canonical_root = fs::canonicalize(folder_path)
        .map_err(|error| format!("library.error.folderOpen\t{folder_path}\t{error}"))?;

    if !canonical_root.is_dir() {
        return Err(format!(
            "library.error.notFolder\t{}",
            canonical_root.display()
        ));
    }

    allow_asset_directory(app, &canonical_root)?;
    let artwork_dir = artwork_cache_dir(app)?;
    if artwork_dir.exists() {
        fs::remove_dir_all(&artwork_dir).map_err(to_error_string)?;
    }
    fs::create_dir_all(&artwork_dir).map_err(to_error_string)?;
    allow_asset_directory(app, &artwork_dir)?;

    let database_path = app_database_path(app)?;
    let mut connection = open_database(&database_path)?;

    let mut pending_albums: HashMap<String, PendingAlbum> = HashMap::new();
    let mut imported_tracks = 0usize;
    let mut skipped_files = 0usize;
    let (audio_files, discovery_errors) = find_audio_files(&canonical_root);
    skipped_files += discovery_errors;

    for path in &audio_files {
        let tagged_file = match read_from_path(path) {
            Ok(file) => file,
            Err(_) => {
                skipped_files += 1;
                continue;
            }
        };

        let tag = tagged_file
            .primary_tag()
            .or_else(|| tagged_file.first_tag());
        let file_stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Unknown Track")
            .to_owned();
        let title = tag
            .and_then(|value| clean_tag_text(value.title()))
            .unwrap_or(file_stem);
        let artist = tag
            .and_then(|value| clean_tag_text(value.artist()))
            .unwrap_or_else(|| "Unknown Artist".to_owned());
        let album_from_tag = tag.and_then(|value| clean_tag_text(value.album()));
        let is_other_album = album_from_tag.is_none();
        let album_title = album_from_tag.unwrap_or_else(|| OTHER_ALBUM_TITLE.to_owned());
        let year = tag
            .and_then(|value| value.date())
            .map(|timestamp| i64::from(timestamp.year));
        let genre = tag.and_then(|value| clean_tag_text(value.genre()));
        let lyrics = read_lyrics(&tagged_file);
        let track_number = tag.and_then(|value| value.track()).map(i64::from);
        let disc_number = tag.and_then(|value| value.disk()).map(i64::from);
        let duration_seconds = tagged_file.properties().duration().as_secs() as i64;
        let file_path = path.to_string_lossy().into_owned();

        let album_key = album_title.to_lowercase();
        let artwork_path = extract_album_artwork(&tagged_file, &artwork_dir, &album_key);

        let pending_album = pending_albums
            .entry(album_key)
            .or_insert_with(|| PendingAlbum {
                title: album_title.clone(),
                artist: if is_other_album {
                    VARIOUS_ARTISTS.to_owned()
                } else {
                    artist.clone()
                },
                artists: BTreeSet::new(),
                year: if is_other_album { None } else { year },
                years: BTreeSet::new(),
                genre: genre.clone(),
                artwork_path: None,
                tracks: Vec::new(),
            });
        if !is_other_album {
            pending_album.artists.insert(artist.clone());
            pending_album.artist = display_album_artist(&pending_album.artists);
            if let Some(year) = year {
                pending_album.years.insert(year);
                pending_album.year = pending_album.years.iter().next_back().copied();
            }
        }
        if pending_album.artwork_path.is_none() {
            pending_album.artwork_path = artwork_path;
        }
        if pending_album.genre.is_none() {
            pending_album.genre = genre;
        }

        pending_album.tracks.push(PendingTrack {
            title,
            artist,
            duration_seconds,
            track_number,
            disc_number,
            file_path,
            lyrics,
        });
        imported_tracks += 1;
    }

    write_library(
        &mut connection,
        &canonical_root,
        pending_albums.into_values().collect(),
    )?;

    Ok(ScanSummary {
        scanned_files: audio_files.len(),
        imported_tracks,
        skipped_files,
        albums: count_albums(&connection)?,
        library_path: canonical_root.to_string_lossy().into_owned(),
    })
}

pub fn update_album_tags(
    app: &AppHandle,
    request: AlbumTagUpdateRequest,
) -> Result<AlbumTagUpdateResult, String> {
    let album_title = request.album_title.trim();
    if album_title.is_empty() {
        return Err("library.error.emptyAlbumTitle".to_owned());
    }

    let album_artist = request.album_artist.trim();
    let artist = request.artist.trim();
    let genre = request.genre.trim();
    let database_path = app_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    let existing_album = load_album_for_update(&connection, request.album_id)?;
    let track_paths = load_track_paths(&connection, request.album_id)?;

    if track_paths.is_empty() {
        return Err(format!(
            "library.error.albumHasNoTracks\t{}",
            request.album_id
        ));
    }

    let mut updated_paths = Vec::new();
    let mut failed_files = Vec::new();
    for file_path in track_paths {
        match write_album_tags_to_file(
            &file_path,
            album_title,
            album_artist,
            artist,
            request.year,
            genre,
        ) {
            Ok(()) => updated_paths.push(file_path),
            Err(reason) => failed_files.push(TagWriteFailure { file_path, reason }),
        }
    }

    let updated_album_id = if !updated_paths.is_empty() {
        persist_album_tag_update(
            &mut connection,
            &existing_album,
            &updated_paths,
            album_title,
            album_artist,
            artist,
            request.year,
            genre,
        )?
    } else {
        request.album_id
    };

    Ok(AlbumTagUpdateResult {
        album_id: updated_album_id,
        updated_files: updated_paths.len(),
        failed_files,
    })
}

pub fn update_track_tags(
    app: &AppHandle,
    request: TrackTagUpdateRequest,
) -> Result<TrackTagUpdateResult, String> {
    let title = request.title.trim();
    if title.is_empty() {
        return Err("library.error.emptyTrackTitle".to_owned());
    }

    let album_title = request.album_title.trim();
    if album_title.is_empty() {
        return Err("library.error.emptyAlbumTitle".to_owned());
    }

    let artist = request.artist.trim();
    let genre = request.genre.trim();
    let database_path = app_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    let existing_track = load_track_for_update(&connection, request.track_id)?;

    write_track_tags_to_file(
        &existing_track.file_path,
        title,
        artist,
        album_title,
        request.year,
        genre,
        request.track_number,
        request.disc_number,
    )?;

    persist_track_tag_update(
        &mut connection,
        &existing_track,
        &request,
        title,
        artist,
        album_title,
        genre,
    )?;

    Ok(TrackTagUpdateResult {
        track_id: existing_track.id,
        album_id: existing_track.album_id,
    })
}

pub fn update_track_artwork(
    app: &AppHandle,
    request: TrackArtworkUpdateRequest,
) -> Result<TrackArtworkUpdateResult, String> {
    let artwork_source_path = request.artwork_path.trim();
    if artwork_source_path.is_empty() {
        return Err("library.error.emptyArtworkPath".to_owned());
    }

    let database_path = app_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    let existing_track = load_track_for_update(&connection, request.track_id)?;
    let artwork_bytes = fs::read(artwork_source_path).map_err(to_error_string)?;
    let picture = make_front_cover_picture(artwork_bytes.clone())?;

    write_track_artwork_to_file(&existing_track.file_path, picture)?;

    let artwork_dir = artwork_cache_dir(app)?;
    fs::create_dir_all(&artwork_dir).map_err(to_error_string)?;
    allow_asset_directory(app, &artwork_dir)?;
    let cached_artwork_path = write_artwork_bytes(
        &artwork_bytes,
        &artwork_dir,
        &format!("album-{}-{}", existing_track.album_id, stable_hash(artwork_source_path)),
    )?;

    persist_track_artwork_update(&mut connection, existing_track.album_id, &cached_artwork_path)?;

    Ok(TrackArtworkUpdateResult {
        track_id: existing_track.id,
        album_id: existing_track.album_id,
        artwork_path: cached_artwork_path,
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
            "SELECT id, title, artist, year, year_label, genre, artwork_path
             FROM albums
             ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE, year",
        )
        .map_err(to_error_string)?;

    let albums = album_statement
        .query_map([], |row| {
            Ok(AlbumRecord {
                id: row.get(0)?,
                title: repair_mojibake(&row.get::<_, String>(1)?),
                artist: repair_mojibake(&row.get::<_, String>(2)?),
                year: row.get(3)?,
                year_label: row.get(4)?,
                genre: row.get(5)?,
                artwork_path: row.get(6)?,
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
            "SELECT id, title, artist, duration_seconds, track_number, disc_number, file_path, lyrics IS NOT NULL AND TRIM(lyrics) != ''
             FROM tracks
             WHERE album_id = ?1
             ORDER BY COALESCE(disc_number, 0), COALESCE(track_number, 0), title COLLATE NOCASE",
        )
        .map_err(to_error_string)?;

    let rows = statement
        .query_map([album_id], |row| {
            Ok(TrackRecord {
                id: row.get(0)?,
                title: repair_mojibake(&row.get::<_, String>(1)?),
                artist: repair_mojibake(&row.get::<_, String>(2)?),
                duration_seconds: row.get(3)?,
                track_number: row.get(4)?,
                disc_number: row.get(5)?,
                file_path: row.get(6)?,
                has_lyrics: row.get(7)?,
            })
        })
        .map_err(to_error_string)?;

    rows.collect::<Result<Vec<_>, _>>().map_err(to_error_string)
}

fn load_album_for_update(connection: &Connection, album_id: i64) -> Result<ExistingAlbum, String> {
    connection
        .query_row(
            "SELECT id, artist, source_root FROM albums WHERE id = ?1",
            [album_id],
            |row| {
                Ok(ExistingAlbum {
                    id: row.get(0)?,
                    artist: row.get(1)?,
                    source_root: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(to_error_string)?
        .ok_or_else(|| format!("library.error.albumNotFound\t{album_id}"))
}

fn load_track_paths(connection: &Connection, album_id: i64) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare("SELECT file_path FROM tracks WHERE album_id = ?1 ORDER BY id")
        .map_err(to_error_string)?;
    let rows = statement
        .query_map([album_id], |row| row.get::<_, String>(0))
        .map_err(to_error_string)?;

    rows.collect::<Result<Vec<_>, _>>().map_err(to_error_string)
}

fn load_track_for_update(connection: &Connection, track_id: i64) -> Result<ExistingTrack, String> {
    connection
        .query_row(
            "SELECT id, album_id, file_path FROM tracks WHERE id = ?1",
            [track_id],
            |row| {
                Ok(ExistingTrack {
                    id: row.get(0)?,
                    album_id: row.get(1)?,
                    file_path: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(to_error_string)?
        .ok_or_else(|| format!("library.error.trackNotFound\t{track_id}"))
}

fn write_album_tags_to_file(
    file_path: &str,
    album_title: &str,
    album_artist: &str,
    artist: &str,
    year: Option<i64>,
    genre: &str,
) -> Result<(), String> {
    let path = Path::new(file_path);
    let mut tagged_file = read_from_path(path).map_err(to_error_string)?;
    let tag_type = tagged_file.primary_tag_type();

    if tagged_file.primary_tag_mut().is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }

    let tag = tagged_file
        .primary_tag_mut()
        .ok_or_else(|| "No writable tag is available for this file".to_owned())?;

    tag.set_album(album_title.to_owned());

    if album_artist.is_empty() {
        tag.remove_key(ItemKey::AlbumArtist);
    } else {
        tag.insert_text(ItemKey::AlbumArtist, album_artist.to_owned());
    }

    if artist.is_empty() {
        tag.remove_artist();
    } else {
        tag.set_artist(artist.to_owned());
    }

    if let Some(year) = year.and_then(valid_year) {
        tag.set_date(Timestamp {
            year,
            month: None,
            day: None,
            hour: None,
            minute: None,
            second: None,
        });
    } else {
        tag.remove_date();
    }

    if genre.is_empty() {
        tag.remove_genre();
    } else {
        tag.set_genre(genre.to_owned());
    }

    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(to_error_string)
}

fn write_track_tags_to_file(
    file_path: &str,
    title: &str,
    artist: &str,
    album_title: &str,
    year: Option<i64>,
    genre: &str,
    track_number: Option<i64>,
    disc_number: Option<i64>,
) -> Result<(), String> {
    let path = Path::new(file_path);
    let mut tagged_file = read_from_path(path).map_err(to_error_string)?;
    let tag_type = tagged_file.primary_tag_type();

    if tagged_file.primary_tag_mut().is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }

    let tag = tagged_file
        .primary_tag_mut()
        .ok_or_else(|| "No writable tag is available for this file".to_owned())?;

    tag.set_title(title.to_owned());
    tag.set_album(album_title.to_owned());

    if artist.is_empty() {
        tag.remove_artist();
    } else {
        tag.set_artist(artist.to_owned());
    }

    if let Some(year) = year.and_then(valid_year) {
        tag.set_date(Timestamp {
            year,
            month: None,
            day: None,
            hour: None,
            minute: None,
            second: None,
        });
    } else {
        tag.remove_date();
    }

    if genre.is_empty() {
        tag.remove_genre();
    } else {
        tag.set_genre(genre.to_owned());
    }

    match track_number.and_then(|value| u32::try_from(value).ok()) {
        Some(value) => tag.set_track(value),
        None => tag.remove_track(),
    }

    match disc_number.and_then(|value| u32::try_from(value).ok()) {
        Some(value) => tag.set_disk(value),
        None => tag.remove_disk(),
    }

    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(to_error_string)
}

fn write_track_artwork_to_file(file_path: &str, picture: Picture) -> Result<(), String> {
    let path = Path::new(file_path);
    let mut tagged_file = read_from_path(path).map_err(to_error_string)?;
    let tag_type = tagged_file.primary_tag_type();

    if tagged_file.primary_tag_mut().is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }

    let tag = tagged_file
        .primary_tag_mut()
        .ok_or_else(|| "No writable tag is available for this file".to_owned())?;

    tag.remove_picture_type(PictureType::CoverFront);
    tag.push_picture(picture);

    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(to_error_string)
}

fn persist_album_tag_update(
    connection: &mut Connection,
    existing_album: &ExistingAlbum,
    updated_paths: &[String],
    album_title: &str,
    album_artist: &str,
    artist: &str,
    year: Option<i64>,
    genre: &str,
) -> Result<i64, String> {
    let transaction = connection.transaction().map_err(to_error_string)?;
    let display_album_artist = if album_artist.is_empty() {
        existing_album.artist.as_str()
    } else {
        album_artist
    };
    let next_album_key = format!(
        "{}::{}",
        existing_album.source_root,
        album_title.to_lowercase()
    );
    let next_track_artist = if artist.is_empty() {
        existing_album.artist.as_str()
    } else {
        artist
    };
    let next_genre = (!genre.is_empty()).then_some(genre);
    let next_year_label = year.map(|value| value.to_string());
    let merge_target_album = transaction
        .query_row(
            "SELECT id, year FROM albums
             WHERE source_root = ?1 AND lower(title) = lower(?2) AND id <> ?3
             ORDER BY id
             LIMIT 1",
            params![existing_album.source_root, album_title, existing_album.id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?)),
        )
        .optional()
        .map_err(to_error_string)?;

    let updated_album_id = if let Some((target_album_id, target_year)) = merge_target_album {
        let merged_years = [target_year, year]
            .into_iter()
            .flatten()
            .collect::<BTreeSet<_>>();
        let merged_year = merged_years.iter().next_back().copied();
        let merged_year_label = display_album_year(&merged_years);
        transaction
            .execute(
                "UPDATE albums
                 SET artist = ?1, year = ?2, year_label = ?3, genre = COALESCE(?4, genre), album_key = ?5
                 WHERE id = ?6",
                params![
                    display_album_artist,
                    merged_year,
                    merged_year_label,
                    next_genre,
                    next_album_key,
                    target_album_id
                ],
            )
            .map_err(to_error_string)?;

        for file_path in updated_paths {
            transaction
                .execute(
                    "UPDATE tracks SET album_id = ?1, artist = ?2 WHERE file_path = ?3",
                    params![target_album_id, next_track_artist, file_path],
                )
                .map_err(to_error_string)?;
        }

        let remaining_source_tracks = transaction
            .query_row(
                "SELECT COUNT(*) FROM tracks WHERE album_id = ?1",
                [existing_album.id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(to_error_string)?;

        if remaining_source_tracks == 0 {
            transaction
                .execute("DELETE FROM albums WHERE id = ?1", [existing_album.id])
                .map_err(to_error_string)?;
        }
        target_album_id
    } else {
        transaction
            .execute(
                "UPDATE albums
                 SET title = ?1, artist = ?2, year = ?3, year_label = ?4, genre = ?5, album_key = ?6
                 WHERE id = ?7",
                params![
                    album_title,
                    display_album_artist,
                    year,
                    next_year_label,
                    next_genre,
                    next_album_key,
                    existing_album.id,
                ],
            )
            .map_err(to_error_string)?;

        for file_path in updated_paths {
            transaction
                .execute(
                    "UPDATE tracks SET artist = ?1 WHERE file_path = ?2",
                    params![next_track_artist, file_path],
                )
                .map_err(to_error_string)?;
        }
        existing_album.id
    };

    transaction.commit().map_err(to_error_string)?;
    Ok(updated_album_id)
}

fn persist_track_tag_update(
    connection: &mut Connection,
    existing_track: &ExistingTrack,
    request: &TrackTagUpdateRequest,
    title: &str,
    artist: &str,
    album_title: &str,
    genre: &str,
) -> Result<(), String> {
    let transaction = connection.transaction().map_err(to_error_string)?;
    let next_artist = (!artist.is_empty()).then_some(artist);
    let next_genre = (!genre.is_empty()).then_some(genre);
    let next_year_label = request.year.map(|value| value.to_string());

    transaction
        .execute(
            "UPDATE tracks
             SET title = ?1,
                 artist = COALESCE(?2, artist),
                 track_number = ?3,
                 disc_number = ?4
             WHERE id = ?5",
            params![
                title,
                next_artist,
                request.track_number,
                request.disc_number,
                existing_track.id
            ],
        )
        .map_err(to_error_string)?;

    transaction
        .execute(
            "UPDATE albums
             SET title = ?1,
                 year = ?2,
                 year_label = ?3,
                 genre = ?4,
                 album_key = source_root || '::' || lower(?1)
             WHERE id = ?5",
            params![
                album_title,
                request.year,
                next_year_label,
                next_genre,
                existing_track.album_id
            ],
        )
        .map_err(to_error_string)?;

    transaction.commit().map_err(to_error_string)
}

fn persist_track_artwork_update(
    connection: &mut Connection,
    album_id: i64,
    artwork_path: &str,
) -> Result<(), String> {
    connection
        .execute(
            "UPDATE albums SET artwork_path = ?1 WHERE id = ?2",
            params![artwork_path, album_id],
        )
        .map_err(to_error_string)?;
    Ok(())
}

fn valid_year(year: i64) -> Option<u16> {
    (1..=9999).contains(&year).then_some(year as u16)
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
        let album_key = format!("{}::{}", root_string, album.title.to_lowercase());
        let year_label = display_album_year(&album.years);

        transaction
            .execute(
                "INSERT INTO albums (title, artist, year, year_label, genre, artwork_path, source_root, album_key)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    album.title,
                    album.artist,
                    album.year,
                    year_label,
                    album.genre,
                    album.artwork_path,
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
                        file_path,
                        lyrics
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        album_id,
                        track.title,
                        track.artist,
                        track.duration_seconds,
                        track.track_number,
                        track.disc_number,
                        track.file_path,
                        track.lyrics
                    ],
                )
                .map_err(to_error_string)?;
        }
    }

    transaction.commit().map_err(to_error_string)
}

fn count_albums(connection: &Connection) -> Result<usize, String> {
    connection
        .query_row("SELECT COUNT(*) FROM albums", [], |row| {
            row.get::<_, i64>(0)
        })
        .map(|count| count as usize)
        .map_err(to_error_string)
}

fn app_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(to_error_string)?;
    fs::create_dir_all(&app_data_dir).map_err(to_error_string)?;
    Ok(app_data_dir.join(DATABASE_NAME))
}

fn artwork_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(to_error_string)?;
    Ok(app_data_dir.join(ARTWORK_DIR_NAME))
}

fn allow_asset_directory(app: &AppHandle, path: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(path, true)
        .map_err(to_error_string)
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
                year_label TEXT,
                genre TEXT,
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
                file_path TEXT NOT NULL UNIQUE,
                lyrics TEXT
            );
            ",
        )
        .map_err(to_error_string)?;
    ensure_column(&connection, "albums", "genre", "TEXT")?;
    ensure_column(&connection, "albums", "year_label", "TEXT")?;
    ensure_column(&connection, "tracks", "lyrics", "TEXT")?;
    Ok(connection)
}

fn ensure_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    column_definition: &str,
) -> Result<(), String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table_name})"))
        .map_err(to_error_string)?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(to_error_string)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error_string)?;

    if columns.iter().any(|column| column == column_name) {
        return Ok(());
    }

    connection
        .execute(
            &format!("ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"),
            [],
        )
        .map_err(to_error_string)?;
    Ok(())
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

fn find_audio_files(root: &Path) -> (Vec<PathBuf>, usize) {
    let mut audio_files = Vec::new();
    let mut skipped_entries = 0usize;

    for entry_result in WalkDir::new(root).follow_links(true) {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => {
                skipped_entries += 1;
                continue;
            }
        };

        if entry.file_type().is_file() && is_supported_audio_file(&entry.path()) {
            audio_files.push(entry.path());
        }
    }

    audio_files.sort_by_cached_key(|path| path.to_string_lossy().to_lowercase());
    (audio_files, skipped_entries)
}

fn clean_tag_text(value: Option<std::borrow::Cow<'_, str>>) -> Option<String> {
    value
        .map(|text| repair_mojibake(text.trim()))
        .filter(|text| !text.is_empty())
}

fn read_lyrics(tagged_file: &impl TaggedFileExt) -> Option<String> {
    tagged_file
        .tags()
        .iter()
        .flat_map(lyrics_candidates)
        .max_by_key(|text| text.chars().count())
}

fn lyrics_candidates(tag: &Tag) -> Vec<String> {
    [ItemKey::UnsyncLyrics, ItemKey::Lyrics]
        .into_iter()
        .flat_map(|key| tag.get_items(key))
        .filter_map(|item| clean_lyrics_text(item.value().text()))
        .chain(
            tag.get_items(ItemKey::Comment)
                .filter(|item| is_lyrics_description(item.description()))
                .filter_map(|item| clean_lyrics_text(item.value().text())),
        )
        .collect()
}

fn clean_lyrics_text(value: Option<&str>) -> Option<String> {
    value
        .map(repair_mojibake)
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}

fn is_lyrics_description(description: &str) -> bool {
    let normalized = description.trim().to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "lyric" | "lyrics" | "unsynced lyrics" | "unsynchronized lyrics" | "歌詞"
    )
}

fn display_album_artist(artists: &BTreeSet<String>) -> String {
    let mut known_artists = artists
        .iter()
        .filter(|artist| artist.as_str() != "Unknown Artist");
    let Some(first_artist) = known_artists.next() else {
        return VARIOUS_ARTISTS.to_owned();
    };

    if known_artists.next().is_some() || artists.len() > 1 {
        format!("{first_artist}など")
    } else {
        first_artist.to_owned()
    }
}

fn display_album_year(years: &BTreeSet<i64>) -> Option<String> {
    let latest_year = years.iter().next_back()?;
    if years.len() > 1 {
        Some(format!("{latest_year}など"))
    } else {
        Some(latest_year.to_string())
    }
}

fn extract_album_artwork(
    tagged_file: &impl TaggedFileExt,
    artwork_dir: &Path,
    album_key: &str,
) -> Option<String> {
    let picture = tagged_file
        .tags()
        .iter()
        .find_map(|tag| tag.get_picture_type(PictureType::CoverFront))
        .or_else(|| {
            tagged_file
                .tags()
                .iter()
                .find_map(|tag| tag.pictures().first())
        })?;

    write_artwork_file(picture, artwork_dir, album_key).ok()
}

fn write_artwork_file(
    picture: &Picture,
    artwork_dir: &Path,
    album_key: &str,
) -> Result<String, String> {
    if picture.data().is_empty() {
        return Err("empty artwork".to_owned());
    }

    let extension = picture
        .mime_type()
        .and_then(MimeType::ext)
        .or_else(|| sniff_picture_extension(picture.data()))
        .unwrap_or("bin");
    let file_name = format!("{:016x}.{extension}", stable_hash(album_key));
    let path = artwork_dir.join(file_name);

    if !path.exists() {
        fs::write(&path, picture.data()).map_err(to_error_string)?;
    }

    Ok(path.to_string_lossy().into_owned())
}

fn write_artwork_bytes(
    bytes: &[u8],
    artwork_dir: &Path,
    artwork_key: &str,
) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty artwork".to_owned());
    }

    let extension = sniff_picture_extension(bytes).unwrap_or("bin");
    let file_name = format!(
        "{:016x}-{:016x}.{extension}",
        stable_hash(artwork_key),
        stable_hash_bytes(bytes),
    );
    let path = artwork_dir.join(file_name);
    fs::write(&path, bytes).map_err(to_error_string)?;
    Ok(path.to_string_lossy().into_owned())
}

fn make_front_cover_picture(bytes: Vec<u8>) -> Result<Picture, String> {
    let mime_type = sniff_picture_mime_type(&bytes)
        .ok_or_else(|| "library.error.unsupportedArtwork".to_owned())?;

    Ok(Picture::unchecked(bytes)
        .pic_type(PictureType::CoverFront)
        .mime_type(mime_type)
        .build())
}

fn sniff_picture_mime_type(bytes: &[u8]) -> Option<MimeType> {
    match bytes {
        [0xFF, 0xD8, ..] => Some(MimeType::Jpeg),
        [0x89, b'P', b'N', b'G', ..] => Some(MimeType::Png),
        [b'G', b'I', b'F', ..] => Some(MimeType::Gif),
        [b'B', b'M', ..] => Some(MimeType::Bmp),
        [b'I', b'I', b'*', 0x00, ..] | [b'M', b'M', 0x00, b'*', ..] => Some(MimeType::Tiff),
        _ => None,
    }
}

fn sniff_picture_extension(bytes: &[u8]) -> Option<&'static str> {
    match bytes {
        [0xFF, 0xD8, ..] => Some("jpg"),
        [0x89, b'P', b'N', b'G', ..] => Some("png"),
        [b'G', b'I', b'F', ..] => Some("gif"),
        [b'B', b'M', ..] => Some("bmp"),
        [b'I', b'I', b'*', 0x00, ..] | [b'M', b'M', 0x00, b'*', ..] => Some("tif"),
        _ => None,
    }
}

fn stable_hash(value: &str) -> u64 {
    value.bytes().fold(0xcbf29ce484222325, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3)
    })
}

fn stable_hash_bytes(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

fn repair_mojibake(text: &str) -> String {
    let mut best = text.trim().to_owned();
    let mut best_score = text_quality_score(text.trim());

    for bytes in mojibake_byte_sources(text) {
        let (decoded_utf8, _, had_utf8_errors) = UTF_8.decode(&bytes);
        if !had_utf8_errors {
            let candidate = decoded_utf8.trim();
            let candidate_score = text_quality_score(candidate);
            if candidate_score > best_score + 3 {
                return candidate.to_owned();
            }
        }

        for encoding in [SHIFT_JIS] {
            let (decoded, _, had_errors) = encoding.decode(&bytes);
            if had_errors {
                continue;
            }
            let candidate = decoded.trim();
            let candidate_score = text_quality_score(candidate);
            if candidate_score > best_score + 3 {
                best = candidate.to_owned();
                best_score = candidate_score;
            }
        }
    }

    best
}

fn mojibake_byte_sources(text: &str) -> Vec<Vec<u8>> {
    let mut sources = Vec::new();
    if let Some(bytes) = encode_as_mixed_single_byte_text(text) {
        sources.push(bytes);
    }
    if let Some(bytes) = encode_as_windows_1252_bytes(text) {
        sources.push(bytes);
    }
    if let Some(bytes) = encode_as_latin1_bytes(text) {
        sources.push(bytes);
    }
    sources
}

fn encode_as_windows_1252_bytes(text: &str) -> Option<Vec<u8>> {
    let (bytes, _, had_errors) = WINDOWS_1252.encode(text);
    (!had_errors).then(|| bytes.into_owned())
}

fn encode_as_latin1_bytes(text: &str) -> Option<Vec<u8>> {
    text.chars()
        .map(|character| u8::try_from(character as u32).ok())
        .collect()
}

fn encode_as_mixed_single_byte_text(text: &str) -> Option<Vec<u8>> {
    text.chars()
        .map(|character| {
            let mut buffer = [0u8; 4];
            let encoded = character.encode_utf8(&mut buffer);
            let (bytes, _, had_errors) = WINDOWS_1252.encode(encoded);
            if !had_errors && bytes.len() == 1 {
                return Some(bytes[0]);
            }
            u8::try_from(character as u32).ok()
        })
        .collect()
}

fn text_quality_score(text: &str) -> i32 {
    let mut score = 0;
    for character in text.chars() {
        if character == '\u{fffd}' || character.is_control() {
            score -= 12;
        } else if is_japanese_character(character) {
            score += 4;
        } else if character.is_ascii_alphanumeric() {
            score += 1;
        }
    }

    if contains_mojibake_marker(text) {
        score -= 8;
    }

    score
}

fn contains_mojibake_marker(text: &str) -> bool {
    ["Ã", "Â", "ã", "ä", "å", "æ", "œ", "€", "�"]
        .iter()
        .any(|marker| text.contains(marker))
}

fn is_japanese_character(character: char) -> bool {
    matches!(
        character as u32,
        0x3040..=0x30ff | 0x3400..=0x9fff | 0xf900..=0xfaff | 0xff66..=0xff9f
    )
}

fn to_error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        display_album_artist, display_album_year, find_audio_files, persist_album_tag_update,
        repair_mojibake, ExistingAlbum,
    };
    use rusqlite::{params, Connection};
    use std::{
        collections::BTreeSet,
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn finds_supported_audio_files_recursively() {
        let root = unique_temp_dir();
        let nested = root.join("Artist").join("Album");
        fs::create_dir_all(&nested).expect("create nested fixture directory");
        fs::write(root.join("root.MP3"), []).expect("write root audio fixture");
        fs::write(nested.join("track.flac"), []).expect("write nested audio fixture");
        fs::write(nested.join("notes.txt"), []).expect("write non-audio fixture");

        let (files, skipped_entries) = find_audio_files(&root);
        let mut names = files
            .iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        names.sort();

        assert_eq!(skipped_entries, 0);
        assert_eq!(names, vec!["root.MP3", "track.flac"]);

        fs::remove_dir_all(root).expect("remove fixture directory");
    }

    #[test]
    fn repairs_common_japanese_mojibake() {
        assert_eq!(repair_mojibake("ã‚¢ãƒ«ãƒ\u{0090}ãƒ "), "アルバム");
        assert_eq!(repair_mojibake("ƒAƒ‹ƒoƒ€"), "アルバム");
        assert_eq!(
            repair_mojibake(
                "\u{008b}@\u{0093}®\u{0090}í\u{008e}m\u{0083}K\u{0083}\u{0093}\u{0083}_\u{0083}\u{0080}SEED DESTINY OST \u{0087}T\n(\u{0089}¹\u{008a}y)\u{008d}²\u{008b}´\u{008f}r\u{0095}F"
            ),
            "機動戦士ガンダムSEED DESTINY OST Ⅰ\n(音楽)佐橋俊彦"
        );
        assert_eq!(repair_mojibake("Midnight Transit"), "Midnight Transit");
    }

    #[test]
    fn displays_multiple_album_artists_as_etc() {
        let artists = BTreeSet::from(["Circular Moonray".to_owned(), "Mica Notes".to_owned()]);

        assert_eq!(display_album_artist(&artists), "Circular Moonrayなど");
    }

    #[test]
    fn displays_multiple_album_years_as_etc() {
        assert_eq!(
            display_album_year(&BTreeSet::from([2024])),
            Some("2024".to_owned())
        );
        assert_eq!(
            display_album_year(&BTreeSet::from([2024, 2026])),
            Some("2026など".to_owned())
        );
    }

    #[test]
    fn merges_album_tag_update_into_existing_album_key() {
        let mut connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(
                "
                CREATE TABLE albums (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    year INTEGER,
                    year_label TEXT,
                    genre TEXT,
                    artwork_path TEXT,
                    source_root TEXT NOT NULL,
                    album_key TEXT NOT NULL UNIQUE
                );
                CREATE TABLE tracks (
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
            .expect("create library schema");

        connection
            .execute(
                "INSERT INTO albums (id, title, artist, year, source_root, album_key)
                 VALUES (1, 'Source Album', 'Source Artist', 2024, '/music', '/music::source album::2024')",
                [],
            )
            .expect("insert source album");
        connection
            .execute(
                "INSERT INTO albums (id, title, artist, year, source_root, album_key)
                 VALUES (2, 'Target Album', 'Target Artist', 2025, '/music', '/music::target album::2025')",
                [],
            )
            .expect("insert target album");
        connection
            .execute(
                "INSERT INTO tracks (album_id, title, artist, duration_seconds, file_path)
                 VALUES (1, 'Moved Track', 'Source Artist', 180, '/music/moved.mp3')",
                [],
            )
            .expect("insert moved track");
        connection
            .execute(
                "INSERT INTO tracks (album_id, title, artist, duration_seconds, file_path)
                 VALUES (2, 'Existing Track', 'Target Artist', 180, '/music/existing.mp3')",
                [],
            )
            .expect("insert existing track");

        let updated_album_id = persist_album_tag_update(
            &mut connection,
            &ExistingAlbum {
                id: 1,
                artist: "Source Artist".to_owned(),
                source_root: "/music".to_owned(),
            },
            &["/music/moved.mp3".to_owned()],
            "Target Album",
            "Target Artist",
            "Target Artist",
            Some(2025),
            "Rock",
        )
        .expect("merge source album into target album");

        let album_count = connection
            .query_row("SELECT COUNT(*) FROM albums", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("count albums");
        let target_track_count = connection
            .query_row(
                "SELECT COUNT(*) FROM tracks WHERE album_id = 2",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count target tracks");
        let moved_track_artist = connection
            .query_row(
                "SELECT artist FROM tracks WHERE file_path = ?1",
                params!["/music/moved.mp3"],
                |row| row.get::<_, String>(0),
            )
            .expect("load moved track artist");

        assert_eq!(album_count, 1);
        assert_eq!(target_track_count, 2);
        assert_eq!(moved_track_artist, "Target Artist");
        assert_eq!(updated_album_id, 2);
    }

    fn unique_temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("musical-library-test-{nanos}"))
    }
}
