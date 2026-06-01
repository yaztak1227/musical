mod library;

use library::{
    AlbumTagUpdateRequest, AlbumTagUpdateResult, LibrarySnapshot, ScanSummary,
    TrackArtworkUpdateRequest, TrackArtworkUpdateResult, TrackTagUpdateRequest,
    TrackTagUpdateResult,
};

#[tauri::command]
fn app_status() -> &'static str {
    "Musical desktop bridge is ready"
}

#[tauri::command]
fn library_snapshot(app: tauri::AppHandle) -> Result<LibrarySnapshot, String> {
    library::load_snapshot(&app)
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
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_status,
            library_snapshot,
            scan_music_folder,
            update_album_tags,
            update_track_artwork,
            update_track_tags
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
