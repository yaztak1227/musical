use rusqlite::Connection;
use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
};
use tauri::AppHandle;

use super::{
    current_library_root, existing_artwork_path, load_album_for_update, load_snapshot,
    load_track_file_path_from_connection, load_tracks, open_database_for_read,
    playlist_dir_for_root, playlist_track_path, repair_mojibake, required_app_database_path,
    sniff_picture_extension, to_error_string, unique_playlist_id, unix_timestamp_millis,
    AddTrackToPlaylistRequest, AddTracksToPlaylistRequest, CreatePlaylistFromAlbumRequest,
    CreatePlaylistRequest, DeletePlaylistRequest, LibrarySnapshot, PlaylistArtworkUpdateRequest,
    PlaylistArtworkUpdateResult, PlaylistFile, PlaylistRecord, RemovePlaylistTrackRequest,
    RenamePlaylistRequest, ReorderPlaylistTrackRequest, TrackRecord, M3U_EXTENSIONS,
    PLAYLIST_EXTENSION, PLS_EXTENSION,
};

pub fn create_playlist_from_album(
    app: &AppHandle,
    request: CreatePlaylistFromAlbumRequest,
) -> Result<LibrarySnapshot, String> {
    let playlist_name = request.name.trim();
    if playlist_name.is_empty() {
        return Err("library.error.emptyPlaylistName".to_owned());
    }

    let library_root = current_library_root(app)?;
    let database_path = required_app_database_path(app)?;
    let connection = open_database_for_read(&database_path)?;
    let album = load_album_for_update(&connection, request.album_id.clone())?;
    let tracks = load_tracks(&connection, &album.group_key)?;
    if tracks.is_empty() {
        return Err(format!(
            "library.error.albumHasNoTracks\t{}",
            request.album_id
        ));
    }

    let playlist_dir = playlist_dir_for_root(&library_root);
    fs::create_dir_all(&playlist_dir).map_err(to_error_string)?;
    let playlist_id = unique_playlist_id(playlist_name, &playlist_dir);
    let file_path = playlist_dir.join(format!("{playlist_id}.{PLAYLIST_EXTENSION}"));
    let track_paths = tracks
        .iter()
        .map(|track| playlist_track_path(&library_root, &track.file_path))
        .collect();
    let playlist_file = PlaylistFile {
        version: 1,
        id: playlist_id,
        name: playlist_name.to_owned(),
        artwork_path: None,
        track_paths,
    };
    let bytes = serde_json::to_vec_pretty(&playlist_file).map_err(to_error_string)?;
    fs::write(&file_path, bytes).map_err(to_error_string)?;

    load_snapshot(app)
}

pub fn create_playlist(
    app: &AppHandle,
    request: CreatePlaylistRequest,
) -> Result<LibrarySnapshot, String> {
    let playlist_name = request.name.trim();
    if playlist_name.is_empty() {
        return Err("library.error.emptyPlaylistName".to_owned());
    }

    let library_root = current_library_root(app)?;
    let playlist_dir = playlist_dir_for_root(&library_root);
    fs::create_dir_all(&playlist_dir).map_err(to_error_string)?;
    let playlist_id = unique_generated_playlist_id(&playlist_dir)?;
    let file_path = playlist_dir.join(format!("{playlist_id}.{PLAYLIST_EXTENSION}"));
    let playlist_file = PlaylistFile {
        version: 1,
        id: playlist_id,
        name: playlist_name.to_owned(),
        artwork_path: None,
        track_paths: Vec::new(),
    };
    let bytes = serde_json::to_vec_pretty(&playlist_file).map_err(to_error_string)?;
    fs::write(&file_path, bytes).map_err(to_error_string)?;

    load_snapshot(app)
}

pub fn add_track_to_playlist(
    app: &AppHandle,
    request: AddTrackToPlaylistRequest,
) -> Result<LibrarySnapshot, String> {
    let library_root = current_library_root(app)?;
    let database_path = required_app_database_path(app)?;
    let connection = open_database_for_read(&database_path)?;
    let file_path = load_track_file_path_from_connection(&connection, &request.track_id)?;
    let (playlist_path, mut playlist_file) =
        editable_playlist_file_for_id(&library_root, &request.playlist_id)?;
    let track_path = playlist_track_path(&library_root, &file_path);

    if !playlist_file
        .track_paths
        .iter()
        .any(|existing_path| existing_path.replace('\\', "/") == track_path)
    {
        playlist_file.track_paths.push(track_path);
        let bytes = serde_json::to_vec_pretty(&playlist_file).map_err(to_error_string)?;
        fs::write(&playlist_path, bytes).map_err(to_error_string)?;
    }

    load_snapshot(app)
}

pub fn add_tracks_to_playlist(
    app: &AppHandle,
    request: AddTracksToPlaylistRequest,
) -> Result<LibrarySnapshot, String> {
    let library_root = current_library_root(app)?;
    let database_path = required_app_database_path(app)?;
    let connection = open_database_for_read(&database_path)?;
    let (playlist_path, mut playlist_file) =
        editable_playlist_file_for_id(&library_root, &request.playlist_id)?;
    let mut changed = false;

    for track_id in request.track_ids {
        let file_path = load_track_file_path_from_connection(&connection, &track_id)?;
        let track_path = playlist_track_path(&library_root, &file_path);
        if playlist_file
            .track_paths
            .iter()
            .any(|existing_path| existing_path.replace('\\', "/") == track_path)
        {
            continue;
        }

        playlist_file.track_paths.push(track_path);
        changed = true;
    }

    if changed {
        write_playlist_file(&playlist_path, &playlist_file)?;
    }

    load_snapshot(app)
}

pub fn rename_playlist(
    app: &AppHandle,
    request: RenamePlaylistRequest,
) -> Result<LibrarySnapshot, String> {
    let playlist_name = request.name.trim();
    if playlist_name.is_empty() {
        return Err("library.error.emptyPlaylistName".to_owned());
    }

    let library_root = current_library_root(app)?;
    let (playlist_path, mut playlist_file) =
        editable_playlist_file_for_id(&library_root, &request.playlist_id)?;
    playlist_file.name = playlist_name.to_owned();
    write_playlist_file(&playlist_path, &playlist_file)?;

    load_snapshot(app)
}

pub fn delete_playlist(
    app: &AppHandle,
    request: DeletePlaylistRequest,
) -> Result<LibrarySnapshot, String> {
    let library_root = current_library_root(app)?;
    let playlist_path = playlist_file_path_for_id(&library_root, &request.playlist_id)?;
    let playlist_stem = playlist_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default()
        .to_owned();

    let _ = fs::remove_file(&playlist_path);
    if let Some(parent) = playlist_path.parent() {
        for extension in ["jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff"] {
            let artwork_path = parent.join(format!("{playlist_stem}.{extension}"));
            if artwork_path.is_file() {
                let _ = fs::remove_file(artwork_path);
            }
        }
    }

    load_snapshot(app)
}

pub fn remove_playlist_track(
    app: &AppHandle,
    request: RemovePlaylistTrackRequest,
) -> Result<LibrarySnapshot, String> {
    let library_root = current_library_root(app)?;
    let (playlist_path, mut playlist_file) =
        editable_playlist_file_for_id(&library_root, &request.playlist_id)?;
    if request.track_index >= playlist_file.track_paths.len() {
        return Err(format!(
            "library.error.playlistTrackNotFound\t{}",
            request.track_index
        ));
    }

    playlist_file.track_paths.remove(request.track_index);
    write_playlist_file(&playlist_path, &playlist_file)?;

    load_snapshot(app)
}

pub fn reorder_playlist_track(
    app: &AppHandle,
    request: ReorderPlaylistTrackRequest,
) -> Result<LibrarySnapshot, String> {
    let library_root = current_library_root(app)?;
    let (playlist_path, mut playlist_file) =
        editable_playlist_file_for_id(&library_root, &request.playlist_id)?;
    if request.from_index >= playlist_file.track_paths.len()
        || request.to_index >= playlist_file.track_paths.len()
    {
        return Err("library.error.playlistTrackNotFound".to_owned());
    }
    if request.from_index != request.to_index {
        let track_path = playlist_file.track_paths.remove(request.from_index);
        playlist_file
            .track_paths
            .insert(request.to_index, track_path);
        write_playlist_file(&playlist_path, &playlist_file)?;
    }

    load_snapshot(app)
}

pub fn update_playlist_artwork(
    app: &AppHandle,
    request: PlaylistArtworkUpdateRequest,
) -> Result<PlaylistArtworkUpdateResult, String> {
    let library_root = current_library_root(app)?;
    update_playlist_artwork_file(&library_root, request)
}

pub(super) fn update_playlist_artwork_file(
    library_root: &Path,
    request: PlaylistArtworkUpdateRequest,
) -> Result<PlaylistArtworkUpdateResult, String> {
    let artwork_source_path = request.artwork_path.trim();
    if artwork_source_path.is_empty() {
        return Err("library.error.emptyArtworkPath".to_owned());
    }

    let artwork_bytes = fs::read(artwork_source_path).map_err(to_error_string)?;
    let extension = sniff_picture_extension(&artwork_bytes)
        .ok_or_else(|| "library.error.unsupportedArtwork".to_owned())?;

    let (playlist_path, mut playlist_file) =
        editable_playlist_file_for_id(&library_root, &request.playlist_id)?;
    let playlist_stem = playlist_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .ok_or_else(|| format!("library.error.playlistNotFound\t{}", request.playlist_id))?;
    let artwork_path = playlist_path.with_file_name(format!("{playlist_stem}.{extension}"));

    if let Some(previous_artwork_path) = playlist_file.artwork_path.as_deref() {
        let previous_path = Path::new(previous_artwork_path);
        if previous_path != artwork_path && previous_path.parent() == artwork_path.parent() {
            let _ = fs::remove_file(previous_path);
        }
    }

    fs::write(&artwork_path, artwork_bytes).map_err(to_error_string)?;
    playlist_file.artwork_path = Some(artwork_path.to_string_lossy().into_owned());
    let bytes = serde_json::to_vec_pretty(&playlist_file).map_err(to_error_string)?;
    fs::write(&playlist_path, bytes).map_err(to_error_string)?;

    Ok(PlaylistArtworkUpdateResult {
        playlist_id: playlist_file.id,
        artwork_path: artwork_path.to_string_lossy().into_owned(),
    })
}

pub(super) fn editable_playlist_file_for_id(
    library_root: &Path,
    playlist_id: &str,
) -> Result<(PathBuf, PlaylistFile), String> {
    let playlist_path = playlist_file_path_for_id(library_root, playlist_id)?;
    if !playlist_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case(PLAYLIST_EXTENSION))
        .unwrap_or(false)
    {
        return Err(format!("library.error.playlistReadOnly\t{playlist_id}"));
    }
    let playlist_file = read_mplaylist_file(&playlist_path)?;
    Ok((playlist_path, playlist_file))
}

pub(super) fn read_mplaylist_file(path: &Path) -> Result<PlaylistFile, String> {
    let text = fs::read_to_string(path).map_err(to_error_string)?;
    serde_json::from_str(&text).map_err(to_error_string)
}

pub(super) fn write_playlist_file(path: &Path, playlist_file: &PlaylistFile) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(playlist_file).map_err(to_error_string)?;
    fs::write(path, bytes).map_err(to_error_string)
}

pub(super) fn playlist_file_path_for_id(
    library_root: &Path,
    playlist_id: &str,
) -> Result<PathBuf, String> {
    let playlist_dir = playlist_dir_for_root(library_root);
    for extension in [PLAYLIST_EXTENSION, "m3u", "m3u8", PLS_EXTENSION] {
        let playlist_path = playlist_dir.join(format!("{playlist_id}.{extension}"));
        if playlist_path.is_file() {
            return Ok(playlist_path);
        }
    }
    Err(format!("library.error.playlistNotFound\t{playlist_id}"))
}

pub(super) fn unique_generated_playlist_id(playlist_dir: &Path) -> Result<String, String> {
    let base = format!("playlist-{}", unix_timestamp_millis()?);
    let mut candidate = base.clone();
    let mut suffix = 2usize;
    while playlist_dir
        .join(format!("{candidate}.{PLAYLIST_EXTENSION}"))
        .exists()
    {
        candidate = format!("{base}-{suffix}");
        suffix += 1;
    }
    Ok(candidate)
}

pub(super) fn load_all_tracks_by_playlist_path(
    library_root: &Path,
    connection: &Connection,
) -> Result<HashMap<String, TrackRecord>, String> {
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
             ORDER BY tracks.file_path COLLATE NOCASE",
        )
        .map_err(to_error_string)?;

    let rows = statement
        .query_map([], |row| {
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

    let mut tracks = HashMap::new();
    for track_result in rows {
        let track = track_result.map_err(to_error_string)?;
        tracks.insert(
            playlist_track_path(library_root, &track.file_path),
            track.clone(),
        );
        tracks.insert(track.file_path.replace('\\', "/"), track);
    }
    Ok(tracks)
}

pub(super) fn load_playlists(
    library_root: &Path,
    connection: &Connection,
) -> Result<Vec<PlaylistRecord>, String> {
    let playlist_dir = playlist_dir_for_root(library_root);
    if !playlist_dir.is_dir() {
        return Ok(Vec::new());
    }

    let tracks_by_path = load_all_tracks_by_playlist_path(library_root, connection)?;
    let mut playlists = Vec::new();
    for entry_result in fs::read_dir(&playlist_dir).map_err(to_error_string)? {
        let entry = entry_result.map_err(to_error_string)?;
        let path = entry.path();
        let is_playlist = is_supported_playlist_path(&path);
        if !is_playlist {
            continue;
        }

        let Some(playlist_file) = load_playlist_file_best_effort(library_root, &path) else {
            continue;
        };
        let mut missing_track_paths = Vec::new();
        let tracks = playlist_file
            .track_paths
            .iter()
            .filter_map(|track_path| {
                let normalized_path = track_path.replace('\\', "/");
                let track = tracks_by_path.get(&normalized_path).cloned();
                if track.is_none() {
                    missing_track_paths.push(normalized_path);
                }
                track
            })
            .collect::<Vec<_>>();
        playlists.push(PlaylistRecord {
            id: playlist_file.id,
            name: playlist_file.name,
            file_path: path.to_string_lossy().into_owned(),
            artwork_path: existing_artwork_path(playlist_file.artwork_path),
            track_count: playlist_file.track_paths.len(),
            missing_track_paths,
            tracks,
        });
    }

    playlists.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(playlists)
}

pub(super) fn is_supported_playlist_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case(PLAYLIST_EXTENSION)
                || extension.eq_ignore_ascii_case(PLS_EXTENSION)
                || M3U_EXTENSIONS
                    .iter()
                    .any(|m3u_extension| extension.eq_ignore_ascii_case(m3u_extension))
        })
        .unwrap_or(false)
}

pub(super) fn load_playlist_file_best_effort(
    library_root: &Path,
    path: &Path,
) -> Option<PlaylistFile> {
    let extension = path.extension().and_then(|extension| extension.to_str())?;
    let text = fs::read_to_string(path).ok()?;
    if extension.eq_ignore_ascii_case(PLAYLIST_EXTENSION) {
        serde_json::from_str(&text).ok()
    } else if extension.eq_ignore_ascii_case(PLS_EXTENSION) {
        Some(parse_pls_playlist(library_root, path, &text))
    } else if M3U_EXTENSIONS
        .iter()
        .any(|m3u_extension| extension.eq_ignore_ascii_case(m3u_extension))
    {
        Some(parse_m3u_playlist(library_root, path, &text))
    } else {
        None
    }
}

pub(super) fn parse_m3u_playlist(library_root: &Path, path: &Path, text: &str) -> PlaylistFile {
    let track_paths = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| normalize_playlist_entry_path(library_root, path, line))
        .collect();

    PlaylistFile {
        version: 1,
        id: playlist_id_from_path(path),
        name: playlist_name_from_path(path),
        artwork_path: None,
        track_paths,
    }
}

pub(super) fn parse_pls_playlist(library_root: &Path, path: &Path, text: &str) -> PlaylistFile {
    let mut entries = text
        .lines()
        .filter_map(|line| line.split_once('='))
        .filter_map(|(key, value)| {
            let key = key.trim().to_ascii_lowercase();
            let index = key.strip_prefix("file")?.parse::<usize>().ok()?;
            Some((
                index,
                normalize_playlist_entry_path(library_root, path, value.trim()),
            ))
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|(index, _)| *index);

    PlaylistFile {
        version: 1,
        id: playlist_id_from_path(path),
        name: playlist_name_from_path(path),
        artwork_path: None,
        track_paths: entries
            .into_iter()
            .map(|(_, track_path)| track_path)
            .collect(),
    }
}

pub(super) fn normalize_playlist_entry_path(
    library_root: &Path,
    playlist_path: &Path,
    entry: &str,
) -> String {
    let entry_path = Path::new(entry);
    let path = if entry_path.is_absolute() {
        entry_path.to_path_buf()
    } else {
        playlist_path
            .parent()
            .unwrap_or(library_root)
            .join(entry_path)
    };
    let normalized_path = normalize_lexical_path(&path);
    playlist_track_path(library_root, &normalized_path.to_string_lossy())
}

pub(super) fn normalize_lexical_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

pub(super) fn playlist_id_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.trim().is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("playlist-{}", unix_timestamp_millis().unwrap_or(0)))
}

pub(super) fn playlist_name_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.trim().is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| "Playlist".to_owned())
}
