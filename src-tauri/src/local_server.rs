use crate::{
    app_config::{
        LOCAL_SERVER_ADDR, LOCAL_SERVER_PORT, MAX_REMOTE_COMMANDS, MAX_REQUEST_BODY_BYTES,
        RESPONSE_WRITE_CHUNK_SIZE,
    },
    app_settings, audio_analysis,
    library::{
        self, AddTrackToPlaylistRequest, AddTracksToPlaylistRequest, AlbumTagUpdateRequest,
        CreatePlaylistFromAlbumRequest, CreatePlaylistRequest, DeletePlaylistRequest,
        LoadPlaylistRequest, PlaylistArtworkUpdateRequest, RemovePlaylistTrackRequest,
        RenamePlaylistRequest, ReorderPlaylistTrackRequest, TrackArtworkUpdateRequest,
        TrackTagUpdateRequest, TrackUserStateUpdateRequest,
    },
    search_index::{
        self, LyricsMoodPlayRequest, LyricsMoodReference, LyricsMoodSearchRequest,
        LyricsMoodStatus, RecommendTracksRequest, SearchTracksRequest,
    },
};
use base64::{engine::general_purpose, Engine as _};
use include_dir::{include_dir, Dir};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs::{self, File},
    io::{Read, Seek, SeekFrom, Write},
    net::{Shutdown, TcpListener, TcpStream, UdpSocket},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Condvar, LockResult, Mutex, MutexGuard},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;

static FRONTEND_DIST: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

const MEDIA_EXTENSIONS: &[&str] = &[
    "aac", "aif", "aiff", "alac", "ape", "flac", "m4a", "m4b", "mka", "mp3", "mp4", "oga", "ogg",
    "opus", "wav", "wma", "jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "webp",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanMusicFolderRequest {
    folder_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrackLyricsRequest {
    track_id: String,
}

#[derive(Debug, Deserialize)]
struct AlbumTagRequestBody {
    request: AlbumTagUpdateRequest,
}

#[derive(Debug, Deserialize)]
struct TrackTagRequestBody {
    request: TrackTagUpdateRequest,
}

#[derive(Debug, Deserialize)]
struct TrackArtworkRequestBody {
    request: TrackArtworkUpdateRequest,
}

#[derive(Debug, Deserialize)]
struct PlaylistArtworkRequestBody {
    request: PlaylistArtworkUpdateRequest,
}

#[derive(Debug, Deserialize)]
struct TrackUserStateRequestBody {
    request: TrackUserStateUpdateRequest,
}

#[derive(Debug, Deserialize)]
struct LocalDevAccessBody {
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct McpSettingsBody {
    enabled: bool,
}

#[derive(Debug, Deserialize)]
struct McpToolRequestBody {
    arguments: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpSettingsInfo {
    enabled: bool,
    url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalDevAccessInfo {
    available: bool,
    enabled: bool,
    host: Option<String>,
    port: u16,
    url: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RemotePlayerState {
    selected_album_id: Option<String>,
    playback_album_id: Option<String>,
    #[serde(default)]
    playback_playlist_id: Option<String>,
    current_track_id: Option<String>,
    queue_track_ids: Vec<String>,
    is_playing: bool,
    is_shuffle: bool,
    repeat_mode: String,
    current_time: f64,
    volume: f64,
}

#[derive(Debug, Deserialize)]
struct RemotePlayerStateBody {
    state: RemotePlayerState,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteAudioAnalysisSegment {
    frame_interval_ms: f64,
    frames: Vec<audio_analysis::AudioAnalysisFrame>,
    is_complete: bool,
    track_id: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RemotePlayerCommand {
    command_type: String,
    payload: Option<Value>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct QueuedRemotePlayerCommand {
    id: u64,
    command_type: String,
    payload: Option<Value>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TvPlayerEventBody {
    session_id: Option<String>,
    event: Value,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DisplayDevice {
    id: String,
    display_name: String,
    aliases: Vec<String>,
    kind: String,
    room: Option<String>,
    online: bool,
    last_used_at: Option<String>,
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterDisplayDeviceBody {
    device: DisplayDevice,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveDisplayDeviceBody {
    query: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayDeviceResolution {
    device: DisplayDevice,
    score: f64,
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FireTvLaunchBody {
    device_id: Option<String>,
    display_url: Option<String>,
    session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FireTvVoiceCommandBody {
    utterance: String,
    device_query: Option<String>,
    display_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemotePlayerCommandsResponse {
    commands: Vec<QueuedRemotePlayerCommand>,
    has_gap: bool,
    latest_id: u64,
    oldest_available_id: Option<u64>,
}

#[derive(Default)]
struct RemoteServerState {
    local_access_enabled: bool,
    mcp_enabled: bool,
    mcp_bridge_token: String,
    mcp_sidecar: Option<McpSidecar>,
    next_command_id: u64,
    player_state: Option<RemotePlayerState>,
    player_state_captured_at_ms: Option<f64>,
    commands: VecDeque<QueuedRemotePlayerCommand>,
    active_track_analysis_loads: HashSet<String>,
    active_track_analysis_prefetches: HashSet<String>,
    display_devices: HashMap<String, DisplayDevice>,
    last_tv_player_event: Option<TvPlayerEventBody>,
    recently_played_track_ids: VecDeque<String>,
}

struct McpSidecar {
    child: Child,
    port: u16,
}

fn apply_remote_command_to_player_state(
    player_state: &mut Option<RemotePlayerState>,
    command: &RemotePlayerCommand,
) {
    match command.command_type.as_str() {
        "play" => {
            if let Some(state) = player_state.as_mut() {
                state.is_playing = state.current_track_id.is_some();
            }
            return;
        }
        "pause" => {
            if let Some(state) = player_state.as_mut() {
                state.is_playing = false;
            }
            return;
        }
        "toggle-playback" => {
            if let Some(state) = player_state.as_mut() {
                state.is_playing = !state.is_playing && state.current_track_id.is_some();
            }
            return;
        }
        _ => {}
    }
    let Some(payload) = command.payload.as_ref() else {
        return;
    };
    if player_state.is_none()
        && matches!(
            command.command_type.as_str(),
            "clear-queue" | "play-album" | "play-track" | "select-album" | "set-queue"
        )
    {
        *player_state = Some(empty_remote_player_state());
    }
    let Some(state) = player_state.as_mut() else {
        return;
    };

    match command.command_type.as_str() {
        "cycle-repeat" => {
            if let Some(repeat_mode) = payload
                .get("repeatMode")
                .and_then(Value::as_str)
                .filter(|value| matches!(*value, "off" | "all" | "one"))
            {
                state.repeat_mode = repeat_mode.to_string();
            }
        }
        "toggle-shuffle" => {
            if let Some(is_shuffle) = payload.get("isShuffle").and_then(Value::as_bool) {
                state.is_shuffle = is_shuffle;
            }
            if let Some(queue_track_ids) = payload.get("queueTrackIds").and_then(Value::as_array) {
                state.queue_track_ids = queue_track_ids
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect();
            }
        }
        "set-queue" => {
            if let Some(queue_track_ids) = payload.get("queueTrackIds").and_then(Value::as_array) {
                state.queue_track_ids = queue_track_ids
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect();
            }
            state.current_track_id = payload
                .get("currentTrackId")
                .and_then(Value::as_str)
                .map(str::to_owned)
                .or_else(|| state.queue_track_ids.first().cloned());
            state.playback_album_id = None;
            state.playback_playlist_id = None;
            state.is_playing = payload
                .get("isPlaying")
                .or_else(|| payload.get("play"))
                .and_then(Value::as_bool)
                .unwrap_or_else(|| state.current_track_id.is_some());
            state.current_time = 0.0;
        }
        "clear-queue" => {
            state.queue_track_ids.clear();
            state.current_track_id = None;
            state.playback_album_id = None;
            state.playback_playlist_id = None;
            state.is_playing = false;
            state.current_time = 0.0;
        }
        "play-album" => {
            state.playback_playlist_id = None;
            if let Some(album_id) = payload.get("albumId").and_then(Value::as_str) {
                state.playback_album_id = Some(album_id.to_owned());
                state.selected_album_id = Some(album_id.to_owned());
            }
            if let Some(queue_track_ids) = payload.get("queueTrackIds").and_then(Value::as_array) {
                state.queue_track_ids = queue_track_ids
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect();
            }
            state.current_track_id = state.queue_track_ids.first().cloned();
            state.is_playing = state.current_track_id.is_some();
            state.current_time = 0.0;
        }
        "play-track" => {
            state.playback_playlist_id = payload
                .get("playlistId")
                .and_then(Value::as_str)
                .map(str::to_owned);
            if let Some(album_id) = payload.get("albumId").and_then(Value::as_str) {
                state.playback_album_id = Some(album_id.to_owned());
            }
            if let Some(queue_track_ids) = payload.get("queueTrackIds").and_then(Value::as_array) {
                state.queue_track_ids = queue_track_ids
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect();
            }
            if let Some(track_id) = payload.get("trackId").and_then(Value::as_str) {
                state.current_track_id = Some(track_id.to_owned());
                if !state.queue_track_ids.iter().any(|id| id == track_id) {
                    state.queue_track_ids.insert(0, track_id.to_owned());
                }
            }
            state.is_playing = state.current_track_id.is_some();
            state.current_time = 0.0;
        }
        "select-album" => {
            if let Some(album_id) = payload.get("albumId").and_then(Value::as_str) {
                state.selected_album_id = Some(album_id.to_owned());
            }
        }
        _ => {}
    }
}

fn empty_remote_player_state() -> RemotePlayerState {
    RemotePlayerState {
        selected_album_id: None,
        playback_album_id: None,
        playback_playlist_id: None,
        current_track_id: None,
        queue_track_ids: Vec::new(),
        is_playing: false,
        is_shuffle: false,
        repeat_mode: "off".to_owned(),
        current_time: 0.0,
        volume: 0.85,
    }
}

struct RemoteServerStateStore {
    state: Mutex<RemoteServerState>,
    track_analysis_finished: Condvar,
}

impl RemoteServerStateStore {
    fn new(state: RemoteServerState) -> Self {
        Self {
            state: Mutex::new(state),
            track_analysis_finished: Condvar::new(),
        }
    }

    fn lock(&self) -> LockResult<MutexGuard<'_, RemoteServerState>> {
        self.state.lock()
    }
}

type SharedRemoteServerState = Arc<RemoteServerStateStore>;

struct Request {
    method: String,
    path: String,
    query: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
    is_local: bool,
}

pub fn start(app: AppHandle) -> Result<String, String> {
    let listener = TcpListener::bind(LOCAL_SERVER_ADDR).map_err(|error| error.to_string())?;
    let url = format!("http://{LOCAL_SERVER_ADDR}");
    let mut initial_state = RemoteServerState::default();
    initial_state.mcp_enabled = app_settings::load(&app)
        .map(|settings| settings.mcp_enabled)
        .unwrap_or(false);
    initial_state.mcp_bridge_token = generate_mcp_bridge_token();
    let should_start_mcp = initial_state.mcp_enabled;
    let remote_state = Arc::new(RemoteServerStateStore::new(initial_state));
    if should_start_mcp {
        if let Err(error) = ensure_mcp_sidecar(&app, &remote_state) {
            error!("failed to start MCP sidecar: {error}");
            eprintln!("failed to start MCP sidecar: {error}");
        }
    }
    info!("local server listening on {LOCAL_SERVER_ADDR}");

    thread::spawn(move || {
        for stream in listener.incoming() {
            let app = app.clone();
            let remote_state = remote_state.clone();
            match stream {
                Ok(stream) => {
                    thread::spawn(move || {
                        if let Err(error) = handle_connection(stream, app, remote_state) {
                            error!("local server request failed: {error}");
                            eprintln!("local server request failed: {error}");
                        }
                    });
                }
                Err(error) => {
                    error!("local server connection failed: {error}");
                    eprintln!("local server connection failed: {error}");
                }
            }
        }
    });

    Ok(url)
}

fn handle_connection(
    mut stream: TcpStream,
    app: AppHandle,
    remote_state: SharedRemoteServerState,
) -> Result<(), String> {
    let is_local = stream
        .peer_addr()
        .map(|address| address.ip().is_loopback())
        .unwrap_or(false);
    let request = read_request(&mut stream, is_local)?;
    if is_websocket_request(&request) && request.path.starts_with("/tv/sessions/") {
        if !request.is_local && !is_local_access_enabled(&remote_state) {
            stream
                .write_all(&text_response(403, "remote access is private"))
                .map_err(|error| error.to_string())?;
            let _ = stream.shutdown(Shutdown::Write);
            return Ok(());
        }
        return handle_tv_session_websocket(stream, request, app, remote_state);
    }
    let response = route_request(request, app, remote_state);
    for chunk in response.chunks(RESPONSE_WRITE_CHUNK_SIZE) {
        stream.write_all(chunk).map_err(|error| error.to_string())?;
        stream.flush().map_err(|error| error.to_string())?;
    }
    let _ = stream.shutdown(Shutdown::Write);
    Ok(())
}

fn read_request(stream: &mut TcpStream, is_local: bool) -> Result<Request, String> {
    let mut buffer = Vec::new();
    let mut chunk = [0; 1024];
    let header_end;

    loop {
        let read = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("connection closed before request headers".to_owned());
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(position) = find_subsequence(&buffer, b"\r\n\r\n") {
            header_end = position + 4;
            break;
        }
        if buffer.len() > 64 * 1024 {
            return Err("request headers are too large".to_owned());
        }
    }

    let header_text = String::from_utf8_lossy(&buffer[..header_end]);
    let mut lines = header_text.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "missing request line".to_owned())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| "missing request method".to_owned())?
        .to_owned();
    let target = request_parts
        .next()
        .ok_or_else(|| "missing request target".to_owned())?;
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key.trim().to_ascii_lowercase(), value.trim().to_owned()))
        .collect::<HashMap<_, _>>();
    let content_length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > MAX_REQUEST_BODY_BYTES {
        return Err(format!(
            "request body exceeds {MAX_REQUEST_BODY_BYTES} bytes"
        ));
    }

    let mut body = buffer[header_end..].to_vec();
    while body.len() < content_length {
        let read = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..read]);
    }
    body.truncate(content_length);

    let (path, query) = target
        .split_once('?')
        .map(|(path, query)| (path.to_owned(), query.to_owned()))
        .unwrap_or_else(|| (target.to_owned(), String::new()));

    Ok(Request {
        method,
        path,
        query,
        headers,
        body,
        is_local,
    })
}

fn route_request(
    request: Request,
    app: AppHandle,
    remote_state: SharedRemoteServerState,
) -> Vec<u8> {
    if !is_allowed_request_origin(&request) {
        return text_response(403, "request origin is not allowed");
    }
    if request.method == "OPTIONS" {
        return empty_response(204);
    }

    if !request.is_local && !is_local_access_enabled(&remote_state) {
        return text_response(403, "remote access is private");
    }

    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/api/local-dev-access") => result_response(local_access_info(&remote_state)),
        ("GET", "/api/mcp-settings") => {
            if !request.is_local {
                return text_response(403, "MCP settings are only available locally");
            }

            result_response(mcp_settings_info(&remote_state))
        }
        ("POST", "/api/mcp-settings") => {
            if !request.is_local {
                return text_response(403, "MCP settings are only available locally");
            }

            let request_body = parse_json::<McpSettingsBody>(&request.body);
            let result = request_body.and_then(|body| {
                app_settings::update(&app, |settings| settings.mcp_enabled = body.enabled)?;
                set_mcp_enabled(&app, &remote_state, body.enabled)?;
                mcp_settings_info(&remote_state)
            });
            result_response(result)
        }
        ("POST", "/api/local-dev-access") => {
            if !request.is_local {
                return text_response(403, "remote access settings are only available locally");
            }

            let request_body = parse_json::<LocalDevAccessBody>(&request.body);
            let result = request_body.and_then(|body| {
                if body.enabled && lan_ipv4_address().is_none() {
                    return Err("No LAN address is available".to_owned());
                }

                let mut state = remote_state.lock().map_err(|error| error.to_string())?;
                state.local_access_enabled = body.enabled;
                drop(state);
                local_access_info(&remote_state)
            });
            result_response(result)
        }
        ("GET", "/api/app_status") => json_response(200, &"Musical desktop bridge is ready"),
        ("GET", "/api/tv/libraries") => result_response(load_tv_libraries(&app)),
        ("GET", "/api/tv/devices") => result_response(list_display_devices(&remote_state)),
        ("POST", "/api/tv/devices") => {
            let request_body = parse_json::<RegisterDisplayDeviceBody>(&request.body);
            result_response(
                request_body.and_then(|body| register_display_device(&remote_state, body.device)),
            )
        }
        ("POST", "/api/tv/devices/resolve") => {
            let request_body = parse_json::<ResolveDisplayDeviceBody>(&request.body);
            result_response(
                request_body.and_then(|body| resolve_display_device(&remote_state, &body.query)),
            )
        }
        ("POST", "/api/tv/dial_launch") => {
            let request_body = parse_json::<FireTvLaunchBody>(&request.body);
            result_response(
                request_body.and_then(|body| prepare_fire_tv_launch(&remote_state, body)),
            )
        }
        ("POST", "/api/tv/voice_command") => {
            let request_body = parse_json::<FireTvVoiceCommandBody>(&request.body);
            result_response(
                request_body.and_then(|body| enqueue_fire_tv_voice_command(&remote_state, body)),
            )
        }
        ("POST", "/api/tv/player_event") => {
            let request_body = parse_json::<TvPlayerEventBody>(&request.body);
            result_response(
                request_body.and_then(|body| record_tv_player_event(&remote_state, body)),
            )
        }
        ("GET", "/api/library_snapshot") => {
            let library_id =
                query_param(&request.query, "libraryId").filter(|value| !value.trim().is_empty());
            result_response(load_library_snapshot(&app, library_id.as_deref()))
        }
        ("POST", "/api/load_playlist") => {
            let request_body = parse_json::<LoadPlaylistRequest>(&request.body);
            result_response(
                request_body.and_then(|body| library::load_playlist(&app, &body.playlist_id)),
            )
        }
        ("GET", "/api/track_lyrics") => {
            let track_id = query_param(&request.query, "trackId")
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "library.error.trackNotFound\t".to_owned());
            result_response(
                track_id.and_then(|track_id| library::load_track_lyrics(&app, &track_id)),
            )
        }
        ("POST", "/api/track_lyrics") => {
            let request_body = parse_json::<TrackLyricsRequest>(&request.body);
            result_response(
                request_body.and_then(|body| library::load_track_lyrics(&app, &body.track_id)),
            )
        }
        ("GET", "/api/track_lyrics_analysis") | ("POST", "/api/track_lyrics_analysis") => {
            track_lyrics_analysis_response(&request, |track_id| {
                search_index::track_lyrics_analysis(&app, track_id)
            })
        }
        ("POST", "/api/scan_music_folder") => {
            let request_body = parse_json::<ScanMusicFolderRequest>(&request.body);
            result_response(
                request_body.and_then(|body| scan_music_folder(&app, &body.folder_path)),
            )
        }
        ("POST", "/api/create_playlist") => {
            let request_body = parse_json::<CreatePlaylistRequest>(&request.body);
            result_response(request_body.and_then(|body| library::create_playlist(&app, body)))
        }
        ("POST", "/api/add_track_to_playlist") => {
            let request_body = parse_json::<AddTrackToPlaylistRequest>(&request.body);
            result_response(
                request_body.and_then(|body| library::add_track_to_playlist(&app, body)),
            )
        }
        ("POST", "/api/add_tracks_to_playlist") => {
            let request_body = parse_json::<AddTracksToPlaylistRequest>(&request.body);
            result_response(
                request_body.and_then(|body| library::add_tracks_to_playlist(&app, body)),
            )
        }
        ("POST", "/api/rename_playlist") => {
            let request_body = parse_json::<RenamePlaylistRequest>(&request.body);
            result_response(request_body.and_then(|body| library::rename_playlist(&app, body)))
        }
        ("POST", "/api/delete_playlist") => {
            let request_body = parse_json::<DeletePlaylistRequest>(&request.body);
            result_response(request_body.and_then(|body| library::delete_playlist(&app, body)))
        }
        ("POST", "/api/remove_playlist_track") => {
            let request_body = parse_json::<RemovePlaylistTrackRequest>(&request.body);
            result_response(
                request_body.and_then(|body| library::remove_playlist_track(&app, body)),
            )
        }
        ("POST", "/api/reorder_playlist_track") => {
            let request_body = parse_json::<ReorderPlaylistTrackRequest>(&request.body);
            result_response(
                request_body.and_then(|body| library::reorder_playlist_track(&app, body)),
            )
        }
        ("POST", "/api/create_playlist_from_album") => {
            let request_body = parse_json::<CreatePlaylistFromAlbumRequest>(&request.body);
            result_response(
                request_body.and_then(|body| library::create_playlist_from_album(&app, body)),
            )
        }
        ("POST", "/api/update_album_tags") => {
            let request_body = parse_json::<AlbumTagRequestBody>(&request.body);
            result_response(
                request_body.and_then(|body| library::update_album_tags(&app, body.request)),
            )
        }
        ("POST", "/api/update_track_tags") => {
            let request_body = parse_json::<TrackTagRequestBody>(&request.body);
            result_response(
                request_body.and_then(|body| library::update_track_tags(&app, body.request)),
            )
        }
        ("POST", "/api/update_track_artwork") => {
            let request_body = parse_json::<TrackArtworkRequestBody>(&request.body);
            result_response(
                request_body.and_then(|body| library::update_track_artwork(&app, body.request)),
            )
        }
        ("POST", "/api/update_playlist_artwork") => {
            let request_body = parse_json::<PlaylistArtworkRequestBody>(&request.body);
            result_response(
                request_body.and_then(|body| library::update_playlist_artwork(&app, body.request)),
            )
        }
        ("POST", "/api/update_track_user_state") => {
            let request_body = parse_json::<TrackUserStateRequestBody>(&request.body);
            result_response(
                request_body.and_then(|body| library::update_track_user_state(&app, body.request)),
            )
        }
        ("GET", "/api/player_state") => {
            let response_sent_at_ms = current_unix_time_ms();
            let state_result = remote_state
                .lock()
                .map(|state| {
                    (
                        state.player_state.clone(),
                        state.player_state_captured_at_ms,
                    )
                })
                .map_err(|error| error.to_string());
            match state_result {
                Ok((state, captured_at_ms)) => {
                    let mut headers = vec![(
                        "X-Musical-Response-Sent-At-Ms".to_owned(),
                        response_sent_at_ms.to_string(),
                    )];
                    if let Some(captured_at_ms) = captured_at_ms {
                        headers.push((
                            "X-Musical-State-Captured-At-Ms".to_owned(),
                            captured_at_ms.to_string(),
                        ));
                    }
                    json_response_with_headers(200, &state, &headers)
                }
                Err(error) => text_response(500, &error),
            }
        }
        ("POST", "/api/player_state") => {
            let request_body = parse_json::<RemotePlayerStateBody>(&request.body);
            let result = request_body.and_then(|body| {
                let mut state = remote_state.lock().map_err(|error| error.to_string())?;
                if let Some(track_id) = body.state.current_track_id.clone() {
                    remember_recent_track(&mut state.recently_played_track_ids, track_id);
                }
                state.player_state_captured_at_ms = request
                    .headers
                    .get("x-musical-state-captured-at-ms")
                    .and_then(|value| value.parse::<f64>().ok())
                    .or_else(|| Some(current_unix_time_ms()));
                state.player_state = Some(body.state);
                Ok(true)
            });
            result_response(result)
        }
        ("GET", "/api/track_analysis") => {
            let result = get_track_analysis(&app, &request, &remote_state);
            result_response(result)
        }
        ("GET", "/api/track_analysis_bytes") => {
            let result = get_track_analysis_bytes(&app, &request, &remote_state);
            track_analysis_bytes_response(result)
        }
        ("POST", "/api/player_command") => {
            let request_body = parse_json::<RemotePlayerCommand>(&request.body);
            let result = request_body.and_then(|command| {
                let mut state = remote_state.lock().map_err(|error| error.to_string())?;
                apply_remote_command_to_player_state(&mut state.player_state, &command);
                state.next_command_id += 1;
                let queued_command = QueuedRemotePlayerCommand {
                    id: state.next_command_id,
                    command_type: command.command_type,
                    payload: command.payload,
                };
                state.commands.push_back(queued_command.clone());
                while state.commands.len() > MAX_REMOTE_COMMANDS {
                    state.commands.pop_front();
                }
                Ok(queued_command)
            });
            result_response(result)
        }
        ("POST", path) if path.starts_with("/api/_mcp/tools/") => {
            if !request.is_local {
                return text_response(403, "MCP bridge is only available locally");
            }
            if !is_valid_mcp_bridge_request(&request, &remote_state) {
                return text_response(403, "invalid MCP bridge token");
            }

            let Some(tool_name) = path.strip_prefix("/api/_mcp/tools/") else {
                return text_response(404, "not found");
            };
            let request_body = parse_json::<McpToolRequestBody>(&request.body);
            let result = request_body.and_then(|body| {
                call_musical_tool(
                    &app,
                    &remote_state,
                    tool_name,
                    body.arguments.unwrap_or_else(|| json!({})),
                )
            });
            result_response(result)
        }
        ("GET", "/api/player_commands") => {
            let after_id = query_param(&request.query, "after")
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(0);
            let commands = remote_state
                .lock()
                .map(|state| {
                    let oldest_available_id = state.commands.front().map(|command| command.id);
                    let commands = state
                        .commands
                        .iter()
                        .filter(|command| command.id > after_id)
                        .cloned()
                        .collect::<Vec<_>>();
                    RemotePlayerCommandsResponse {
                        commands,
                        has_gap: has_command_gap(after_id, oldest_available_id),
                        latest_id: state.next_command_id,
                        oldest_available_id,
                    }
                })
                .map_err(|error| error.to_string());
            result_response(commands)
        }
        ("GET", "/api/media") | ("HEAD", "/api/media") => {
            if let Some(path) = query_param(&request.query, "path") {
                match authorized_media_path(&app, &path) {
                    Ok(path) => file_response(&request, &path),
                    Err(error) => text_response(403, &error),
                }
            } else {
                text_response(400, "missing media path")
            }
        }
        ("POST", "/mcp") => {
            if !request.is_local {
                return text_response(403, "MCP is only available locally");
            }
            if !is_mcp_enabled(&remote_state) {
                return text_response(404, "MCP server is disabled");
            }

            proxy_mcp_request(&request, &app, &remote_state)
        }
        ("GET", path) if !path.starts_with("/api/") => frontend_response(path),
        _ => text_response(404, "not found"),
    }
}

fn track_lyrics_analysis_response<F>(request: &Request, analyze: F) -> Vec<u8>
where
    F: FnOnce(&str) -> Result<crate::lyrics_sentiment::TrackLyricsAnalysis, String>,
{
    let track_id = match request.method.as_str() {
        "GET" => query_param(&request.query, "trackId")
            .ok_or_else(|| "library.error.trackNotFound\t".to_owned()),
        "POST" => parse_json::<TrackLyricsRequest>(&request.body).map(|body| body.track_id),
        _ => Err("unsupported lyrics-analysis request method".to_owned()),
    }
    .and_then(|track_id| {
        if track_id.trim().is_empty() {
            Err("library.error.trackNotFound\t".to_owned())
        } else {
            Ok(track_id)
        }
    });

    result_response(track_id.and_then(|track_id| analyze(&track_id)))
}

fn has_command_gap(after_id: u64, oldest_available_id: Option<u64>) -> bool {
    after_id > 0
        && oldest_available_id
            .map(|oldest_id| oldest_id > after_id.saturating_add(1))
            .unwrap_or(false)
}

fn is_allowed_request_origin(request: &Request) -> bool {
    let Some(origin) = request.headers.get("origin") else {
        return true;
    };
    if matches!(
        origin.as_str(),
        "tauri://localhost" | "http://tauri.localhost" | "https://tauri.localhost"
    ) {
        return true;
    }

    let Ok(origin_url) = reqwest::Url::parse(origin) else {
        return false;
    };
    let Some(host) = request.headers.get("host") else {
        return false;
    };
    let Ok(host_url) = reqwest::Url::parse(&format!("http://{host}")) else {
        return false;
    };
    let trusted_host = match host_url.host_str() {
        Some("localhost") => true,
        Some(host) => host
            .parse::<std::net::IpAddr>()
            .map(|address| match address {
                std::net::IpAddr::V4(address) => address.is_loopback() || address.is_private(),
                std::net::IpAddr::V6(address) => address.is_loopback(),
            })
            .unwrap_or(false),
        None => false,
    };
    if !trusted_host {
        return false;
    }
    if origin_url.host_str() == host_url.host_str()
        && origin_url.port_or_known_default() == host_url.port_or_known_default()
    {
        return true;
    }

    matches!(
        (
            origin_url.scheme(),
            origin_url.host_str(),
            origin_url.port_or_known_default()
        ),
        ("http", Some("localhost" | "127.0.0.1"), Some(1420))
    )
}

fn authorized_media_path(app: &AppHandle, requested_path: &str) -> Result<PathBuf, String> {
    let library_root = app_settings::load(app)?
        .last_library_path
        .ok_or_else(|| "No music library is configured".to_owned())?;
    resolve_media_path(Path::new(&library_root), Path::new(requested_path))
}

fn resolve_media_path(library_root: &Path, requested_path: &Path) -> Result<PathBuf, String> {
    let canonical_root = fs::canonicalize(library_root).map_err(|error| error.to_string())?;
    let canonical_path = fs::canonicalize(requested_path).map_err(|error| error.to_string())?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Media path is outside the configured library".to_owned());
    }

    let extension = canonical_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "Media path has no supported extension".to_owned())?;
    if !MEDIA_EXTENSIONS.contains(&extension.as_str()) {
        return Err("Media type is not allowed".to_owned());
    }
    Ok(canonical_path)
}

fn is_local_access_enabled(remote_state: &SharedRemoteServerState) -> bool {
    remote_state
        .lock()
        .map(|state| state.local_access_enabled)
        .unwrap_or(false)
}

fn is_mcp_enabled(remote_state: &SharedRemoteServerState) -> bool {
    remote_state
        .lock()
        .map(|state| state.mcp_enabled)
        .unwrap_or(false)
}

fn mcp_settings_info(remote_state: &SharedRemoteServerState) -> Result<McpSettingsInfo, String> {
    Ok(McpSettingsInfo {
        enabled: is_mcp_enabled(remote_state),
        url: format!("http://127.0.0.1:{LOCAL_SERVER_PORT}/mcp"),
    })
}

fn set_mcp_enabled(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    enabled: bool,
) -> Result<(), String> {
    {
        let mut state = remote_state.lock().map_err(|error| error.to_string())?;
        state.mcp_enabled = enabled;
    }

    if enabled {
        ensure_mcp_sidecar(app, remote_state).map(|_| ())
    } else {
        stop_mcp_sidecar(remote_state);
        Ok(())
    }
}

fn ensure_mcp_sidecar(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
) -> Result<u16, String> {
    {
        let mut state = remote_state.lock().map_err(|error| error.to_string())?;
        if let Some(sidecar) = state.mcp_sidecar.as_mut() {
            match sidecar.child.try_wait() {
                Ok(Some(status)) => {
                    warn!("MCP sidecar exited with status {status}");
                    state.mcp_sidecar = None;
                }
                Ok(None) => return Ok(sidecar.port),
                Err(error) => {
                    warn!("failed to inspect MCP sidecar: {error}");
                    state.mcp_sidecar = None;
                }
            }
        }
    }

    let port = reserve_loopback_port()?;
    let script_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("dist")
        .join("mcp")
        .join("server.js");
    if !script_path.is_file() {
        return Err(format!(
            "MCP sidecar build is missing at {}. Run npm run build:mcp.",
            script_path.display()
        ));
    }

    let token = remote_state
        .lock()
        .map(|state| state.mcp_bridge_token.clone())
        .map_err(|error| error.to_string())?;
    let child = Command::new("node")
        .arg(&script_path)
        .current_dir(Path::new(env!("CARGO_MANIFEST_DIR")).join(".."))
        .env(
            "MUSICAL_MCP_BRIDGE_URL",
            format!("http://127.0.0.1:{LOCAL_SERVER_PORT}"),
        )
        .env("MUSICAL_MCP_PORT", port.to_string())
        .env("MUSICAL_MCP_TOKEN", token)
        .env("MUSICAL_MCP_VERSION", env!("CARGO_PKG_VERSION"))
        .env("MUSICAL_MCP_PARENT_WATCHDOG", "stdin")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("failed to start node MCP sidecar: {error}"))?;

    let mut state = remote_state.lock().map_err(|error| error.to_string())?;
    state.mcp_sidecar = Some(McpSidecar { child, port });
    drop(state);
    thread::sleep(Duration::from_millis(150));
    info!("MCP sidecar started on 127.0.0.1:{port}");

    let _ = app;
    Ok(port)
}

fn stop_mcp_sidecar(remote_state: &SharedRemoteServerState) {
    let sidecar = remote_state
        .lock()
        .ok()
        .and_then(|mut state| state.mcp_sidecar.take());
    if let Some(mut sidecar) = sidecar {
        if let Err(error) = sidecar.child.kill() {
            warn!("failed to stop MCP sidecar: {error}");
        }
        let _ = sidecar.child.wait();
    }
}

fn reserve_loopback_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| error.to_string())
}

fn generate_mcp_bridge_token() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let source = format!("{now}:{}", std::process::id());
    let mut hasher = Sha1::new();
    hasher.update(source.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn is_valid_mcp_bridge_request(request: &Request, remote_state: &SharedRemoteServerState) -> bool {
    let Some(token) = request.headers.get("x-musical-mcp-token") else {
        return false;
    };
    remote_state
        .lock()
        .map(|state| state.mcp_bridge_token == *token)
        .unwrap_or(false)
}

fn proxy_mcp_request(
    request: &Request,
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
) -> Vec<u8> {
    let port = match ensure_mcp_sidecar(app, remote_state) {
        Ok(port) => port,
        Err(error) => return text_response(503, &error),
    };
    let url = format!("http://127.0.0.1:{port}/mcp");
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60 * 30))
        .build()
    {
        Ok(client) => client,
        Err(error) => return text_response(500, &error.to_string()),
    };
    let mut builder = client.post(url).body(request.body.clone());
    if let Some(content_type) = request.headers.get("content-type") {
        builder = builder.header("content-type", content_type);
    }
    if let Some(accept) = request.headers.get("accept") {
        builder = builder.header("accept", accept);
    }
    for header_name in ["mcp-session-id", "mcp-protocol-version", "last-event-id"] {
        if let Some(value) = request.headers.get(header_name) {
            builder = builder.header(header_name, value);
        }
    }
    let proxied_response = match builder.send() {
        Ok(response) => response,
        Err(error) => return text_response(503, &error.to_string()),
    };
    let status = proxied_response.status().as_u16();
    let content_type = proxied_response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json")
        .to_owned();
    let extra_headers = ["mcp-session-id", "mcp-protocol-version"]
        .iter()
        .filter_map(|header_name| {
            proxied_response
                .headers()
                .get(*header_name)
                .and_then(|value| value.to_str().ok())
                .map(|value| ((*header_name).to_owned(), value.to_owned()))
        })
        .collect::<Vec<_>>();
    match proxied_response.bytes() {
        Ok(bytes) => response_with_headers(status, &content_type, bytes.as_ref(), &extra_headers),
        Err(error) => text_response(503, &error.to_string()),
    }
}

fn local_access_info(remote_state: &SharedRemoteServerState) -> Result<LocalDevAccessInfo, String> {
    let enabled = is_local_access_enabled(remote_state);
    let host = lan_ipv4_address();
    let url = enabled
        .then(|| {
            host.as_ref()
                .map(|host| format!("http://{host}:{LOCAL_SERVER_PORT}/"))
        })
        .flatten();

    Ok(LocalDevAccessInfo {
        available: enabled && host.is_some(),
        enabled,
        host,
        port: LOCAL_SERVER_PORT,
        url,
    })
}

fn load_library_snapshot(
    app: &AppHandle,
    library_id: Option<&str>,
) -> Result<library::LibrarySnapshot, String> {
    library::load_snapshot_for_tv_library(app, library_id)
}

fn load_tv_libraries(app: &AppHandle) -> Result<library::TvLibraryList, String> {
    library::load_tv_libraries(app)
}

fn scan_music_folder(app: &AppHandle, folder_path: &str) -> Result<library::ScanSummary, String> {
    library::scan_folder(app, folder_path)
}

fn enqueue_remote_command(
    remote_state: &SharedRemoteServerState,
    command_type: &str,
    payload: Option<Value>,
) -> Result<QueuedRemotePlayerCommand, String> {
    let command = RemotePlayerCommand {
        command_type: command_type.to_owned(),
        payload,
    };
    let mut state = remote_state.lock().map_err(|error| error.to_string())?;
    apply_remote_command_to_player_state(&mut state.player_state, &command);
    state.next_command_id += 1;
    let queued_command = QueuedRemotePlayerCommand {
        id: state.next_command_id,
        command_type: command.command_type,
        payload: command.payload,
    };
    state.commands.push_back(queued_command.clone());
    while state.commands.len() > MAX_REMOTE_COMMANDS {
        state.commands.pop_front();
    }
    Ok(queued_command)
}

fn remember_recent_track(recently_played_track_ids: &mut VecDeque<String>, track_id: String) {
    if recently_played_track_ids.front() == Some(&track_id) {
        return;
    }
    recently_played_track_ids.retain(|existing| existing != &track_id);
    recently_played_track_ids.push_front(track_id);
    while recently_played_track_ids.len() > 100 {
        recently_played_track_ids.pop_back();
    }
}

fn call_musical_tool(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    name: &str,
    arguments: Value,
) -> Result<Value, String> {
    match name {
        "get_player_state" => {
            let state = remote_state
                .lock()
                .map(|state| state.player_state.clone())
                .map_err(|error| error.to_string())?;
            Ok(json!({ "state": state }))
        }
        "get_library" => serde_json::to_value(load_library_snapshot(app, None)?)
            .map_err(|error| error.to_string()),
        "search_library" => search_library(app, &arguments),
        "get_search_index_status" => serde_json::to_value(search_index::index_status(app)?)
            .map_err(|error| error.to_string()),
        "build_search_index" => {
            serde_json::to_value(search_index::build_index(app)?).map_err(|error| error.to_string())
        }
        "search_tracks" => {
            let request = serde_json::from_value::<SearchTracksRequest>(arguments)
                .map_err(|error| error.to_string())?;
            serde_json::to_value(search_index::search_tracks(app, request)?)
                .map_err(|error| error.to_string())
        }
        "recommend_tracks" => {
            let request = serde_json::from_value::<RecommendTracksRequest>(arguments)
                .map_err(|error| error.to_string())?;
            serde_json::to_value(search_index::recommend_tracks(app, request)?)
                .map_err(|error| error.to_string())
        }
        "search_lyrics_by_mood" => {
            let request = serde_json::from_value::<LyricsMoodSearchRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let reference =
                lyrics_mood_reference(remote_state, request.relative_to_current.is_some())?;
            serde_json::to_value(search_index::search_lyrics_by_mood(
                app, request, reference,
            )?)
            .map_err(|error| error.to_string())
        }
        "play_lyrics_by_mood" => {
            let request = serde_json::from_value::<LyricsMoodPlayRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let reference =
                lyrics_mood_reference(remote_state, request.relative_to_current.is_some())?;
            finalize_lyrics_mood_playback(
                remote_state,
                search_index::recommend_lyrics_by_mood(app, request, reference)?,
            )
        }
        "get_library_summary" => library_summary(app),
        "list_albums" => list_albums(app, &arguments),
        "list_tracks" => list_tracks(app, &arguments),
        "get_album" => get_album(app, &arguments),
        "get_track" => get_track(app, &arguments),
        "find_artist" => find_artist(app, &arguments),
        "find_album" => find_album(app, &arguments),
        "get_queue" => get_queue(app, remote_state),
        "get_recently_played" => get_recently_played(app, remote_state, &arguments),
        "get_favorites" => get_favorites(app, &arguments),
        "get_track_lyrics" => {
            let track_id = required_string(&arguments, "trackId")?;
            Ok(
                json!({ "trackId": track_id, "lyrics": library::load_track_lyrics(app, &track_id)? }),
            )
        }
        "get_track_lyrics_analysis" => {
            let track_id = required_string(&arguments, "trackId")?;
            serde_json::to_value(search_index::track_lyrics_analysis(app, &track_id)?)
                .map_err(|error| error.to_string())
        }
        "play" => serde_json::to_value(enqueue_remote_command(remote_state, "play", None)?)
            .map_err(|error| error.to_string()),
        "pause" => serde_json::to_value(enqueue_remote_command(remote_state, "pause", None)?)
            .map_err(|error| error.to_string()),
        "toggle_playback" => serde_json::to_value(enqueue_remote_command(
            remote_state,
            "toggle-playback",
            None,
        )?)
        .map_err(|error| error.to_string()),
        "next_track" => serde_json::to_value(enqueue_remote_command(remote_state, "next", None)?)
            .map_err(|error| error.to_string()),
        "previous_track" => {
            serde_json::to_value(enqueue_remote_command(remote_state, "previous", None)?)
                .map_err(|error| error.to_string())
        }
        "seek" => {
            let time = required_f64(&arguments, "time")?.max(0.0);
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "seek",
                Some(json!({ "time": time })),
            )?)
            .map_err(|error| error.to_string())
        }
        "set_volume" => {
            let volume = required_f64(&arguments, "volume")?.clamp(0.0, 1.0);
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "set-volume",
                Some(json!({ "volume": volume })),
            )?)
            .map_err(|error| error.to_string())
        }
        "set_shuffle" => {
            let is_shuffle = required_bool_any(&arguments, &["enabled", "isShuffle"])?;
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "toggle-shuffle",
                Some(json!({ "isShuffle": is_shuffle })),
            )?)
            .map_err(|error| error.to_string())
        }
        "set_repeat" => {
            let repeat_mode = required_string_any(&arguments, &["mode", "repeatMode"])?;
            if !matches!(repeat_mode.as_str(), "off" | "all" | "one") {
                return Err("repeatMode must be off, all, or one".to_owned());
            }
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "cycle-repeat",
                Some(json!({ "repeatMode": repeat_mode })),
            )?)
            .map_err(|error| error.to_string())
        }
        "play_album" => {
            let album_id = required_string(&arguments, "albumId")?;
            let queue_track_ids = album_track_ids(app, &album_id)?;
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "play-album",
                Some(json!({ "albumId": album_id, "queueTrackIds": queue_track_ids })),
            )?)
            .map_err(|error| error.to_string())
        }
        "play_track" => {
            let track_id = required_string(&arguments, "trackId")?;
            let album_id = optional_string(&arguments, "albumId")
                .or_else(|| album_id_for_track(app, &track_id).ok().flatten());
            let mut payload = json!({ "trackId": track_id });
            if let Some(album_id) = album_id {
                let queue_track_ids =
                    album_queue_track_ids_starting_with(app, &album_id, &track_id)?;
                payload["albumId"] = json!(album_id);
                payload["queueTrackIds"] = json!(queue_track_ids);
            }
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "play-track",
                Some(payload),
            )?)
            .map_err(|error| error.to_string())
        }
        "play_artist" => play_artist(app, remote_state, &arguments),
        "play_search" => play_search(app, remote_state, &arguments),
        "set_queue" => set_queue(app, remote_state, &arguments),
        "clear_queue" => serde_json::to_value(enqueue_remote_command(
            remote_state,
            "clear-queue",
            Some(json!({ "queueTrackIds": [] })),
        )?)
        .map_err(|error| error.to_string()),
        "select_album" => {
            let album_id = required_string(&arguments, "albumId")?;
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "select-album",
                Some(json!({ "albumId": album_id })),
            )?)
            .map_err(|error| error.to_string())
        }
        "select_track" => {
            let track_id = required_string(&arguments, "trackId")?;
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "select-track",
                Some(json!({ "trackId": track_id })),
            )?)
            .map_err(|error| error.to_string())
        }
        "refresh_library" => serde_json::to_value(enqueue_remote_command(
            remote_state,
            "refresh-library",
            None,
        )?)
        .map_err(|error| error.to_string()),
        "scan_music_folder" => {
            let folder_path = required_string(&arguments, "folderPath")?;
            let result = scan_music_folder(app, &folder_path)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            Ok(json!({ "scan": result, "refreshCommand": refresh_command }))
        }
        "create_playlist" => {
            let request = serde_json::from_value::<CreatePlaylistRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::create_playlist(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            Ok(json!({ "snapshot": result, "refreshCommand": refresh_command }))
        }
        "add_track_to_playlist" => {
            let request = serde_json::from_value::<AddTrackToPlaylistRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::add_track_to_playlist(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            Ok(json!({ "snapshot": result, "refreshCommand": refresh_command }))
        }
        "delete_playlist" => {
            let request = serde_json::from_value::<DeletePlaylistRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::delete_playlist(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            Ok(json!({ "snapshot": result, "refreshCommand": refresh_command }))
        }
        "create_playlist_from_album" => {
            let request = serde_json::from_value::<CreatePlaylistFromAlbumRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::create_playlist_from_album(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            Ok(json!({ "snapshot": result, "refreshCommand": refresh_command }))
        }
        "update_album_tags" => {
            let request = serde_json::from_value::<AlbumTagUpdateRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::update_album_tags(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            Ok(json!({ "update": result, "refreshCommand": refresh_command }))
        }
        "update_track_tags" => {
            let request = serde_json::from_value::<TrackTagUpdateRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::update_track_tags(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            Ok(json!({ "update": result, "refreshCommand": refresh_command }))
        }
        "update_track_artwork" => {
            let request = serde_json::from_value::<TrackArtworkUpdateRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::update_track_artwork(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            Ok(json!({ "update": result, "refreshCommand": refresh_command }))
        }
        "update_playlist_artwork" => {
            let request = serde_json::from_value::<PlaylistArtworkUpdateRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::update_playlist_artwork(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            Ok(json!({ "update": result, "refreshCommand": refresh_command }))
        }
        "add_favorite" => update_favorite(app, remote_state, &arguments, true),
        "remove_favorite" => update_favorite(app, remote_state, &arguments, false),
        "update_track_user_state" => {
            let request = serde_json::from_value::<TrackUserStateUpdateRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::update_track_user_state(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            Ok(json!({ "update": result, "refreshCommand": refresh_command }))
        }
        _ => Err(format!("unknown tool: {name}")),
    }
}

fn search_library(app: &AppHandle, arguments: &Value) -> Result<Value, String> {
    let query = required_string(arguments, "query")?.to_lowercase();
    let limit = optional_i64(arguments, "limit").unwrap_or(20).clamp(1, 100) as usize;
    let snapshot = library::load_snapshot(app)?;
    let mut results = Vec::new();

    'albums: for album in snapshot.albums {
        let album_text = format!(
            "{} {} {} {}",
            album.title,
            album.artist,
            album.year_label.clone().unwrap_or_default(),
            album.genre.clone().unwrap_or_default()
        )
        .to_lowercase();

        if album_text.contains(&query) {
            results.push(json!({ "type": "album", "album": album }));
            if results.len() >= limit {
                break;
            }
            continue;
        }

        for track in album.tracks {
            let track_text = format!(
                "{} {} {} {} {}",
                album.title, album.artist, track.title, track.artist, track.file_path
            )
            .to_lowercase();
            if track_text.contains(&query) {
                results.push(json!({ "type": "track", "albumId": album.id, "albumTitle": album.title, "track": track }));
                if results.len() >= limit {
                    break 'albums;
                }
            }
        }
    }

    Ok(json!({ "query": query, "results": results }))
}

fn library_summary(app: &AppHandle) -> Result<Value, String> {
    let snapshot = library::load_snapshot(app)?;
    let artists = artist_summaries(&snapshot);
    let track_count = snapshot
        .albums
        .iter()
        .map(|album| album.tracks.len())
        .sum::<usize>();
    let favorite_count = snapshot
        .albums
        .iter()
        .flat_map(|album| album.tracks.iter())
        .filter(|track| track.is_favorite)
        .count();
    Ok(json!({
        "artistCount": artists.len(),
        "albumCount": snapshot.albums.len(),
        "trackCount": track_count,
        "favoriteCount": favorite_count,
        "playlistCount": snapshot.playlists.len(),
        "lastScanPath": snapshot.last_scan_path,
        "databasePath": snapshot.database_path,
        "isScanned": !snapshot.database_path.is_empty(),
    }))
}

fn list_albums(app: &AppHandle, arguments: &Value) -> Result<Value, String> {
    let snapshot = library::load_snapshot(app)?;
    let artist = optional_string(arguments, "artist").map(|value| normalize_mcp_match_text(&value));
    let limit = optional_i64(arguments, "limit")
        .unwrap_or(100)
        .clamp(1, 100) as usize;
    let albums = snapshot
        .albums
        .into_iter()
        .filter(|album| {
            artist
                .as_ref()
                .map(|artist| normalize_mcp_match_text(&album.artist).contains(artist))
                .unwrap_or(true)
        })
        .take(limit)
        .collect::<Vec<_>>();
    Ok(json!({ "albums": albums }))
}

fn list_tracks(app: &AppHandle, arguments: &Value) -> Result<Value, String> {
    let snapshot = library::load_snapshot(app)?;
    let album_id = optional_string(arguments, "albumId");
    let artist = optional_string(arguments, "artist").map(|value| normalize_mcp_match_text(&value));
    let limit = optional_i64(arguments, "limit")
        .unwrap_or(100)
        .clamp(1, 100) as usize;
    let mut tracks = Vec::new();
    for album in snapshot.albums {
        if album_id.as_ref().map(|id| id != &album.id).unwrap_or(false) {
            continue;
        }
        for track in album.tracks {
            if artist
                .as_ref()
                .map(|artist| {
                    normalize_mcp_match_text(&track.artist).contains(artist)
                        || normalize_mcp_match_text(&album.artist).contains(artist)
                })
                .unwrap_or(true)
            {
                tracks.push(
                    json!({ "albumId": album.id, "albumTitle": album.title, "track": track }),
                );
                if tracks.len() >= limit {
                    return Ok(json!({ "tracks": tracks }));
                }
            }
        }
    }
    Ok(json!({ "tracks": tracks }))
}

fn get_album(app: &AppHandle, arguments: &Value) -> Result<Value, String> {
    let album_id = required_string(arguments, "albumId")?;
    let snapshot = library::load_snapshot(app)?;
    let album = snapshot
        .albums
        .into_iter()
        .find(|album| album.id == album_id)
        .ok_or_else(|| format!("album not found: {album_id}"))?;
    Ok(json!({ "album": album }))
}

fn get_track(app: &AppHandle, arguments: &Value) -> Result<Value, String> {
    let track_id = required_string(arguments, "trackId")?;
    let snapshot = library::load_snapshot(app)?;
    let (album, track) = find_track_in_snapshot(&snapshot, &track_id)
        .ok_or_else(|| format!("track not found: {track_id}"))?;
    Ok(json!({ "albumId": album.id, "albumTitle": album.title, "track": track }))
}

fn find_artist(app: &AppHandle, arguments: &Value) -> Result<Value, String> {
    let name = required_string(arguments, "name")?;
    let limit = optional_i64(arguments, "limit").unwrap_or(10).clamp(1, 100) as usize;
    let query = normalize_mcp_match_text(&name);
    let snapshot = library::load_snapshot(app)?;
    let mut artists = artist_summaries(&snapshot)
        .into_iter()
        .filter_map(|artist| {
            let normalized = normalize_mcp_match_text(&artist.name);
            fuzzy_score(&normalized, &query)
                .map(|score| json!({ "score": score, "artist": artist }))
        })
        .collect::<Vec<_>>();
    sort_scored_values(&mut artists);
    artists.truncate(limit);
    Ok(json!({ "query": name, "artists": artists }))
}

fn find_album(app: &AppHandle, arguments: &Value) -> Result<Value, String> {
    let name = required_string(arguments, "name")?;
    let artist_filter =
        optional_string(arguments, "artist").map(|artist| normalize_mcp_match_text(&artist));
    let limit = optional_i64(arguments, "limit").unwrap_or(10).clamp(1, 100) as usize;
    let query = normalize_mcp_match_text(&name);
    let snapshot = library::load_snapshot(app)?;
    let mut albums = snapshot
        .albums
        .into_iter()
        .filter(|album| {
            artist_filter
                .as_ref()
                .map(|artist| normalize_mcp_match_text(&album.artist).contains(artist))
                .unwrap_or(true)
        })
        .filter_map(|album| {
            let normalized = normalize_mcp_match_text(&album.title);
            fuzzy_score(&normalized, &query).map(|score| json!({ "score": score, "album": album }))
        })
        .collect::<Vec<_>>();
    sort_scored_values(&mut albums);
    albums.truncate(limit);
    Ok(json!({ "query": name, "albums": albums }))
}

fn get_queue(app: &AppHandle, remote_state: &SharedRemoteServerState) -> Result<Value, String> {
    let state = remote_state
        .lock()
        .map(|state| state.player_state.clone())
        .map_err(|error| error.to_string())?;
    let snapshot = library::load_snapshot(app)?;
    let track_ids = state
        .as_ref()
        .map(|state| state.queue_track_ids.clone())
        .unwrap_or_default();
    let tracks = queue_tracks_from_ids(&snapshot, &track_ids);
    Ok(json!({
        "currentTrackId": state.as_ref().and_then(|state| state.current_track_id.clone()),
        "isPlaying": state.as_ref().map(|state| state.is_playing).unwrap_or(false),
        "queueTrackIds": track_ids,
        "tracks": tracks,
    }))
}

fn get_recently_played(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    arguments: &Value,
) -> Result<Value, String> {
    let limit = optional_i64(arguments, "limit").unwrap_or(20).clamp(1, 100) as usize;
    let track_ids = remote_state
        .lock()
        .map(|state| {
            state
                .recently_played_track_ids
                .iter()
                .take(limit)
                .cloned()
                .collect::<Vec<_>>()
        })
        .map_err(|error| error.to_string())?;
    let snapshot = library::load_snapshot(app)?;
    Ok(json!({ "tracks": queue_tracks_from_ids(&snapshot, &track_ids) }))
}

fn get_favorites(app: &AppHandle, arguments: &Value) -> Result<Value, String> {
    let limit = optional_i64(arguments, "limit")
        .unwrap_or(100)
        .clamp(1, 100) as usize;
    let snapshot = library::load_snapshot(app)?;
    let mut tracks = Vec::new();
    for album in snapshot.albums {
        for track in album.tracks.into_iter().filter(|track| track.is_favorite) {
            tracks.push(json!({ "albumId": album.id, "albumTitle": album.title, "track": track }));
            if tracks.len() >= limit {
                return Ok(json!({ "tracks": tracks }));
            }
        }
    }
    Ok(json!({ "tracks": tracks }))
}

fn play_artist(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    arguments: &Value,
) -> Result<Value, String> {
    let artist_id = required_string(arguments, "artistId")?;
    let snapshot = library::load_snapshot(app)?;
    let artist_key = normalize_mcp_match_text(&artist_id);
    let track_ids = snapshot
        .albums
        .iter()
        .filter(|album| {
            normalize_mcp_match_text(&album.artist) == artist_key || album.artist == artist_id
        })
        .flat_map(|album| album.tracks.iter().map(|track| track.id.clone()))
        .collect::<Vec<_>>();
    if track_ids.is_empty() {
        return Err(format!("artist not found or has no tracks: {artist_id}"));
    }
    enqueue_set_queue(
        remote_state,
        track_ids.clone(),
        track_ids.first().cloned(),
        true,
    )
}

fn play_search(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    arguments: &Value,
) -> Result<Value, String> {
    let query = required_string(arguments, "query")?;
    let normalized_query = normalize_mcp_match_text(&query);
    let snapshot = library::load_snapshot(app)?;

    let mut album_matches = snapshot
        .albums
        .iter()
        .filter_map(|album| {
            let target = normalize_mcp_match_text(&format!("{} {}", album.artist, album.title));
            fuzzy_score(&target, &normalized_query).map(|score| (score, album))
        })
        .collect::<Vec<_>>();
    album_matches.sort_by(|left, right| right.0.cmp(&left.0));
    if let Some((_score, album)) = album_matches.first() {
        if !album.tracks.is_empty() {
            let track_ids = album
                .tracks
                .iter()
                .map(|track| track.id.clone())
                .collect::<Vec<_>>();
            return enqueue_set_queue(
                remote_state,
                track_ids.clone(),
                track_ids.first().cloned(),
                true,
            );
        }
    }

    let mut track_matches = snapshot
        .albums
        .iter()
        .flat_map(|album| album.tracks.iter().map(move |track| (album, track)))
        .filter_map(|(album, track)| {
            let target = normalize_mcp_match_text(&format!(
                "{} {} {}",
                album.artist, album.title, track.title
            ));
            fuzzy_score(&target, &normalized_query).map(|score| (score, album, track))
        })
        .collect::<Vec<_>>();
    track_matches.sort_by(|left, right| right.0.cmp(&left.0));
    let Some((_score, album, track)) = track_matches.first() else {
        return Err(format!("no playable match for query: {query}"));
    };
    let track_ids = album_queue_ids_starting_with(album, &track.id);
    enqueue_set_queue(
        remote_state,
        track_ids.clone(),
        Some(track.id.clone()),
        true,
    )
}

fn set_queue(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    arguments: &Value,
) -> Result<Value, String> {
    let track_ids = required_string_array(arguments, "trackIds")?;
    let snapshot = library::load_snapshot(app)?;
    let known_track_ids = snapshot
        .albums
        .iter()
        .flat_map(|album| album.tracks.iter().map(|track| track.id.clone()))
        .collect::<HashSet<_>>();
    if let Some(missing) = track_ids
        .iter()
        .find(|track_id| !known_track_ids.contains(*track_id))
    {
        return Err(format!("track not found: {missing}"));
    }
    let current_track_id =
        optional_string(arguments, "currentTrackId").or_else(|| track_ids.first().cloned());
    let should_play = optional_bool(arguments, "play").unwrap_or(true);
    enqueue_set_queue(remote_state, track_ids, current_track_id, should_play)
}

fn update_favorite(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    arguments: &Value,
    is_favorite: bool,
) -> Result<Value, String> {
    let track_id = required_string(arguments, "trackId")?;
    let snapshot = library::load_snapshot(app)?;
    let (_album, track) = find_track_in_snapshot(&snapshot, &track_id)
        .ok_or_else(|| format!("track not found: {track_id}"))?;
    let request = TrackUserStateUpdateRequest {
        track_id,
        is_favorite,
        rating: track.rating,
    };
    let result = library::update_track_user_state(app, request)?;
    let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
    Ok(json!({ "update": result, "refreshCommand": refresh_command }))
}

fn enqueue_set_queue(
    remote_state: &SharedRemoteServerState,
    track_ids: Vec<String>,
    current_track_id: Option<String>,
    is_playing: bool,
) -> Result<Value, String> {
    let command = enqueue_remote_command(
        remote_state,
        "set-queue",
        Some(json!({
            "queueTrackIds": track_ids,
            "currentTrackId": current_track_id,
            "isPlaying": is_playing,
        })),
    )?;
    serde_json::to_value(command).map_err(|error| error.to_string())
}

fn lyrics_mood_reference(
    remote_state: &SharedRemoteServerState,
    relative_to_current: bool,
) -> Result<LyricsMoodReference, String> {
    if !relative_to_current {
        return Ok(LyricsMoodReference::Prompt);
    }
    let current_track_id = remote_state
        .lock()
        .map_err(|error| error.to_string())?
        .player_state
        .as_ref()
        .and_then(|state| state.current_track_id.clone());
    Ok(current_track_id.map_or(
        LyricsMoodReference::MissingCurrentTrack,
        LyricsMoodReference::CurrentTrack,
    ))
}

fn finalize_lyrics_mood_playback(
    remote_state: &SharedRemoteServerState,
    mut response: search_index::VoiceLyricsResponse,
) -> Result<Value, String> {
    if response.status != LyricsMoodStatus::Ok || response.results.is_empty() {
        return serde_json::to_value(response).map_err(|error| error.to_string());
    }
    let track_ids = response
        .results
        .iter()
        .map(|result| result.track_id.clone())
        .collect::<Vec<_>>();
    let command = enqueue_set_queue(
        remote_state,
        track_ids.clone(),
        track_ids.first().cloned(),
        true,
    )?;
    response.status = LyricsMoodStatus::Playing;
    let mut value = serde_json::to_value(response).map_err(|error| error.to_string())?;
    value["command"] = command;
    Ok(value)
}

fn optional_i64(arguments: &Value, key: &str) -> Option<i64> {
    arguments.get(key).and_then(Value::as_i64)
}

fn optional_bool(arguments: &Value, key: &str) -> Option<bool> {
    arguments.get(key).and_then(Value::as_bool)
}

fn optional_string(arguments: &Value, key: &str) -> Option<String> {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
}

fn required_f64(arguments: &Value, key: &str) -> Result<f64, String> {
    arguments
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or_else(|| format!("missing or invalid {key}"))
}

fn required_bool_any(arguments: &Value, keys: &[&str]) -> Result<bool, String> {
    keys.iter()
        .find_map(|key| arguments.get(*key).and_then(Value::as_bool))
        .ok_or_else(|| format!("missing or invalid {}", keys.join(" or ")))
}

fn required_string(arguments: &Value, key: &str) -> Result<String, String> {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| format!("missing or invalid {key}"))
}

fn required_string_any(arguments: &Value, keys: &[&str]) -> Result<String, String> {
    keys.iter()
        .find_map(|key| optional_string(arguments, key))
        .ok_or_else(|| format!("missing or invalid {}", keys.join(" or ")))
}

fn required_string_array(arguments: &Value, key: &str) -> Result<Vec<String>, String> {
    let values = arguments
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("missing or invalid {key}"))?
        .iter()
        .filter_map(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if values.is_empty() {
        return Err(format!("missing or invalid {key}"));
    }
    Ok(values)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpArtistSummary {
    id: String,
    name: String,
    album_count: usize,
    track_count: usize,
}

fn artist_summaries(snapshot: &library::LibrarySnapshot) -> Vec<McpArtistSummary> {
    let mut artists: HashMap<String, McpArtistSummary> = HashMap::new();
    for album in &snapshot.albums {
        let entry = artists
            .entry(normalize_mcp_match_text(&album.artist))
            .or_insert_with(|| McpArtistSummary {
                id: normalize_mcp_match_text(&album.artist),
                name: album.artist.clone(),
                album_count: 0,
                track_count: 0,
            });
        entry.album_count += 1;
        entry.track_count += album.tracks.len();
    }
    let mut values = artists.into_values().collect::<Vec<_>>();
    values.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    values
}

fn normalize_mcp_match_text(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn fuzzy_score(target: &str, query: &str) -> Option<i64> {
    if target == query {
        Some(100)
    } else if target.contains(query) {
        Some(80 + query.len().min(19) as i64)
    } else if query.contains(target) {
        Some(50 + target.len().min(29) as i64)
    } else {
        None
    }
}

fn sort_scored_values(values: &mut [Value]) {
    values.sort_by(|left, right| {
        let left_score = left
            .get("score")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        let right_score = right
            .get("score")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        right_score.cmp(&left_score)
    });
}

fn find_track_in_snapshot<'a>(
    snapshot: &'a library::LibrarySnapshot,
    track_id: &str,
) -> Option<(&'a library::AlbumRecord, &'a library::TrackRecord)> {
    snapshot.albums.iter().find_map(|album| {
        album
            .tracks
            .iter()
            .find(|track| track.id == track_id)
            .map(|track| (album, track))
    })
}

fn queue_tracks_from_ids(snapshot: &library::LibrarySnapshot, track_ids: &[String]) -> Vec<Value> {
    track_ids
        .iter()
        .filter_map(|track_id| {
            find_track_in_snapshot(snapshot, track_id)
                .map(|(album, track)| json!({ "albumId": album.id, "albumTitle": album.title, "track": track }))
        })
        .collect()
}

fn album_track_ids(app: &AppHandle, album_id: &str) -> Result<Vec<String>, String> {
    let snapshot = library::load_snapshot(app)?;
    let album = snapshot
        .albums
        .iter()
        .find(|album| album.id == album_id)
        .ok_or_else(|| format!("album not found: {album_id}"))?;
    Ok(album.tracks.iter().map(|track| track.id.clone()).collect())
}

fn album_id_for_track(app: &AppHandle, track_id: &str) -> Result<Option<String>, String> {
    let snapshot = library::load_snapshot(app)?;
    Ok(find_track_in_snapshot(&snapshot, track_id).map(|(album, _track)| album.id.clone()))
}

fn album_queue_track_ids_starting_with(
    app: &AppHandle,
    album_id: &str,
    track_id: &str,
) -> Result<Vec<String>, String> {
    let snapshot = library::load_snapshot(app)?;
    let album = snapshot
        .albums
        .iter()
        .find(|album| album.id == album_id)
        .ok_or_else(|| format!("album not found: {album_id}"))?;
    Ok(album_queue_ids_starting_with(album, track_id))
}

fn album_queue_ids_starting_with(album: &library::AlbumRecord, track_id: &str) -> Vec<String> {
    let mut track_ids = album
        .tracks
        .iter()
        .map(|track| track.id.clone())
        .collect::<Vec<_>>();
    if let Some(index) = track_ids.iter().position(|id| id == track_id) {
        track_ids.rotate_left(index);
    }
    track_ids
}

fn get_track_analysis(
    app: &AppHandle,
    request: &Request,
    remote_state: &SharedRemoteServerState,
) -> Result<RemoteAudioAnalysisSegment, String> {
    let track_id = query_param(&request.query, "trackId")
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "missing trackId".to_owned())?;
    let file_path = library::load_track_file_path(app, &track_id)?;
    let loaded_analysis = get_or_analyze_track_once(app, remote_state, &track_id, &file_path)?;
    prefetch_next_track_analysis(app.clone(), remote_state.clone(), track_id.clone());

    Ok(RemoteAudioAnalysisSegment {
        frame_interval_ms: loaded_analysis.analysis.frame_interval_ms,
        frames: loaded_analysis.analysis.frames,
        is_complete: loaded_analysis.is_complete,
        track_id: track_id.clone(),
    })
}

fn get_track_analysis_bytes(
    app: &AppHandle,
    request: &Request,
    remote_state: &SharedRemoteServerState,
) -> Result<audio_analysis::TrackAnalysisBytes, String> {
    let segment = get_track_analysis(app, request, remote_state)?;
    Ok(audio_analysis::TrackAnalysisBytes::from_frames(
        &segment.track_id,
        segment.frame_interval_ms,
        segment.is_complete,
        &segment.frames,
    ))
}

fn get_or_analyze_track_once(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    track_id: &str,
    file_path: &str,
) -> Result<audio_analysis::TrackAnalysisLoad, String> {
    loop {
        let mut state = remote_state.lock().map_err(|error| error.to_string())?;
        if state
            .active_track_analysis_loads
            .insert(track_id.to_owned())
        {
            break;
        }
        drop(
            remote_state
                .track_analysis_finished
                .wait(state)
                .map_err(|error| error.to_string())?,
        );
    }

    let result = audio_analysis::get_or_analyze_track(app, track_id, file_path);
    if let Ok(mut state) = remote_state.lock() {
        state.active_track_analysis_loads.remove(track_id);
        remote_state.track_analysis_finished.notify_all();
    }
    result
}

fn prefetch_next_track_analysis(
    app: AppHandle,
    remote_state: SharedRemoteServerState,
    completed_track_id: String,
) {
    let Ok(Some(next_track_id)) =
        reserve_next_track_analysis_prefetch(&remote_state, completed_track_id)
    else {
        return;
    };

    thread::spawn(move || {
        let result = prefetch_track_analysis(&app, &remote_state, &next_track_id);
        if let Err(error) = result {
            info!("next track analysis prefetch skipped for {next_track_id}: {error}");
        }
        if let Ok(mut state) = remote_state.lock() {
            state
                .active_track_analysis_prefetches
                .remove(&next_track_id);
        }
    });
}

fn reserve_next_track_analysis_prefetch(
    remote_state: &SharedRemoteServerState,
    completed_track_id: String,
) -> Result<Option<String>, String> {
    let mut state = remote_state.lock().map_err(|error| error.to_string())?;
    let Some(player_state) = state.player_state.as_ref() else {
        return Ok(None);
    };
    let Some(next_track_id) =
        next_queue_track_id(&player_state.queue_track_ids, &completed_track_id)
    else {
        return Ok(None);
    };
    if !state
        .active_track_analysis_prefetches
        .insert(next_track_id.clone())
    {
        return Ok(None);
    }
    Ok(Some(next_track_id))
}

fn next_queue_track_id(queue_track_ids: &[String], completed_track_id: &str) -> Option<String> {
    let current_index = queue_track_ids
        .iter()
        .position(|track_id| track_id == completed_track_id)?;
    queue_track_ids.get(current_index + 1).cloned()
}

fn prefetch_track_analysis(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    track_id: &str,
) -> Result<(), String> {
    let file_path = library::load_track_file_path(app, track_id)?;
    get_or_analyze_track_once(app, remote_state, track_id, &file_path)?;
    Ok(())
}

fn is_websocket_request(request: &Request) -> bool {
    request
        .headers
        .get("upgrade")
        .map(|value| value.eq_ignore_ascii_case("websocket"))
        .unwrap_or(false)
        && request
            .headers
            .get("connection")
            .map(|value| value.to_ascii_lowercase().contains("upgrade"))
            .unwrap_or(false)
}

fn handle_tv_session_websocket(
    mut stream: TcpStream,
    request: Request,
    app: AppHandle,
    remote_state: SharedRemoteServerState,
) -> Result<(), String> {
    let websocket_key = request
        .headers
        .get("sec-websocket-key")
        .ok_or_else(|| "missing websocket key".to_owned())?;
    let accept_key = websocket_accept_key(websocket_key);
    let handshake = format!(
        "HTTP/1.1 101 Switching Protocols\r\n\
         Upgrade: websocket\r\n\
         Connection: Upgrade\r\n\
         Sec-WebSocket-Accept: {accept_key}\r\n\r\n",
    );
    stream
        .write_all(handshake.as_bytes())
        .map_err(|error| error.to_string())?;

    let session_id = request
        .path
        .trim_start_matches("/tv/sessions/")
        .split('/')
        .next()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("default")
        .to_owned();
    let snapshot = tv_session_snapshot(&app)?;
    write_websocket_text(
        &mut stream,
        &tv_envelope(
            &session_id,
            json!({ "type": "session_ready", "sessionId": session_id }),
        ),
    )?;
    write_websocket_text(
        &mut stream,
        &tv_envelope(
            &session_id,
            json!({ "type": "session_snapshot", "snapshot": snapshot }),
        ),
    )?;

    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| error.to_string())?;
    loop {
        match read_websocket_frame(&mut stream) {
            Ok(Some(WebSocketFrame::Text(text))) => {
                handle_tv_client_message(&remote_state, &session_id, &text)?;
            }
            Ok(Some(WebSocketFrame::Ping(payload))) => {
                write_websocket_frame(&mut stream, 0xA, &payload)?;
            }
            Ok(Some(WebSocketFrame::Close)) | Ok(None) => break,
            Ok(Some(WebSocketFrame::Other)) => {}
            Err(error) if error.contains("timed out") || error.contains("WouldBlock") => {
                write_websocket_frame(&mut stream, 0x9, b"")?;
            }
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn websocket_accept_key(key: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(key.trim().as_bytes());
    hasher.update(b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    general_purpose::STANDARD.encode(hasher.finalize())
}

enum WebSocketFrame {
    Text(String),
    Ping(Vec<u8>),
    Close,
    Other,
}

fn read_websocket_frame(stream: &mut TcpStream) -> Result<Option<WebSocketFrame>, String> {
    let mut header = [0_u8; 2];
    match stream.read_exact(&mut header) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error.to_string()),
    }

    let opcode = header[0] & 0x0F;
    let masked = (header[1] & 0x80) != 0;
    let mut length = u64::from(header[1] & 0x7F);
    if length == 126 {
        let mut bytes = [0_u8; 2];
        stream
            .read_exact(&mut bytes)
            .map_err(|error| error.to_string())?;
        length = u64::from(u16::from_be_bytes(bytes));
    } else if length == 127 {
        let mut bytes = [0_u8; 8];
        stream
            .read_exact(&mut bytes)
            .map_err(|error| error.to_string())?;
        length = u64::from_be_bytes(bytes);
    }
    if length > 1024 * 1024 {
        return Err("websocket frame is too large".to_owned());
    }

    let mut mask = [0_u8; 4];
    if masked {
        stream
            .read_exact(&mut mask)
            .map_err(|error| error.to_string())?;
    }
    let mut payload = vec![0_u8; length as usize];
    stream
        .read_exact(&mut payload)
        .map_err(|error| error.to_string())?;
    if masked {
        for (index, byte) in payload.iter_mut().enumerate() {
            *byte ^= mask[index % 4];
        }
    }

    Ok(Some(match opcode {
        0x1 => WebSocketFrame::Text(String::from_utf8_lossy(&payload).into_owned()),
        0x8 => WebSocketFrame::Close,
        0x9 => WebSocketFrame::Ping(payload),
        _ => WebSocketFrame::Other,
    }))
}

fn write_websocket_text(stream: &mut TcpStream, value: &Value) -> Result<(), String> {
    let text = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    write_websocket_frame(stream, 0x1, &text)
}

fn write_websocket_frame(stream: &mut TcpStream, opcode: u8, payload: &[u8]) -> Result<(), String> {
    let mut frame = vec![0x80 | opcode];
    if payload.len() < 126 {
        frame.push(payload.len() as u8);
    } else if payload.len() <= u16::MAX as usize {
        frame.push(126);
        frame.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    } else {
        frame.push(127);
        frame.extend_from_slice(&(payload.len() as u64).to_be_bytes());
    }
    frame.extend_from_slice(payload);
    stream.write_all(&frame).map_err(|error| error.to_string())
}

fn handle_tv_client_message(
    remote_state: &SharedRemoteServerState,
    session_id: &str,
    text: &str,
) -> Result<(), String> {
    let value = serde_json::from_str::<Value>(text).map_err(|error| error.to_string())?;
    if value.get("type").and_then(Value::as_str) == Some("player_event") {
        let event = value.get("event").cloned().unwrap_or(Value::Null);
        record_tv_player_event(
            remote_state,
            TvPlayerEventBody {
                session_id: Some(session_id.to_owned()),
                event,
            },
        )?;
    }
    Ok(())
}

fn tv_envelope(session_id: &str, message: Value) -> Value {
    json!({
        "id": format!("tv-{}-{}", session_id, current_unix_time_ms() as u64),
        "sessionId": session_id,
        "sentAt": current_iso_like_timestamp(),
        "message": message,
    })
}

fn tv_session_snapshot(app: &AppHandle) -> Result<Value, String> {
    let snapshot = library::load_snapshot(app)?;
    let first_album = snapshot.albums.first();
    let first_track = first_album.and_then(|album| album.tracks.first());
    let track_id = first_track.map(|track| track.id.clone());
    let lyrics = track_id
        .as_deref()
        .and_then(|id| library::load_track_lyrics(app, id).ok().flatten());
    let lyrics_lines = lyrics
        .as_deref()
        .map(parse_plain_lyrics)
        .unwrap_or_default();
    let queue_items = first_album
        .map(|album| {
            album
                .tracks
                .iter()
                .map(|track| {
                    json!({
                        "trackId": track.id,
                        "title": track.title,
                        "artist": track.artist,
                        "album": album.title,
                        "artworkUrl": album.artwork_path,
                        "isCurrent": Some(&track.id) == track_id.as_ref(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(json!({
        "player": {
            "trackId": track_id,
            "title": first_track.map(|track| track.title.as_str()).unwrap_or("Musical"),
            "artist": first_track.map(|track| track.artist.as_str()).unwrap_or(""),
            "album": first_album.map(|album| album.title.as_str()).unwrap_or(""),
            "artworkUrl": first_album.and_then(|album| album.artwork_path.as_deref()),
            "audioUrl": first_track.map(|track| format!("/api/media?path={}", url_encode(&track.file_path))),
            "isPlaying": false,
            "durationSeconds": first_track.map(|track| track.duration_seconds).unwrap_or(0),
            "positionSeconds": 0,
            "updatedAt": current_iso_like_timestamp(),
        },
        "lyrics": track_id.as_ref().map(|id| json!({
            "trackId": id,
            "mode": "plain",
            "lines": lyrics_lines,
        })),
        "queue": {
            "currentTrackId": track_id,
            "items": queue_items,
        },
    }))
}

fn parse_plain_lyrics(lyrics: &str) -> Vec<Value> {
    lyrics
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .enumerate()
        .map(|(index, text)| json!({ "id": format!("line-{index}"), "text": text }))
        .collect()
}

fn current_iso_like_timestamp() -> String {
    format!("{}Z", (current_unix_time_ms() / 1000.0) as u64)
}

fn list_display_devices(
    remote_state: &SharedRemoteServerState,
) -> Result<HashMap<String, Vec<DisplayDevice>>, String> {
    let state = remote_state.lock().map_err(|error| error.to_string())?;
    Ok(HashMap::from([(
        "devices".to_owned(),
        state.display_devices.values().cloned().collect(),
    )]))
}

fn register_display_device(
    remote_state: &SharedRemoteServerState,
    mut device: DisplayDevice,
) -> Result<DisplayDevice, String> {
    if device.id.trim().is_empty() {
        return Err("missing device id".to_owned());
    }
    if device.kind.trim().is_empty() {
        device.kind = "firetv".to_owned();
    }
    device.last_used_at = Some(current_iso_like_timestamp());
    let mut state = remote_state.lock().map_err(|error| error.to_string())?;
    state
        .display_devices
        .insert(device.id.clone(), device.clone());
    Ok(device)
}

fn resolve_display_device(
    remote_state: &SharedRemoteServerState,
    query: &str,
) -> Result<HashMap<String, Vec<DisplayDeviceResolution>>, String> {
    let normalized_query = normalize_search_text(query);
    let state = remote_state.lock().map_err(|error| error.to_string())?;
    let mut matches = state
        .display_devices
        .values()
        .filter_map(|device| score_display_device(device, &normalized_query))
        .collect::<Vec<_>>();
    matches.sort_by(|first, second| {
        second
            .score
            .partial_cmp(&first.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(HashMap::from([("matches".to_owned(), matches)]))
}

fn score_display_device(
    device: &DisplayDevice,
    normalized_query: &str,
) -> Option<DisplayDeviceResolution> {
    let name = normalize_search_text(&device.display_name);
    if normalized_query.is_empty() {
        return None;
    }
    if name == normalized_query {
        return Some(DisplayDeviceResolution {
            device: device.clone(),
            score: 1.0,
            reason: "displayName".to_owned(),
        });
    }
    for alias in &device.aliases {
        let normalized_alias = normalize_search_text(alias);
        if normalized_alias == normalized_query {
            return Some(DisplayDeviceResolution {
                device: device.clone(),
                score: 0.92,
                reason: "alias".to_owned(),
            });
        }
    }
    let haystack = std::iter::once(name)
        .chain(
            device
                .aliases
                .iter()
                .map(|alias| normalize_search_text(alias)),
        )
        .chain(device.room.iter().map(|room| normalize_search_text(room)))
        .collect::<Vec<_>>()
        .join(" ");
    if haystack.contains(normalized_query) {
        let availability = if device.online { 0.08 } else { 0.0 };
        return Some(DisplayDeviceResolution {
            device: device.clone(),
            score: 0.72 + availability,
            reason: "partial".to_owned(),
        });
    }
    None
}

fn normalize_search_text(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn prepare_fire_tv_launch(
    remote_state: &SharedRemoteServerState,
    body: FireTvLaunchBody,
) -> Result<Value, String> {
    let display_url = body
        .display_url
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("http://{LOCAL_SERVER_ADDR}/tv"));
    let command = enqueue_remote_command(
        remote_state,
        "firetv-launch",
        Some(json!({
            "deviceId": body.device_id,
            "displayUrl": display_url,
            "sessionId": body.session_id,
            "deepLink": format!("musical-firetv://display?url={}", url_encode(&display_url)),
        })),
    )?;
    Ok(json!({ "launch": command }))
}

fn enqueue_fire_tv_voice_command(
    remote_state: &SharedRemoteServerState,
    body: FireTvVoiceCommandBody,
) -> Result<Value, String> {
    let matches = if let Some(device_query) = body.device_query.as_deref() {
        resolve_display_device(remote_state, device_query)?
            .remove("matches")
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let command = enqueue_remote_command(
        remote_state,
        "firetv-voice-command",
        Some(json!({
            "utterance": body.utterance,
            "displayUrl": body.display_url,
            "deviceMatches": matches,
        })),
    )?;
    Ok(json!({ "command": command }))
}

fn record_tv_player_event(
    remote_state: &SharedRemoteServerState,
    body: TvPlayerEventBody,
) -> Result<Value, String> {
    let mut state = remote_state.lock().map_err(|error| error.to_string())?;
    state.last_tv_player_event = Some(body.clone());
    Ok(json!({ "recorded": true, "event": body }))
}

fn lan_ipv4_address() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let address = socket.local_addr().ok()?;
    let ip = address.ip();
    (!ip.is_loopback()).then(|| ip.to_string())
}

fn parse_json<T: for<'de> Deserialize<'de>>(body: &[u8]) -> Result<T, String> {
    serde_json::from_slice(body).map_err(|error| error.to_string())
}

fn current_unix_time_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

fn result_response<T: serde::Serialize>(result: Result<T, String>) -> Vec<u8> {
    match result {
        Ok(value) => json_response(200, &value),
        Err(error) => text_response(500, &error),
    }
}

fn json_response<T: serde::Serialize>(status: u16, value: &T) -> Vec<u8> {
    let body = serde_json::to_vec(value).unwrap_or_else(|_| b"null".to_vec());
    response(status, "application/json; charset=utf-8", &body)
}

fn json_response_with_headers<T: serde::Serialize>(
    status: u16,
    value: &T,
    extra_headers: &[(String, String)],
) -> Vec<u8> {
    let body = serde_json::to_vec(value).unwrap_or_else(|_| b"null".to_vec());
    response_with_headers(
        status,
        "application/json; charset=utf-8",
        &body,
        extra_headers,
    )
}

fn track_analysis_bytes_response(
    result: Result<audio_analysis::TrackAnalysisBytes, String>,
) -> Vec<u8> {
    match result {
        Ok(analysis) => {
            let headers = vec![
                (
                    "X-Musical-Track-Id".to_owned(),
                    url_encode(&analysis.track_id),
                ),
                (
                    "X-Musical-Start-Time-Ms".to_owned(),
                    analysis.start_time_ms.to_string(),
                ),
                (
                    "X-Musical-Frame-Interval-Ms".to_owned(),
                    analysis.frame_interval_ms.to_string(),
                ),
                (
                    "X-Musical-Bucket-Count".to_owned(),
                    analysis.bucket_count.to_string(),
                ),
                (
                    "X-Musical-Frame-Count".to_owned(),
                    analysis.frame_count.to_string(),
                ),
                (
                    "X-Musical-Is-Complete".to_owned(),
                    analysis.is_complete.to_string(),
                ),
            ];
            response_with_headers(200, "application/octet-stream", &analysis.values, &headers)
        }
        Err(error) => text_response(500, &error),
    }
}

fn text_response(status: u16, message: &str) -> Vec<u8> {
    response(status, "text/plain; charset=utf-8", message.as_bytes())
}

fn empty_response(status: u16) -> Vec<u8> {
    response(status, "text/plain; charset=utf-8", b"")
}

fn file_response(request: &Request, path: &Path) -> Vec<u8> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) => return text_response(404, &error.to_string()),
    };
    let file_size = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(error) => return text_response(500, &error.to_string()),
    };

    let content_type = content_type(path);
    let range = match request.headers.get("range") {
        Some(value) => parse_byte_range(value, file_size),
        None => Ok(None),
    };
    let (status, start, end) = match range {
        Ok(Some((start, end))) => (206, start, end),
        Ok(None) => (200, 0, file_size.saturating_sub(1)),
        Err(_) => {
            return response_with_headers(
                416,
                "text/plain; charset=utf-8",
                b"requested range not satisfiable",
                &[
                    ("Accept-Ranges".to_owned(), "bytes".to_owned()),
                    ("Content-Range".to_owned(), format!("bytes */{file_size}")),
                ],
            );
        }
    };

    if file_size == 0 {
        return response_with_declared_content_length(
            200,
            content_type,
            b"",
            0,
            &[("Accept-Ranges".to_owned(), "bytes".to_owned())],
        );
    }

    let read_length = end.saturating_sub(start).saturating_add(1);
    let mut bytes = Vec::new();
    if let Err(error) = file
        .seek(SeekFrom::Start(start))
        .and_then(|_| file.take(read_length).read_to_end(&mut bytes))
    {
        return text_response(500, &error.to_string());
    }

    let empty_body: &[u8] = &[];
    let body: &[u8] = if request.method == "HEAD" {
        empty_body
    } else {
        &bytes
    };
    let mut headers = vec![("Accept-Ranges".to_owned(), "bytes".to_owned())];
    if status == 206 {
        headers.push((
            "Content-Range".to_owned(),
            format!("bytes {start}-{end}/{file_size}"),
        ));
    }
    response_with_declared_content_length(status, content_type, body, read_length, &headers)
}

fn parse_byte_range(range_header: &str, file_size: u64) -> Result<Option<(u64, u64)>, String> {
    let Some(range_value) = range_header.strip_prefix("bytes=") else {
        return Ok(None);
    };
    let Some(first_range) = range_value.split(',').next() else {
        return Ok(None);
    };
    let Some((start_text, end_text)) = first_range.trim().split_once('-') else {
        return Err("invalid range".to_owned());
    };

    if file_size == 0 {
        return Err("empty file".to_owned());
    }

    if start_text.is_empty() {
        let suffix_length = end_text
            .parse::<u64>()
            .map_err(|_| "invalid suffix range".to_owned())?;
        if suffix_length == 0 {
            return Err("invalid suffix range".to_owned());
        }
        let start = file_size.saturating_sub(suffix_length);
        return Ok(Some((start, file_size - 1)));
    }

    let start = start_text
        .parse::<u64>()
        .map_err(|_| "invalid range start".to_owned())?;
    if start >= file_size {
        return Err("range start exceeds file size".to_owned());
    }

    let end = if end_text.is_empty() {
        file_size - 1
    } else {
        end_text
            .parse::<u64>()
            .map_err(|_| "invalid range end".to_owned())?
            .min(file_size - 1)
    };

    if end < start {
        return Err("range end precedes start".to_owned());
    }

    Ok(Some((start, end)))
}

fn frontend_response(path: &str) -> Vec<u8> {
    let requested_path = path.trim_start_matches('/');
    if requested_path.contains("..") || requested_path.contains('\\') {
        return text_response(400, "invalid frontend path");
    }

    let file_path = if requested_path.is_empty() {
        "index.html"
    } else {
        requested_path
    };

    // The release app must remain self-contained, but a long-running `tauri
    // dev` process otherwise keeps serving the frontend bundle that was
    // embedded when Cargo last compiled it. Read the current on-disk build in
    // debug mode so the LAN/Web view receives the same visualizer code as the
    // desktop WebView after `npm run build`, without changing any `/api/*`
    // route or audio-analysis transport.
    #[cfg(debug_assertions)]
    if let Some(response) = filesystem_frontend_response(&development_frontend_dist(), file_path) {
        return response;
    }

    if let Some(file) = FRONTEND_DIST.get_file(file_path) {
        return response(200, content_type(Path::new(file_path)), file.contents());
    }

    match FRONTEND_DIST.get_file("index.html") {
        Some(index) => response(200, "text/html; charset=utf-8", index.contents()),
        None => text_response(404, "frontend bundle not found"),
    }
}

#[cfg(debug_assertions)]
fn development_frontend_dist() -> PathBuf {
    std::env::var_os("MUSICAL_DEV_FRONTEND_DIST")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("dist")
        })
}

#[cfg(any(debug_assertions, test))]
fn filesystem_frontend_response(frontend_root: &Path, file_path: &str) -> Option<Vec<u8>> {
    let requested_file = frontend_root.join(file_path);
    let response_file = requested_file
        .is_file()
        .then_some(requested_file)
        .unwrap_or_else(|| frontend_root.join("index.html"));
    let contents = fs::read(&response_file).ok()?;
    Some(response_with_headers(
        200,
        content_type(&response_file),
        &contents,
        &[("Cache-Control".to_owned(), "no-store".to_owned())],
    ))
}

fn response(status: u16, content_type: &str, body: &[u8]) -> Vec<u8> {
    response_with_headers(status, content_type, body, &[])
}

fn response_with_headers(
    status: u16,
    content_type: &str,
    body: &[u8],
    extra_headers: &[(String, String)],
) -> Vec<u8> {
    response_with_declared_content_length(
        status,
        content_type,
        body,
        body.len() as u64,
        extra_headers,
    )
}

fn response_with_declared_content_length(
    status: u16,
    content_type: &str,
    body: &[u8],
    content_length: u64,
    extra_headers: &[(String, String)],
) -> Vec<u8> {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        206 => "Partial Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        416 => "Range Not Satisfiable",
        500 => "Internal Server Error",
        _ => "OK",
    };
    let mut headers = format!(
        "HTTP/1.1 {status} {reason}\r\n\
         Content-Length: {content_length}\r\n\
         Content-Type: {content_type}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type, Range, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-Id, X-Musical-State-Captured-At-Ms\r\n\
         Access-Control-Expose-Headers: Accept-Ranges, Content-Range, Mcp-Session-Id, Mcp-Protocol-Version, X-Musical-Response-Sent-At-Ms, X-Musical-State-Captured-At-Ms, X-Musical-Track-Id, X-Musical-Start-Time-Ms, X-Musical-Frame-Interval-Ms, X-Musical-Bucket-Count, X-Musical-Frame-Count, X-Musical-Is-Complete\r\n",
    );
    for (key, value) in extra_headers {
        headers.push_str(key);
        headers.push_str(": ");
        headers.push_str(value);
        headers.push_str("\r\n");
    }
    headers.push_str("Connection: close\r\n\r\n");
    [headers.as_bytes(), body].concat()
}

fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (candidate_key, value) = pair.split_once('=')?;
        (url_decode(candidate_key) == key).then(|| url_decode(value))
    })
}

fn url_decode(value: &str) -> String {
    let mut bytes = Vec::with_capacity(value.len());
    let mut chars = value.as_bytes().iter().copied();
    while let Some(byte) = chars.next() {
        if byte == b'%' {
            let first = chars.next();
            let second = chars.next();
            if let (Some(first), Some(second)) = (first, second) {
                if let Ok(hex) = u8::from_str_radix(&String::from_utf8_lossy(&[first, second]), 16)
                {
                    bytes.push(hex);
                    continue;
                }
            }
            bytes.push(byte);
        } else if byte == b'+' {
            bytes.push(b' ');
        } else {
            bytes.push(byte);
        }
    }

    String::from_utf8_lossy(&bytes).into_owned()
}

fn url_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(*byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
    {
        "aac" => "audio/aac",
        "css" => "text/css; charset=utf-8",
        "flac" => "audio/flac",
        "gif" => "image/gif",
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "jpg" | "jpeg" => "image/jpeg",
        "m4a" | "mp4" => "audio/mp4",
        "mp3" => "audio/mpeg",
        "ogg" | "oga" => "audio/ogg",
        "opus" => "audio/opus",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "wav" => "audio/wav",
        "webp" => "image/webp",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::{
        empty_remote_player_state, filesystem_frontend_response, has_command_gap,
        is_allowed_request_origin, lyrics_mood_reference, resolve_media_path,
        track_lyrics_analysis_response, LyricsMoodReference, RemoteServerState,
        RemoteServerStateStore, Request,
    };
    use crate::lyrics_sentiment::{
        LyricsSentimentBlock, LyricsSentimentSummary, SentimentLabel, TrackLyricsAnalysis,
        ANALYZER_ID,
    };
    use crate::search_index::{
        LyricsMoodStatus, VoiceLyricsMatch, VoiceLyricsResponse, VoiceLyricsSentiment,
    };
    use serde_json::Value;
    use std::{
        collections::HashMap,
        fs,
        sync::atomic::{AtomicUsize, Ordering},
        sync::Arc,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct ParsedHttpResponse {
        status: u16,
        content_type: String,
        content_length: usize,
        body: Vec<u8>,
    }

    fn parse_http_response(response: &[u8]) -> ParsedHttpResponse {
        let header_end = response
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .expect("response header terminator");
        let header = std::str::from_utf8(&response[..header_end]).expect("UTF-8 response headers");
        let mut lines = header.lines();
        let status = lines
            .next()
            .expect("response status line")
            .split_whitespace()
            .nth(1)
            .expect("response status")
            .parse()
            .expect("numeric response status");
        let headers = lines
            .filter_map(|line| line.split_once(':'))
            .map(|(key, value)| (key.trim().to_ascii_lowercase(), value.trim().to_owned()))
            .collect::<HashMap<_, _>>();
        let content_type = headers
            .get("content-type")
            .expect("Content-Type response header")
            .clone();
        let content_length = headers
            .get("content-length")
            .expect("Content-Length response header")
            .parse()
            .expect("numeric Content-Length");
        let body = response[header_end + 4..].to_vec();
        assert_eq!(content_length, body.len());

        ParsedHttpResponse {
            status,
            content_type,
            content_length,
            body,
        }
    }

    fn lyrics_analysis_request(method: &str, query: &str, body: &[u8]) -> Request {
        Request {
            method: method.to_owned(),
            path: "/api/track_lyrics_analysis".to_owned(),
            query: query.to_owned(),
            headers: HashMap::from([("host".to_owned(), "127.0.0.1:1422".to_owned())]),
            body: body.to_vec(),
            is_local: true,
        }
    }

    fn sentiment_summary(
        score: Option<f32>,
        label: SentimentLabel,
        diagnostic: Option<&str>,
    ) -> LyricsSentimentSummary {
        LyricsSentimentSummary {
            score,
            label,
            coverage: if score.is_some() { 0.75 } else { 0.0 },
            eligible_token_count: 4,
            matched_token_count: usize::from(score.is_some()) * 3,
            scored_token_count: usize::from(score.is_some()) * 2,
            positive_count: usize::from(score.is_some()),
            negative_count: 0,
            analyzer_id: ANALYZER_ID.to_owned(),
            diagnostic: diagnostic.map(str::to_owned),
        }
    }

    fn lyrics_analysis_fixture(
        track_id: &str,
        summary: LyricsSentimentSummary,
    ) -> TrackLyricsAnalysis {
        TrackLyricsAnalysis {
            track_id: track_id.to_owned(),
            lyrics_hash: "fixture-lyrics-hash".to_owned(),
            sentiment: summary.clone(),
            blocks: vec![LyricsSentimentBlock {
                ordinal: 0,
                start_line: 1,
                end_line: 2,
                text: "うれしい\n明日".to_owned(),
                sentiment: summary,
            }],
        }
    }

    fn voice_lyrics_response(status: LyricsMoodStatus, track_ids: &[&str]) -> VoiceLyricsResponse {
        VoiceLyricsResponse {
            status,
            interpreted_prompt: "fixture mood".to_owned(),
            query_sentiment: VoiceLyricsSentiment {
                score: None,
                label: SentimentLabel::Unknown,
                coverage: 0.0,
            },
            total_duration_seconds: 0,
            results: track_ids
                .iter()
                .map(|track_id| VoiceLyricsMatch {
                    track_id: (*track_id).to_owned(),
                    title: format!("Title {track_id}"),
                    artist: "Artist".to_owned(),
                    album_title: "Album".to_owned(),
                    duration_seconds: 180,
                    matched_text: "excerpt…".to_owned(),
                    reason: "fixture".to_owned(),
                    sentiment: None,
                })
                .collect(),
            can_build: None,
            reason_code: None,
            reason: None,
        }
    }

    fn assert_object_keys(value: &Value, expected: &[&str]) {
        let object = value.as_object().expect("JSON object");
        assert_eq!(object.len(), expected.len());
        for key in expected {
            assert!(object.contains_key(*key), "missing JSON field {key}");
        }
    }

    fn assert_sentiment_schema(value: &Value) {
        assert_object_keys(
            value,
            &[
                "score",
                "label",
                "coverage",
                "eligibleTokenCount",
                "matchedTokenCount",
                "scoredTokenCount",
                "positiveCount",
                "negativeCount",
                "analyzerId",
                "diagnostic",
            ],
        );
        assert!(value["score"].is_null() || value["score"].is_number());
        assert!(value["label"].is_string());
        assert!(value["coverage"].is_number());
        for key in [
            "eligibleTokenCount",
            "matchedTokenCount",
            "scoredTokenCount",
            "positiveCount",
            "negativeCount",
        ] {
            assert!(value[key].is_u64(), "{key} must be an unsigned integer");
        }
        assert!(value["analyzerId"].is_string());
        assert!(value["diagnostic"].is_null() || value["diagnostic"].is_string());
    }

    fn assert_track_analysis_schema(value: &Value) {
        assert_object_keys(value, &["trackId", "lyricsHash", "sentiment", "blocks"]);
        assert!(value["trackId"].is_string());
        assert!(value["lyricsHash"].is_string());
        assert_sentiment_schema(&value["sentiment"]);
        let blocks = value["blocks"].as_array().expect("blocks array");
        for block in blocks {
            assert_object_keys(
                block,
                &["ordinal", "startLine", "endLine", "text", "sentiment"],
            );
            assert!(block["ordinal"].is_u64());
            assert!(block["startLine"].is_u64());
            assert!(block["endLine"].is_u64());
            assert!(block["text"].is_string());
            assert_sentiment_schema(&block["sentiment"]);
        }
    }

    fn assert_text_error(response: Vec<u8>, expected_body: &str) {
        let response = parse_http_response(&response);
        assert_eq!(response.status, 500);
        assert_eq!(response.content_type, "text/plain; charset=utf-8");
        assert_eq!(response.content_length, expected_body.len());
        assert_eq!(response.body, expected_body.as_bytes());
    }

    fn request_with_origin(origin: Option<&str>, host: &str) -> Request {
        let mut headers = HashMap::from([("host".to_owned(), host.to_owned())]);
        if let Some(origin) = origin {
            headers.insert("origin".to_owned(), origin.to_owned());
        }
        Request {
            method: "GET".to_owned(),
            path: "/api/app_status".to_owned(),
            query: String::new(),
            headers,
            body: Vec::new(),
            is_local: true,
        }
    }

    #[test]
    fn lyrics_analysis_get_and_post_return_the_documented_json_contract() {
        let requests = [
            lyrics_analysis_request("GET", "trackId=track-1", b""),
            lyrics_analysis_request("POST", "", br#"{"trackId":"track-1"}"#),
        ];

        for request in requests {
            let response = track_lyrics_analysis_response(&request, |track_id| {
                assert_eq!(track_id, "track-1");
                Ok(lyrics_analysis_fixture(
                    track_id,
                    sentiment_summary(Some(0.5), SentimentLabel::Positive, None),
                ))
            });
            let response = parse_http_response(&response);
            assert_eq!(response.status, 200);
            assert_eq!(response.content_type, "application/json; charset=utf-8");
            let body: Value = serde_json::from_slice(&response.body).expect("analysis JSON body");
            assert_track_analysis_schema(&body);
            assert_eq!(body["trackId"], "track-1");
            assert_eq!(body["sentiment"]["score"], 0.5);
            assert_eq!(body["sentiment"]["label"], "positive");
            assert_eq!(body["blocks"][0]["startLine"], 1);
            assert_eq!(body["blocks"][0]["endLine"], 2);
        }
    }

    #[test]
    fn lyrics_analysis_get_and_post_reject_empty_track_ids_with_the_existing_error_contract() {
        let requests = [
            lyrics_analysis_request("GET", "trackId=", b""),
            lyrics_analysis_request("GET", "trackId=%20%20", b""),
            lyrics_analysis_request("POST", "", br#"{"trackId":""}"#),
            lyrics_analysis_request("POST", "", br#"{"trackId":"  \t"}"#),
        ];
        let analyzer_calls = AtomicUsize::new(0);

        for request in requests {
            let response = track_lyrics_analysis_response(&request, |track_id| {
                analyzer_calls.fetch_add(1, Ordering::SeqCst);
                Ok(lyrics_analysis_fixture(
                    track_id,
                    sentiment_summary(None, SentimentLabel::Unknown, None),
                ))
            });
            assert_text_error(response, "library.error.trackNotFound\t");
        }

        assert_eq!(analyzer_calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn lyrics_analysis_post_reports_invalid_json_without_invoking_the_analyzer() {
        let request = lyrics_analysis_request("POST", "", br#"{"trackId":"track-1""#);
        let response = track_lyrics_analysis_response(&request, |_| {
            panic!("invalid JSON must not reach the analyzer")
        });
        let response = parse_http_response(&response);

        assert_eq!(response.status, 500);
        assert_eq!(response.content_type, "text/plain; charset=utf-8");
        let body = std::str::from_utf8(&response.body).expect("UTF-8 JSON parse error");
        assert!(
            body.contains("EOF while parsing"),
            "unexpected error: {body}"
        );
        assert!(body.contains("line 1 column"), "unexpected error: {body}");
    }

    #[test]
    fn lyrics_analysis_get_and_post_report_missing_tracks_with_the_existing_error_contract() {
        let requests = [
            lyrics_analysis_request("GET", "trackId=missing-track", b""),
            lyrics_analysis_request("POST", "", br#"{"trackId":"missing-track"}"#),
        ];

        for request in requests {
            let response = track_lyrics_analysis_response(&request, |track_id| {
                Err(format!("library.error.trackNotFound\t{track_id}"))
            });
            assert_text_error(response, "library.error.trackNotFound\tmissing-track");
        }
    }

    #[test]
    fn lyrics_analysis_get_and_post_expose_dictionary_unavailability_as_unknown_json() {
        let requests = [
            lyrics_analysis_request("GET", "trackId=track-1", b""),
            lyrics_analysis_request("POST", "", br#"{"trackId":"track-1"}"#),
        ];
        let diagnostic = "sentiment dictionary unavailable: fixture failure";

        for request in requests {
            let response = track_lyrics_analysis_response(&request, |track_id| {
                Ok(lyrics_analysis_fixture(
                    track_id,
                    sentiment_summary(None, SentimentLabel::Unknown, Some(diagnostic)),
                ))
            });
            let response = parse_http_response(&response);
            assert_eq!(response.status, 200);
            assert_eq!(response.content_type, "application/json; charset=utf-8");
            let body: Value = serde_json::from_slice(&response.body).expect("analysis JSON body");
            assert_track_analysis_schema(&body);
            assert!(body["sentiment"]["score"].is_null());
            assert_eq!(body["sentiment"]["label"], "unknown");
            assert_eq!(body["sentiment"]["diagnostic"], diagnostic);
            assert_eq!(body["blocks"][0]["sentiment"]["label"], "unknown");
            assert_eq!(body["blocks"][0]["sentiment"]["diagnostic"], diagnostic);
        }
    }

    #[test]
    fn rejects_untrusted_browser_origins() {
        assert!(is_allowed_request_origin(&request_with_origin(
            None,
            "127.0.0.1:1422"
        )));
        assert!(is_allowed_request_origin(&request_with_origin(
            Some("http://192.168.1.20:1422"),
            "192.168.1.20:1422"
        )));
        assert!(is_allowed_request_origin(&request_with_origin(
            Some("http://localhost:1420"),
            "127.0.0.1:1422"
        )));
        assert!(is_allowed_request_origin(&request_with_origin(
            Some("tauri://localhost"),
            "127.0.0.1:1422"
        )));
        assert!(!is_allowed_request_origin(&request_with_origin(
            Some("https://attacker.example"),
            "127.0.0.1:1422"
        )));
        assert!(!is_allowed_request_origin(&request_with_origin(
            Some("http://attacker.example:1422"),
            "attacker.example:1422"
        )));
    }

    #[test]
    fn detects_evicted_remote_commands() {
        assert!(!has_command_gap(0, Some(50)));
        assert!(!has_command_gap(49, Some(50)));
        assert!(has_command_gap(10, Some(50)));
        assert!(!has_command_gap(10, None));
    }

    #[test]
    fn lyrics_mood_reference_uses_only_the_current_track() {
        let missing_state = Arc::new(RemoteServerStateStore::new(RemoteServerState::default()));
        assert!(matches!(
            lyrics_mood_reference(&missing_state, true).expect("missing reference"),
            LyricsMoodReference::MissingCurrentTrack
        ));
        assert!(matches!(
            lyrics_mood_reference(&missing_state, false).expect("prompt reference"),
            LyricsMoodReference::Prompt
        ));

        let mut player_state = empty_remote_player_state();
        player_state.current_track_id = Some("track-1".to_owned());
        let current_state = Arc::new(RemoteServerStateStore::new(RemoteServerState {
            player_state: Some(player_state),
            ..RemoteServerState::default()
        }));
        assert!(matches!(
            lyrics_mood_reference(&current_state, true).expect("current reference"),
            LyricsMoodReference::CurrentTrack(track_id) if track_id == "track-1"
        ));
    }

    #[test]
    fn lyrics_mood_playback_keeps_the_queue_for_every_non_success_status() {
        for status in [
            LyricsMoodStatus::IndexNotReady,
            LyricsMoodStatus::NeedsCurrentTrack,
            LyricsMoodStatus::ReferenceSentimentUnavailable,
            LyricsMoodStatus::NoMatch,
        ] {
            let mut player_state = empty_remote_player_state();
            player_state.queue_track_ids = vec!["existing-track".to_owned()];
            player_state.current_track_id = Some("existing-track".to_owned());
            let remote_state = Arc::new(RemoteServerStateStore::new(RemoteServerState {
                player_state: Some(player_state),
                ..RemoteServerState::default()
            }));
            let result = super::finalize_lyrics_mood_playback(
                &remote_state,
                voice_lyrics_response(status.clone(), &["new-track"]),
            )
            .expect("structured non-success response");
            assert_eq!(result["status"], serde_json::json!(status));

            let state = remote_state.lock().expect("remote state");
            assert!(state.commands.is_empty());
            let player_state = state.player_state.as_ref().expect("existing player state");
            assert_eq!(player_state.queue_track_ids, vec!["existing-track"]);
            assert_eq!(
                player_state.current_track_id.as_deref(),
                Some("existing-track")
            );
        }
    }

    #[test]
    fn lyrics_mood_playback_sets_the_result_queue_once_and_starts_the_first_track() {
        let remote_state = Arc::new(RemoteServerStateStore::new(RemoteServerState::default()));
        let result = super::finalize_lyrics_mood_playback(
            &remote_state,
            voice_lyrics_response(LyricsMoodStatus::Ok, &["track-2", "track-1"]),
        )
        .expect("playing response");
        assert_eq!(result["status"], "playing");
        assert_eq!(result["command"]["commandType"], "set-queue");

        let state = remote_state.lock().expect("remote state");
        assert_eq!(state.commands.len(), 1);
        let command = state.commands.front().expect("set queue command");
        assert_eq!(command.command_type, "set-queue");
        assert_eq!(
            command.payload.as_ref().expect("payload")["queueTrackIds"],
            serde_json::json!(["track-2", "track-1"])
        );
        assert_eq!(
            command.payload.as_ref().expect("payload")["currentTrackId"],
            "track-2"
        );
        assert_eq!(
            command.payload.as_ref().expect("payload")["isPlaying"],
            true
        );
        let player_state = state.player_state.as_ref().expect("player state");
        assert_eq!(player_state.queue_track_ids, vec!["track-2", "track-1"]);
        assert_eq!(player_state.current_track_id.as_deref(), Some("track-2"));
        assert!(player_state.is_playing);
    }

    #[test]
    fn serves_current_debug_frontend_files_without_caching() {
        let fixture_root = std::env::temp_dir().join(format!(
            "musical-frontend-dist-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let assets_root = fixture_root.join("assets");
        fs::create_dir_all(&assets_root).expect("create frontend assets");
        fs::write(fixture_root.join("index.html"), b"current-index").expect("write frontend index");
        fs::write(assets_root.join("visualizer.js"), b"current-visualizer")
            .expect("write visualizer asset");

        let asset_response = filesystem_frontend_response(&fixture_root, "assets/visualizer.js")
            .expect("serve current asset");
        let fallback_response =
            filesystem_frontend_response(&fixture_root, "player/warp").expect("serve SPA fallback");
        let asset_text = String::from_utf8_lossy(&asset_response);
        let fallback_text = String::from_utf8_lossy(&fallback_response);

        assert!(asset_text.contains("Content-Type: text/javascript; charset=utf-8"));
        assert!(asset_text.contains("Cache-Control: no-store"));
        assert!(asset_text.ends_with("current-visualizer"));
        assert!(fallback_text.contains("Content-Type: text/html; charset=utf-8"));
        assert!(fallback_text.ends_with("current-index"));

        fs::remove_dir_all(fixture_root).expect("remove frontend fixtures");
    }

    #[test]
    fn restricts_media_to_supported_files_inside_library_root() {
        let fixture_root = std::env::temp_dir().join(format!(
            "musical-media-path-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let library_root = fixture_root.join("library");
        fs::create_dir_all(&library_root).expect("create library root");
        let track_path = library_root.join("track.mp3");
        let database_path = library_root.join("library.sqlite3");
        let outside_path = fixture_root.join("secret.mp3");
        fs::write(&track_path, []).expect("write track");
        fs::write(&database_path, []).expect("write database");
        fs::write(&outside_path, []).expect("write outside file");

        assert_eq!(
            resolve_media_path(&library_root, &track_path).expect("allow track"),
            fs::canonicalize(&track_path).expect("canonical track")
        );
        assert!(resolve_media_path(&library_root, &database_path).is_err());
        assert!(resolve_media_path(&library_root, &outside_path).is_err());

        fs::remove_dir_all(fixture_root).expect("remove fixtures");
    }
}
