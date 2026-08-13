use crate::app_settings;
use lofty::{
    file::{AudioFile, TaggedFileExt},
    read_from_path,
    tag::{Accessor, ItemKey, Tag},
};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    collections::{BTreeSet, HashMap},
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Emitter};

const DATABASE_NAME: &str = "musical.sqlite3";
const MUSICAL_DIR_NAME: &str = ".musical";
const ARTWORK_DIR_NAME: &str = "artwork";
const PLAYLIST_DIR_NAME: &str = "playlist";
const PLAYLIST_EXTENSION: &str = "mplaylist";
const M3U_EXTENSIONS: &[&str] = &["m3u", "m3u8"];
const PLS_EXTENSION: &str = "pls";
const SCHEMA_VERSION: &str = "2";
const AUDIO_EXTENSIONS: &[&str] = &[
    "aac", "aif", "aiff", "alac", "ape", "flac", "m4a", "m4b", "mka", "mp3", "mp4", "oga", "ogg",
    "opus", "wav", "wma",
];
const OTHER_ALBUM_TITLE: &str = "Other Album";
const VARIOUS_ARTISTS: &str = "Various Artists";
const LIBRARY_SCAN_PROGRESS_EVENT: &str = "musical-library-scan-progress";
const LIBRARY_LOAD_PROGRESS_EVENT: &str = "musical-library-load-progress";

mod artwork;
mod artwork_search;
mod models;
mod playlist;
mod storage;
mod tag_updates;
mod text;

use artwork::{
    extract_album_artwork, make_front_cover_picture, sniff_picture_extension, stable_hash,
    stable_hash_bytes, write_artwork_bytes,
};
pub use artwork_search::{
    inspect_artwork_release, preview_artwork_candidate, search_artwork_candidates,
};
pub use models::{
    AddTrackToPlaylistRequest, AddTracksToPlaylistRequest, AlbumArtworkUpdateRequest,
    AlbumArtworkUpdateResult, AlbumRecord, AlbumTagUpdateRequest, AlbumTagUpdateResult,
    ArtworkCandidate, ArtworkCandidatePreviewRequest, ArtworkCandidatePreviewResult,
    ArtworkCandidateSearchRequest, ArtworkCandidateSearchResult, ArtworkReleaseInspectRequest,
    ArtworkReleaseInspectResult, ArtworkReleaseTrack, ArtworkSearchProgress,
    CreatePlaylistFromAlbumRequest, CreatePlaylistRequest, DeletePlaylistRequest,
    LibraryLoadProgress, LibraryScanProgress, LibrarySnapshot, LoadPlaylistRequest,
    PlaylistArtworkUpdateRequest, PlaylistArtworkUpdateResult, PlaylistRecord,
    RemovePlaylistTrackRequest, RenamePlaylistRequest, ReorderPlaylistTrackRequest, ScanSummary,
    TagWriteFailure, TrackArtworkUpdateRequest, TrackArtworkUpdateResult, TrackRecord,
    TrackTagUpdateRequest, TrackTagUpdateResult, TrackUserStateUpdateRequest,
    TrackUserStateUpdateResult, TvLibraryList, TvLibrarySummary,
};
use models::{
    ExistingAlbum, ExistingFileState, ExistingTrack, PendingAlbum, PendingTrack, PlaylistFile,
};
use playlist::load_playlists;
pub use playlist::{
    add_track_to_playlist, add_tracks_to_playlist, create_playlist, create_playlist_from_album,
    delete_playlist, load_playlist, remove_playlist_track, rename_playlist, reorder_playlist_track,
    update_playlist_artwork,
};
#[cfg(test)]
use playlist::{
    load_playlist_by_id, load_playlist_file_best_effort, parse_m3u_playlist, parse_pls_playlist,
    read_mplaylist_file, resolve_playlist_tracks, strip_windows_drive_prefix,
    update_playlist_artwork_file, write_playlist_file,
};
use storage::{
    allow_asset_directory, app_database_path, artwork_cache_dir_for_root, count_albums,
    current_library_root, database_path_for_root, file_fingerprint, find_audio_files,
    hide_directory_best_effort, musical_dir_for_root, normalize_group_key,
    normalize_windows_extended_path, normalize_windows_extended_path_string, open_database,
    open_database_for_read, playlist_dir_for_root, playlist_track_path, read_rating,
    required_app_database_path, track_uuid, unique_playlist_id, unix_timestamp_millis,
};
#[cfg(test)]
use tag_updates::persist_album_tag_update;
use tag_updates::{load_album_for_update, load_existing_file_states};
pub use tag_updates::{
    update_album_artwork, update_album_tags, update_track_artwork, update_track_tags,
    update_track_user_state,
};
use text::repair_mojibake;

pub fn load_snapshot(app: &AppHandle) -> Result<LibrarySnapshot, String> {
    let Some(database_path) = app_database_path(app)? else {
        return Ok(LibrarySnapshot {
            albums: Vec::new(),
            playlists: Vec::new(),
            last_scan_path: None,
            database_path: String::new(),
        });
    };
    emit_library_load_progress(app, "opening", 0, 0, 0);
    let connection = open_database_for_read(&database_path)?;
    let snapshot = read_snapshot(app, &connection, &database_path)?;

    emit_library_load_progress(
        app,
        "assets",
        snapshot.albums.len(),
        snapshot.albums.len(),
        count_snapshot_tracks(&snapshot),
    );
    if let Some(last_scan_path) = &snapshot.last_scan_path {
        let path = Path::new(last_scan_path);
        if path.is_dir() {
            allow_asset_directory(app, path)?;
        }
    }
    if let Some(artwork_dir) = snapshot
        .last_scan_path
        .as_deref()
        .map(|path| artwork_cache_dir_for_root(Path::new(path)))
        .transpose()?
    {
        if artwork_dir.is_dir() {
            allow_asset_directory(app, &artwork_dir)?;
        }
    }

    emit_library_load_progress(
        app,
        "completed",
        snapshot.albums.len(),
        snapshot.albums.len(),
        count_snapshot_tracks(&snapshot),
    );
    crate::search_index::schedule_refresh(app, false);
    Ok(snapshot)
}

pub fn current_database_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    app_database_path(app)
}

pub fn load_snapshot_for_tv_library(
    app: &AppHandle,
    library_id: Option<&str>,
) -> Result<LibrarySnapshot, String> {
    let snapshot = load_snapshot(app)?;
    let Some(library_id) = library_id else {
        return Ok(snapshot);
    };

    let Some(current_library_id) = tv_library_id(&snapshot) else {
        return Err("library.error.noLibraryScanned".to_owned());
    };
    if current_library_id != library_id {
        return Err("library.error.libraryNotFound".to_owned());
    }

    Ok(snapshot)
}

pub fn load_tv_libraries(app: &AppHandle) -> Result<TvLibraryList, String> {
    let snapshot = load_snapshot(app)?;
    if snapshot.database_path.is_empty() {
        return Ok(TvLibraryList {
            libraries: Vec::new(),
        });
    }

    let track_count = count_snapshot_tracks(&snapshot);
    let name = snapshot
        .last_scan_path
        .as_deref()
        .and_then(|path| Path::new(path).file_name())
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Current library")
        .to_owned();

    Ok(TvLibraryList {
        libraries: vec![TvLibrarySummary {
            id: tv_library_id(&snapshot).unwrap_or_default(),
            name,
            path: snapshot.last_scan_path,
            album_count: snapshot.albums.len(),
            track_count,
        }],
    })
}

fn tv_library_id(snapshot: &LibrarySnapshot) -> Option<String> {
    if snapshot.database_path.is_empty() {
        return None;
    }

    let id_source = snapshot
        .last_scan_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .unwrap_or(&snapshot.database_path);
    Some(format!("{:x}", md5::compute(id_source)))
}

pub fn load_track_lyrics(app: &AppHandle, track_id: &str) -> Result<Option<String>, String> {
    let database_path = required_app_database_path(app)?;
    let connection = open_database_for_read(&database_path)?;

    connection
        .query_row(
            "SELECT lyrics FROM tracks WHERE uuid = ?1",
            [track_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(to_error_string)?
        .ok_or_else(|| format!("library.error.trackNotFound\t{track_id}"))
}

pub fn load_track_file_path(app: &AppHandle, track_id: &str) -> Result<String, String> {
    let database_path = required_app_database_path(app)?;
    let connection = open_database_for_read(&database_path)?;
    load_track_file_path_from_connection(&connection, track_id)
}

fn load_track_file_path_from_connection(
    connection: &Connection,
    track_id: &str,
) -> Result<String, String> {
    connection
        .query_row(
            "SELECT file_path FROM tracks WHERE uuid = ?1",
            [track_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_error_string)?
        .ok_or_else(|| format!("library.error.trackNotFound\t{track_id}"))
}

pub fn scan_folder(app: &AppHandle, folder_path: &str) -> Result<ScanSummary, String> {
    let canonical_root = normalize_windows_extended_path(
        fs::canonicalize(folder_path)
            .map_err(|error| format!("library.error.folderOpen\t{folder_path}\t{error}"))?,
    );

    if !canonical_root.is_dir() {
        return Err(format!(
            "library.error.notFolder\t{}",
            canonical_root.display()
        ));
    }

    allow_asset_directory(app, &canonical_root)?;
    let musical_dir = musical_dir_for_root(&canonical_root);
    fs::create_dir_all(&musical_dir).map_err(to_error_string)?;
    hide_directory_best_effort(&musical_dir);
    let artwork_dir = artwork_cache_dir_for_root(&canonical_root)?;
    fs::create_dir_all(&artwork_dir).map_err(to_error_string)?;
    allow_asset_directory(app, &artwork_dir)?;

    let database_path = database_path_for_root(&canonical_root);
    let mut connection = open_database(&database_path)?;
    let existing_file_states = load_existing_file_states(&connection)?;

    let mut pending_albums: HashMap<String, PendingAlbum> = HashMap::new();
    let mut imported_tracks = 0usize;
    let mut skipped_files = 0usize;
    emit_library_scan_progress(app, "discovering", &canonical_root, 0, 0, 0, 0);
    let (audio_files, discovery_errors) = find_audio_files(&canonical_root);
    skipped_files += discovery_errors;
    emit_library_scan_progress(
        app,
        "reading",
        &canonical_root,
        0,
        audio_files.len(),
        imported_tracks,
        skipped_files,
    );

    for (index, path) in audio_files.iter().enumerate() {
        let file_path = path.to_string_lossy().into_owned();
        let uuid = track_uuid(&canonical_root, path)?;
        let metadata = fs::metadata(path).map_err(to_error_string)?;
        let file_size = metadata.len() as i64;
        let file_mtime = metadata
            .modified()
            .map_err(to_error_string)?
            .duration_since(UNIX_EPOCH)
            .map_err(to_error_string)?
            .as_millis() as i64;
        let file_fingerprint = if let Some(state) = existing_file_states
            .get(&uuid)
            .filter(|state| state.file_mtime == file_mtime && state.file_size == file_size)
        {
            state.file_md5.clone()
        } else {
            file_fingerprint(&uuid, file_mtime, file_size)
        };

        let tagged_file = match read_from_path(path) {
            Ok(file) => file,
            Err(_) => {
                skipped_files += 1;
                emit_library_scan_progress_if_needed(
                    app,
                    &canonical_root,
                    index + 1,
                    audio_files.len(),
                    imported_tracks,
                    skipped_files,
                );
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
        let initial_rating = tag.and_then(read_rating);
        let track_number = tag.and_then(|value| value.track()).map(i64::from);
        let disc_number = tag.and_then(|value| value.disk()).map(i64::from);
        let duration_seconds = tagged_file.properties().duration().as_secs() as i64;

        let album_key = normalize_group_key(&album_title);
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
            uuid,
            title,
            artist,
            duration_seconds,
            track_number,
            disc_number,
            file_path,
            file_md5: file_fingerprint,
            file_mtime,
            file_size,
            initial_rating,
            lyrics,
        });
        imported_tracks += 1;
        emit_library_scan_progress_if_needed(
            app,
            &canonical_root,
            index + 1,
            audio_files.len(),
            imported_tracks,
            skipped_files,
        );
    }

    emit_library_scan_progress(
        app,
        "writing",
        &canonical_root,
        audio_files.len(),
        audio_files.len(),
        imported_tracks,
        skipped_files,
    );
    write_library(
        &mut connection,
        &canonical_root,
        pending_albums.into_values().collect(),
    )?;
    app_settings::update(app, |settings| {
        settings.last_library_path = Some(canonical_root.to_string_lossy().into_owned());
    })?;

    emit_library_scan_progress(
        app,
        "completed",
        &canonical_root,
        audio_files.len(),
        audio_files.len(),
        imported_tracks,
        skipped_files,
    );

    let summary = ScanSummary {
        scanned_files: audio_files.len(),
        imported_tracks,
        skipped_files,
        albums: count_albums(&connection)?,
        library_path: canonical_root.to_string_lossy().into_owned(),
    };
    drop(connection);
    crate::search_index::schedule_refresh(app, true);
    Ok(summary)
}

fn emit_library_scan_progress_if_needed(
    app: &AppHandle,
    library_root: &Path,
    processed: usize,
    total: usize,
    imported: usize,
    skipped: usize,
) {
    if processed == total || processed % 25 == 0 {
        emit_library_scan_progress(
            app,
            "reading",
            library_root,
            processed,
            total,
            imported,
            skipped,
        );
    }
}

fn emit_library_scan_progress(
    app: &AppHandle,
    status: &'static str,
    library_root: &Path,
    processed: usize,
    total: usize,
    imported: usize,
    skipped: usize,
) {
    let _ = app.emit(
        LIBRARY_SCAN_PROGRESS_EVENT,
        LibraryScanProgress {
            status,
            library_path: library_root.to_string_lossy().into_owned(),
            processed,
            total,
            imported,
            skipped,
        },
    );
}

fn emit_library_load_progress(
    app: &AppHandle,
    status: &'static str,
    processed: usize,
    total: usize,
    tracks: usize,
) {
    let _ = app.emit(
        LIBRARY_LOAD_PROGRESS_EVENT,
        LibraryLoadProgress {
            status,
            processed,
            total,
            tracks,
        },
    );
}

fn read_snapshot(
    app: &AppHandle,
    connection: &Connection,
    database_path: &Path,
) -> Result<LibrarySnapshot, String> {
    let last_scan_path = connection
        .query_row(
            "SELECT value FROM library_settings WHERE key = 'last_scan_path'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_error_string)?
        .map(normalize_windows_extended_path_string);

    let mut album_statement = connection
        .prepare(
            "SELECT group_key, title, artist, year, year_label, genre, artwork_path
             FROM albums
             ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE, year",
        )
        .map_err(to_error_string)?;

    let albums = album_statement
        .query_map([], |row| {
            Ok(AlbumRecord {
                id: row.get(0)?,
                group_key: row.get(0)?,
                title: repair_mojibake(&row.get::<_, String>(1)?),
                artist: repair_mojibake(&row.get::<_, String>(2)?),
                year: row.get(3)?,
                year_label: row.get(4)?,
                genre: row.get(5)?,
                artwork_path: existing_artwork_path(row.get(6)?),
                tracks: Vec::new(),
            })
        })
        .map_err(to_error_string)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_error_string)?;

    let total_albums = albums.len();
    emit_library_load_progress(app, "albums", 0, total_albums, 0);
    let mut hydrated_albums = Vec::with_capacity(total_albums);
    let mut hydrated_tracks = 0usize;
    for (index, mut album) in albums.into_iter().enumerate() {
        album.tracks = load_tracks(connection, &album.id)?;
        hydrated_tracks += album.tracks.len();
        hydrated_albums.push(album);
        let processed = index + 1;
        if processed == total_albums || processed % 25 == 0 {
            emit_library_load_progress(app, "albums", processed, total_albums, hydrated_tracks);
        }
    }

    let playlists = last_scan_path
        .as_deref()
        .map(Path::new)
        .filter(|path| path.is_dir())
        .map(|library_root| load_playlists(library_root, connection))
        .transpose()?
        .unwrap_or_default();

    Ok(LibrarySnapshot {
        albums: hydrated_albums,
        playlists,
        last_scan_path,
        database_path: database_path.to_string_lossy().into_owned(),
    })
}

fn count_snapshot_tracks(snapshot: &LibrarySnapshot) -> usize {
    snapshot.albums.iter().map(|album| album.tracks.len()).sum()
}

fn existing_artwork_path(artwork_path: Option<String>) -> Option<String> {
    artwork_path.filter(|path| Path::new(path).is_file())
}

fn load_tracks(connection: &Connection, album_id: &str) -> Result<Vec<TrackRecord>, String> {
    let mut statement = connection
        .prepare(
            "SELECT tracks.uuid,
                    tracks.title,
                    tracks.artist,
                    tracks.duration_seconds,
                    tracks.track_number,
                    tracks.disc_number,
                    tracks.file_path,
                    tracks.lyrics IS NOT NULL AND TRIM(tracks.lyrics) != '',
                    COALESCE(track_user_state.is_favorite, 0),
                    track_user_state.rating
             FROM tracks
             LEFT JOIN track_user_state ON track_user_state.track_uuid = tracks.uuid
             WHERE album_group_key = ?1
             ORDER BY COALESCE(disc_number, 0), COALESCE(track_number, 0), title COLLATE NOCASE, file_path COLLATE NOCASE",
        )
        .map_err(to_error_string)?;

    let rows = statement
        .query_map([album_id], |row| {
            Ok(TrackRecord {
                id: row.get(0)?,
                uuid: row.get(0)?,
                title: repair_mojibake(&row.get::<_, String>(1)?),
                artist: repair_mojibake(&row.get::<_, String>(2)?),
                duration_seconds: row.get(3)?,
                track_number: row.get(4)?,
                disc_number: row.get(5)?,
                file_path: row.get(6)?,
                has_lyrics: row.get(7)?,
                is_favorite: row.get::<_, i64>(8)? != 0,
                rating: row.get(9)?,
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
            DELETE FROM albums;
            ",
        )
        .map_err(to_error_string)?;

    transaction
        .execute(
            "INSERT INTO library_settings (key, value) VALUES ('last_scan_path', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [root_string.as_str()],
        )
        .map_err(to_error_string)?;

    let mut seen_track_uuids = Vec::new();
    for album in albums {
        let album_key = normalize_group_key(&album.title);
        let year_label = display_album_year(&album.years);

        transaction
            .execute(
                "INSERT INTO albums (group_key, title, artist, year, year_label, genre, artwork_path)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(group_key) DO UPDATE SET
                    title = excluded.title,
                    artist = excluded.artist,
                    year = excluded.year,
                    year_label = excluded.year_label,
                    genre = excluded.genre,
                    artwork_path = excluded.artwork_path",
                params![
                    album_key,
                    album.title,
                    album.artist,
                    album.year,
                    year_label,
                    album.genre,
                    album.artwork_path,
                ],
            )
            .map_err(to_error_string)?;

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
            seen_track_uuids.push(track.uuid.clone());
            transaction
                .execute(
                    "INSERT INTO tracks (
                        uuid,
                        album_group_key,
                        title,
                        artist,
                        duration_seconds,
                        track_number,
                        disc_number,
                        file_path,
                        file_mtime,
                        file_size,
                        file_md5,
                        lyrics
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                     ON CONFLICT(uuid) DO UPDATE SET
                        album_group_key = excluded.album_group_key,
                        title = excluded.title,
                        artist = excluded.artist,
                        duration_seconds = excluded.duration_seconds,
                        track_number = excluded.track_number,
                        disc_number = excluded.disc_number,
                        file_path = excluded.file_path,
                        file_mtime = excluded.file_mtime,
                        file_size = excluded.file_size,
                        file_md5 = excluded.file_md5,
                        lyrics = excluded.lyrics",
                    params![
                        track.uuid,
                        album_key,
                        track.title,
                        track.artist,
                        track.duration_seconds,
                        track.track_number,
                        track.disc_number,
                        track.file_path,
                        track.file_mtime,
                        track.file_size,
                        track.file_md5,
                        track.lyrics
                    ],
                )
                .map_err(to_error_string)?;
            if let Some(initial_rating) = track.initial_rating {
                transaction
                    .execute(
                        "INSERT INTO track_user_state (track_uuid, is_favorite, rating, updated_at)
                         VALUES (?1, 0, ?2, ?3)
                         ON CONFLICT(track_uuid) DO NOTHING",
                        params![
                            track.uuid,
                            initial_rating,
                            unix_timestamp_millis()?.to_string()
                        ],
                    )
                    .map_err(to_error_string)?;
            }
        }
    }

    if seen_track_uuids.is_empty() {
        transaction
            .execute("DELETE FROM tracks", [])
            .map_err(to_error_string)?;
    } else {
        let placeholders = std::iter::repeat("?")
            .take(seen_track_uuids.len())
            .collect::<Vec<_>>()
            .join(",");
        let delete_sql = format!("DELETE FROM tracks WHERE uuid NOT IN ({placeholders})");
        transaction
            .execute(
                &delete_sql,
                rusqlite::params_from_iter(seen_track_uuids.iter()),
            )
            .map_err(to_error_string)?;
    }

    transaction.commit().map_err(to_error_string)
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

fn to_error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests;
