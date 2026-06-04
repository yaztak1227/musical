use crate::{
    app_config::{
        LOCAL_SERVER_ADDR, LOCAL_SERVER_PORT, MAX_REMOTE_COMMANDS, RESPONSE_WRITE_CHUNK_SIZE,
    },
    audio_analysis,
    library::{self, AlbumTagUpdateRequest, TrackArtworkUpdateRequest, TrackTagUpdateRequest},
};
use include_dir::{include_dir, Dir};
use log::{error, info};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    net::{Shutdown, TcpListener, TcpStream, UdpSocket},
    path::Path,
    sync::{Arc, Mutex},
    thread,
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
    track_id: i64,
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
struct LocalDevAccessBody {
    enabled: bool,
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
    selected_album_id: Option<i64>,
    playback_album_id: Option<i64>,
    current_track_id: Option<i64>,
    queue_track_ids: Vec<i64>,
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
    track_id: i64,
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
    next_command_id: u64,
    player_state: Option<RemotePlayerState>,
    player_state_sent_at_ms: Option<f64>,
    commands: VecDeque<QueuedRemotePlayerCommand>,
    track_analysis_builds: HashMap<i64, TrackAnalysisBuild>,
}

struct TrackAnalysisBuild {
    covered_ranges: Vec<(f64, f64)>,
    expected_duration: f64,
    file_path: String,
    frame_interval_ms: f64,
    frames_by_tick: HashMap<i64, audio_analysis::AudioAnalysisFrame>,
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
                state.queue_track_ids = queue_track_ids.iter().filter_map(Value::as_i64).collect();
            }
        }
        _ => {}
    }
}

type SharedRemoteServerState = Arc<Mutex<RemoteServerState>>;

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
    let remote_state = Arc::new(Mutex::new(RemoteServerState::default()));
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
        ("GET", "/api/library_snapshot") => result_response(library::load_snapshot(&app)),
        ("GET", "/api/track_lyrics") => {
            let track_id = query_param(&request.query, "trackId")
                .and_then(|value| value.parse::<i64>().ok())
                .ok_or_else(|| "library.error.trackNotFound\t".to_owned());
            result_response(
                track_id.and_then(|track_id| library::load_track_lyrics(&app, track_id)),
            )
        }
        ("POST", "/api/track_lyrics") => {
            let request_body = parse_json::<TrackLyricsRequest>(&request.body);
            result_response(
                request_body.and_then(|body| library::load_track_lyrics(&app, body.track_id)),
            )
        }
        ("POST", "/api/scan_music_folder") => {
            let request_body = parse_json::<ScanMusicFolderRequest>(&request.body);
            result_response(
                request_body.and_then(|body| library::scan_folder(&app, &body.folder_path)),
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
        ("GET", "/api/player_state") => {
            let state_result = remote_state
                .lock()
                .map(|state| (state.player_state.clone(), state.player_state_sent_at_ms))
                .map_err(|error| error.to_string());
            match state_result {
                Ok((state, sent_at_ms)) => {
                    let mut headers = Vec::new();
                    if let Some(sent_at_ms) = sent_at_ms {
                        headers.push((
                            "X-Musical-State-Sent-At-Ms".to_owned(),
                            sent_at_ms.to_string(),
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
                state.player_state_sent_at_ms = request
                    .headers
                    .get("x-musical-client-sent-at-ms")
                    .and_then(|value| value.parse::<f64>().ok());
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
        ("GET", "/api/media") => {
            if let Some(path) = query_param(&request.query, "path") {
                file_response(&path)
            } else {
                text_response(400, "missing media path")
            }
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

fn get_track_analysis_segment(
    app: &AppHandle,
    request: &Request,
    remote_state: &SharedRemoteServerState,
) -> Result<RemoteAudioAnalysisSegment, String> {
    let track_id = query_param(&request.query, "trackId")
        .and_then(|value| value.parse::<i64>().ok())
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

    let file_path = library::load_track_file_path(app, track_id)?;
    let loaded_analysis =
        audio_analysis::get_or_analyze_track_segment(app, track_id, &file_path, from, duration)?;
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
    if !loaded_analysis.is_complete {
        let complete_analysis = collect_track_analysis_chunk(
            remote_state,
            track_id,
            &file_path,
            loaded_analysis.analysis.frame_interval_ms,
            &frames,
            from,
            to,
            total_duration,
        )?;
        if let Some(analysis) = complete_analysis {
            audio_analysis::save_track_analysis_cache(app, track_id, &file_path, &analysis)?;
        }
    }

    Ok(RemoteAudioAnalysisSegment {
        frame_interval_ms: loaded_analysis.analysis.frame_interval_ms,
        frames,
        is_complete: loaded_analysis.is_complete,
        track_id,
    })
}

fn collect_track_analysis_chunk(
    remote_state: &SharedRemoteServerState,
    track_id: i64,
    file_path: &str,
    frame_interval_ms: f64,
    frames: &[audio_analysis::AudioAnalysisFrame],
    from: f64,
    to: f64,
    total_duration: f64,
) -> Result<Option<audio_analysis::TrackAnalysis>, String> {
    let mut state = remote_state.lock().map_err(|error| error.to_string())?;
    let build = state
        .track_analysis_builds
        .entry(track_id)
        .or_insert_with(|| TrackAnalysisBuild {
            covered_ranges: Vec::new(),
            expected_duration: total_duration,
            file_path: file_path.to_owned(),
            frame_interval_ms,
            frames_by_tick: HashMap::new(),
        });

    if build.file_path != file_path {
        *build = TrackAnalysisBuild {
            covered_ranges: Vec::new(),
            expected_duration: total_duration,
            file_path: file_path.to_owned(),
            frame_interval_ms,
            frames_by_tick: HashMap::new(),
        };
    }

    build.expected_duration = build.expected_duration.max(total_duration);
    build.frame_interval_ms = frame_interval_ms;
    for frame in frames {
        let tick = ((frame.timecode * 1000.0) / frame_interval_ms).round() as i64;
        build.frames_by_tick.insert(tick, frame.clone());
    }
    build.covered_ranges.push((from.max(0.0), to.max(from)));
    merge_covered_ranges(&mut build.covered_ranges);

    if !ranges_cover_track(
        &build.covered_ranges,
        build.expected_duration,
        frame_interval_ms,
    ) {
        return Ok(None);
    }

    let mut frames = build
        .frames_by_tick
        .values()
        .cloned()
        .collect::<Vec<audio_analysis::AudioAnalysisFrame>>();
    frames.sort_by(|first, second| first.timecode.total_cmp(&second.timecode));
    let analysis = audio_analysis::TrackAnalysis {
        frame_interval_ms: build.frame_interval_ms,
        frames,
    };
    state.track_analysis_builds.remove(&track_id);
    Ok(Some(analysis))
}

fn merge_covered_ranges(ranges: &mut Vec<(f64, f64)>) {
    ranges.sort_by(|first, second| first.0.total_cmp(&second.0));
    let mut merged: Vec<(f64, f64)> = Vec::with_capacity(ranges.len());

    for (start, end) in ranges.drain(..) {
        let Some((_, last_end)) = merged.last_mut() else {
            merged.push((start, end));
            continue;
        };

        if start <= *last_end + 0.1 {
            *last_end = last_end.max(end);
        } else {
            merged.push((start, end));
        }
    }

    *ranges = merged;
}

fn ranges_cover_track(ranges: &[(f64, f64)], total_duration: f64, frame_interval_ms: f64) -> bool {
    let tolerance = (frame_interval_ms / 1000.0).max(0.1);
    ranges
        .first()
        .is_some_and(|(start, end)| *start <= tolerance && *end + tolerance >= total_duration)
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

fn file_response(path: &str) -> Vec<u8> {
    let path = Path::new(path);
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) => return text_response(404, &error.to_string()),
    };
    let mut bytes = Vec::new();
    if let Err(error) = file
        .seek(SeekFrom::Start(0))
        .and_then(|_| file.read_to_end(&mut bytes))
    {
        return text_response(500, &error.to_string());
    }

    response(200, content_type(path), &bytes)
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
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "OK",
    };
    let mut headers = format!(
        "HTTP/1.1 {status} {reason}\r\n\
         Content-Length: {}\r\n\
         Content-Type: {content_type}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type, X-Musical-Client-Sent-At-Ms\r\n\
         Access-Control-Expose-Headers: X-Musical-State-Sent-At-Ms\r\n",
        body.len()
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
