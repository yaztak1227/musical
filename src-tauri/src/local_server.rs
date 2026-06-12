use crate::{
    app_config::{
        LOCAL_SERVER_ADDR, LOCAL_SERVER_PORT, MAX_REMOTE_COMMANDS, RESPONSE_WRITE_CHUNK_SIZE,
    },
    app_settings::{self, AppSettings},
    audio_analysis,
    library::{
        self, AlbumTagUpdateRequest, TrackArtworkUpdateRequest, TrackTagUpdateRequest,
        TrackUserStateUpdateRequest,
    },
};
use include_dir::{include_dir, Dir};
use log::{error, info};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    net::{Shutdown, TcpListener, TcpStream, UdpSocket},
    path::Path,
    sync::{Arc, Condvar, LockResult, Mutex, MutexGuard},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;

static FRONTEND_DIST: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemotePlayerCommandsResponse {
    commands: Vec<QueuedRemotePlayerCommand>,
}

#[derive(Default)]
struct RemoteServerState {
    local_access_enabled: bool,
    mcp_enabled: bool,
    next_command_id: u64,
    player_state: Option<RemotePlayerState>,
    player_state_captured_at_ms: Option<f64>,
    commands: VecDeque<QueuedRemotePlayerCommand>,
    active_track_analysis_loads: HashSet<String>,
    active_track_analysis_prefetches: HashSet<String>,
}

fn apply_remote_command_to_player_state(
    player_state: &mut Option<RemotePlayerState>,
    command: &RemotePlayerCommand,
) {
    let Some(state) = player_state.as_mut() else {
        return;
    };
    let Some(payload) = command.payload.as_ref() else {
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
        _ => {}
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
    let remote_state = Arc::new(RemoteServerStateStore::new(initial_state));
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
                app_settings::save(
                    &app,
                    &AppSettings {
                        last_library_path: app_settings::load(&app)?.last_library_path,
                        mcp_enabled: body.enabled,
                    },
                )?;
                let mut state = remote_state.lock().map_err(|error| error.to_string())?;
                state.mcp_enabled = body.enabled;
                drop(state);
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
        ("GET", "/api/library_snapshot") => result_response(load_library_snapshot(&app)),
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
        ("POST", "/api/scan_music_folder") => {
            let request_body = parse_json::<ScanMusicFolderRequest>(&request.body);
            result_response(
                request_body.and_then(|body| scan_music_folder(&app, &body.folder_path)),
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
        ("GET", "/api/track_analysis") | ("GET", "/api/audio_analysis_segment") => {
            let result = get_track_analysis_segment(&app, &request, &remote_state);
            result_response(result)
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
        ("GET", "/api/player_commands") => {
            let after_id = query_param(&request.query, "after")
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(0);
            let commands = remote_state
                .lock()
                .map(|state| {
                    state
                        .commands
                        .iter()
                        .filter(|command| command.id > after_id)
                        .cloned()
                        .collect::<Vec<_>>()
                })
                .map_err(|error| error.to_string());
            result_response(commands.map(|commands| RemotePlayerCommandsResponse { commands }))
        }
        ("GET", "/api/media") | ("HEAD", "/api/media") => {
            if let Some(path) = query_param(&request.query, "path") {
                file_response(&request, &path)
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

            mcp_response(&request.body, &app, &remote_state)
        }
        ("GET", path) if !path.starts_with("/api/") => frontend_response(path),
        _ => text_response(404, "not found"),
    }
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

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

fn mcp_response(
    request_body: &[u8],
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
) -> Vec<u8> {
    let request = match parse_json::<JsonRpcRequest>(request_body) {
        Ok(request) => request,
        Err(error) => return json_response(400, &json_rpc_error(None, -32700, &error)),
    };

    if request.id.is_none() {
        return empty_response(202);
    }

    let id = request.id.clone();
    let response = match request.method.as_str() {
        "initialize" => json_rpc_result(
            id,
            json!({
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "tools": {
                        "listChanged": false
                    }
                },
                "serverInfo": {
                    "name": "musical",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }),
        ),
        "tools/list" => json_rpc_result(id, json!({ "tools": mcp_tools() })),
        "tools/call" => match call_mcp_tool(app, remote_state, request.params) {
            Ok(result) => json_rpc_result(id, result),
            Err(error) => json_rpc_result(id, mcp_error_tool_result(&error)),
        },
        _ => json_rpc_error(id, -32601, "method not found"),
    };

    json_response(200, &response)
}

fn json_rpc_result(id: Option<Value>, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id.unwrap_or(Value::Null),
        "result": result
    })
}

fn json_rpc_error(id: Option<Value>, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id.unwrap_or(Value::Null),
        "error": {
            "code": code,
            "message": message
        }
    })
}

fn mcp_success_tool_result(value: Value) -> Value {
    json!({
        "content": [
            {
                "type": "text",
                "text": serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string())
            }
        ],
        "structuredContent": value,
        "isError": false
    })
}

fn mcp_error_tool_result(message: &str) -> Value {
    json!({
        "content": [
            {
                "type": "text",
                "text": message
            }
        ],
        "isError": true
    })
}

fn mcp_tools() -> Value {
    json!([
        {
            "name": "get_player_state",
            "title": "Get Player State",
            "description": "Read Musical's current playback state.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "get_library",
            "title": "Get Library",
            "description": "Return the indexed album library.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "search_library",
            "title": "Search Library",
            "description": "Search albums and tracks by title, artist, year, genre, or file path.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 100 }
                },
                "required": ["query"]
            }
        },
        {
            "name": "get_track_lyrics",
            "title": "Get Track Lyrics",
            "description": "Read lyrics saved in a track tag.",
            "inputSchema": {
                "type": "object",
                "properties": { "trackId": { "type": "string" } },
                "required": ["trackId"]
            }
        },
        {
            "name": "play",
            "title": "Play",
            "description": "Start or resume playback.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "pause",
            "title": "Pause",
            "description": "Pause playback.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "toggle_playback",
            "title": "Toggle Playback",
            "description": "Toggle play and pause.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "next_track",
            "title": "Next Track",
            "description": "Skip to the next track.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "previous_track",
            "title": "Previous Track",
            "description": "Skip to the previous track.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "seek",
            "title": "Seek",
            "description": "Seek to a playback time in seconds.",
            "inputSchema": {
                "type": "object",
                "properties": { "time": { "type": "number", "minimum": 0 } },
                "required": ["time"]
            }
        },
        {
            "name": "set_volume",
            "title": "Set Volume",
            "description": "Set volume from 0 to 1.",
            "inputSchema": {
                "type": "object",
                "properties": { "volume": { "type": "number", "minimum": 0, "maximum": 1 } },
                "required": ["volume"]
            }
        },
        {
            "name": "set_shuffle",
            "title": "Set Shuffle",
            "description": "Enable or disable shuffle.",
            "inputSchema": {
                "type": "object",
                "properties": { "isShuffle": { "type": "boolean" } },
                "required": ["isShuffle"]
            }
        },
        {
            "name": "set_repeat",
            "title": "Set Repeat",
            "description": "Set repeat mode.",
            "inputSchema": {
                "type": "object",
                "properties": { "repeatMode": { "type": "string", "enum": ["off", "all", "one"] } },
                "required": ["repeatMode"]
            }
        },
        {
            "name": "play_album",
            "title": "Play Album",
            "description": "Play an album by ID.",
            "inputSchema": {
                "type": "object",
                "properties": { "albumId": { "type": "string" } },
                "required": ["albumId"]
            }
        },
        {
            "name": "play_track",
            "title": "Play Track",
            "description": "Play a track by ID, optionally within an album.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "trackId": { "type": "string" },
                    "albumId": { "type": "string" }
                },
                "required": ["trackId"]
            }
        },
        {
            "name": "select_album",
            "title": "Select Album",
            "description": "Select an album in the Musical UI.",
            "inputSchema": {
                "type": "object",
                "properties": { "albumId": { "type": "string" } },
                "required": ["albumId"]
            }
        },
        {
            "name": "select_track",
            "title": "Select Track",
            "description": "Select a track in the Musical UI.",
            "inputSchema": {
                "type": "object",
                "properties": { "trackId": { "type": "string" } },
                "required": ["trackId"]
            }
        },
        {
            "name": "refresh_library",
            "title": "Refresh Library",
            "description": "Ask the Musical UI to reload the indexed library.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "scan_music_folder",
            "title": "Scan Music Folder",
            "description": "Scan a local music folder and rebuild the indexed library.",
            "inputSchema": {
                "type": "object",
                "properties": { "folderPath": { "type": "string" } },
                "required": ["folderPath"]
            }
        },
        {
            "name": "update_album_tags",
            "title": "Update Album Tags",
            "description": "Write album-wide tag values to files in an album.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "albumId": { "type": "string" },
                    "albumTitle": { "type": "string" },
                    "albumArtist": { "type": "string" },
                    "artist": { "type": "string" },
                    "year": { "type": ["integer", "null"] },
                    "genre": { "type": "string" }
                },
                "required": ["albumId", "albumTitle", "albumArtist", "artist", "genre"]
            }
        },
        {
            "name": "update_track_tags",
            "title": "Update Track Tags",
            "description": "Write tag values to one track file.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "trackId": { "type": "string" },
                    "title": { "type": "string" },
                    "artist": { "type": "string" },
                    "albumTitle": { "type": "string" },
                    "year": { "type": ["integer", "null"] },
                    "genre": { "type": "string" },
                    "trackNumber": { "type": ["integer", "null"] },
                    "discNumber": { "type": ["integer", "null"] }
                },
                "required": ["trackId", "title", "artist", "albumTitle", "genre"]
            }
        },
        {
            "name": "update_track_artwork",
            "title": "Update Track Artwork",
            "description": "Write artwork from a local image path to the track's file.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "trackId": { "type": "string" },
                    "artworkPath": { "type": "string" }
                },
                "required": ["trackId", "artworkPath"]
            }
        },
        {
            "name": "update_track_user_state",
            "title": "Update Track User State",
            "description": "Set Musical-only favorite and rating for a track.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "trackId": { "type": "string" },
                    "isFavorite": { "type": "boolean" },
                    "rating": { "type": ["integer", "null"], "minimum": 1, "maximum": 5 }
                },
                "required": ["trackId", "isFavorite", "rating"]
            }
        }
    ])
}

fn call_mcp_tool(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    params: Option<Value>,
) -> Result<Value, String> {
    let params = params.ok_or_else(|| "missing params".to_owned())?;
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing tool name".to_owned())?;
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let output = match name {
        "get_player_state" => {
            let state = remote_state
                .lock()
                .map(|state| state.player_state.clone())
                .map_err(|error| error.to_string())?;
            json!({ "state": state })
        }
        "get_library" => {
            serde_json::to_value(load_library_snapshot(app)?).map_err(|error| error.to_string())?
        }
        "search_library" => search_library(app, &arguments)?,
        "get_track_lyrics" => {
            let track_id = required_string(&arguments, "trackId")?;
            json!({ "trackId": track_id, "lyrics": library::load_track_lyrics(app, &track_id)? })
        }
        "play" => serde_json::to_value(enqueue_remote_command(remote_state, "play", None)?)
            .map_err(|error| error.to_string())?,
        "pause" => serde_json::to_value(enqueue_remote_command(remote_state, "pause", None)?)
            .map_err(|error| error.to_string())?,
        "toggle_playback" => serde_json::to_value(enqueue_remote_command(
            remote_state,
            "toggle-playback",
            None,
        )?)
        .map_err(|error| error.to_string())?,
        "next_track" => serde_json::to_value(enqueue_remote_command(remote_state, "next", None)?)
            .map_err(|error| error.to_string())?,
        "previous_track" => {
            serde_json::to_value(enqueue_remote_command(remote_state, "previous", None)?)
                .map_err(|error| error.to_string())?
        }
        "seek" => {
            let time = required_f64(&arguments, "time")?.max(0.0);
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "seek",
                Some(json!({ "time": time })),
            )?)
            .map_err(|error| error.to_string())?
        }
        "set_volume" => {
            let volume = required_f64(&arguments, "volume")?.clamp(0.0, 1.0);
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "set-volume",
                Some(json!({ "volume": volume })),
            )?)
            .map_err(|error| error.to_string())?
        }
        "set_shuffle" => {
            let is_shuffle = required_bool(&arguments, "isShuffle")?;
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "toggle-shuffle",
                Some(json!({ "isShuffle": is_shuffle })),
            )?)
            .map_err(|error| error.to_string())?
        }
        "set_repeat" => {
            let repeat_mode = required_string(&arguments, "repeatMode")?;
            if !matches!(repeat_mode.as_str(), "off" | "all" | "one") {
                return Err("repeatMode must be off, all, or one".to_owned());
            }
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "cycle-repeat",
                Some(json!({ "repeatMode": repeat_mode })),
            )?)
            .map_err(|error| error.to_string())?
        }
        "play_album" => {
            let album_id = required_string(&arguments, "albumId")?;
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "play-album",
                Some(json!({ "albumId": album_id })),
            )?)
            .map_err(|error| error.to_string())?
        }
        "play_track" => {
            let track_id = required_string(&arguments, "trackId")?;
            let mut payload = json!({ "trackId": track_id });
            if let Some(album_id) = optional_string(&arguments, "albumId") {
                payload["albumId"] = json!(album_id);
            }
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "play-track",
                Some(payload),
            )?)
            .map_err(|error| error.to_string())?
        }
        "select_album" => {
            let album_id = required_string(&arguments, "albumId")?;
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "select-album",
                Some(json!({ "albumId": album_id })),
            )?)
            .map_err(|error| error.to_string())?
        }
        "select_track" => {
            let track_id = required_string(&arguments, "trackId")?;
            serde_json::to_value(enqueue_remote_command(
                remote_state,
                "select-track",
                Some(json!({ "trackId": track_id })),
            )?)
            .map_err(|error| error.to_string())?
        }
        "refresh_library" => serde_json::to_value(enqueue_remote_command(
            remote_state,
            "refresh-library",
            None,
        )?)
        .map_err(|error| error.to_string())?,
        "scan_music_folder" => {
            let folder_path = required_string(&arguments, "folderPath")?;
            let result = scan_music_folder(app, &folder_path)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            json!({ "scan": result, "refreshCommand": refresh_command })
        }
        "update_album_tags" => {
            let request = serde_json::from_value::<AlbumTagUpdateRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::update_album_tags(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            json!({ "update": result, "refreshCommand": refresh_command })
        }
        "update_track_tags" => {
            let request = serde_json::from_value::<TrackTagUpdateRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::update_track_tags(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            json!({ "update": result, "refreshCommand": refresh_command })
        }
        "update_track_artwork" => {
            let request = serde_json::from_value::<TrackArtworkUpdateRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::update_track_artwork(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            json!({ "update": result, "refreshCommand": refresh_command })
        }
        "update_track_user_state" => {
            let request = serde_json::from_value::<TrackUserStateUpdateRequest>(arguments)
                .map_err(|error| error.to_string())?;
            let result = library::update_track_user_state(app, request)?;
            let refresh_command = enqueue_remote_command(remote_state, "refresh-library", None)?;
            json!({ "update": result, "refreshCommand": refresh_command })
        }
        _ => return Err(format!("unknown tool: {name}")),
    };

    Ok(mcp_success_tool_result(output))
}

fn load_library_snapshot(app: &AppHandle) -> Result<library::LibrarySnapshot, String> {
    library::load_snapshot(app)
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

fn optional_i64(arguments: &Value, key: &str) -> Option<i64> {
    arguments.get(key).and_then(Value::as_i64)
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

fn required_bool(arguments: &Value, key: &str) -> Result<bool, String> {
    arguments
        .get(key)
        .and_then(Value::as_bool)
        .ok_or_else(|| format!("missing or invalid {key}"))
}

fn required_string(arguments: &Value, key: &str) -> Result<String, String> {
    arguments
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .ok_or_else(|| format!("missing or invalid {key}"))
}

fn get_track_analysis_segment(
    app: &AppHandle,
    request: &Request,
    remote_state: &SharedRemoteServerState,
) -> Result<RemoteAudioAnalysisSegment, String> {
    let track_id = query_param(&request.query, "trackId")
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "missing trackId".to_owned())?;
    let from = query_param(&request.query, "from")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite())
        .unwrap_or(0.0)
        .max(0.0);
    let duration = query_param(&request.query, "duration")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite())
        .unwrap_or(4.0)
        .clamp(0.25, 60.0 * 60.0 * 4.0);
    let total_duration = query_param(&request.query, "totalDuration")
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite())
        .unwrap_or(duration)
        .clamp(duration, 60.0 * 60.0 * 4.0);
    let to = from + duration;

    let file_path = library::load_track_file_path(app, &track_id)?;
    let loaded_analysis =
        get_or_analyze_track_once(app, remote_state, &track_id, &file_path, total_duration)?;
    let frames = if loaded_analysis.is_complete {
        loaded_analysis.analysis.frames.clone()
    } else {
        loaded_analysis
            .analysis
            .frames
            .iter()
            .filter(|frame| frame.timecode >= from && frame.timecode <= to)
            .cloned()
            .collect::<Vec<_>>()
    };
    prefetch_next_track_analysis(app.clone(), remote_state.clone(), track_id.clone());

    Ok(RemoteAudioAnalysisSegment {
        frame_interval_ms: loaded_analysis.analysis.frame_interval_ms,
        frames,
        is_complete: loaded_analysis.is_complete,
        track_id: track_id.clone(),
    })
}

fn get_or_analyze_track_once(
    app: &AppHandle,
    remote_state: &SharedRemoteServerState,
    track_id: &str,
    file_path: &str,
    total_duration: f64,
) -> Result<audio_analysis::TrackAnalysisLoad, String> {
    if let Some(analysis) = audio_analysis::get_cached_track_analysis(app, track_id, file_path)? {
        return Ok(audio_analysis::TrackAnalysisLoad {
            analysis,
            is_complete: true,
        });
    }

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
        if let Some(analysis) = audio_analysis::get_cached_track_analysis(app, track_id, file_path)?
        {
            return Ok(audio_analysis::TrackAnalysisLoad {
                analysis,
                is_complete: true,
            });
        }
    }

    let result = analyze_and_cache_track(app, track_id, file_path, total_duration);
    if let Ok(mut state) = remote_state.lock() {
        state.active_track_analysis_loads.remove(track_id);
        remote_state.track_analysis_finished.notify_all();
    }
    result
}

fn analyze_and_cache_track(
    app: &AppHandle,
    track_id: &str,
    file_path: &str,
    total_duration: f64,
) -> Result<audio_analysis::TrackAnalysisLoad, String> {
    if let Some(analysis) = audio_analysis::get_cached_track_analysis(app, track_id, file_path)? {
        return Ok(audio_analysis::TrackAnalysisLoad {
            analysis,
            is_complete: true,
        });
    }

    let loaded_analysis = audio_analysis::get_or_analyze_track_segment(
        app,
        track_id,
        file_path,
        0.0,
        total_duration,
    )?;
    if !loaded_analysis.is_complete {
        audio_analysis::save_track_analysis_cache(
            app,
            track_id,
            file_path,
            &loaded_analysis.analysis,
        )?;
    }
    Ok(audio_analysis::TrackAnalysisLoad {
        analysis: loaded_analysis.analysis,
        is_complete: true,
    })
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
    let (file_path, duration_seconds) = library::load_track_file_path_and_duration(app, track_id)?;
    let duration = (duration_seconds.max(1) as f64) + 2.0;
    get_or_analyze_track_once(app, remote_state, track_id, &file_path, duration)?;
    Ok(())
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

fn text_response(status: u16, message: &str) -> Vec<u8> {
    response(status, "text/plain; charset=utf-8", message.as_bytes())
}

fn empty_response(status: u16) -> Vec<u8> {
    response(status, "text/plain; charset=utf-8", b"")
}

fn file_response(request: &Request, path: &str) -> Vec<u8> {
    let path = Path::new(path);
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

    if let Some(file) = FRONTEND_DIST.get_file(file_path) {
        return response(200, content_type(Path::new(file_path)), file.contents());
    }

    match FRONTEND_DIST.get_file("index.html") {
        Some(index) => response(200, "text/html; charset=utf-8", index.contents()),
        None => text_response(404, "frontend bundle not found"),
    }
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
    response_with_declared_content_length(status, content_type, body, body.len() as u64, extra_headers)
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
         Access-Control-Allow-Headers: Content-Type, Range, X-Musical-State-Captured-At-Ms\r\n\
         Access-Control-Expose-Headers: Accept-Ranges, Content-Range, X-Musical-Response-Sent-At-Ms, X-Musical-State-Captured-At-Ms\r\n",
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
