mod app_config;
mod audio_analysis;
mod library;
mod local_server;

use library::{
    AlbumTagUpdateRequest, AlbumTagUpdateResult, LibrarySnapshot, ScanSummary,
    TrackArtworkUpdateRequest, TrackArtworkUpdateResult, TrackTagUpdateRequest,
    TrackTagUpdateResult,
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
fn track_lyrics(app: tauri::AppHandle, track_id: i64) -> Result<Option<String>, String> {
    library::load_track_lyrics(&app, track_id)
}

#[tauri::command]
fn scan_music_folder(app: tauri::AppHandle, folder_path: String) -> Result<ScanSummary, String> {
    library::scan_folder(&app, &folder_path)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
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

                if let Err(error) = app.opener().open_url("http://localhost:1420", None::<&str>) {
                    error!("failed to open controller browser: {error}");
                    eprintln!("failed to open controller browser: {error}");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_status,
            library_snapshot,
            scan_music_folder,
            track_lyrics,
            update_album_tags,
            update_track_artwork,
            update_track_tags
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
