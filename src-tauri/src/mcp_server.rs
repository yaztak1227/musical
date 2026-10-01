use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};

const LATEST_PROTOCOL_VERSION: &str = "2025-06-18";
const TOOL_MANIFEST_JSON: &str = include_str!("../mcp-tools.json");

static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);
static TOOL_MANIFEST: OnceLock<Vec<Value>> = OnceLock::new();

#[derive(Default)]
pub struct SessionStore {
    session_ids: Mutex<HashSet<String>>,
}

pub struct HttpResponse {
    pub status: u16,
    pub content_type: &'static str,
    pub body: Vec<u8>,
    pub headers: Vec<(String, String)>,
}

impl HttpResponse {
    fn json(status: u16, value: &Value, headers: Vec<(String, String)>) -> Self {
        Self {
            status,
            content_type: "application/json; charset=utf-8",
            body: serde_json::to_vec(value).unwrap_or_else(|_| b"null".to_vec()),
            headers,
        }
    }

    fn empty(status: u16) -> Self {
        Self {
            status,
            content_type: "text/plain; charset=utf-8",
            body: Vec::new(),
            headers: Vec::new(),
        }
    }
}

pub fn handle_request<F>(
    method: &str,
    headers: &HashMap<String, String>,
    body: &[u8],
    sessions: &SessionStore,
    mut call_tool: F,
) -> HttpResponse
where
    F: FnMut(&str, Value) -> Result<Value, String>,
{
    if method == "DELETE" {
        return delete_session(headers, sessions);
    }
    if method != "POST" {
        return HttpResponse::empty(405);
    }

    let request = match serde_json::from_slice::<Value>(body) {
        Ok(request) => request,
        Err(error) => {
            return json_rpc_error_response(
                400,
                Value::Null,
                -32700,
                &format!("Parse error: {error}"),
                Vec::new(),
            )
        }
    };

    let supplied_session_id = headers
        .get("mcp-session-id")
        .map(String::as_str)
        .filter(|value| !value.trim().is_empty());
    let initializes = contains_method(&request, "initialize");
    let (session_id, created_session) = match supplied_session_id {
        Some(session_id) => {
            if !sessions.contains(session_id) {
                return json_rpc_error_response(
                    404,
                    Value::Null,
                    -32001,
                    "Session not found",
                    Vec::new(),
                );
            }
            (session_id.to_owned(), false)
        }
        None if initializes => {
            let session_id = generate_session_id();
            sessions.insert(session_id.clone());
            (session_id, true)
        }
        None => {
            return json_rpc_error_response(
                400,
                Value::Null,
                -32000,
                "Bad Request: Mcp-Session-Id header is required",
                Vec::new(),
            )
        }
    };

    let mut response_headers = vec![(
        "mcp-protocol-version".to_owned(),
        LATEST_PROTOCOL_VERSION.to_owned(),
    )];
    if created_session {
        response_headers.push(("mcp-session-id".to_owned(), session_id));
    }

    let responses = match request {
        Value::Array(messages) if messages.is_empty() => vec![json_rpc_error(
            Value::Null,
            -32600,
            "Invalid Request: empty batch",
        )],
        Value::Array(messages) => messages
            .into_iter()
            .filter_map(|message| process_message(message, created_session, &mut call_tool))
            .collect::<Vec<_>>(),
        message => process_message(message, created_session, &mut call_tool)
            .into_iter()
            .collect(),
    };

    if responses.is_empty() {
        let mut response = HttpResponse::empty(202);
        response.headers = response_headers;
        return response;
    }
    let body = if responses.len() == 1 {
        responses.into_iter().next().unwrap_or(Value::Null)
    } else {
        Value::Array(responses)
    };
    HttpResponse::json(200, &body, response_headers)
}

fn process_message<F>(message: Value, created_session: bool, call_tool: &mut F) -> Option<Value>
where
    F: FnMut(&str, Value) -> Result<Value, String>,
{
    let Some(object) = message.as_object() else {
        return Some(json_rpc_error(Value::Null, -32600, "Invalid Request"));
    };
    let id = object.get("id").cloned();
    let Some(method) = object.get("method").and_then(Value::as_str) else {
        return id.map(|id| json_rpc_error(id, -32600, "Invalid Request"));
    };

    if id.is_none() {
        return None;
    }
    let id = id.unwrap_or(Value::Null);
    match method {
        "initialize" if created_session => {
            let requested_version = object
                .get("params")
                .and_then(|params| params.get("protocolVersion"))
                .and_then(Value::as_str)
                .unwrap_or(LATEST_PROTOCOL_VERSION);
            Some(json_rpc_result(
                id,
                json!({
                    "protocolVersion": negotiated_protocol_version(requested_version),
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": {
                        "name": "musical",
                        "version": env!("CARGO_PKG_VERSION"),
                    },
                }),
            ))
        }
        "initialize" => Some(json_rpc_error(id, -32600, "Server is already initialized")),
        "ping" => Some(json_rpc_result(id, json!({}))),
        "tools/list" => Some(json_rpc_result(id, json!({ "tools": tool_manifest() }))),
        "tools/call" => {
            let params = object.get("params").and_then(Value::as_object);
            let name = params
                .and_then(|params| params.get("name"))
                .and_then(Value::as_str);
            let Some(name) = name else {
                return Some(json_rpc_error(
                    id,
                    -32602,
                    "tools/call requires a tool name",
                ));
            };
            let arguments = params
                .and_then(|params| params.get("arguments"))
                .cloned()
                .unwrap_or_else(|| json!({}));
            let result = match call_tool(name, arguments) {
                Ok(structured_content) if structured_content.is_object() => json!({
                    "content": [],
                    "structuredContent": structured_content,
                    "isError": false,
                }),
                Ok(_) => tool_error_result("MCP tool success result must be a JSON object"),
                Err(error) => tool_error_result(&error),
            };
            Some(json_rpc_result(id, result))
        }
        _ => Some(json_rpc_error(id, -32601, "Method not found")),
    }
}

fn delete_session(headers: &HashMap<String, String>, sessions: &SessionStore) -> HttpResponse {
    let Some(session_id) = headers.get("mcp-session-id") else {
        return json_rpc_error_response(
            400,
            Value::Null,
            -32000,
            "Bad Request: Mcp-Session-Id header is required",
            Vec::new(),
        );
    };
    if sessions.remove(session_id) {
        HttpResponse::empty(200)
    } else {
        json_rpc_error_response(404, Value::Null, -32001, "Session not found", Vec::new())
    }
}

fn contains_method(value: &Value, expected: &str) -> bool {
    match value {
        Value::Array(values) => values.iter().any(|value| contains_method(value, expected)),
        Value::Object(object) => object.get("method").and_then(Value::as_str) == Some(expected),
        _ => false,
    }
}

fn negotiated_protocol_version(requested: &str) -> &str {
    match requested {
        "2025-06-18" | "2025-03-26" | "2024-11-05" => requested,
        _ => LATEST_PROTOCOL_VERSION,
    }
}

fn tool_manifest() -> &'static Vec<Value> {
    TOOL_MANIFEST.get_or_init(|| {
        serde_json::from_str(TOOL_MANIFEST_JSON)
            .expect("generated MCP tool manifest must contain a JSON array")
    })
}

fn generate_session_id() -> String {
    let sequence = NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("{now:032x}{sequence:016x}")
}

fn json_rpc_result(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn json_rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message },
    })
}

fn json_rpc_error_response(
    status: u16,
    id: Value,
    code: i64,
    message: &str,
    headers: Vec<(String, String)>,
) -> HttpResponse {
    HttpResponse::json(status, &json_rpc_error(id, code, message), headers)
}

fn tool_error_result(message: &str) -> Value {
    json!({
        "content": [{ "type": "text", "text": redact_home_path(message) }],
        "isError": true,
    })
}

fn redact_home_path(message: &str) -> String {
    let home = std::env::var("USERPROFILE")
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| std::env::var("HOME").ok().filter(|value| !value.is_empty()));
    let Some(home) = home else {
        return message.to_owned();
    };
    let normalized = home.trim_end_matches(['/', '\\']);
    if normalized.is_empty() {
        return message.to_owned();
    }

    let mut variants = vec![
        normalized.to_owned(),
        normalized.replace('\\', "/"),
        normalized.replace('/', "\\"),
    ];
    if normalized.as_bytes().get(1) == Some(&b':') {
        let slash = normalized.replace('\\', "/");
        let backslash = normalized.replace('/', "\\");
        for prefix in [r"\\?\", "//?/", r"\\?/", "//?\\"] {
            variants.push(format!("{prefix}{slash}"));
            variants.push(format!("{prefix}{backslash}"));
        }
    }
    variants.sort_by_key(|variant| std::cmp::Reverse(variant.len()));
    variants.dedup();

    variants
        .into_iter()
        .fold(message.to_owned(), |redacted, variant| {
            redact_path_variant(&redacted, &variant)
        })
}

fn redact_path_variant(message: &str, variant: &str) -> String {
    let mut output = String::with_capacity(message.len());
    let mut cursor = 0;
    while let Some(relative_index) = message[cursor..].find(variant) {
        let index = cursor + relative_index;
        let end = index + variant.len();
        output.push_str(&message[cursor..index]);
        if has_path_boundary(message, index, end) && !is_non_file_url_path(message, index) {
            output.push_str("[home]");
        } else {
            output.push_str(variant);
        }
        cursor = end;
    }
    output.push_str(&message[cursor..]);
    output
}

fn has_path_boundary(message: &str, start: usize, end: usize) -> bool {
    let previous = message[..start].chars().next_back();
    let next = message[end..].chars().next();
    let invalid = |character: char| character.is_alphanumeric() || "_.-".contains(character);
    !previous.is_some_and(invalid) && !next.is_some_and(invalid)
}

fn is_non_file_url_path(message: &str, index: usize) -> bool {
    let prefix = &message[..index];
    let token_start = prefix
        .rfind(|character: char| character.is_whitespace() || "\"'<>".contains(character))
        .map_or(0, |position| position + 1);
    let token = &prefix[token_start..];
    let Some((scheme, _)) = token.split_once("://") else {
        return false;
    };
    !scheme.eq_ignore_ascii_case("file")
}

impl SessionStore {
    fn contains(&self, session_id: &str) -> bool {
        self.session_ids
            .lock()
            .map(|sessions| sessions.contains(session_id))
            .unwrap_or(false)
    }

    fn insert(&self, session_id: String) {
        if let Ok(mut sessions) = self.session_ids.lock() {
            sessions.insert(session_id);
        }
    }

    fn remove(&self, session_id: &str) -> bool {
        self.session_ids
            .lock()
            .map(|mut sessions| sessions.remove(session_id))
            .unwrap_or(false)
    }

    pub fn clear(&self) {
        if let Ok(mut sessions) = self.session_ids.lock() {
            sessions.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(
        body: Value,
        headers: HashMap<String, String>,
        sessions: &SessionStore,
    ) -> HttpResponse {
        handle_request(
            "POST",
            &headers,
            &serde_json::to_vec(&body).unwrap(),
            sessions,
            |name, arguments| Ok(json!({ "name": name, "arguments": arguments })),
        )
    }

    fn initialize(sessions: &SessionStore) -> (String, HttpResponse) {
        let response = request(
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": { "protocolVersion": LATEST_PROTOCOL_VERSION },
            }),
            HashMap::new(),
            sessions,
        );
        let session_id = response
            .headers
            .iter()
            .find(|(name, _)| name == "mcp-session-id")
            .map(|(_, value)| value.clone())
            .unwrap();
        (session_id, response)
    }

    #[test]
    fn initialize_creates_a_session_in_the_main_process() {
        let sessions = SessionStore::default();
        let (session_id, response) = initialize(&sessions);
        assert_eq!(response.status, 200);
        assert!(sessions.contains(&session_id));
        let body: Value = serde_json::from_slice(&response.body).unwrap();
        assert_eq!(body["result"]["serverInfo"]["name"], "musical");
    }

    #[test]
    fn list_tools_uses_the_generated_catalog() {
        let sessions = SessionStore::default();
        let (session_id, _) = initialize(&sessions);
        let response = request(
            json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }),
            HashMap::from([("mcp-session-id".to_owned(), session_id)]),
            &sessions,
        );
        let body: Value = serde_json::from_slice(&response.body).unwrap();
        assert_eq!(body["result"]["tools"].as_array().map(Vec::len), Some(51));
    }

    #[test]
    fn delete_terminates_only_the_requested_session() {
        let sessions = SessionStore::default();
        let (session_id, _) = initialize(&sessions);
        let response = handle_request(
            "DELETE",
            &HashMap::from([("mcp-session-id".to_owned(), session_id.clone())]),
            &[],
            &sessions,
            |_, _| Ok(Value::Null),
        );
        assert_eq!(response.status, 200);
        assert!(!sessions.contains(&session_id));
    }

    #[test]
    fn tool_errors_redact_the_current_home_directory() {
        let Some(home) = std::env::var("HOME").ok().filter(|value| !value.is_empty()) else {
            return;
        };
        let result = tool_error_result(&format!("failed to read {home}/Music/library.db"));
        assert_eq!(
            result["content"][0]["text"],
            "failed to read [home]/Music/library.db"
        );
    }
}
