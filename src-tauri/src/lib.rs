mod app_config;
mod app_settings;
mod atomic_file;
mod audio_analysis;
mod library;
mod local_server;

use library::{
    AddTrackToPlaylistRequest, AddTracksToPlaylistRequest, AlbumArtworkUpdateRequest,
    AlbumArtworkUpdateResult, AlbumTagUpdateRequest, AlbumTagUpdateResult,
    ArtworkCandidatePreviewRequest, ArtworkCandidatePreviewResult, ArtworkCandidateSearchRequest,
    ArtworkCandidateSearchResult, ArtworkReleaseInspectRequest, ArtworkReleaseInspectResult,
    CreatePlaylistFromAlbumRequest, CreatePlaylistRequest, DeletePlaylistRequest, LibrarySnapshot,
    PlaylistArtworkUpdateRequest, PlaylistArtworkUpdateResult, RemovePlaylistTrackRequest,
    RenamePlaylistRequest, ReorderPlaylistTrackRequest, ScanSummary, TrackArtworkUpdateRequest,
    TrackArtworkUpdateResult, TrackTagUpdateRequest, TrackTagUpdateResult,
    TrackUserStateUpdateRequest, TrackUserStateUpdateResult,
};
use log::{error, info, LevelFilter};

#[tauri::command]
fn app_status() -> &'static str {
    "Musical desktop bridge is ready"
}

#[tauri::command]
fn library_snapshot(app: tauri::AppHandle) -> Result<LibrarySnapshot, String> {
    library::load_snapshot(&app)
}

#[tauri::command]
fn track_lyrics(app: tauri::AppHandle, track_id: String) -> Result<Option<String>, String> {
    library::load_track_lyrics(&app, &track_id)
}

#[tauri::command]
fn scan_music_folder(app: tauri::AppHandle, folder_path: String) -> Result<ScanSummary, String> {
    library::scan_folder(&app, &folder_path)
}

#[tauri::command]
fn create_playlist(app: tauri::AppHandle, name: String) -> Result<LibrarySnapshot, String> {
    library::create_playlist(&app, CreatePlaylistRequest { name })
}

#[tauri::command]
fn add_track_to_playlist(
    app: tauri::AppHandle,
    playlist_id: String,
    track_id: String,
) -> Result<LibrarySnapshot, String> {
    library::add_track_to_playlist(
        &app,
        AddTrackToPlaylistRequest {
            playlist_id,
            track_id,
        },
    )
}

#[tauri::command]
fn add_tracks_to_playlist(
    app: tauri::AppHandle,
    playlist_id: String,
    track_ids: Vec<String>,
) -> Result<LibrarySnapshot, String> {
    library::add_tracks_to_playlist(
        &app,
        AddTracksToPlaylistRequest {
            playlist_id,
            track_ids,
        },
    )
}

#[tauri::command]
fn rename_playlist(
    app: tauri::AppHandle,
    playlist_id: String,
    name: String,
) -> Result<LibrarySnapshot, String> {
    library::rename_playlist(&app, RenamePlaylistRequest { playlist_id, name })
}

#[tauri::command]
fn delete_playlist(app: tauri::AppHandle, playlist_id: String) -> Result<LibrarySnapshot, String> {
    library::delete_playlist(&app, DeletePlaylistRequest { playlist_id })
}

#[tauri::command]
fn remove_playlist_track(
    app: tauri::AppHandle,
    playlist_id: String,
    track_index: usize,
) -> Result<LibrarySnapshot, String> {
    library::remove_playlist_track(
        &app,
        RemovePlaylistTrackRequest {
            playlist_id,
            track_index,
        },
    )
}

#[tauri::command]
fn reorder_playlist_track(
    app: tauri::AppHandle,
    playlist_id: String,
    from_index: usize,
    to_index: usize,
) -> Result<LibrarySnapshot, String> {
    library::reorder_playlist_track(
        &app,
        ReorderPlaylistTrackRequest {
            playlist_id,
            from_index,
            to_index,
        },
    )
}

#[tauri::command]
fn create_playlist_from_album(
    app: tauri::AppHandle,
    album_id: String,
    name: String,
) -> Result<LibrarySnapshot, String> {
    library::create_playlist_from_album(&app, CreatePlaylistFromAlbumRequest { album_id, name })
}

#[tauri::command]
fn update_album_tags(
    app: tauri::AppHandle,
    request: AlbumTagUpdateRequest,
) -> Result<AlbumTagUpdateResult, String> {
    library::update_album_tags(&app, request)
}

#[tauri::command]
fn update_track_tags(
    app: tauri::AppHandle,
    request: TrackTagUpdateRequest,
) -> Result<TrackTagUpdateResult, String> {
    library::update_track_tags(&app, request)
}

#[tauri::command]
fn update_track_artwork(
    app: tauri::AppHandle,
    request: TrackArtworkUpdateRequest,
) -> Result<TrackArtworkUpdateResult, String> {
    library::update_track_artwork(&app, request)
}

#[tauri::command]
fn update_album_artwork(
    app: tauri::AppHandle,
    request: AlbumArtworkUpdateRequest,
) -> Result<AlbumArtworkUpdateResult, String> {
    library::update_album_artwork(&app, request)
}

#[tauri::command]
async fn search_artwork_candidates(
    app: tauri::AppHandle,
    request: ArtworkCandidateSearchRequest,
) -> Result<ArtworkCandidateSearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || library::search_artwork_candidates(&app, request))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn preview_artwork_candidate(
    app: tauri::AppHandle,
    request: ArtworkCandidatePreviewRequest,
) -> Result<ArtworkCandidatePreviewResult, String> {
    tauri::async_runtime::spawn_blocking(move || library::preview_artwork_candidate(&app, request))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn inspect_artwork_release(
    app: tauri::AppHandle,
    request: ArtworkReleaseInspectRequest,
) -> Result<ArtworkReleaseInspectResult, String> {
    tauri::async_runtime::spawn_blocking(move || library::inspect_artwork_release(&app, request))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn update_playlist_artwork(
    app: tauri::AppHandle,
    request: PlaylistArtworkUpdateRequest,
) -> Result<PlaylistArtworkUpdateResult, String> {
    library::update_playlist_artwork(&app, request)
}

#[tauri::command]
fn update_track_user_state(
    app: tauri::AppHandle,
    request: TrackUserStateUpdateRequest,
) -> Result<TrackUserStateUpdateResult, String> {
    library::update_track_user_state(&app, request)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(LevelFilter::Info)
                .level_for("lofty::mpeg::properties", LevelFilter::Error)
                .build(),
        )
        .plugin(tauri_plugin_opener::init());

    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            info!("starting Musical desktop app");
            match local_server::start(app.handle().clone()) {
                Ok(url) => {
                    info!("local browser API is available at {url}");
                    eprintln!("local browser API is available at {url}");
                }
                Err(error) => {
                    error!("failed to start local browser API: {error}");
                    eprintln!("failed to start local browser API: {error}");
                }
            }

            #[cfg(debug_assertions)]
            {
                use tauri_plugin_opener::OpenerExt;

                if should_open_dev_browser() {
                    if let Err(error) = app.opener().open_url("http://localhost:1420", None::<&str>)
                    {
                        error!("failed to open controller browser: {error}");
                        eprintln!("failed to open controller browser: {error}");
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_track_to_playlist,
            add_tracks_to_playlist,
            app_status,
            create_playlist,
            create_playlist_from_album,
            delete_playlist,
            inspect_artwork_release,
            library_snapshot,
            preview_artwork_candidate,
            remove_playlist_track,
            rename_playlist,
            reorder_playlist_track,
            scan_music_folder,
            search_artwork_candidates,
            track_lyrics,
            update_album_artwork,
            update_album_tags,
            update_playlist_artwork,
            update_track_artwork,
            update_track_tags,
            update_track_user_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(debug_assertions)]
fn should_open_dev_browser() -> bool {
    let env_enabled = std::env::var("MUSICAL_OPEN_DEV_BROWSER")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false);
    env_enabled || std::env::args().any(|arg| arg == "--open-dev-browser")
}
