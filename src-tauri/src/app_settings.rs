use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE_NAME: &str = "settings.json";

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub last_library_path: Option<String>,
    pub mcp_enabled: bool,
}

pub fn load(app: &AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let settings_text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&settings_text).map_err(|error| error.to_string())
}

pub fn save(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let settings_text =
        serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, settings_text).map_err(|error| error.to_string())
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(app_data_dir.join(SETTINGS_FILE_NAME))
}
