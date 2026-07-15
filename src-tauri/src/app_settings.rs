use crate::atomic_file;
use serde::{Deserialize, Serialize};
use std::{fs, sync::Mutex};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE_NAME: &str = "settings.json";
static SETTINGS_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub last_library_path: Option<String>,
    pub mcp_enabled: bool,
}

pub fn load(app: &AppHandle) -> Result<AppSettings, String> {
    let _guard = SETTINGS_LOCK.lock().map_err(|error| error.to_string())?;
    load_unlocked(app)
}

fn load_unlocked(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let settings_text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut settings: AppSettings =
        serde_json::from_str(&settings_text).map_err(|error| error.to_string())?;
    settings.last_library_path = settings
        .last_library_path
        .map(normalize_windows_extended_path_string);
    Ok(settings)
}

pub fn update(
    app: &AppHandle,
    update_settings: impl FnOnce(&mut AppSettings),
) -> Result<AppSettings, String> {
    let _guard = SETTINGS_LOCK.lock().map_err(|error| error.to_string())?;
    let mut settings = load_unlocked(app)?;
    update_settings(&mut settings);
    save_unlocked(app, &settings)?;
    Ok(settings)
}

fn save_unlocked(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let settings = AppSettings {
        last_library_path: settings
            .last_library_path
            .clone()
            .map(normalize_windows_extended_path_string),
        mcp_enabled: settings.mcp_enabled,
    };
    let settings_text =
        serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    atomic_file::write(&path, settings_text.as_bytes()).map_err(|error| error.to_string())
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(app_data_dir.join(SETTINGS_FILE_NAME))
}

#[cfg(windows)]
fn normalize_windows_extended_path_string(path: String) -> String {
    if let Some(stripped) = path.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{stripped}");
    }
    if let Some(stripped) = path.strip_prefix(r"\\?\") {
        return stripped.to_owned();
    }
    path
}

#[cfg(not(windows))]
fn normalize_windows_extended_path_string(path: String) -> String {
    path
}

#[cfg(all(test, windows))]
mod tests {
    use super::normalize_windows_extended_path_string;

    #[test]
    fn normalizes_windows_extended_drive_path() {
        assert_eq!(
            normalize_windows_extended_path_string(r"\\?\C:\Users\you\Music".to_owned()),
            r"C:\Users\you\Music"
        );
    }

    #[test]
    fn normalizes_windows_extended_unc_path() {
        assert_eq!(
            normalize_windows_extended_path_string(r"\\?\UNC\server\share\Music".to_owned()),
            r"\\server\share\Music"
        );
    }
}
