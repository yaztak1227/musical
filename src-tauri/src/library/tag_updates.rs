use lofty::{
    config::WriteOptions,
    file::{AudioFile, TaggedFileExt},
    picture::{Picture, PictureType},
    read_from_path,
    tag::{items::Timestamp, Accessor, ItemKey, Tag},
};
use rusqlite::{params, Connection, OptionalExtension};
use std::{collections::HashMap, fs, path::Path};
use tauri::AppHandle;

use super::{
    allow_asset_directory, artwork_cache_dir_for_root, current_library_root,
    make_front_cover_picture, normalize_group_key, open_database, required_app_database_path,
    stable_hash, to_error_string, unix_timestamp_millis, write_artwork_bytes,
    AlbumArtworkUpdateRequest, AlbumArtworkUpdateResult, AlbumTagUpdateRequest,
    AlbumTagUpdateResult, ExistingAlbum, ExistingFileState, ExistingTrack, TagWriteFailure,
    TrackArtworkUpdateRequest, TrackArtworkUpdateResult, TrackTagUpdateRequest,
    TrackTagUpdateResult, TrackUserStateUpdateRequest, TrackUserStateUpdateResult,
};

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
    let database_path = required_app_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    let existing_album = load_album_for_update(&connection, request.album_id.clone())?;
    let track_paths = load_track_paths(&connection, request.album_id.clone())?;

    if track_paths.is_empty() {
        return Err(format!(
            "library.error.albumHasNoTracks\t{}",
            request.album_id.clone()
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

    let result = AlbumTagUpdateResult {
        album_id: updated_album_id,
        updated_files: updated_paths.len(),
        failed_files,
    };
    drop(connection);
    if result.updated_files > 0 {
        crate::search_index::schedule_refresh(app, true);
    }
    Ok(result)
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
    let database_path = required_app_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    let existing_track = load_track_for_update(&connection, request.track_id.clone())?;

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

    let result = TrackTagUpdateResult {
        track_id: existing_track.uuid,
        album_id: existing_track.album_group_key,
    };
    drop(connection);
    crate::search_index::schedule_refresh(app, true);
    Ok(result)
}

pub fn update_track_artwork(
    app: &AppHandle,
    request: TrackArtworkUpdateRequest,
) -> Result<TrackArtworkUpdateResult, String> {
    let artwork_source_path = request.artwork_path.trim();
    if artwork_source_path.is_empty() {
        return Err("library.error.emptyArtworkPath".to_owned());
    }

    let database_path = required_app_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    let existing_track = load_track_for_update(&connection, request.track_id.clone())?;
    let artwork_bytes = fs::read(artwork_source_path).map_err(to_error_string)?;
    let picture = make_front_cover_picture(artwork_bytes.clone())?;

    write_track_artwork_to_file(&existing_track.file_path, picture)?;

    let library_root = current_library_root(app)?;
    let artwork_dir = artwork_cache_dir_for_root(&library_root)?;
    fs::create_dir_all(&artwork_dir).map_err(to_error_string)?;
    allow_asset_directory(app, &artwork_dir)?;
    let cached_artwork_path = write_artwork_bytes(
        &artwork_bytes,
        &artwork_dir,
        &format!(
            "album-{}-{}",
            existing_track.album_group_key,
            stable_hash(artwork_source_path)
        ),
    )?;

    persist_track_artwork_update(
        &mut connection,
        &existing_track.album_group_key,
        &cached_artwork_path,
    )?;

    Ok(TrackArtworkUpdateResult {
        track_id: existing_track.uuid,
        album_id: existing_track.album_group_key,
        artwork_path: cached_artwork_path,
    })
}

pub fn update_album_artwork(
    app: &AppHandle,
    request: AlbumArtworkUpdateRequest,
) -> Result<AlbumArtworkUpdateResult, String> {
    let artwork_source_path = request.artwork_path.trim();
    if artwork_source_path.is_empty() {
        return Err("library.error.emptyArtworkPath".to_owned());
    }

    let database_path = required_app_database_path(app)?;
    let mut connection = open_database(&database_path)?;
    load_album_for_update(&connection, request.album_id.clone())?;
    let track_paths = load_track_paths(&connection, request.album_id.clone())?;

    if track_paths.is_empty() {
        return Err(format!(
            "library.error.albumHasNoTracks\t{}",
            request.album_id.clone()
        ));
    }

    let artwork_bytes = fs::read(artwork_source_path).map_err(to_error_string)?;
    make_front_cover_picture(artwork_bytes.clone())?;

    let mut updated_files = 0usize;
    let mut failed_files = Vec::new();
    for file_path in track_paths {
        match make_front_cover_picture(artwork_bytes.clone())
            .and_then(|picture| write_track_artwork_to_file(&file_path, picture))
        {
            Ok(()) => updated_files += 1,
            Err(reason) => failed_files.push(TagWriteFailure { file_path, reason }),
        }
    }

    if updated_files == 0 {
        return Err(format!(
            "library.error.albumArtworkWriteFailed\t{}",
            request.album_id
        ));
    }

    let library_root = current_library_root(app)?;
    let artwork_dir = artwork_cache_dir_for_root(&library_root)?;
    fs::create_dir_all(&artwork_dir).map_err(to_error_string)?;
    allow_asset_directory(app, &artwork_dir)?;
    let cached_artwork_path = write_artwork_bytes(
        &artwork_bytes,
        &artwork_dir,
        &format!(
            "album-{}-{}",
            request.album_id,
            stable_hash(artwork_source_path)
        ),
    )?;

    persist_track_artwork_update(&mut connection, &request.album_id, &cached_artwork_path)?;

    Ok(AlbumArtworkUpdateResult {
        album_id: request.album_id,
        artwork_path: cached_artwork_path,
        updated_files,
        failed_files,
    })
}

pub fn update_track_user_state(
    app: &AppHandle,
    request: TrackUserStateUpdateRequest,
) -> Result<TrackUserStateUpdateResult, String> {
    if let Some(rating) = request.rating {
        if !(1..=5).contains(&rating) {
            return Err("library.error.invalidRating".to_owned());
        }
    }

    let database_path = required_app_database_path(app)?;
    let connection = open_database(&database_path)?;
    connection
        .execute(
            "INSERT INTO track_user_state (track_uuid, is_favorite, rating, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(track_uuid) DO UPDATE SET
                is_favorite = excluded.is_favorite,
                rating = excluded.rating,
                updated_at = excluded.updated_at",
            params![
                request.track_id,
                if request.is_favorite { 1 } else { 0 },
                request.rating,
                unix_timestamp_millis()?.to_string(),
            ],
        )
        .map_err(|error| format!("library.error.userStateWrite\t{error}"))?;

    let result = TrackUserStateUpdateResult {
        track_id: request.track_id,
        is_favorite: request.is_favorite,
        rating: request.rating,
    };
    drop(connection);
    crate::search_index::schedule_refresh(app, true);
    Ok(result)
}

pub(super) fn load_album_for_update(
    connection: &Connection,
    album_id: String,
) -> Result<ExistingAlbum, String> {
    connection
        .query_row(
            "SELECT group_key, artist FROM albums WHERE group_key = ?1",
            [album_id.as_str()],
            |row| {
                Ok(ExistingAlbum {
                    group_key: row.get(0)?,
                    artist: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(to_error_string)?
        .ok_or_else(|| format!("library.error.albumNotFound\t{album_id}"))
}

pub(super) fn load_track_paths(
    connection: &Connection,
    album_id: String,
) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare("SELECT file_path FROM tracks WHERE album_group_key = ?1 ORDER BY uuid")
        .map_err(to_error_string)?;
    let rows = statement
        .query_map([album_id.as_str()], |row| row.get::<_, String>(0))
        .map_err(to_error_string)?;

    rows.collect::<Result<Vec<_>, _>>().map_err(to_error_string)
}

pub(super) fn load_track_for_update(
    connection: &Connection,
    track_id: String,
) -> Result<ExistingTrack, String> {
    connection
        .query_row(
            "SELECT uuid, album_group_key, file_path FROM tracks WHERE uuid = ?1",
            [track_id.as_str()],
            |row| {
                Ok(ExistingTrack {
                    uuid: row.get(0)?,
                    album_group_key: row.get(1)?,
                    file_path: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(to_error_string)?
        .ok_or_else(|| format!("library.error.trackNotFound\t{track_id}"))
}

pub(super) fn load_existing_file_states(
    connection: &Connection,
) -> Result<HashMap<String, ExistingFileState>, String> {
    let mut statement = connection
        .prepare("SELECT uuid, file_mtime, file_size, file_md5 FROM tracks")
        .map_err(to_error_string)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                ExistingFileState {
                    file_mtime: row.get(1)?,
                    file_size: row.get(2)?,
                    file_md5: row.get(3)?,
                },
            ))
        })
        .map_err(to_error_string)?;

    rows.collect::<Result<HashMap<_, _>, _>>()
        .map_err(to_error_string)
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

pub(super) fn write_track_artwork_to_file(file_path: &str, picture: Picture) -> Result<(), String> {
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

pub(super) fn persist_album_tag_update(
    connection: &mut Connection,
    existing_album: &ExistingAlbum,
    updated_paths: &[String],
    album_title: &str,
    album_artist: &str,
    artist: &str,
    year: Option<i64>,
    genre: &str,
) -> Result<String, String> {
    let transaction = connection.transaction().map_err(to_error_string)?;
    let display_album_artist = if album_artist.is_empty() {
        existing_album.artist.as_str()
    } else {
        album_artist
    };
    let next_album_key = normalize_group_key(album_title);
    let next_track_artist = if artist.is_empty() {
        existing_album.artist.as_str()
    } else {
        artist
    };
    let next_genre = (!genre.is_empty()).then_some(genre);
    let next_year_label = year.map(|value| value.to_string());
    transaction
        .execute(
            "INSERT INTO albums (group_key, title, artist, year, year_label, genre, artwork_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT artwork_path FROM albums WHERE group_key = ?7))
             ON CONFLICT(group_key) DO UPDATE SET
                title = excluded.title,
                artist = excluded.artist,
                year = excluded.year,
                year_label = excluded.year_label,
                genre = excluded.genre,
                artwork_path = COALESCE(albums.artwork_path, excluded.artwork_path)",
            params![
                next_album_key,
                album_title,
                display_album_artist,
                year,
                next_year_label,
                next_genre,
                existing_album.group_key,
            ],
        )
        .map_err(to_error_string)?;

    for file_path in updated_paths {
        transaction
            .execute(
                "UPDATE tracks SET album_group_key = ?1, artist = ?2 WHERE file_path = ?3",
                params![next_album_key, next_track_artist, file_path],
            )
            .map_err(to_error_string)?;
    }

    let remaining_source_tracks = transaction
        .query_row(
            "SELECT COUNT(*) FROM tracks WHERE album_group_key = ?1",
            [existing_album.group_key.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .map_err(to_error_string)?;

    if remaining_source_tracks == 0 && existing_album.group_key != next_album_key {
        transaction
            .execute(
                "DELETE FROM albums WHERE group_key = ?1",
                [existing_album.group_key.as_str()],
            )
            .map_err(to_error_string)?;
    }

    transaction.commit().map_err(to_error_string)?;
    Ok(next_album_key)
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
                 album_group_key = ?3,
                 track_number = ?4,
                 disc_number = ?5
             WHERE uuid = ?6",
            params![
                title,
                next_artist,
                normalize_group_key(album_title),
                request.track_number,
                request.disc_number,
                existing_track.uuid
            ],
        )
        .map_err(to_error_string)?;

    transaction
        .execute(
            "INSERT INTO albums (group_key, title, artist, year, year_label, genre, artwork_path)
             VALUES (?1, ?2, COALESCE(?3, ''), ?4, ?5, ?6, (SELECT artwork_path FROM albums WHERE group_key = ?7))
             ON CONFLICT(group_key) DO UPDATE SET
                title = excluded.title,
                year = excluded.year,
                year_label = excluded.year_label,
                genre = excluded.genre,
                artwork_path = COALESCE(albums.artwork_path, excluded.artwork_path)",
            params![
                normalize_group_key(album_title),
                album_title,
                next_artist,
                request.year,
                next_year_label,
                next_genre,
                existing_track.album_group_key,
            ],
        )
        .map_err(to_error_string)?;

    transaction.commit().map_err(to_error_string)
}

fn persist_track_artwork_update(
    connection: &mut Connection,
    album_id: &str,
    artwork_path: &str,
) -> Result<(), String> {
    connection
        .execute(
            "UPDATE albums SET artwork_path = ?1 WHERE group_key = ?2",
            params![artwork_path, album_id],
        )
        .map_err(to_error_string)?;
    Ok(())
}

fn valid_year(year: i64) -> Option<u16> {
    (1..=9999).contains(&year).then_some(year as u16)
}
