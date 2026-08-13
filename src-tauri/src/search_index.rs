use crate::{
    atomic_file, library,
    lyrics_sentiment::{self, LyricsSentimentBlock, LyricsSentimentSummary, TrackLyricsAnalysis},
};
use fastembed::{EmbeddingModel, Pooling, TextEmbedding, TextInitOptions};
use hf_hub::{api::sync::ApiBuilder, Cache as HuggingFaceCache, Repo, RepoType};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use unicode_normalization::UnicodeNormalization;

const SEARCH_INDEX_DATABASE_NAME: &str = "search_index.sqlite3";
const SEARCH_INDEX_SCHEMA_VERSION: &str = "2";
const EMBEDDING_MODEL_REPOSITORY: &str = "intfloat/multilingual-e5-small";
const EMBEDDING_MODEL_REVISION: &str = "614241f622f53c4eeff9890bdc4f31cfecc418b3";
const EMBEDDING_MODEL_MANIFEST_SHA256: &str =
    "a1c9fc0930d0049c947ecd9e0207a1d20772977ac50b17dc3bd72a06d963bf37";
const EMBEDDING_MAX_LENGTH: usize = 512;
const EMBEDDING_PIPELINE_ID: &str = "fastembed=5.17.4;tokenizers=0.22.2;pooling=mean;max_length=512;query-prefix=query-colon-space;passage-prefix=passage-colon-space;output-normalization=l2-epsilon-1e-12";
const EMBEDDING_MODEL_ID: &str = concat!(
    "intfloat/multilingual-e5-small@",
    "614241f622f53c4eeff9890bdc4f31cfecc418b3",
    "#manifest-sha256:",
    "a1c9fc0930d0049c947ecd9e0207a1d20772977ac50b17dc3bd72a06d963bf37",
    "#pipeline:",
    "fastembed=5.17.4;tokenizers=0.22.2;pooling=mean;max_length=512;query-prefix=query-colon-space;passage-prefix=passage-colon-space;output-normalization=l2-epsilon-1e-12"
);
const EMBEDDING_MODEL_CACHE_DIRECTORY: &str = "semantic-models-pinned";
const EMBEDDING_QUERY_PREFIX: &str = "query: ";
const EMBEDDING_PASSAGE_PREFIX: &str = "passage: ";
const MAX_REFRESH_FAILURE_BACKOFF_SECONDS: i64 = 60 * 60;
const LYRICS_CHUNK_LINES: usize = 6;
const LYRICS_CHUNK_OVERLAP: usize = 2;
const MAX_DOCUMENT_CHARS: usize = 1_500;
const MAX_MATCHED_TEXT_CHARS: usize = 320;
const MAX_VOICE_MATCHED_TEXT_CHARS: usize = 180;
const QUERY_CACHE_CAPACITY: usize = 128;

#[derive(Clone, Copy)]
struct EmbeddingModelResource {
    path: &'static str,
    sha256: &'static str,
    size: u64,
}

const EMBEDDING_MODEL_RESOURCES: [EmbeddingModelResource; 5] = [
    EmbeddingModelResource {
        path: "onnx/model.onnx",
        sha256: "ca456c06b3a9505ddfd9131408916dd79290368331e7d76bb621f1cba6bc8665",
        size: 470_268_510,
    },
    EmbeddingModelResource {
        path: "tokenizer.json",
        sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39",
        size: 17_082_730,
    },
    EmbeddingModelResource {
        path: "config.json",
        sha256: "69137736cab8b8903a07fe8afaafdda25aac55415a12a55d1bffa9f581abf959",
        size: 655,
    },
    EmbeddingModelResource {
        path: "special_tokens_map.json",
        sha256: "d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7",
        size: 167,
    },
    EmbeddingModelResource {
        path: "tokenizer_config.json",
        sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b",
        size: 443,
    },
];

static SEARCH_RUNTIME: OnceLock<Mutex<SearchRuntime>> = OnceLock::new();
static SEARCH_BUILD_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static SEARCH_REFRESH_STATE: OnceLock<Mutex<SearchRefreshState>> = OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchTracksRequest {
    pub query: String,
    #[serde(default = "default_search_mode")]
    pub mode: String,
    #[serde(default = "default_search_target")]
    pub target: String,
    #[serde(default)]
    pub lyrics_only: bool,
    #[serde(default)]
    pub favorite_only: bool,
    pub min_rating: Option<i64>,
    #[serde(default)]
    pub genres: Vec<String>,
    pub artist: Option<String>,
    #[serde(default)]
    pub exclude_track_ids: Vec<String>,
    #[serde(default = "default_search_limit")]
    pub limit: usize,
    #[serde(default)]
    pub sentiment_weight: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendTracksRequest {
    pub prompt: String,
    #[serde(default)]
    pub favorite_only: bool,
    pub min_rating: Option<i64>,
    #[serde(default)]
    pub genres: Vec<String>,
    pub artist: Option<String>,
    #[serde(default)]
    pub avoid_track_ids: Vec<String>,
    pub duration_minutes: Option<i64>,
    #[serde(default = "default_artist_limit")]
    pub max_tracks_per_artist: usize,
    #[serde(default = "default_recommendation_limit")]
    pub limit: usize,
    #[serde(default = "default_recommendation_sentiment_weight")]
    pub sentiment_weight: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsMoodSearchRequest {
    pub prompt: String,
    pub mood_strength: Option<String>,
    #[serde(default)]
    pub favorite_only: bool,
    pub min_rating: Option<i64>,
    #[serde(default)]
    pub genres: Vec<String>,
    pub artist: Option<String>,
    #[serde(default)]
    pub exclude_track_ids: Vec<String>,
    pub relative_to_current: Option<String>,
    #[serde(default = "default_search_limit")]
    pub limit: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsMoodPlayRequest {
    pub prompt: String,
    pub mood_strength: Option<String>,
    #[serde(default)]
    pub favorite_only: bool,
    pub min_rating: Option<i64>,
    #[serde(default)]
    pub genres: Vec<String>,
    pub artist: Option<String>,
    #[serde(default)]
    pub avoid_track_ids: Vec<String>,
    pub relative_to_current: Option<String>,
    pub duration_minutes: Option<i64>,
    #[serde(default = "default_artist_limit")]
    pub max_tracks_per_artist: usize,
    #[serde(default = "default_recommendation_limit")]
    pub limit: usize,
}

#[derive(Clone, Debug)]
pub enum LyricsMoodReference {
    Prompt,
    CurrentTrack(String),
    MissingCurrentTrack,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum LyricsMoodStatus {
    Ok,
    Playing,
    NoMatch,
    IndexNotReady,
    NeedsCurrentTrack,
    ReferenceSentimentUnavailable,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLyricsSentiment {
    pub score: Option<f32>,
    pub label: lyrics_sentiment::SentimentLabel,
    pub coverage: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLyricsMatch {
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album_title: String,
    pub duration_seconds: i64,
    pub matched_text: String,
    pub reason: String,
    pub sentiment: Option<VoiceLyricsSentiment>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceLyricsResponse {
    pub status: LyricsMoodStatus,
    pub interpreted_prompt: String,
    pub query_sentiment: VoiceLyricsSentiment,
    pub total_duration_seconds: i64,
    pub results: Vec<VoiceLyricsMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_build: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchIndexStatus {
    pub ready: bool,
    pub stale: bool,
    pub model_id: String,
    pub analyzer_id: String,
    pub indexed_analyzer_id: Option<String>,
    pub generation: i64,
    pub track_count: usize,
    pub document_count: usize,
    pub retryable_sentiment_count: usize,
    pub sentiment_retry_after: Option<i64>,
    pub source_revision: Option<String>,
    pub indexed_source_revision: Option<String>,
    pub built_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchIndexBuildResult {
    pub status: SearchIndexStatus,
    pub embedded_document_count: usize,
    pub reused_document_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackSearchResponse {
    pub query: String,
    pub mode: String,
    pub target: String,
    pub index: SearchIndexStatus,
    pub query_sentiment: LyricsSentimentSummary,
    pub results: Vec<TrackSearchResult>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackSearchResult {
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album_title: String,
    pub album_artist: String,
    pub genre: Option<String>,
    pub duration_seconds: i64,
    pub has_lyrics: bool,
    pub is_favorite: bool,
    pub rating: Option<i64>,
    pub score: f32,
    pub semantic_score: f32,
    pub lexical_score: f32,
    pub lyrics_sentiment: Option<LyricsSentimentSummary>,
    pub sentiment_similarity: Option<f32>,
    pub matched_document_kind: String,
    pub matched_text: String,
    pub reason: String,
    #[serde(skip)]
    lyrics_hash: Option<String>,
    #[serde(skip)]
    lyrics_lines: Option<Vec<String>>,
    #[serde(skip)]
    lyrics_line_set: Option<HashSet<String>>,
    #[serde(skip)]
    lyrics_chars: Option<String>,
    #[serde(skip)]
    lyrics_five_grams: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackRecommendationResponse {
    pub prompt: String,
    pub basis: String,
    pub index: SearchIndexStatus,
    pub query_sentiment: LyricsSentimentSummary,
    pub total_duration_seconds: i64,
    pub results: Vec<TrackSearchResult>,
}

#[derive(Clone)]
struct TrackSource {
    track_uuid: String,
    title: String,
    artist: String,
    album_title: String,
    album_artist: String,
    genre: Option<String>,
    duration_seconds: i64,
    lyrics: Option<String>,
    is_favorite: bool,
    rating: Option<i64>,
    file_mtime: i64,
    file_size: i64,
    user_state_updated_at: Option<String>,
}

struct PendingDocument {
    track_uuid: String,
    kind: String,
    ordinal: i64,
    text: String,
    content_hash: String,
    embedding: Option<Vec<f32>>,
}

#[derive(Clone)]
struct CachedTrack {
    track_uuid: String,
    title: String,
    artist: String,
    album_title: String,
    album_artist: String,
    genre: Option<String>,
    duration_seconds: i64,
    has_lyrics: bool,
    is_favorite: bool,
    rating: Option<i64>,
    lyrics_sentiment: Option<LyricsSentimentSummary>,
    lyrics_analysis: Option<TrackLyricsAnalysis>,
}

struct CachedDocument {
    track_uuid: String,
    kind: String,
    text: String,
    normalized_text: String,
    embedding: Vec<f32>,
}

struct LoadedIndex {
    database_path: PathBuf,
    generation: i64,
    tracks: HashMap<String, CachedTrack>,
    documents: Vec<CachedDocument>,
}

struct QueryCacheEntry {
    key: String,
    embedding: Vec<f32>,
}

#[derive(Default)]
struct SearchRuntime {
    model: Option<TextEmbedding>,
    loaded_index: Option<LoadedIndex>,
    query_cache: VecDeque<QueryCacheEntry>,
}

#[derive(Default)]
struct SearchRefreshState {
    running: bool,
    active_library: Option<PathBuf>,
    pending_libraries: VecDeque<PathBuf>,
    checked_libraries: HashSet<PathBuf>,
    scheduled_sentiment_retries: HashMap<PathBuf, i64>,
    refresh_failure_streaks: HashMap<PathBuf, u32>,
}

#[derive(Clone)]
struct Candidate {
    track: CachedTrack,
    score: f32,
    semantic_score: f32,
    lexical_score: f32,
    matched_document_kind: String,
    matched_text: String,
    sentiment_similarity: Option<f32>,
    sentiment_effective_weight: f32,
    lyrics_chunk_scores: Vec<f32>,
}

pub fn index_status(app: &AppHandle) -> Result<SearchIndexStatus, String> {
    let (library_database_path, search_database_path) = current_database_paths(app)?;
    index_status_for_paths(&library_database_path, &search_database_path)
}

fn index_status_for_paths(
    library_database_path: &Path,
    search_database_path: &Path,
) -> Result<SearchIndexStatus, String> {
    let source_revision = current_source_revision(library_database_path)?;
    if !search_database_path.exists() {
        return Ok(SearchIndexStatus {
            ready: false,
            stale: true,
            model_id: EMBEDDING_MODEL_ID.to_owned(),
            analyzer_id: lyrics_sentiment::ANALYZER_ID.to_owned(),
            indexed_analyzer_id: None,
            generation: 0,
            track_count: 0,
            document_count: 0,
            retryable_sentiment_count: 0,
            sentiment_retry_after: None,
            source_revision: Some(source_revision),
            indexed_source_revision: None,
            built_at: None,
        });
    }

    let connection = open_search_database(search_database_path)?;
    let generation = read_meta_i64(&connection, "generation")?.unwrap_or(0);
    let indexed_source_revision = read_meta(&connection, "source_revision")?;
    let indexed_model = read_meta(&connection, "model_id")?;
    let indexed_schema = read_meta(&connection, "schema_version")?;
    let indexed_analyzer_id = read_meta(&connection, "analyzer_id")?;
    let retryable_sentiment_count = read_meta_i64(&connection, "retryable_sentiment_count")?
        .unwrap_or(0)
        .max(0) as usize;
    let sentiment_retry_after =
        read_meta_i64(&connection, "sentiment_retry_after")?.filter(|retry_after| *retry_after > 0);
    let built_at = read_meta_i64(&connection, "built_at")?;
    let track_count = count_rows(&connection, "tracks")?;
    let document_count = count_rows(&connection, "documents")?;
    let (ready, stale) = evaluate_index_state(
        generation,
        &source_revision,
        indexed_source_revision.as_deref(),
        indexed_model.as_deref(),
        indexed_schema.as_deref(),
        indexed_analyzer_id.as_deref(),
        retryable_sentiment_count,
        sentiment_retry_after,
        unix_timestamp_seconds()?,
    );

    Ok(SearchIndexStatus {
        ready,
        stale,
        model_id: EMBEDDING_MODEL_ID.to_owned(),
        analyzer_id: lyrics_sentiment::ANALYZER_ID.to_owned(),
        indexed_analyzer_id,
        generation,
        track_count,
        document_count,
        retryable_sentiment_count,
        sentiment_retry_after,
        source_revision: Some(source_revision),
        indexed_source_revision,
        built_at,
    })
}

#[allow(clippy::too_many_arguments)]
fn evaluate_index_state(
    generation: i64,
    source_revision: &str,
    indexed_source_revision: Option<&str>,
    indexed_model: Option<&str>,
    indexed_schema: Option<&str>,
    indexed_analyzer_id: Option<&str>,
    retryable_sentiment_count: usize,
    sentiment_retry_after: Option<i64>,
    now: i64,
) -> (bool, bool) {
    let model_matches = indexed_model == Some(EMBEDDING_MODEL_ID);
    let schema_matches = indexed_schema == Some(SEARCH_INDEX_SCHEMA_VERSION);
    let analyzer_matches = indexed_analyzer_id == Some(lyrics_sentiment::ANALYZER_ID);
    let sentiment_retry_is_due = retryable_sentiment_count > 0
        && sentiment_retry_after.is_none_or(|retry_after| retry_after <= now);
    let ready = generation > 0 && model_matches && schema_matches;
    let stale = indexed_source_revision != Some(source_revision)
        || !model_matches
        || !schema_matches
        || !analyzer_matches
        || sentiment_retry_is_due;
    (ready, stale)
}

pub fn build_index(app: &AppHandle) -> Result<SearchIndexBuildResult, String> {
    let (library_database_path, search_database_path) = current_database_paths(app)?;
    build_index_for_paths(app, &library_database_path, &search_database_path)
}

pub fn track_lyrics_analysis(
    app: &AppHandle,
    track_id: &str,
) -> Result<TrackLyricsAnalysis, String> {
    let lyrics = library::load_track_lyrics(app, track_id)?;
    let Some(lyrics) = lyrics else {
        return Ok(lyrics_sentiment::no_lyrics_analysis(track_id));
    };
    if lyrics.trim().is_empty() {
        return Ok(lyrics_sentiment::analyze_track(app, track_id, &lyrics));
    }

    let expected_lyrics_hash = lyrics_sentiment::lyrics_hash(&lyrics);
    let expected_analysis_hash = lyrics_sentiment::analysis_hash(&lyrics);
    if let Some(library_database_path) = library::current_database_path(app)? {
        let search_database_path = search_database_path_for_library(&library_database_path);
        if search_database_path.exists() {
            let cached = Connection::open_with_flags(
                &search_database_path,
                OpenFlags::SQLITE_OPEN_READ_ONLY,
            )
            .map_err(to_error_string)
            .and_then(|connection| {
                if !table_exists(&connection, "track_lyrics_sentiment")?
                    || !table_exists(&connection, "lyrics_sentiment_blocks")?
                {
                    return Ok(None);
                }
                load_cached_track_analysis(
                    &connection,
                    track_id,
                    &expected_lyrics_hash,
                    &expected_analysis_hash,
                )
            });
            match cached {
                Ok(Some(analysis)) => return Ok(analysis),
                Ok(None) => {}
                Err(error) => {
                    log::warn!("could not read cached lyrics sentiment for {track_id}: {error}");
                }
            }
        }
    }
    Ok(lyrics_sentiment::analyze_track(app, track_id, &lyrics))
}

fn build_index_for_paths(
    app: &AppHandle,
    library_database_path: &Path,
    search_database_path: &Path,
) -> Result<SearchIndexBuildResult, String> {
    let _build_guard = search_build_lock()
        .lock()
        .map_err(|error| error.to_string())?;
    let sources = load_track_sources(library_database_path)?;
    let source_revision = revision_for_sources(&sources);
    let mut connection = open_search_database(search_database_path)?;
    initialize_search_database(&connection)?;
    let existing_documents = load_existing_documents(&connection)?;
    let existing_analyses = load_cached_analyses(&connection)?;
    let previous_sentiment_retry_after =
        read_meta_i64(&connection, "sentiment_retry_after")?.filter(|retry_after| *retry_after > 0);

    let mut analyses = HashMap::<String, (String, TrackLyricsAnalysis)>::new();
    for source in &sources {
        let Some(lyrics) = source
            .lyrics
            .as_deref()
            .filter(|lyrics| !lyrics.trim().is_empty())
        else {
            continue;
        };
        let expected_hash = lyrics_sentiment::analysis_hash(lyrics);
        let current_lyrics_hash = lyrics_sentiment::lyrics_hash(lyrics);
        let analysis = reusable_cached_analysis(
            existing_analyses.get(&source.track_uuid),
            &expected_hash,
            &current_lyrics_hash,
        )
        .unwrap_or_else(|| lyrics_sentiment::analyze_track(app, &source.track_uuid, lyrics));
        analyses.insert(source.track_uuid.clone(), (expected_hash, analysis));
    }
    let retryable_sentiment_count = analyses
        .values()
        .filter(|(_, analysis)| lyrics_sentiment::is_retryable_unavailable(&analysis.sentiment))
        .count();
    let sentiment_retry_now = unix_timestamp_seconds()?;
    let sentiment_retry_after = next_sentiment_retry_after(
        retryable_sentiment_count,
        previous_sentiment_retry_after,
        sentiment_retry_now,
    );

    let mut documents = build_documents(&sources);
    let mut reused_document_count = 0usize;
    let mut pending_indexes = Vec::new();
    for (index, document) in documents.iter_mut().enumerate() {
        let key = document_key(&document.track_uuid, &document.kind, document.ordinal);
        if let Some((content_hash, embedding)) = existing_documents.get(&key) {
            if content_hash == &document.content_hash {
                document.embedding = Some(embedding.clone());
                reused_document_count += 1;
                continue;
            }
        }
        pending_indexes.push(index);
    }

    if !pending_indexes.is_empty() {
        let inputs = pending_indexes
            .iter()
            .map(|index| format!("{EMBEDDING_PASSAGE_PREFIX}{}", documents[*index].text))
            .collect::<Vec<_>>();
        let mut runtime = search_runtime().lock().map_err(|error| error.to_string())?;
        let model = ensure_model(app, &mut runtime)?;
        let embeddings = model.embed(inputs, Some(32)).map_err(|error| {
            format!("failed to create local semantic-search embeddings: {error}")
        })?;
        if embeddings.len() != pending_indexes.len() {
            return Err("embedding model returned an unexpected result count".to_owned());
        }
        for (document_index, embedding) in pending_indexes.iter().zip(embeddings) {
            documents[*document_index].embedding = Some(embedding);
        }
    }

    let previous_generation = read_meta_i64(&connection, "generation")?.unwrap_or(0);
    let generation = previous_generation.saturating_add(1);
    let built_at = unix_timestamp_seconds()?;
    let transaction = connection.transaction().map_err(to_error_string)?;
    transaction
        .execute("DELETE FROM documents", [])
        .map_err(to_error_string)?;
    transaction
        .execute("DELETE FROM tracks", [])
        .map_err(to_error_string)?;
    transaction
        .execute("DELETE FROM lyrics_sentiment_blocks", [])
        .map_err(to_error_string)?;
    transaction
        .execute("DELETE FROM track_lyrics_sentiment", [])
        .map_err(to_error_string)?;

    for source in &sources {
        transaction
            .execute(
                "INSERT INTO tracks (
                    track_uuid, title, artist, album_title, album_artist, genre,
                    duration_seconds, has_lyrics, is_favorite, rating
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    source.track_uuid,
                    source.title,
                    source.artist,
                    source.album_title,
                    source.album_artist,
                    source.genre,
                    source.duration_seconds,
                    source
                        .lyrics
                        .as_deref()
                        .is_some_and(|lyrics| !lyrics.trim().is_empty()),
                    source.is_favorite,
                    source.rating,
                ],
            )
            .map_err(to_error_string)?;
    }

    for document in &documents {
        let embedding = document
            .embedding
            .as_ref()
            .ok_or_else(|| "semantic-search document has no embedding".to_owned())?;
        transaction
            .execute(
                "INSERT INTO documents (
                    track_uuid, kind, ordinal, text, content_hash, embedding
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    document.track_uuid,
                    document.kind,
                    document.ordinal,
                    document.text,
                    document.content_hash,
                    encode_embedding(embedding),
                ],
            )
            .map_err(to_error_string)?;
    }

    for source in &sources {
        if let Some((sentiment_hash, analysis)) = analyses.get(&source.track_uuid) {
            store_track_analysis(&transaction, sentiment_hash, analysis)?;
        }
    }

    write_meta(&transaction, "schema_version", SEARCH_INDEX_SCHEMA_VERSION)?;
    write_meta(&transaction, "model_id", EMBEDDING_MODEL_ID)?;
    write_meta(&transaction, "analyzer_id", lyrics_sentiment::ANALYZER_ID)?;
    write_meta(
        &transaction,
        "retryable_sentiment_count",
        &retryable_sentiment_count.to_string(),
    )?;
    write_meta(
        &transaction,
        "sentiment_retry_after",
        &sentiment_retry_after.unwrap_or(0).to_string(),
    )?;
    write_meta(&transaction, "source_revision", &source_revision)?;
    write_meta(&transaction, "generation", &generation.to_string())?;
    write_meta(&transaction, "built_at", &built_at.to_string())?;
    transaction.commit().map_err(to_error_string)?;

    {
        let mut runtime = search_runtime().lock().map_err(|error| error.to_string())?;
        runtime.loaded_index = None;
        runtime.query_cache.clear();
    }

    reset_refresh_failure_streak_for_library(library_database_path);
    update_sentiment_retry_schedule(app, library_database_path, sentiment_retry_after);

    Ok(SearchIndexBuildResult {
        status: index_status_for_paths(library_database_path, search_database_path)?,
        embedded_document_count: pending_indexes.len(),
        reused_document_count,
    })
}

fn reusable_cached_analysis(
    cached: Option<&(String, TrackLyricsAnalysis)>,
    expected_analysis_hash: &str,
    current_lyrics_hash: &str,
) -> Option<TrackLyricsAnalysis> {
    let (cached_hash, cached_analysis) = cached?;
    if cached_hash != expected_analysis_hash
        || cached_analysis.blocks.is_empty()
        || lyrics_sentiment::is_retryable_unavailable(&cached_analysis.sentiment)
    {
        return None;
    }
    let mut analysis = cached_analysis.clone();
    analysis.lyrics_hash = current_lyrics_hash.to_owned();
    Some(analysis)
}

pub(crate) fn schedule_refresh(app: &AppHandle, force: bool) {
    let Some(library_database_path) = library::current_database_path(app)
        .map_err(|error| {
            log::warn!("could not resolve library for semantic-search refresh: {error}");
        })
        .ok()
        .flatten()
    else {
        return;
    };

    let should_spawn = {
        let mut state = match search_refresh_state().lock() {
            Ok(state) => state,
            Err(error) => {
                log::warn!("could not schedule semantic-search refresh: {error}");
                return;
            }
        };
        if !force
            && (state.checked_libraries.contains(&library_database_path)
                || state.active_library.as_ref() == Some(&library_database_path)
                || state.pending_libraries.contains(&library_database_path)
                || state
                    .scheduled_sentiment_retries
                    .contains_key(&library_database_path))
        {
            return;
        }
        if force {
            state.checked_libraries.remove(&library_database_path);
            state
                .scheduled_sentiment_retries
                .remove(&library_database_path);
            state.refresh_failure_streaks.remove(&library_database_path);
        }
        let active_for_library = state.active_library.as_ref() == Some(&library_database_path);
        if (!active_for_library || force)
            && !state.pending_libraries.contains(&library_database_path)
        {
            state.pending_libraries.push_back(library_database_path);
        }
        if state.running {
            false
        } else {
            state.running = true;
            true
        }
    };

    if !should_spawn {
        return;
    }

    let app = app.clone();
    thread::spawn(move || refresh_worker(app));
}

fn sentiment_retry_deadline(now: i64) -> i64 {
    now.saturating_add(lyrics_sentiment::retry_cooldown().as_secs() as i64)
        .saturating_add(1)
}

fn next_sentiment_retry_after(
    retryable_sentiment_count: usize,
    previous_retry_after: Option<i64>,
    now: i64,
) -> Option<i64> {
    (retryable_sentiment_count > 0).then(|| {
        previous_retry_after
            .filter(|retry_after| *retry_after > now)
            .unwrap_or_else(|| sentiment_retry_deadline(now))
    })
}

fn register_refresh_retry(
    state: &mut SearchRefreshState,
    library_database_path: &Path,
    retry_after: i64,
) -> bool {
    if state
        .scheduled_sentiment_retries
        .get(library_database_path)
        .is_some_and(|scheduled| *scheduled <= retry_after)
    {
        return false;
    }
    state
        .scheduled_sentiment_retries
        .insert(library_database_path.to_owned(), retry_after);
    true
}

fn refresh_failure_backoff_seconds(failure_streak: u32) -> i64 {
    let base = lyrics_sentiment::retry_cooldown().as_secs() as i64 + 1;
    let multiplier = 1i64
        .checked_shl(failure_streak.saturating_sub(1).min(30))
        .unwrap_or(i64::MAX);
    base.saturating_mul(multiplier)
        .min(MAX_REFRESH_FAILURE_BACKOFF_SECONDS)
}

fn complete_refresh_attempt(
    state: &mut SearchRefreshState,
    library_database_path: &Path,
    succeeded: bool,
    now: i64,
) -> Option<i64> {
    state.active_library = None;
    if succeeded {
        state.refresh_failure_streaks.remove(library_database_path);
        state
            .checked_libraries
            .insert(library_database_path.to_owned());
        None
    } else {
        state.checked_libraries.remove(library_database_path);
        let failure_streak = state
            .refresh_failure_streaks
            .entry(library_database_path.to_owned())
            .or_default();
        *failure_streak = failure_streak.saturating_add(1);
        Some(now.saturating_add(refresh_failure_backoff_seconds(*failure_streak)))
    }
}

fn reset_refresh_failure_streak(state: &mut SearchRefreshState, library_database_path: &Path) {
    state.refresh_failure_streaks.remove(library_database_path);
}

fn reset_refresh_failure_streak_for_library(library_database_path: &Path) {
    match search_refresh_state().lock() {
        Ok(mut state) => reset_refresh_failure_streak(&mut state, library_database_path),
        Err(error) => {
            log::warn!("could not reset semantic-search refresh failure streak: {error}");
        }
    }
}

fn update_sentiment_retry_schedule(
    app: &AppHandle,
    library_database_path: &Path,
    retry_after: Option<i64>,
) {
    let library_database_path = library_database_path.to_owned();
    let Some(retry_after) = retry_after else {
        match search_refresh_state().lock() {
            Ok(mut state) => {
                state
                    .scheduled_sentiment_retries
                    .remove(&library_database_path);
            }
            Err(error) => {
                log::warn!("could not cancel lyrics-sentiment retry: {error}");
            }
        }
        return;
    };
    let should_spawn = {
        let mut state = match search_refresh_state().lock() {
            Ok(state) => state,
            Err(error) => {
                log::warn!("could not schedule lyrics-sentiment retry: {error}");
                return;
            }
        };
        register_refresh_retry(&mut state, &library_database_path, retry_after)
    };
    if !should_spawn {
        return;
    }

    let app = app.clone();
    thread::spawn(move || {
        loop {
            let now = match unix_timestamp_seconds() {
                Ok(now) => now,
                Err(error) => {
                    log::warn!("lyrics-sentiment retry clock failed: {error}");
                    return;
                }
            };
            if now >= retry_after {
                break;
            }
            let wait_seconds = (retry_after - now).min(60) as u64;
            thread::sleep(Duration::from_secs(wait_seconds.max(1)));
        }

        let should_spawn_worker = {
            let mut state = match search_refresh_state().lock() {
                Ok(state) => state,
                Err(error) => {
                    log::warn!("lyrics-sentiment retry state failed: {error}");
                    return;
                }
            };
            if state
                .scheduled_sentiment_retries
                .get(&library_database_path)
                != Some(&retry_after)
            {
                return;
            }
            state
                .scheduled_sentiment_retries
                .remove(&library_database_path);
            state.checked_libraries.remove(&library_database_path);
            if !state.pending_libraries.contains(&library_database_path) {
                state
                    .pending_libraries
                    .push_back(library_database_path.clone());
            }
            if state.running {
                false
            } else {
                state.running = true;
                true
            }
        };
        if should_spawn_worker {
            refresh_worker(app);
        }
    });
}

fn refresh_worker(app: AppHandle) {
    loop {
        let library_database_path = {
            let mut state = match search_refresh_state().lock() {
                Ok(state) => state,
                Err(error) => {
                    log::warn!("semantic-search refresh state failed: {error}");
                    return;
                }
            };
            let Some(path) = state.pending_libraries.pop_front() else {
                state.running = false;
                state.active_library = None;
                return;
            };
            state.active_library = Some(path.clone());
            path
        };
        let search_database_path = search_database_path_for_library(&library_database_path);
        let result = index_status_for_paths(&library_database_path, &search_database_path)
            .and_then(|status| {
                if !status.ready || status.stale {
                    build_index_for_paths(&app, &library_database_path, &search_database_path)?;
                } else {
                    update_sentiment_retry_schedule(
                        &app,
                        &library_database_path,
                        (status.retryable_sentiment_count > 0)
                            .then_some(status.sentiment_retry_after)
                            .flatten(),
                    );
                }
                Ok(())
            });

        let succeeded = result.is_ok();
        let retry_now = if succeeded {
            0
        } else {
            match unix_timestamp_seconds() {
                Ok(now) => now,
                Err(error) => {
                    log::warn!("semantic-search retry clock failed: {error}");
                    continue;
                }
            }
        };
        let retry_after = {
            let mut state = match search_refresh_state().lock() {
                Ok(state) => state,
                Err(error) => {
                    log::warn!("semantic-search refresh state failed: {error}");
                    return;
                }
            };
            complete_refresh_attempt(&mut state, &library_database_path, succeeded, retry_now)
        };
        if let Err(error) = result {
            log::warn!(
                "semantic-search refresh failed for {}; retrying after cooldown: {error}",
                library_database_path.display()
            );
        }
        // Register after releasing the refresh-state lock: the scheduler also
        // takes that lock, and a persistent build error must back off instead
        // of spinning or waiting forever for another library mutation.
        if retry_after.is_some() {
            update_sentiment_retry_schedule(&app, &library_database_path, retry_after);
        }
    }
}

pub fn search_tracks(
    app: &AppHandle,
    request: SearchTracksRequest,
) -> Result<TrackSearchResponse, String> {
    search_tracks_with_query_sentiment(app, request, None)
}

fn search_tracks_with_query_sentiment(
    app: &AppHandle,
    request: SearchTracksRequest,
    query_sentiment_override: Option<LyricsSentimentSummary>,
) -> Result<TrackSearchResponse, String> {
    search_tracks_with_query_sentiment_and_policy(app, request, query_sentiment_override, None)
}

fn search_tracks_with_query_sentiment_and_policy(
    app: &AppHandle,
    mut request: SearchTracksRequest,
    query_sentiment_override: Option<LyricsSentimentSummary>,
    grief_policy: Option<&lyrics_sentiment::GriefMoodPolicy>,
) -> Result<TrackSearchResponse, String> {
    validate_search_request(&mut request)?;
    let index = index_status(app)?;
    if !index.ready {
        return Err("semantic search index is not ready; call build_search_index first".to_owned());
    }
    // querySentiment is an observable part of every response, independent of
    // whether its requested weight contributes to ranking.
    let query_sentiment = query_sentiment_override
        .unwrap_or_else(|| lyrics_sentiment::analyze_summary(app, &request.query));
    if index.document_count == 0 {
        return Ok(TrackSearchResponse {
            query: request.query,
            mode: request.mode,
            target: request.target,
            index,
            query_sentiment,
            results: Vec::new(),
        });
    }
    let (_, search_database_path) = current_database_paths(app)?;
    let mut runtime = search_runtime().lock().map_err(|error| error.to_string())?;
    ensure_loaded_index(&search_database_path, index.generation, &mut runtime)?;
    let query_embedding = cached_query_embedding(app, &request.query, &mut runtime)?;
    let loaded = runtime
        .loaded_index
        .as_ref()
        .ok_or_else(|| "semantic search index failed to load".to_owned())?;
    let compatible_sentiment =
        compatible_query_sentiment(index.indexed_analyzer_id.as_deref(), &query_sentiment);
    let results = match grief_policy {
        Some(policy) => rank_tracks_with_policy(
            loaded,
            &query_embedding,
            compatible_sentiment,
            &request,
            Some(policy),
        ),
        None => rank_tracks(loaded, &query_embedding, compatible_sentiment, &request),
    };

    Ok(TrackSearchResponse {
        query: request.query,
        mode: request.mode,
        target: request.target,
        index,
        query_sentiment,
        results,
    })
}

pub fn recommend_tracks(
    app: &AppHandle,
    mut request: RecommendTracksRequest,
) -> Result<TrackRecommendationResponse, String> {
    request.prompt = request.prompt.trim().to_owned();
    if request.prompt.is_empty() {
        return Err("prompt must not be empty".to_owned());
    }
    request.limit = request.limit.clamp(1, 100);
    request.max_tracks_per_artist = request.max_tracks_per_artist.clamp(1, 20);
    validate_sentiment_weight(request.sentiment_weight)?;
    if request
        .min_rating
        .is_some_and(|rating| !(1..=5).contains(&rating))
    {
        return Err("minRating must be between 1 and 5".to_owned());
    }
    if let Some(artist) = request.artist.as_mut() {
        *artist = artist.trim().to_owned();
        if artist.is_empty() {
            return Err("artist must not be empty".to_owned());
        }
    }

    let search_limit = (request.limit * 5).clamp(request.limit, 100);
    let response = search_tracks(
        app,
        SearchTracksRequest {
            query: request.prompt.clone(),
            mode: "semantic".to_owned(),
            target: "all".to_owned(),
            lyrics_only: false,
            favorite_only: request.favorite_only,
            min_rating: request.min_rating,
            genres: request.genres,
            artist: request.artist,
            exclude_track_ids: request.avoid_track_ids,
            limit: search_limit,
            sentiment_weight: request.sentiment_weight,
        },
    )?;

    let mut per_artist = HashMap::<String, usize>::new();
    let mut total_duration_seconds = 0i64;
    let target_duration_seconds = request
        .duration_minutes
        .map(|minutes| minutes.clamp(1, 24 * 60) * 60);
    let mut results = Vec::new();
    for result in response.results {
        let artist_key = normalize_text(&result.artist);
        let artist_count = per_artist.entry(artist_key).or_default();
        if *artist_count >= request.max_tracks_per_artist {
            continue;
        }
        *artist_count += 1;
        total_duration_seconds += result.duration_seconds.max(0);
        results.push(result);
        if results.len() >= request.limit
            || target_duration_seconds
                .is_some_and(|target| total_duration_seconds >= target && !results.is_empty())
        {
            break;
        }
    }

    Ok(TrackRecommendationResponse {
        prompt: request.prompt,
        basis: "local multilingual semantic similarity over track metadata and saved lyrics"
            .to_owned(),
        index: response.index,
        query_sentiment: response.query_sentiment,
        total_duration_seconds,
        results,
    })
}

pub fn search_lyrics_by_mood(
    app: &AppHandle,
    request: LyricsMoodSearchRequest,
    reference: LyricsMoodReference,
) -> Result<VoiceLyricsResponse, String> {
    let options = LyricsMoodSearchOptions {
        prompt: request.prompt,
        mood_strength: request.mood_strength,
        favorite_only: request.favorite_only,
        min_rating: request.min_rating,
        genres: request.genres,
        artist: request.artist,
        exclude_track_ids: request.exclude_track_ids,
        relative_to_current: request.relative_to_current,
        limit: request.limit.clamp(1, 20),
    };
    search_lyrics_by_mood_with_options(app, options, reference)
}

pub fn recommend_lyrics_by_mood(
    app: &AppHandle,
    request: LyricsMoodPlayRequest,
    reference: LyricsMoodReference,
) -> Result<VoiceLyricsResponse, String> {
    let requested_limit = request.limit.clamp(1, 100);
    let search_limit = (requested_limit * 5).clamp(requested_limit, 100);
    let response = search_lyrics_by_mood_with_options(
        app,
        LyricsMoodSearchOptions {
            prompt: request.prompt,
            mood_strength: request.mood_strength,
            favorite_only: request.favorite_only,
            min_rating: request.min_rating,
            genres: request.genres,
            artist: request.artist,
            exclude_track_ids: request.avoid_track_ids,
            relative_to_current: request.relative_to_current,
            limit: search_limit,
        },
        reference,
    )?;
    if response.status != LyricsMoodStatus::Ok {
        return Ok(response);
    }

    let target_duration_seconds = request
        .duration_minutes
        .map(|minutes| minutes.clamp(1, 24 * 60) * 60);
    let max_tracks_per_artist = request.max_tracks_per_artist.clamp(1, 20);
    let (results, total_duration_seconds) = select_voice_lyrics_results(
        response.results,
        requested_limit,
        max_tracks_per_artist,
        target_duration_seconds,
    );
    Ok(VoiceLyricsResponse {
        status: if results.is_empty() {
            LyricsMoodStatus::NoMatch
        } else {
            LyricsMoodStatus::Ok
        },
        total_duration_seconds,
        results,
        ..response
    })
}

fn select_voice_lyrics_results(
    candidates: Vec<VoiceLyricsMatch>,
    limit: usize,
    max_tracks_per_artist: usize,
    target_duration_seconds: Option<i64>,
) -> (Vec<VoiceLyricsMatch>, i64) {
    let mut per_artist = HashMap::<String, usize>::new();
    let mut total_duration_seconds = 0i64;
    let mut results = Vec::new();
    for result in candidates {
        let artist_count = per_artist
            .entry(normalize_text(&result.artist))
            .or_default();
        if *artist_count >= max_tracks_per_artist {
            continue;
        }
        *artist_count += 1;
        total_duration_seconds += result.duration_seconds.max(0);
        results.push(result);
        if results.len() >= limit
            || target_duration_seconds
                .is_some_and(|target| total_duration_seconds >= target && !results.is_empty())
        {
            break;
        }
    }
    (results, total_duration_seconds)
}

struct LyricsMoodSearchOptions {
    prompt: String,
    mood_strength: Option<String>,
    favorite_only: bool,
    min_rating: Option<i64>,
    genres: Vec<String>,
    artist: Option<String>,
    exclude_track_ids: Vec<String>,
    relative_to_current: Option<String>,
    limit: usize,
}

fn grief_policy_for_voice_options(
    options: &LyricsMoodSearchOptions,
) -> Option<lyrics_sentiment::GriefMoodPolicy> {
    if options.relative_to_current.is_some() {
        return None;
    }
    lyrics_sentiment::grief_mood_policy_for_prompt(
        &options.prompt,
        options.mood_strength.as_deref(),
    )
}

fn search_lyrics_by_mood_with_options(
    app: &AppHandle,
    mut options: LyricsMoodSearchOptions,
    reference: LyricsMoodReference,
) -> Result<VoiceLyricsResponse, String> {
    validate_lyrics_mood_options(&mut options)?;
    let index = match index_status(app) {
        Ok(index) => index,
        Err(error) => {
            return lyrics_mood_known_index_error(&error, options.prompt.clone());
        }
    };
    if !index.ready {
        return Ok(index_not_ready_lyrics_mood_response(options.prompt));
    }
    let query_sentiment = match resolve_lyrics_mood_query_sentiment(
        app,
        &options.prompt,
        options.relative_to_current.as_deref(),
        reference,
    )? {
        Ok(summary) => summary,
        Err(status) => {
            return Ok(lyrics_mood_response(
                status,
                options.prompt,
                unknown_voice_sentiment(),
            ))
        }
    };
    let grief_policy = grief_policy_for_voice_options(&options);
    let search_limit = grief_policy
        .is_some()
        .then(|| (options.limit * 5).clamp(options.limit, 100))
        .unwrap_or(options.limit);
    let search = search_tracks_with_query_sentiment_and_policy(
        app,
        SearchTracksRequest {
            query: options.prompt.clone(),
            mode: "hybrid".to_owned(),
            target: "lyrics".to_owned(),
            lyrics_only: true,
            favorite_only: options.favorite_only,
            min_rating: options.min_rating,
            genres: options.genres,
            artist: options.artist,
            exclude_track_ids: options.exclude_track_ids,
            limit: search_limit,
            sentiment_weight: mood_strength_valence_weight(options.mood_strength.as_deref())?,
        },
        Some(query_sentiment.clone()),
        grief_policy.as_ref(),
    )?;
    let ranked_results = if grief_policy.is_some() {
        dedupe_lyrics_results(search.results, options.limit)
    } else {
        search.results.into_iter().take(options.limit).collect()
    };
    let results = ranked_results
        .into_iter()
        .map(compact_voice_lyrics_match)
        .collect::<Vec<_>>();
    let total_duration_seconds = results
        .iter()
        .map(|result| result.duration_seconds.max(0))
        .sum();
    Ok(VoiceLyricsResponse {
        status: if results.is_empty() {
            LyricsMoodStatus::NoMatch
        } else {
            LyricsMoodStatus::Ok
        },
        interpreted_prompt: options.prompt,
        query_sentiment: compact_voice_sentiment(&query_sentiment),
        total_duration_seconds,
        results,
        can_build: None,
        reason_code: None,
        reason: None,
    })
}

fn validate_lyrics_mood_options(options: &mut LyricsMoodSearchOptions) -> Result<(), String> {
    options.prompt = options.prompt.trim().to_owned();
    if options.prompt.is_empty() || options.prompt.chars().count() > 500 {
        return Err("prompt must be between 1 and 500 characters".to_owned());
    }
    options.limit = options.limit.clamp(1, 100);
    if options
        .min_rating
        .is_some_and(|rating| !(1..=5).contains(&rating))
    {
        return Err("minRating must be between 1 and 5".to_owned());
    }
    if let Some(artist) = options.artist.as_mut() {
        *artist = artist.trim().to_owned();
        if artist.is_empty() {
            return Err("artist must not be empty".to_owned());
        }
    }
    mood_strength_valence_weight(options.mood_strength.as_deref())?;
    if let Some(relative) = options.relative_to_current.as_deref() {
        if !matches!(relative, "similar" | "brighter" | "darker") {
            return Err("relativeToCurrent must be similar, brighter, or darker".to_owned());
        }
    }
    Ok(())
}

fn resolve_lyrics_mood_query_sentiment(
    app: &AppHandle,
    prompt: &str,
    relative_to_current: Option<&str>,
    reference: LyricsMoodReference,
) -> Result<Result<LyricsSentimentSummary, LyricsMoodStatus>, String> {
    if relative_to_current.is_none() {
        return Ok(Ok(lyrics_sentiment::analyze_summary(app, prompt)));
    }
    let LyricsMoodReference::CurrentTrack(track_id) = reference else {
        return Ok(Err(LyricsMoodStatus::NeedsCurrentTrack));
    };
    let reference_sentiment = track_lyrics_analysis(app, &track_id)?.sentiment;
    let Some(score) = reference_sentiment.score else {
        return Ok(Err(LyricsMoodStatus::ReferenceSentimentUnavailable));
    };
    if reference_sentiment.coverage <= 0.0 {
        return Ok(Err(LyricsMoodStatus::ReferenceSentimentUnavailable));
    }
    let target_score = match relative_to_current {
        Some("brighter") => (score + 0.25).clamp(-1.0, 1.0),
        Some("darker") => (score - 0.25).clamp(-1.0, 1.0),
        _ => score,
    };
    let mut target = reference_sentiment;
    target.score = Some(target_score);
    target.label = sentiment_label_for_score(target_score);
    target.diagnostic = None;
    Ok(Ok(target))
}

fn mood_strength_valence_weight(mood_strength: Option<&str>) -> Result<f32, String> {
    match mood_strength.unwrap_or("balanced") {
        "subtle" => Ok(0.08),
        "balanced" => Ok(0.15),
        "strong" => Ok(0.30),
        _ => Err("moodStrength must be subtle, balanced, or strong".to_owned()),
    }
}

fn sentiment_label_for_score(score: f32) -> lyrics_sentiment::SentimentLabel {
    if score > 0.05 {
        lyrics_sentiment::SentimentLabel::Positive
    } else if score < -0.05 {
        lyrics_sentiment::SentimentLabel::Negative
    } else {
        lyrics_sentiment::SentimentLabel::Neutral
    }
}

fn unknown_voice_sentiment() -> VoiceLyricsSentiment {
    VoiceLyricsSentiment {
        score: None,
        label: lyrics_sentiment::SentimentLabel::Unknown,
        coverage: 0.0,
    }
}

fn compact_voice_sentiment(summary: &LyricsSentimentSummary) -> VoiceLyricsSentiment {
    VoiceLyricsSentiment {
        score: summary.score,
        label: summary.label,
        coverage: summary.coverage,
    }
}

fn compact_voice_lyrics_match(result: TrackSearchResult) -> VoiceLyricsMatch {
    VoiceLyricsMatch {
        track_id: result.track_id,
        title: result.title,
        artist: result.artist,
        album_title: result.album_title,
        duration_seconds: result.duration_seconds,
        matched_text: voice_matched_excerpt(&result.matched_text),
        reason: result.reason,
        sentiment: result
            .lyrics_sentiment
            .as_ref()
            .map(compact_voice_sentiment),
    }
}

fn lyrics_content_lines(analysis: &TrackLyricsAnalysis) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut lines = Vec::new();
    for block in &analysis.blocks {
        for line in block.text.lines() {
            let normalized = normalize_lyrics_line(line);
            if !normalized.is_empty() && seen.insert(normalized.clone()) {
                lines.push(normalized);
            }
        }
    }
    lines
}

fn normalize_lyrics_line(line: &str) -> String {
    line.nfkc()
        .flat_map(char::to_lowercase)
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn lyrics_content_chars(analysis: &TrackLyricsAnalysis) -> String {
    analysis
        .blocks
        .iter()
        .flat_map(|block| block.text.nfkc())
        .flat_map(char::to_lowercase)
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn unique_five_grams(text: &str) -> Vec<String> {
    let characters = text.chars().collect::<Vec<_>>();
    if characters.len() < 5 {
        return Vec::new();
    }
    let mut grams = (0..=characters.len() - 5)
        .map(|start| characters[start..start + 5].iter().collect::<String>())
        .collect::<Vec<_>>();
    grams.sort_unstable();
    grams.dedup();
    grams
}

fn dedupe_lyrics_results(
    candidates: Vec<TrackSearchResult>,
    limit: usize,
) -> Vec<TrackSearchResult> {
    let mut comparison_count = 0;
    dedupe_lyrics_results_with_counter(candidates, limit, &mut comparison_count)
}

fn dedupe_lyrics_results_with_counter(
    candidates: Vec<TrackSearchResult>,
    limit: usize,
    comparison_count: &mut usize,
) -> Vec<TrackSearchResult> {
    if limit == 0 {
        return Vec::new();
    }
    let mut seen_hashes = HashSet::new();
    let mut representatives = Vec::<LyricsDedupeRepresentative>::new();
    let mut results = Vec::with_capacity(limit.min(candidates.len()));
    for candidate in candidates {
        if results.len() >= limit {
            break;
        }
        let duplicate_by_hash = candidate
            .lyrics_hash
            .as_deref()
            .filter(|hash| !hash.is_empty())
            .is_some_and(|hash| !seen_hashes.insert(hash.to_owned()));
        if duplicate_by_hash {
            continue;
        }
        let candidate_representation = LyricsDedupeRepresentative::from_result(&candidate);
        let duplicate_by_near_content = candidate_representation.as_ref().is_some_and(|current| {
            representatives.iter().any(|representative| {
                *comparison_count += 1;
                representative.overlaps(current)
            })
        });
        if duplicate_by_near_content {
            continue;
        }
        if let Some(representation) = candidate_representation {
            representatives.push(representation);
        }
        results.push(candidate);
    }
    results
}

struct LyricsDedupeRepresentative {
    line_count: usize,
    line_set: Option<HashSet<String>>,
    character_count: usize,
    five_grams: Option<Vec<String>>,
}

impl LyricsDedupeRepresentative {
    fn from_result(result: &TrackSearchResult) -> Option<Self> {
        let line_count = result.lyrics_lines.as_ref().map_or(0, Vec::len);
        let line_set = (line_count >= 8)
            .then(|| result.lyrics_line_set.clone())
            .flatten();
        let character_count = result
            .lyrics_chars
            .as_deref()
            .map_or(0, |text| text.chars().count());
        let five_grams = (character_count >= 160)
            .then(|| result.lyrics_five_grams.clone())
            .flatten();
        (line_set.is_some() || five_grams.is_some()).then_some(Self {
            line_count,
            line_set,
            character_count,
            five_grams,
        })
    }

    fn overlaps(&self, other: &Self) -> bool {
        let exact_lines = self
            .line_set
            .as_ref()
            .zip(other.line_set.as_ref())
            .is_some_and(|(left, right)| {
                lyrics_content_sets_overlap(self.line_count, left, other.line_count, right)
            });
        exact_lines
            || self
                .five_grams
                .as_deref()
                .zip(other.five_grams.as_deref())
                .is_some_and(|(left, right)| {
                    lyrics_five_gram_overlap(
                        self.character_count,
                        left,
                        other.character_count,
                        right,
                    )
                })
    }
}

fn lyrics_five_gram_overlap(
    left_count: usize,
    left: &[String],
    right_count: usize,
    right: &[String],
) -> bool {
    if left_count < 160 || right_count < 160 || left.is_empty() || right.is_empty() {
        return false;
    }
    let length_ratio = left_count.min(right_count) as f32 / left_count.max(right_count) as f32;
    if length_ratio < 0.95 {
        return false;
    }
    let mut left_index = 0;
    let mut right_index = 0;
    let mut intersection = 0;
    while left_index < left.len() && right_index < right.len() {
        match left[left_index].cmp(&right[right_index]) {
            std::cmp::Ordering::Less => left_index += 1,
            std::cmp::Ordering::Greater => right_index += 1,
            std::cmp::Ordering::Equal => {
                intersection += 1;
                left_index += 1;
                right_index += 1;
            }
        }
    }
    intersection as f32 / left.len().min(right.len()) as f32 >= 0.95
}

fn lyrics_content_sets_overlap(
    left_count: usize,
    left: &HashSet<String>,
    right_count: usize,
    right: &HashSet<String>,
) -> bool {
    if left_count < 8 || right_count < 8 {
        return false;
    }
    let intersection = left.intersection(right).count();
    intersection as f32 / left_count.min(right_count) as f32 >= 0.85
}

#[cfg(test)]
fn lyrics_content_overlap(left: &[String], right: &[String]) -> bool {
    if left.len() < 8 || right.len() < 8 {
        return false;
    }
    let left_set = left.iter().cloned().collect::<HashSet<_>>();
    let right_set = right.iter().cloned().collect::<HashSet<_>>();
    lyrics_content_sets_overlap(left.len(), &left_set, right.len(), &right_set)
}

fn voice_matched_excerpt(text: &str) -> String {
    if text.chars().count() <= MAX_VOICE_MATCHED_TEXT_CHARS {
        return String::new();
    }
    let excerpt = truncate_chars(text, MAX_VOICE_MATCHED_TEXT_CHARS.saturating_sub(1));
    format!("{excerpt}…")
}

fn lyrics_mood_response(
    status: LyricsMoodStatus,
    interpreted_prompt: String,
    query_sentiment: VoiceLyricsSentiment,
) -> VoiceLyricsResponse {
    VoiceLyricsResponse {
        status,
        interpreted_prompt,
        query_sentiment,
        total_duration_seconds: 0,
        results: Vec::new(),
        can_build: None,
        reason_code: None,
        reason: None,
    }
}

fn index_not_ready_lyrics_mood_response(interpreted_prompt: String) -> VoiceLyricsResponse {
    let hf_home_configured = std::env::var_os("HF_HOME").is_some();
    let mut response = lyrics_mood_response(
        LyricsMoodStatus::IndexNotReady,
        interpreted_prompt,
        unknown_voice_sentiment(),
    );
    response.can_build = Some(true);
    response.reason_code = Some(
        if hf_home_configured {
            "hfHomeConfigured"
        } else {
            "searchIndexNotReady"
        }
        .to_owned(),
    );
    response.reason = Some(
        if hf_home_configured {
            "HF_HOME is configured. Unset it before building the local semantic-search index."
        } else {
            "The local semantic-search index must be built before lyrics mood search can run."
        }
        .to_owned(),
    );
    response
}

fn lyrics_mood_known_index_error(
    error: &str,
    interpreted_prompt: String,
) -> Result<VoiceLyricsResponse, String> {
    if error != "library.error.noLibraryScanned" {
        return Err(error.to_owned());
    }
    let mut response = lyrics_mood_response(
        LyricsMoodStatus::IndexNotReady,
        interpreted_prompt,
        unknown_voice_sentiment(),
    );
    response.can_build = Some(false);
    response.reason_code = Some("noLibraryScanned".to_owned());
    response.reason = Some(
        "Scan or select a music library before building the local semantic-search index."
            .to_owned(),
    );
    Ok(response)
}

fn validate_search_request(request: &mut SearchTracksRequest) -> Result<(), String> {
    request.query = request.query.trim().to_owned();
    if request.query.is_empty() {
        return Err("query must not be empty".to_owned());
    }
    if !matches!(request.mode.as_str(), "semantic" | "hybrid") {
        return Err("mode must be semantic or hybrid".to_owned());
    }
    if !matches!(request.target.as_str(), "all" | "lyrics" | "metadata") {
        return Err("target must be all, lyrics, or metadata".to_owned());
    }
    if request
        .min_rating
        .is_some_and(|rating| !(1..=5).contains(&rating))
    {
        return Err("minRating must be between 1 and 5".to_owned());
    }
    if let Some(artist) = request.artist.as_mut() {
        *artist = artist.trim().to_owned();
        if artist.is_empty() {
            return Err("artist must not be empty".to_owned());
        }
    }
    request.limit = request.limit.clamp(1, 100);
    validate_sentiment_weight(request.sentiment_weight)?;
    Ok(())
}

fn validate_sentiment_weight(weight: f32) -> Result<(), String> {
    if !weight.is_finite() || !(0.0..=0.3).contains(&weight) {
        return Err("sentimentWeight must be between 0 and 0.3".to_owned());
    }
    Ok(())
}

fn compatible_query_sentiment<'a>(
    indexed_analyzer_id: Option<&str>,
    query_sentiment: &'a LyricsSentimentSummary,
) -> Option<&'a LyricsSentimentSummary> {
    (indexed_analyzer_id == Some(lyrics_sentiment::ANALYZER_ID)).then_some(query_sentiment)
}

fn blend_sentiment_score(
    base_score: f32,
    requested_weight: f32,
    query: &LyricsSentimentSummary,
    track: Option<&LyricsSentimentSummary>,
) -> (f32, Option<f32>, f32) {
    if requested_weight == 0.0 {
        return (base_score, None, 0.0);
    }
    let Some(track) = track else {
        return (base_score, None, 0.0);
    };
    let (Some(query_score), Some(track_score)) = (query.score, track.score) else {
        return (base_score, None, 0.0);
    };
    let similarity = 1.0 - (query_score - track_score).abs() / 2.0;
    let effective_weight = requested_weight * query.coverage.min(track.coverage);
    if effective_weight <= 0.0 {
        return (base_score, Some(similarity), 0.0);
    }
    (
        base_score * (1.0 - effective_weight) + similarity * effective_weight,
        Some(similarity),
        effective_weight,
    )
}

fn rank_tracks(
    loaded: &LoadedIndex,
    query_embedding: &[f32],
    query_sentiment: Option<&LyricsSentimentSummary>,
    request: &SearchTracksRequest,
) -> Vec<TrackSearchResult> {
    rank_tracks_with_policy(loaded, query_embedding, query_sentiment, request, None)
}

fn rank_tracks_with_policy(
    loaded: &LoadedIndex,
    query_embedding: &[f32],
    query_sentiment: Option<&LyricsSentimentSummary>,
    request: &SearchTracksRequest,
    grief_policy: Option<&lyrics_sentiment::GriefMoodPolicy>,
) -> Vec<TrackSearchResult> {
    let query_normalized = normalize_text(&request.query);
    let genres = request
        .genres
        .iter()
        .map(|genre| normalize_text(genre))
        .collect::<HashSet<_>>();
    let excluded = request
        .exclude_track_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let artist = request.artist.as_deref().map(normalize_text);
    let mut candidates = HashMap::<String, Candidate>::new();

    for document in &loaded.documents {
        if (request.target == "lyrics" && document.kind != "lyrics")
            || (request.target == "metadata" && document.kind != "metadata")
        {
            continue;
        }
        let Some(track) = loaded.tracks.get(&document.track_uuid) else {
            continue;
        };
        if excluded.contains(track.track_uuid.as_str())
            || (request.lyrics_only && !track.has_lyrics)
            || (request.favorite_only && !track.is_favorite)
            || request
                .min_rating
                .is_some_and(|minimum| track.rating.unwrap_or(0) < minimum)
            || artist
                .as_ref()
                .is_some_and(|artist| normalize_text(&track.artist) != *artist)
            || (!genres.is_empty()
                && !track
                    .genre
                    .as_deref()
                    .map(normalize_text)
                    .is_some_and(|genre| genres.contains(&genre)))
        {
            continue;
        }

        let semantic_score = cosine_similarity(query_embedding, &document.embedding);
        let lexical_score = lexical_match_score(&query_normalized, &document.normalized_text);
        let base_score = if request.mode == "hybrid" {
            semantic_score * 0.85 + lexical_score * 0.15
        } else {
            semantic_score
        };
        let (score, sentiment_similarity, sentiment_effective_weight) =
            query_sentiment.map_or((base_score, None, 0.0), |query_sentiment| {
                blend_sentiment_score(
                    base_score,
                    request.sentiment_weight,
                    query_sentiment,
                    track.lyrics_sentiment.as_ref(),
                )
            });
        let is_lyrics_document = document.kind == "lyrics";
        let should_replace = candidates
            .get(&track.track_uuid)
            .map(|candidate| score > candidate.score)
            .unwrap_or(true);
        if should_replace {
            let mut lyrics_chunk_scores = candidates
                .get(&track.track_uuid)
                .map(|candidate| candidate.lyrics_chunk_scores.clone())
                .unwrap_or_default();
            if is_lyrics_document {
                lyrics_chunk_scores.push(score);
            }
            candidates.insert(
                track.track_uuid.clone(),
                Candidate {
                    track: track.clone(),
                    score,
                    semantic_score,
                    lexical_score,
                    matched_document_kind: document.kind.clone(),
                    matched_text: truncate_chars(&document.text, MAX_MATCHED_TEXT_CHARS),
                    sentiment_similarity,
                    sentiment_effective_weight,
                    lyrics_chunk_scores,
                },
            );
        } else if is_lyrics_document {
            if let Some(candidate) = candidates.get_mut(&track.track_uuid) {
                candidate.lyrics_chunk_scores.push(score);
            }
        }
    }

    let mut candidates = candidates.into_values().collect::<Vec<_>>();
    if let Some(policy) = grief_policy {
        candidates = candidates
            .into_iter()
            .map(|mut candidate| {
                let Some(analysis) = candidate.track.lyrics_analysis.as_ref() else {
                    return candidate;
                };
                let Some(profile) = lyrics_sentiment::grief_profile(analysis) else {
                    return candidate;
                };
                let persistence = lyrics_persistence(&candidate.lyrics_chunk_scores);
                let score = lyrics_sentiment::apply_grief_policy(
                    candidate.score,
                    &profile,
                    persistence,
                    *policy,
                );
                candidate.score = score;
                candidate
            })
            .collect();
    }
    candidates.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.track.artist.cmp(&right.track.artist))
            .then_with(|| left.track.title.cmp(&right.track.title))
            .then_with(|| left.track.track_uuid.cmp(&right.track.track_uuid))
    });
    candidates
        .into_iter()
        .take(request.limit)
        .map(|candidate| {
            let mut reason = if candidate.matched_document_kind == "lyrics" {
                "The saved lyrics contain a semantically similar passage.".to_owned()
            } else {
                "The track metadata is semantically similar to the request.".to_owned()
            };
            if candidate.sentiment_effective_weight > 0.0 {
                reason.push_str(" Lyrics sentiment similarity contributed to the score.");
            }
            let lyrics_lines = candidate
                .track
                .lyrics_analysis
                .as_ref()
                .map(lyrics_content_lines);
            let lyrics_line_set = lyrics_lines
                .as_ref()
                .map(|lines| lines.iter().cloned().collect());
            let lyrics_chars = candidate
                .track
                .lyrics_analysis
                .as_ref()
                .map(lyrics_content_chars);
            let lyrics_five_grams = lyrics_chars.as_deref().map(unique_five_grams);
            TrackSearchResult {
                track_id: candidate.track.track_uuid,
                title: candidate.track.title,
                artist: candidate.track.artist,
                album_title: candidate.track.album_title,
                album_artist: candidate.track.album_artist,
                genre: candidate.track.genre,
                duration_seconds: candidate.track.duration_seconds,
                has_lyrics: candidate.track.has_lyrics,
                is_favorite: candidate.track.is_favorite,
                rating: candidate.track.rating,
                score: candidate.score,
                semantic_score: candidate.semantic_score,
                lexical_score: candidate.lexical_score,
                lyrics_sentiment: candidate.track.lyrics_sentiment,
                sentiment_similarity: candidate.sentiment_similarity,
                reason,
                matched_document_kind: candidate.matched_document_kind,
                matched_text: candidate.matched_text,
                lyrics_hash: candidate
                    .track
                    .lyrics_analysis
                    .as_ref()
                    .map(|analysis| analysis.lyrics_hash.clone()),
                lyrics_lines,
                lyrics_line_set,
                lyrics_chars,
                lyrics_five_grams,
            }
        })
        .collect()
}

fn lyrics_persistence(scores: &[f32]) -> f32 {
    let Some(top_score) = scores.iter().copied().max_by(f32::total_cmp) else {
        return 0.0;
    };
    let threshold = top_score - 0.06;
    (scores
        .iter()
        .filter(|score| **score >= threshold)
        .count()
        .min(3) as f32)
        / 3.0
}

fn current_database_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let library_database_path = library::current_database_path(app)?
        .ok_or_else(|| "library.error.noLibraryScanned".to_owned())?;
    let search_database_path = search_database_path_for_library(&library_database_path);
    Ok((library_database_path, search_database_path))
}

fn search_database_path_for_library(library_database_path: &Path) -> PathBuf {
    library_database_path.with_file_name(SEARCH_INDEX_DATABASE_NAME)
}

fn load_track_sources(database_path: &Path) -> Result<Vec<TrackSource>, String> {
    let connection = Connection::open(database_path).map_err(to_error_string)?;
    let mut statement = connection
        .prepare(
            "SELECT
                tracks.uuid,
                tracks.title,
                tracks.artist,
                albums.title,
                albums.artist,
                albums.genre,
                tracks.duration_seconds,
                tracks.lyrics,
                COALESCE(track_user_state.is_favorite, 0),
                track_user_state.rating,
                tracks.file_mtime,
                tracks.file_size,
                track_user_state.updated_at
             FROM tracks
             JOIN albums ON albums.group_key = tracks.album_group_key
             LEFT JOIN track_user_state ON track_user_state.track_uuid = tracks.uuid
             ORDER BY tracks.uuid",
        )
        .map_err(to_error_string)?;
    let rows = statement
        .query_map([], |row| {
            Ok(TrackSource {
                track_uuid: row.get(0)?,
                title: row.get(1)?,
                artist: row.get(2)?,
                album_title: row.get(3)?,
                album_artist: row.get(4)?,
                genre: row.get(5)?,
                duration_seconds: row.get(6)?,
                lyrics: row.get(7)?,
                is_favorite: row.get(8)?,
                rating: row.get(9)?,
                file_mtime: row.get(10)?,
                file_size: row.get(11)?,
                user_state_updated_at: row.get(12)?,
            })
        })
        .map_err(to_error_string)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(to_error_string)
}

fn current_source_revision(database_path: &Path) -> Result<String, String> {
    let connection = Connection::open(database_path).map_err(to_error_string)?;
    let mut statement = connection
        .prepare(
            "SELECT
                tracks.uuid,
                tracks.title,
                tracks.artist,
                albums.title,
                albums.artist,
                COALESCE(albums.genre, ''),
                tracks.duration_seconds,
                tracks.file_mtime,
                tracks.file_size,
                COALESCE(track_user_state.is_favorite, 0),
                COALESCE(track_user_state.rating, 0),
                COALESCE(track_user_state.updated_at, ''),
                COALESCE(tracks.lyrics, '')
             FROM tracks
             JOIN albums ON albums.group_key = tracks.album_group_key
             LEFT JOIN track_user_state ON track_user_state.track_uuid = tracks.uuid
             ORDER BY tracks.uuid",
        )
        .map_err(to_error_string)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, bool>(9)?,
                row.get::<_, i64>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
            ))
        })
        .map_err(to_error_string)?;
    let mut hasher = Sha1::new();
    for row in rows {
        let (
            track_uuid,
            title,
            artist,
            album_title,
            album_artist,
            genre,
            duration_seconds,
            file_mtime,
            file_size,
            is_favorite,
            rating,
            updated_at,
            lyrics,
        ) = row.map_err(to_error_string)?;
        update_revision_hash(
            &mut hasher,
            &track_uuid,
            &title,
            &artist,
            &album_title,
            &album_artist,
            &genre,
            duration_seconds,
            file_mtime,
            file_size,
            is_favorite,
            rating,
            &updated_at,
            &lyrics,
        );
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn revision_for_sources(sources: &[TrackSource]) -> String {
    let mut hasher = Sha1::new();
    for source in sources {
        update_revision_hash(
            &mut hasher,
            &source.track_uuid,
            &source.title,
            &source.artist,
            &source.album_title,
            &source.album_artist,
            source.genre.as_deref().unwrap_or(""),
            source.duration_seconds,
            source.file_mtime,
            source.file_size,
            source.is_favorite,
            source.rating.unwrap_or(0),
            source.user_state_updated_at.as_deref().unwrap_or(""),
            source.lyrics.as_deref().unwrap_or(""),
        );
    }
    format!("{:x}", hasher.finalize())
}

#[allow(clippy::too_many_arguments)]
fn update_revision_hash(
    hasher: &mut Sha1,
    track_uuid: &str,
    title: &str,
    artist: &str,
    album_title: &str,
    album_artist: &str,
    genre: &str,
    duration_seconds: i64,
    file_mtime: i64,
    file_size: i64,
    is_favorite: bool,
    rating: i64,
    updated_at: &str,
    lyrics: &str,
) {
    for value in [
        track_uuid,
        title,
        artist,
        album_title,
        album_artist,
        genre,
        updated_at,
        lyrics,
    ] {
        hasher.update((value.len() as u64).to_le_bytes());
        hasher.update(value.as_bytes());
    }
    hasher.update(duration_seconds.to_le_bytes());
    hasher.update(file_mtime.to_le_bytes());
    hasher.update(file_size.to_le_bytes());
    hasher.update([u8::from(is_favorite)]);
    hasher.update(rating.to_le_bytes());
}

fn build_documents(sources: &[TrackSource]) -> Vec<PendingDocument> {
    let mut documents = Vec::new();
    for source in sources {
        let metadata_text = truncate_chars(
            &format!(
                "{}\nArtist: {}\nAlbum: {}\nAlbum artist: {}\nGenre: {}",
                source.title,
                source.artist,
                source.album_title,
                source.album_artist,
                source.genre.as_deref().unwrap_or("")
            ),
            MAX_DOCUMENT_CHARS,
        );
        documents.push(PendingDocument {
            track_uuid: source.track_uuid.clone(),
            kind: "metadata".to_owned(),
            ordinal: 0,
            content_hash: document_hash("metadata", &metadata_text),
            text: metadata_text,
            embedding: None,
        });
        if let Some(lyrics) = source.lyrics.as_deref() {
            for (index, chunk) in chunk_lyrics(lyrics).into_iter().enumerate() {
                documents.push(PendingDocument {
                    track_uuid: source.track_uuid.clone(),
                    kind: "lyrics".to_owned(),
                    ordinal: index as i64,
                    content_hash: document_hash("lyrics", &chunk),
                    text: chunk,
                    embedding: None,
                });
            }
        }
    }
    documents
}

fn chunk_lyrics(lyrics: &str) -> Vec<String> {
    let lines = lyrics
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return Vec::new();
    }
    let step = LYRICS_CHUNK_LINES
        .saturating_sub(LYRICS_CHUNK_OVERLAP)
        .max(1);
    (0..lines.len())
        .step_by(step)
        .map(|start| {
            let end = (start + LYRICS_CHUNK_LINES).min(lines.len());
            truncate_chars(&lines[start..end].join("\n"), MAX_DOCUMENT_CHARS)
        })
        .collect()
}

fn document_hash(kind: &str, text: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(SEARCH_INDEX_SCHEMA_VERSION.as_bytes());
    hasher.update(EMBEDDING_MODEL_ID.as_bytes());
    hasher.update(kind.as_bytes());
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn open_search_database(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_error_string)?;
    }
    let connection = Connection::open(path).map_err(to_error_string)?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(to_error_string)?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;",
        )
        .map_err(to_error_string)?;
    initialize_search_database(&connection)?;
    Ok(connection)
}

fn initialize_search_database(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS search_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS tracks (
                track_uuid TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album_title TEXT NOT NULL,
                album_artist TEXT NOT NULL,
                genre TEXT,
                duration_seconds INTEGER NOT NULL,
                has_lyrics INTEGER NOT NULL,
                is_favorite INTEGER NOT NULL,
                rating INTEGER
             );
             CREATE TABLE IF NOT EXISTS documents (
                track_uuid TEXT NOT NULL,
                kind TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                text TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                embedding BLOB NOT NULL,
                PRIMARY KEY (track_uuid, kind, ordinal)
             );
             CREATE INDEX IF NOT EXISTS documents_track_uuid_idx
             ON documents(track_uuid);
             CREATE TABLE IF NOT EXISTS track_lyrics_sentiment (
                track_uuid TEXT PRIMARY KEY,
                lyrics_hash TEXT NOT NULL,
                analysis_hash TEXT NOT NULL,
                sentiment_json TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS lyrics_sentiment_blocks (
                track_uuid TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                block_json TEXT NOT NULL,
                PRIMARY KEY (track_uuid, ordinal)
             );
             CREATE INDEX IF NOT EXISTS lyrics_sentiment_blocks_track_uuid_idx
             ON lyrics_sentiment_blocks(track_uuid);",
        )
        .map_err(to_error_string)?;
    Ok(())
}

fn load_existing_documents(
    connection: &Connection,
) -> Result<HashMap<String, (String, Vec<f32>)>, String> {
    let mut statement = connection
        .prepare(
            "SELECT track_uuid, kind, ordinal, content_hash, embedding
             FROM documents",
        )
        .map_err(to_error_string)?;
    let rows = statement
        .query_map([], |row| {
            let track_uuid = row.get::<_, String>(0)?;
            let kind = row.get::<_, String>(1)?;
            let ordinal = row.get::<_, i64>(2)?;
            let hash = row.get::<_, String>(3)?;
            let bytes = row.get::<_, Vec<u8>>(4)?;
            Ok((document_key(&track_uuid, &kind, ordinal), hash, bytes))
        })
        .map_err(to_error_string)?;
    let mut documents = HashMap::new();
    for row in rows {
        let (key, hash, bytes) = row.map_err(to_error_string)?;
        if let Some(embedding) = decode_embedding(&bytes) {
            documents.insert(key, (hash, embedding));
        }
    }
    Ok(documents)
}

fn load_cached_analyses(
    connection: &Connection,
) -> Result<HashMap<String, (String, TrackLyricsAnalysis)>, String> {
    let mut blocks_by_track = HashMap::<String, Vec<LyricsSentimentBlock>>::new();
    let mut block_statement = connection
        .prepare(
            "SELECT track_uuid, block_json
             FROM lyrics_sentiment_blocks
             ORDER BY track_uuid, ordinal",
        )
        .map_err(to_error_string)?;
    let block_rows = block_statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(to_error_string)?;
    for row in block_rows {
        let (track_uuid, json) = row.map_err(to_error_string)?;
        if let Ok(block) = serde_json::from_str::<LyricsSentimentBlock>(&json) {
            blocks_by_track.entry(track_uuid).or_default().push(block);
        }
    }

    let mut statement = connection
        .prepare(
            "SELECT track_uuid, lyrics_hash, analysis_hash, sentiment_json
             FROM track_lyrics_sentiment",
        )
        .map_err(to_error_string)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(to_error_string)?;
    let mut analyses = HashMap::new();
    for row in rows {
        let (track_uuid, lyrics_hash, analysis_hash, summary_json) =
            row.map_err(to_error_string)?;
        let Ok(sentiment) = serde_json::from_str::<LyricsSentimentSummary>(&summary_json) else {
            continue;
        };
        analyses.insert(
            track_uuid.clone(),
            (
                analysis_hash,
                TrackLyricsAnalysis {
                    track_id: track_uuid.clone(),
                    lyrics_hash,
                    sentiment,
                    blocks: blocks_by_track.remove(&track_uuid).unwrap_or_default(),
                },
            ),
        );
    }
    Ok(analyses)
}

fn load_cached_sentiment_summaries(
    connection: &Connection,
) -> Result<HashMap<String, LyricsSentimentSummary>, String> {
    let mut statement = connection
        .prepare("SELECT track_uuid, sentiment_json FROM track_lyrics_sentiment")
        .map_err(to_error_string)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(to_error_string)?;
    let mut summaries = HashMap::new();
    for row in rows {
        let (track_uuid, json) = row.map_err(to_error_string)?;
        if let Ok(summary) = serde_json::from_str::<LyricsSentimentSummary>(&json) {
            summaries.insert(track_uuid, summary);
        }
    }
    Ok(summaries)
}

fn load_cached_track_analysis(
    connection: &Connection,
    track_id: &str,
    expected_lyrics_hash: &str,
    expected_analysis_hash: &str,
) -> Result<Option<TrackLyricsAnalysis>, String> {
    let cached = connection
        .query_row(
            "SELECT lyrics_hash, analysis_hash, sentiment_json
             FROM track_lyrics_sentiment
             WHERE track_uuid = ?1",
            [track_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(to_error_string)?;
    let Some((lyrics_hash, cached_analysis_hash, summary_json)) = cached else {
        return Ok(None);
    };
    if lyrics_hash != expected_lyrics_hash || cached_analysis_hash != expected_analysis_hash {
        return Ok(None);
    }
    let sentiment = match serde_json::from_str::<LyricsSentimentSummary>(&summary_json) {
        Ok(sentiment) if !lyrics_sentiment::is_retryable_unavailable(&sentiment) => sentiment,
        _ => return Ok(None),
    };
    let mut statement = connection
        .prepare(
            "SELECT block_json
             FROM lyrics_sentiment_blocks
             WHERE track_uuid = ?1
             ORDER BY ordinal",
        )
        .map_err(to_error_string)?;
    let rows = statement
        .query_map([track_id], |row| row.get::<_, String>(0))
        .map_err(to_error_string)?;
    let mut blocks = Vec::new();
    for row in rows {
        let json = row.map_err(to_error_string)?;
        let Ok(block) = serde_json::from_str::<LyricsSentimentBlock>(&json) else {
            return Ok(None);
        };
        blocks.push(block);
    }
    if blocks.is_empty() {
        return Ok(None);
    }
    Ok(Some(TrackLyricsAnalysis {
        track_id: track_id.to_owned(),
        lyrics_hash,
        sentiment,
        blocks,
    }))
}

fn store_track_analysis(
    connection: &Connection,
    analysis_hash: &str,
    analysis: &TrackLyricsAnalysis,
) -> Result<(), String> {
    let summary_json = serde_json::to_string(&analysis.sentiment).map_err(to_error_string)?;
    connection
        .execute(
            "INSERT INTO track_lyrics_sentiment (
                track_uuid, lyrics_hash, analysis_hash, sentiment_json
             ) VALUES (?1, ?2, ?3, ?4)",
            params![
                analysis.track_id,
                analysis.lyrics_hash,
                analysis_hash,
                summary_json
            ],
        )
        .map_err(to_error_string)?;
    for block in &analysis.blocks {
        let block_json = serde_json::to_string(block).map_err(to_error_string)?;
        connection
            .execute(
                "INSERT INTO lyrics_sentiment_blocks (
                    track_uuid, ordinal, block_json
                 ) VALUES (?1, ?2, ?3)",
                params![analysis.track_id, block.ordinal as i64, block_json],
            )
            .map_err(to_error_string)?;
    }
    Ok(())
}

fn ensure_loaded_index(
    database_path: &Path,
    generation: i64,
    runtime: &mut SearchRuntime,
) -> Result<(), String> {
    let already_loaded = runtime.loaded_index.as_ref().is_some_and(|loaded| {
        loaded.database_path == database_path && loaded.generation == generation
    });
    if already_loaded {
        return Ok(());
    }
    let connection = open_search_database(database_path)?;
    let sentiment_summaries = load_cached_sentiment_summaries(&connection)?;
    let cached_analyses = load_cached_analyses(&connection)?;
    let mut tracks = HashMap::new();
    {
        let mut statement = connection
            .prepare(
                "SELECT
                    track_uuid, title, artist, album_title, album_artist, genre,
                    duration_seconds, has_lyrics, is_favorite, rating
                 FROM tracks",
            )
            .map_err(to_error_string)?;
        let rows = statement
            .query_map([], |row| {
                let track_uuid = row.get::<_, String>(0)?;
                Ok(CachedTrack {
                    lyrics_sentiment: sentiment_summaries.get(&track_uuid).cloned(),
                    lyrics_analysis: cached_analyses
                        .get(&track_uuid)
                        .map(|(_, analysis)| analysis.clone()),
                    track_uuid,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    album_title: row.get(3)?,
                    album_artist: row.get(4)?,
                    genre: row.get(5)?,
                    duration_seconds: row.get(6)?,
                    has_lyrics: row.get(7)?,
                    is_favorite: row.get(8)?,
                    rating: row.get(9)?,
                })
            })
            .map_err(to_error_string)?;
        for row in rows {
            let track = row.map_err(to_error_string)?;
            tracks.insert(track.track_uuid.clone(), track);
        }
    }

    let mut documents = Vec::new();
    {
        let mut statement = connection
            .prepare("SELECT track_uuid, kind, text, embedding FROM documents")
            .map_err(to_error_string)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Vec<u8>>(3)?,
                ))
            })
            .map_err(to_error_string)?;
        for row in rows {
            let (track_uuid, kind, text, bytes) = row.map_err(to_error_string)?;
            if let Some(embedding) = decode_embedding(&bytes) {
                documents.push(CachedDocument {
                    track_uuid,
                    kind,
                    normalized_text: normalize_text(&text),
                    text,
                    embedding,
                });
            }
        }
    }

    runtime.loaded_index = Some(LoadedIndex {
        database_path: database_path.to_owned(),
        generation,
        tracks,
        documents,
    });
    Ok(())
}

fn ensure_model<'a>(
    app: &AppHandle,
    runtime: &'a mut SearchRuntime,
) -> Result<&'a mut TextEmbedding, String> {
    if runtime.model.is_none() {
        let cache_dir = embedding_model_cache_dir(app)?;
        runtime.model = Some(initialize_pinned_embedding_model(&cache_dir)?);
    }
    runtime
        .model
        .as_mut()
        .ok_or_else(|| "local embedding model is unavailable".to_owned())
}

fn initialize_pinned_embedding_model(cache_dir: &Path) -> Result<TextEmbedding, String> {
    if std::env::var_os("HF_HOME").is_some() {
        return Err(hf_home_unsupported_error());
    }
    verify_embedding_pipeline_identity()?;
    prepare_pinned_embedding_model_cache(cache_dir)?;
    write_fastembed_main_ref(cache_dir)?;
    let options = embedding_model_init_options(cache_dir);
    let model = TextEmbedding::try_new(options).map_err(|error| {
        format!("failed to initialize pinned local embedding model {EMBEDDING_MODEL_ID}: {error}")
    })?;
    // FastEmbed opens the built-in model through refs/main. A concurrent
    // deletion could make hf-hub fetch that branch between our first check
    // and open, so verify the pinned ref and every loaded artifact again
    // before adopting the model in SearchRuntime.
    verify_pinned_embedding_model_cache(cache_dir)?;
    Ok(model)
}

fn embedding_model_init_options(cache_dir: &Path) -> TextInitOptions {
    TextInitOptions::new(EmbeddingModel::MultilingualE5Small)
        .with_max_length(EMBEDDING_MAX_LENGTH)
        .with_cache_dir(cache_dir.to_owned())
        .with_show_download_progress(false)
}

fn verify_embedding_pipeline_identity() -> Result<(), String> {
    if TextEmbedding::get_default_pooling_method(&EmbeddingModel::MultilingualE5Small)
        != Some(Pooling::Mean)
    {
        return Err(format!(
            "FastEmbed pooling no longer matches pinned embedding pipeline {EMBEDDING_PIPELINE_ID}"
        ));
    }
    Ok(())
}

fn embedding_model_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    embedding_model_cache_dir_for(
        app.path().app_cache_dir().map_err(to_error_string)?,
        std::env::var_os("HF_HOME"),
    )
}

fn embedding_model_cache_dir_for(
    app_cache_dir: PathBuf,
    hf_home: Option<std::ffi::OsString>,
) -> Result<PathBuf, String> {
    if hf_home.is_some() {
        return Err(hf_home_unsupported_error());
    }
    Ok(app_cache_dir.join(EMBEDDING_MODEL_CACHE_DIRECTORY))
}

fn hf_home_unsupported_error() -> String {
    "semantic search does not support HF_HOME because FastEmbed would override Musical's pinned cache directory and mutate the shared Hugging Face cache; launch Musical without HF_HOME"
        .to_owned()
}

fn prepare_pinned_embedding_model_cache(cache_dir: &Path) -> Result<(), String> {
    verify_embedding_model_manifest_identity()?;
    fs::create_dir_all(cache_dir).map_err(|error| {
        format!(
            "failed to create embedding model cache {}: {error}",
            cache_dir.display()
        )
    })?;

    ensure_embedding_model_ref(
        cache_dir,
        EMBEDDING_MODEL_REVISION,
        EMBEDDING_MODEL_REVISION,
    )?;
    let pinned_repo = embedding_model_repo(EMBEDDING_MODEL_REVISION);
    let cache = HuggingFaceCache::new(cache_dir.to_owned());
    let cached_repo = cache.repo(pinned_repo.clone());
    let mut missing = Vec::new();
    for resource in EMBEDDING_MODEL_RESOURCES {
        match cached_repo.get(resource.path) {
            Some(path) => verify_embedding_model_resource(&path, resource)?,
            None => missing.push(resource),
        }
    }

    if !missing.is_empty() {
        let api = ApiBuilder::new()
            .with_cache_dir(cache_dir.to_owned())
            .with_progress(false)
            .build()
            .map_err(|error| format!("failed to initialize Hugging Face model client: {error}"))?;
        let remote_repo = api.repo(pinned_repo);
        for resource in missing {
            let path = remote_repo.get(resource.path).map_err(|error| {
                format!(
                    "failed to download pinned embedding resource {} at revision {}: {error}",
                    resource.path, EMBEDDING_MODEL_REVISION
                )
            })?;
            verify_embedding_model_resource(&path, resource)?;
        }
    }

    write_embedding_model_ref(
        cache_dir,
        EMBEDDING_MODEL_REVISION,
        EMBEDDING_MODEL_REVISION,
    )?;
    verify_pinned_revision_resources(cache_dir)
}

fn verify_pinned_embedding_model_cache(cache_dir: &Path) -> Result<(), String> {
    let main_ref = embedding_model_main_ref_path(cache_dir);
    let main_revision = fs::read_to_string(&main_ref).map_err(|error| {
        format!(
            "failed to read pinned embedding model ref {}: {error}",
            main_ref.display()
        )
    })?;
    if main_revision.trim() != EMBEDDING_MODEL_REVISION {
        return Err(format!(
            "embedding model ref mismatch (expected {}, got {})",
            EMBEDDING_MODEL_REVISION,
            main_revision.trim()
        ));
    }
    verify_pinned_revision_resources(cache_dir)
}

fn verify_pinned_revision_resources(cache_dir: &Path) -> Result<(), String> {
    verify_embedding_model_ref(
        cache_dir,
        EMBEDDING_MODEL_REVISION,
        EMBEDDING_MODEL_REVISION,
    )?;
    let cache = HuggingFaceCache::new(cache_dir.to_owned());
    let cached_repo = cache.repo(embedding_model_repo(EMBEDDING_MODEL_REVISION));
    for resource in EMBEDDING_MODEL_RESOURCES {
        let path = cached_repo.get(resource.path).ok_or_else(|| {
            format!(
                "pinned embedding resource {} is missing from revision {}",
                resource.path, EMBEDDING_MODEL_REVISION
            )
        })?;
        verify_embedding_model_resource(&path, resource)?;
    }
    Ok(())
}

fn verify_embedding_model_resource(
    path: &Path,
    resource: EmbeddingModelResource,
) -> Result<(), String> {
    use std::io::Read;

    let metadata = fs::metadata(path).map_err(|error| {
        format!(
            "failed to inspect embedding resource {} at {}: {error}",
            resource.path,
            path.display()
        )
    })?;
    if !metadata.is_file() || metadata.len() != resource.size {
        return Err(format!(
            "embedding resource {} size mismatch (expected {}, got {})",
            resource.path,
            resource.size,
            metadata.len()
        ));
    }
    let mut file = fs::File::open(path).map_err(|error| {
        format!(
            "failed to open embedding resource {} at {}: {error}",
            resource.path,
            path.display()
        )
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| {
            format!(
                "failed to hash embedding resource {} at {}: {error}",
                resource.path,
                path.display()
            )
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual_hash = format!("{:x}", hasher.finalize());
    if actual_hash != resource.sha256 {
        return Err(format!(
            "embedding resource {} SHA-256 mismatch (expected {}, got {})",
            resource.path, resource.sha256, actual_hash
        ));
    }
    Ok(())
}

fn embedding_model_repo(revision: &str) -> Repo {
    Repo::with_revision(
        EMBEDDING_MODEL_REPOSITORY.to_owned(),
        RepoType::Model,
        revision.to_owned(),
    )
}

fn embedding_model_ref_path(cache_dir: &Path, revision: &str) -> PathBuf {
    cache_dir
        .join(Repo::model(EMBEDDING_MODEL_REPOSITORY.to_owned()).folder_name())
        .join("refs")
        .join(revision)
}

fn embedding_model_main_ref_path(cache_dir: &Path) -> PathBuf {
    embedding_model_ref_path(cache_dir, "main")
}

fn write_fastembed_main_ref(cache_dir: &Path) -> Result<(), String> {
    write_embedding_model_ref(cache_dir, "main", EMBEDDING_MODEL_REVISION)
}

fn ensure_embedding_model_ref(
    cache_dir: &Path,
    revision: &str,
    commit: &str,
) -> Result<(), String> {
    let path = embedding_model_ref_path(cache_dir, revision);
    match fs::read_to_string(&path) {
        Ok(existing) if existing.trim() == commit => Ok(()),
        Ok(existing) => Err(format!(
            "embedding model ref {revision} mismatch (expected {commit}, got {})",
            existing.trim()
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            write_embedding_model_ref(cache_dir, revision, commit)
        }
        Err(error) => Err(format!(
            "failed to read embedding model ref {}: {error}",
            path.display()
        )),
    }
}

fn verify_embedding_model_ref(
    cache_dir: &Path,
    revision: &str,
    commit: &str,
) -> Result<(), String> {
    let path = embedding_model_ref_path(cache_dir, revision);
    let actual = fs::read_to_string(&path).map_err(|error| {
        format!(
            "failed to read embedding model ref {}: {error}",
            path.display()
        )
    })?;
    if actual.trim() != commit {
        return Err(format!(
            "embedding model ref {revision} mismatch (expected {commit}, got {})",
            actual.trim()
        ));
    }
    Ok(())
}

fn write_embedding_model_ref(cache_dir: &Path, revision: &str, commit: &str) -> Result<(), String> {
    let path = embedding_model_ref_path(cache_dir, revision);
    write_embedding_model_ref_bytes(&path, commit.as_bytes())
}

fn write_embedding_model_ref_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "embedding model ref has no parent directory".to_owned())?;
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "failed to create embedding model ref directory {}: {error}",
            parent.display()
        )
    })?;
    atomic_file::write(path, bytes).map_err(|error| {
        format!(
            "failed to atomically pin embedding model ref {}: {error}",
            path.display()
        )
    })
}

fn verify_embedding_model_manifest_identity() -> Result<(), String> {
    let mut manifest =
        format!("model={EMBEDDING_MODEL_REPOSITORY}\nrevision={EMBEDDING_MODEL_REVISION}\n");
    for resource in EMBEDDING_MODEL_RESOURCES {
        manifest.push_str(&format!(
            "{}={}:{}\n",
            resource.path, resource.sha256, resource.size
        ));
    }
    let actual = format!("{:x}", Sha256::digest(manifest.as_bytes()));
    if actual != EMBEDDING_MODEL_MANIFEST_SHA256 {
        return Err(format!(
            "compiled embedding model manifest mismatch (expected {}, got {})",
            EMBEDDING_MODEL_MANIFEST_SHA256, actual
        ));
    }
    Ok(())
}

fn cached_query_embedding(
    app: &AppHandle,
    query: &str,
    runtime: &mut SearchRuntime,
) -> Result<Vec<f32>, String> {
    let key = embedding_query_input(query);
    if let Some(position) = runtime
        .query_cache
        .iter()
        .position(|entry| entry.key == key)
    {
        let entry = runtime
            .query_cache
            .remove(position)
            .ok_or_else(|| "query cache entry disappeared".to_owned())?;
        let embedding = entry.embedding.clone();
        runtime.query_cache.push_front(entry);
        return Ok(embedding);
    }
    let model = ensure_model(app, runtime)?;
    let mut embeddings = model
        .embed(vec![key.clone()], Some(1))
        .map_err(|error| format!("failed to embed semantic-search query: {error}"))?;
    let embedding = embeddings
        .pop()
        .ok_or_else(|| "embedding model returned no query vector".to_owned())?;
    runtime.query_cache.push_front(QueryCacheEntry {
        key,
        embedding: embedding.clone(),
    });
    runtime.query_cache.truncate(QUERY_CACHE_CAPACITY);
    Ok(embedding)
}

fn embedding_query_input(query: &str) -> String {
    format!("{EMBEDDING_QUERY_PREFIX}{query}")
}

fn search_runtime() -> &'static Mutex<SearchRuntime> {
    SEARCH_RUNTIME.get_or_init(|| Mutex::new(SearchRuntime::default()))
}

fn search_build_lock() -> &'static Mutex<()> {
    SEARCH_BUILD_LOCK.get_or_init(|| Mutex::new(()))
}

fn search_refresh_state() -> &'static Mutex<SearchRefreshState> {
    SEARCH_REFRESH_STATE.get_or_init(|| Mutex::new(SearchRefreshState::default()))
}

fn cosine_similarity(left: &[f32], right: &[f32]) -> f32 {
    if left.len() != right.len() || left.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut left_norm = 0.0f32;
    let mut right_norm = 0.0f32;
    for (left_value, right_value) in left.iter().zip(right) {
        dot += left_value * right_value;
        left_norm += left_value * left_value;
        right_norm += right_value * right_value;
    }
    if left_norm <= f32::EPSILON || right_norm <= f32::EPSILON {
        0.0
    } else {
        dot / (left_norm.sqrt() * right_norm.sqrt())
    }
}

fn lexical_match_score(query: &str, document: &str) -> f32 {
    if query.is_empty() {
        return 0.0;
    }
    if document.contains(query) {
        return 1.0;
    }
    let terms = query.split_whitespace().collect::<Vec<_>>();
    if terms.is_empty() {
        return 0.0;
    }
    let matched = terms
        .iter()
        .filter(|term| document.contains(**term))
        .count();
    matched as f32 / terms.len() as f32
}

fn normalize_text(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn encode_embedding(embedding: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(embedding.len() * 4);
    for value in embedding {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

fn decode_embedding(bytes: &[u8]) -> Option<Vec<f32>> {
    if bytes.is_empty() || !bytes.len().is_multiple_of(4) {
        return None;
    }
    Some(
        bytes
            .chunks_exact(4)
            .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
            .collect(),
    )
}

fn document_key(track_uuid: &str, kind: &str, ordinal: i64) -> String {
    format!("{track_uuid}\u{1f}{kind}\u{1f}{ordinal}")
}

fn read_meta(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM search_meta WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_error_string)
}

fn read_meta_i64(connection: &Connection, key: &str) -> Result<Option<i64>, String> {
    read_meta(connection, key)?
        .map(|value| value.parse::<i64>().map_err(to_error_string))
        .transpose()
}

fn write_meta(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO search_meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map(|_| ())
        .map_err(to_error_string)
}

fn count_rows(connection: &Connection, table: &str) -> Result<usize, String> {
    if !matches!(table, "tracks" | "documents") {
        return Err("unsupported search-index table".to_owned());
    }
    connection
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get::<_, i64>(0)
        })
        .map(|count| count.max(0) as usize)
        .map_err(to_error_string)
}

fn table_exists(connection: &Connection, table: &str) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
             )",
            [table],
            |row| row.get(0),
        )
        .map_err(to_error_string)
}

fn unix_timestamp_seconds() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .map_err(to_error_string)
}

fn default_search_mode() -> String {
    "hybrid".to_owned()
}

fn default_search_target() -> String {
    "all".to_owned()
}

fn default_search_limit() -> usize {
    20
}

fn default_recommendation_limit() -> usize {
    20
}

fn default_artist_limit() -> usize {
    2
}

fn default_recommendation_sentiment_weight() -> f32 {
    0.15
}

fn to_error_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        blend_sentiment_score, chunk_lyrics, compatible_query_sentiment, complete_refresh_attempt,
        cosine_similarity, current_source_revision, decode_embedding, dedupe_lyrics_results,
        dedupe_lyrics_results_with_counter, embedding_model_cache_dir_for,
        embedding_model_init_options, embedding_query_input, encode_embedding,
        evaluate_index_state, grief_policy_for_voice_options, initialize_pinned_embedding_model,
        initialize_search_database, lexical_match_score, load_cached_track_analysis,
        lyrics_five_gram_overlap, lyrics_mood_known_index_error, lyrics_persistence,
        mood_strength_valence_weight, next_sentiment_retry_after, normalize_text, rank_tracks,
        rank_tracks_with_policy, read_meta, refresh_failure_backoff_seconds,
        register_refresh_retry, reset_refresh_failure_streak, reusable_cached_analysis,
        revision_for_sources, search_database_path_for_library, select_voice_lyrics_results,
        sentiment_retry_deadline, store_track_analysis, table_exists, validate_sentiment_weight,
        verify_embedding_model_manifest_identity, verify_embedding_model_resource,
        verify_embedding_pipeline_identity, verify_pinned_embedding_model_cache,
        voice_matched_excerpt, write_fastembed_main_ref, CachedDocument, CachedTrack,
        EmbeddingModelResource, LoadedIndex, LyricsMoodPlayRequest, LyricsMoodSearchOptions,
        LyricsMoodSearchRequest, LyricsMoodStatus, RecommendTracksRequest, SearchRefreshState,
        SearchTracksRequest, TrackSearchResult, TrackSource, VoiceLyricsMatch,
        EMBEDDING_MAX_LENGTH, EMBEDDING_MODEL_ID, EMBEDDING_MODEL_MANIFEST_SHA256,
        EMBEDDING_MODEL_REVISION, EMBEDDING_PASSAGE_PREFIX, EMBEDDING_PIPELINE_ID,
        MAX_REFRESH_FAILURE_BACKOFF_SECONDS, SEARCH_INDEX_SCHEMA_VERSION,
    };
    use crate::lyrics_sentiment::{
        apply_grief_policy, grief_mood_policy_for_prompt, GriefMoodPolicy, GriefMoodStrength,
        GriefProfile, LyricsSentimentBlock, LyricsSentimentSummary, SentimentLabel,
        TrackLyricsAnalysis, ANALYZER_ID,
    };
    use fastembed::Pooling;
    use rusqlite::Connection;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temporary_path(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "musical-search-index-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ))
    }

    fn sentiment(score: Option<f32>, coverage: f32) -> LyricsSentimentSummary {
        LyricsSentimentSummary {
            score,
            label: score.map_or(SentimentLabel::Unknown, |score| {
                if score > 0.05 {
                    SentimentLabel::Positive
                } else if score < -0.05 {
                    SentimentLabel::Negative
                } else {
                    SentimentLabel::Neutral
                }
            }),
            coverage,
            eligible_token_count: 1,
            matched_token_count: usize::from(coverage > 0.0),
            scored_token_count: usize::from(score.is_some()),
            positive_count: usize::from(score.is_some_and(|score| score > 0.0)),
            negative_count: usize::from(score.is_some_and(|score| score < 0.0)),
            analyzer_id: ANALYZER_ID.to_owned(),
            diagnostic: None,
        }
    }

    fn voice_match(track_id: &str, artist: &str, duration_seconds: i64) -> VoiceLyricsMatch {
        VoiceLyricsMatch {
            track_id: track_id.to_owned(),
            title: format!("Title {track_id}"),
            artist: artist.to_owned(),
            album_title: "Album".to_owned(),
            duration_seconds,
            matched_text: "excerpt…".to_owned(),
            reason: "fixture".to_owned(),
            sentiment: None,
        }
    }

    fn lyrics_result(
        track_id: &str,
        score: f32,
        lyrics_hash: Option<&str>,
        lines: Vec<&str>,
    ) -> TrackSearchResult {
        let lyrics_lines = lines.into_iter().map(str::to_owned).collect::<Vec<_>>();
        let lyrics_line_set = Some(lyrics_lines.iter().cloned().collect());
        let lyrics_chars = Some(lyrics_lines.join(""));
        let lyrics_five_grams = lyrics_chars.as_deref().map(super::unique_five_grams);
        TrackSearchResult {
            track_id: track_id.to_owned(),
            title: format!("Title {track_id}"),
            artist: "Artist".to_owned(),
            album_title: "Album".to_owned(),
            album_artist: "Artist".to_owned(),
            genre: None,
            duration_seconds: 180,
            has_lyrics: true,
            is_favorite: false,
            rating: None,
            score,
            semantic_score: score,
            lexical_score: 0.0,
            lyrics_sentiment: None,
            sentiment_similarity: None,
            matched_document_kind: "lyrics".to_owned(),
            matched_text: "excerpt".to_owned(),
            reason: "fixture".to_owned(),
            lyrics_hash: lyrics_hash.map(str::to_owned),
            lyrics_lines: Some(lyrics_lines),
            lyrics_line_set,
            lyrics_chars,
            lyrics_five_grams,
        }
    }

    fn mood_options(prompt: &str, relative_to_current: Option<&str>) -> LyricsMoodSearchOptions {
        LyricsMoodSearchOptions {
            prompt: prompt.to_owned(),
            mood_strength: Some("strong".to_owned()),
            favorite_only: false,
            min_rating: None,
            genres: Vec::new(),
            artist: None,
            exclude_track_ids: Vec::new(),
            relative_to_current: relative_to_current.map(str::to_owned),
            limit: 20,
        }
    }

    fn grief_analysis_fixture(texts: &[&str]) -> TrackLyricsAnalysis {
        let blocks = texts
            .iter()
            .enumerate()
            .map(|(index, text)| LyricsSentimentBlock {
                ordinal: index + 1,
                start_line: index + 1,
                end_line: index + 1,
                text: (*text).to_owned(),
                sentiment: sentiment(Some(-0.5), 1.0),
            })
            .collect::<Vec<_>>();
        TrackLyricsAnalysis {
            track_id: "fixture".to_owned(),
            lyrics_hash: "hash".to_owned(),
            sentiment: sentiment(Some(-0.5), 1.0),
            blocks,
        }
    }

    fn cached_lyrics_track(track_id: &str, analysis: Option<TrackLyricsAnalysis>) -> CachedTrack {
        CachedTrack {
            track_uuid: track_id.to_owned(),
            title: format!("Title {track_id}"),
            artist: "Artist".to_owned(),
            album_title: "Album".to_owned(),
            album_artist: "Artist".to_owned(),
            genre: None,
            duration_seconds: 180,
            has_lyrics: true,
            is_favorite: false,
            rating: None,
            lyrics_sentiment: Some(sentiment(Some(-0.5), 1.0)),
            lyrics_analysis: analysis,
        }
    }

    #[test]
    fn chunks_lyrics_with_overlap() {
        let lyrics = (1..=10)
            .map(|line| format!("line {line}"))
            .collect::<Vec<_>>()
            .join("\n");
        let chunks = chunk_lyrics(&lyrics);
        assert_eq!(chunks.len(), 3);
        assert!(chunks[0].contains("line 6"));
        assert!(chunks[1].starts_with("line 5"));
        assert!(chunks[2].starts_with("line 9"));
    }

    #[test]
    fn embedding_blob_round_trips() {
        let embedding = vec![0.25, -0.5, 1.0];
        assert_eq!(
            decode_embedding(&encode_embedding(&embedding)),
            Some(embedding)
        );
    }

    #[test]
    fn cosine_similarity_handles_equal_and_orthogonal_vectors() {
        assert!((cosine_similarity(&[1.0, 0.0], &[1.0, 0.0]) - 1.0).abs() < 0.0001);
        assert!(cosine_similarity(&[1.0, 0.0], &[0.0, 1.0]).abs() < 0.0001);
    }

    #[test]
    fn lexical_matching_uses_normalized_terms() {
        let document = normalize_text("Rainy Night Drive");
        assert_eq!(lexical_match_score("rainy night", &document), 1.0);
        assert_eq!(lexical_match_score("rainy ocean", &document), 0.5);
    }

    #[test]
    fn search_database_is_stored_with_its_library_database() {
        let library_database = PathBuf::from("library")
            .join(".musical")
            .join("musical.sqlite3");
        assert_eq!(
            search_database_path_for_library(&library_database),
            PathBuf::from("library")
                .join(".musical")
                .join("search_index.sqlite3")
        );
    }

    #[test]
    fn embedding_cache_is_private_and_rejects_hf_home() {
        let app_cache = PathBuf::from("application-cache");
        assert_eq!(
            embedding_model_cache_dir_for(app_cache.clone(), None).expect("private cache"),
            app_cache.join(super::EMBEDDING_MODEL_CACHE_DIRECTORY)
        );
        let error = embedding_model_cache_dir_for(
            app_cache,
            Some(std::ffi::OsString::from("shared-hf-cache")),
        )
        .expect_err("shared HF_HOME must be rejected");
        assert!(error.contains("does not support HF_HOME"));

        let empty_error = embedding_model_cache_dir_for(
            PathBuf::from("application-cache"),
            Some(std::ffi::OsString::new()),
        )
        .expect_err("empty HF_HOME must still be rejected");
        assert!(empty_error.contains("does not support HF_HOME"));

        #[cfg(unix)]
        {
            use std::os::unix::ffi::OsStringExt;

            let non_unicode_error = embedding_model_cache_dir_for(
                PathBuf::from("application-cache"),
                Some(std::ffi::OsString::from_vec(vec![0xff])),
            )
            .expect_err("non-Unicode HF_HOME must be rejected");
            assert!(non_unicode_error.contains("does not support HF_HOME"));
        }
    }

    #[test]
    fn source_revision_staleness_remains_searchable_but_model_mismatch_does_not() {
        let source_revision_only = evaluate_index_state(
            1,
            "current-source",
            Some("previous-source"),
            Some(EMBEDDING_MODEL_ID),
            Some(SEARCH_INDEX_SCHEMA_VERSION),
            Some(ANALYZER_ID),
            0,
            None,
            100,
        );
        assert_eq!(source_revision_only, (true, true));

        let model_mismatch = evaluate_index_state(
            1,
            "current-source",
            Some("current-source"),
            Some("previous-embedding-model"),
            Some(SEARCH_INDEX_SCHEMA_VERSION),
            Some(ANALYZER_ID),
            0,
            None,
            100,
        );
        assert_eq!(model_mismatch, (false, true));
    }

    #[test]
    fn embedding_pipeline_identity_is_persisted_and_invalidates_old_indexes() {
        assert!(EMBEDDING_PIPELINE_ID.contains("fastembed=5.17.4"));
        assert!(EMBEDDING_PIPELINE_ID.contains("tokenizers=0.22.2"));
        assert!(EMBEDDING_PIPELINE_ID.contains("pooling=mean"));
        assert!(EMBEDDING_PIPELINE_ID.contains("max_length=512"));
        assert!(EMBEDDING_PIPELINE_ID.contains("query-prefix=query-colon-space"));
        assert!(EMBEDDING_PIPELINE_ID.contains("passage-prefix=passage-colon-space"));
        assert!(EMBEDDING_PIPELINE_ID.contains("output-normalization=l2-epsilon-1e-12"));
        assert!(EMBEDDING_MODEL_ID.contains(EMBEDDING_PIPELINE_ID));
        assert_eq!(
            embedding_model_init_options(&PathBuf::from("model-cache")).max_length,
            EMBEDDING_MAX_LENGTH
        );
        assert_eq!(
            fastembed::TextEmbedding::get_default_pooling_method(
                &fastembed::EmbeddingModel::MultilingualE5Small
            ),
            Some(Pooling::Mean)
        );
        verify_embedding_pipeline_identity().expect("compiled FastEmbed pooling pipeline");

        let previous_model_id = EMBEDDING_MODEL_ID.replace(
            EMBEDDING_PIPELINE_ID,
            "fastembed=5.17.3;tokenizers=0.22.2;pooling=mean;max_length=512;query-prefix=query-colon-space;passage-prefix=passage-colon-space;output-normalization=l2-epsilon-1e-12",
        );
        assert_eq!(
            evaluate_index_state(
                1,
                "current-source",
                Some("current-source"),
                Some(&previous_model_id),
                Some(SEARCH_INDEX_SCHEMA_VERSION),
                Some(ANALYZER_ID),
                0,
                None,
                100,
            ),
            (false, true)
        );
    }

    #[test]
    fn query_embedding_cache_key_is_the_exact_prefixed_model_input() {
        assert_eq!(embedding_query_input("Apple"), "query: Apple");
        assert_ne!(
            embedding_query_input("Apple"),
            embedding_query_input("apple")
        );
        assert_ne!(
            embedding_query_input("雨 の 夜"),
            embedding_query_input("雨  の 夜")
        );
        assert_eq!(
            embedding_query_input("雨 の 夜"),
            embedding_query_input("雨 の 夜")
        );
    }

    #[test]
    fn analyzer_mismatch_and_due_retry_are_stale_but_remain_searchable() {
        let analyzer_mismatch = evaluate_index_state(
            1,
            "current-source",
            Some("current-source"),
            Some(EMBEDDING_MODEL_ID),
            Some(SEARCH_INDEX_SCHEMA_VERSION),
            Some("previous-analyzer"),
            0,
            None,
            100,
        );
        assert_eq!(analyzer_mismatch, (true, true));

        let waiting_for_retry = evaluate_index_state(
            1,
            "current-source",
            Some("current-source"),
            Some(EMBEDDING_MODEL_ID),
            Some(SEARCH_INDEX_SCHEMA_VERSION),
            Some(ANALYZER_ID),
            2,
            Some(101),
            100,
        );
        assert_eq!(waiting_for_retry, (true, false));

        let retry_due = evaluate_index_state(
            1,
            "current-source",
            Some("current-source"),
            Some(EMBEDDING_MODEL_ID),
            Some(SEARCH_INDEX_SCHEMA_VERSION),
            Some(ANALYZER_ID),
            2,
            Some(100),
            100,
        );
        assert_eq!(retry_due, (true, true));
        assert_eq!(sentiment_retry_deadline(100), 161);
        assert_eq!(next_sentiment_retry_after(2, None, 100), Some(161));
        assert_eq!(next_sentiment_retry_after(2, Some(150), 100), Some(150));
        assert_eq!(next_sentiment_retry_after(2, Some(100), 100), Some(161));
        assert_eq!(next_sentiment_retry_after(0, Some(150), 100), None);

        let query = sentiment(Some(0.75), 1.0);
        assert!(compatible_query_sentiment(Some("previous-analyzer"), &query).is_none());
        assert_eq!(
            compatible_query_sentiment(Some(ANALYZER_ID), &query),
            Some(&query)
        );
    }

    #[test]
    fn failed_refresh_is_rescheduled_with_backoff_without_duplicate_timer() {
        let library = PathBuf::from("library.sqlite3");
        let mut state = SearchRefreshState {
            active_library: Some(library.clone()),
            checked_libraries: std::collections::HashSet::from([library.clone()]),
            ..SearchRefreshState::default()
        };

        let retry_after = complete_refresh_attempt(&mut state, &library, false, 100)
            .expect("failed refresh must request a retry");
        assert_eq!(retry_after, 161);
        assert_eq!(state.refresh_failure_streaks.get(&library), Some(&1));
        assert!(state.active_library.is_none());
        assert!(!state.checked_libraries.contains(&library));
        assert!(register_refresh_retry(&mut state, &library, retry_after));
        assert!(!register_refresh_retry(&mut state, &library, retry_after));
        assert!(!register_refresh_retry(
            &mut state,
            &library,
            retry_after + 60
        ));
        assert_eq!(
            state.scheduled_sentiment_retries.get(&library),
            Some(&retry_after)
        );

        assert_eq!(
            complete_refresh_attempt(&mut state, &library, false, 200),
            Some(322)
        );
        assert_eq!(state.refresh_failure_streaks.get(&library), Some(&2));
        assert_eq!(refresh_failure_backoff_seconds(3), 244);
        assert_eq!(
            refresh_failure_backoff_seconds(32),
            MAX_REFRESH_FAILURE_BACKOFF_SECONDS
        );

        reset_refresh_failure_streak(&mut state, &library);
        assert!(!state.refresh_failure_streaks.contains_key(&library));
        assert_eq!(
            complete_refresh_attempt(&mut state, &library, false, 300),
            Some(361)
        );
        assert_eq!(state.refresh_failure_streaks.get(&library), Some(&1));

        assert_eq!(
            complete_refresh_attempt(&mut state, &library, true, 400),
            None
        );
        assert!(state.checked_libraries.contains(&library));
        assert!(!state.refresh_failure_streaks.contains_key(&library));
    }

    #[test]
    fn lyrics_only_change_updates_source_revision() {
        let source = TrackSource {
            track_uuid: "track-1".to_owned(),
            title: "Title".to_owned(),
            artist: "Artist".to_owned(),
            album_title: "Album".to_owned(),
            album_artist: "Album Artist".to_owned(),
            genre: Some("Rock".to_owned()),
            duration_seconds: 180,
            lyrics: Some("before".to_owned()),
            is_favorite: false,
            rating: None,
            file_mtime: 10,
            file_size: 20,
            user_state_updated_at: None,
        };
        let before = revision_for_sources(std::slice::from_ref(&source));
        let mut changed = source;
        changed.lyrics = Some("after".to_owned());
        assert_ne!(before, revision_for_sources(&[changed]));

        let database_path = temporary_path("source-revision.sqlite3");
        let connection = Connection::open(&database_path).expect("open source revision fixture");
        connection
            .execute_batch(
                "CREATE TABLE albums (
                    group_key TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    genre TEXT
                 );
                 CREATE TABLE tracks (
                    uuid TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    album_group_key TEXT NOT NULL,
                    duration_seconds INTEGER NOT NULL,
                    file_mtime INTEGER NOT NULL,
                    file_size INTEGER NOT NULL,
                    lyrics TEXT
                 );
                 CREATE TABLE track_user_state (
                    track_uuid TEXT PRIMARY KEY,
                    is_favorite INTEGER NOT NULL,
                    rating INTEGER,
                    updated_at TEXT
                 );
                 INSERT INTO albums (group_key, title, artist, genre)
                 VALUES ('album-1', 'Album', 'Album Artist', 'Rock');
                 INSERT INTO tracks (
                    uuid, title, artist, album_group_key, duration_seconds, file_mtime, file_size, lyrics
                 ) VALUES ('track-1', 'Title', 'Artist', 'album-1', 180, 10, 20, 'before');",
            )
            .expect("initialize source revision fixture");
        drop(connection);
        let before = current_source_revision(&database_path).expect("source revision before");
        let connection = Connection::open(&database_path).expect("reopen source revision fixture");
        connection
            .execute(
                "UPDATE tracks SET lyrics = 'after' WHERE uuid = 'track-1'",
                [],
            )
            .expect("change lyrics only");
        drop(connection);
        let after = current_source_revision(&database_path).expect("source revision after");
        assert_ne!(before, after);
        fs::remove_file(database_path).expect("remove source revision fixture");
    }

    #[test]
    fn duration_only_change_updates_source_revision() {
        let source = TrackSource {
            track_uuid: "track-1".to_owned(),
            title: "Title".to_owned(),
            artist: "Artist".to_owned(),
            album_title: "Album".to_owned(),
            album_artist: "Album Artist".to_owned(),
            genre: Some("Rock".to_owned()),
            duration_seconds: 180,
            lyrics: Some("Lyrics".to_owned()),
            is_favorite: false,
            rating: None,
            file_mtime: 10,
            file_size: 20,
            user_state_updated_at: None,
        };
        let before = revision_for_sources(std::slice::from_ref(&source));
        let mut changed = source;
        changed.duration_seconds = 181;
        assert_ne!(before, revision_for_sources(&[changed]));

        let database_path = temporary_path("source-revision-duration.sqlite3");
        let connection = Connection::open(&database_path).expect("open source revision fixture");
        connection
            .execute_batch(
                "CREATE TABLE albums (
                    group_key TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    genre TEXT
                 );
                 CREATE TABLE tracks (
                    uuid TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    album_group_key TEXT NOT NULL,
                    duration_seconds INTEGER NOT NULL,
                    file_mtime INTEGER NOT NULL,
                    file_size INTEGER NOT NULL,
                    lyrics TEXT
                 );
                 CREATE TABLE track_user_state (
                    track_uuid TEXT PRIMARY KEY,
                    is_favorite INTEGER NOT NULL,
                    rating INTEGER,
                    updated_at TEXT
                 );
                 INSERT INTO albums (group_key, title, artist, genre)
                 VALUES ('album-1', 'Album', 'Album Artist', 'Rock');
                 INSERT INTO tracks (
                    uuid, title, artist, album_group_key, duration_seconds, file_mtime, file_size, lyrics
                 ) VALUES ('track-1', 'Title', 'Artist', 'album-1', 180, 10, 20, 'Lyrics');",
            )
            .expect("initialize source revision fixture");
        drop(connection);
        let before = current_source_revision(&database_path).expect("source revision before");
        let connection = Connection::open(&database_path).expect("reopen source revision fixture");
        connection
            .execute(
                "UPDATE tracks SET duration_seconds = 181 WHERE uuid = 'track-1'",
                [],
            )
            .expect("change duration only");
        drop(connection);
        let after = current_source_revision(&database_path).expect("source revision after");
        assert_ne!(before, after);
        fs::remove_file(database_path).expect("remove source revision fixture");
    }

    #[test]
    fn pinned_model_manifest_and_cache_files_reject_tampering() {
        verify_embedding_model_manifest_identity().expect("compiled model manifest");
        assert!(EMBEDDING_MODEL_ID.contains(EMBEDDING_MODEL_REVISION));
        assert!(EMBEDDING_MODEL_ID.contains(EMBEDDING_MODEL_MANIFEST_SHA256));

        let root = temporary_path("model-verification");
        fs::create_dir_all(&root).expect("create model fixture");
        let path = root.join("resource.bin");
        fs::write(&path, b"verified").expect("write verified fixture");
        let resource = EmbeddingModelResource {
            path: "resource.bin",
            sha256: "1c34f88707b55e6104c4eb20e71ffa3d33e414b71ef689a15fad0640d0ac58cb",
            size: 8,
        };
        verify_embedding_model_resource(&path, resource).expect("verified fixture");

        fs::write(&path, b"tampered").expect("tamper fixture");
        let error = verify_embedding_model_resource(&path, resource)
            .expect_err("tampered fixture must be rejected");
        assert!(error.contains("SHA-256 mismatch"));
        fs::remove_dir_all(root).expect("remove model fixture");
    }

    #[test]
    fn fastembed_main_ref_is_atomically_pinned() {
        let root = temporary_path("model-ref");
        write_fastembed_main_ref(&root).expect("write pinned ref");
        let main_ref = super::embedding_model_main_ref_path(&root);
        assert_eq!(
            fs::read_to_string(&main_ref).expect("read pinned ref"),
            EMBEDDING_MODEL_REVISION
        );
        fs::write(&main_ref, "future-main").expect("replace pinned ref");
        let error = verify_pinned_embedding_model_cache(&root)
            .expect_err("changed main ref must be rejected before model adoption");
        assert!(error.contains("ref mismatch"));
        fs::remove_dir_all(root).expect("remove model ref fixture");
    }

    #[test]
    fn zero_sentiment_weight_preserves_base_score_bits() {
        let query = sentiment(Some(0.8), 1.0);
        let track = sentiment(Some(-0.4), 1.0);
        let base = 0.712_345_66_f32;
        let (score, similarity, effective_weight) =
            blend_sentiment_score(base, 0.0, &query, Some(&track));
        assert_eq!(score.to_bits(), base.to_bits());
        assert_eq!(similarity, None);
        assert_eq!(effective_weight, 0.0);
    }

    #[test]
    fn zero_sentiment_weight_preserves_semantic_rank_order() {
        let first = CachedTrack {
            track_uuid: "first".to_owned(),
            title: "First".to_owned(),
            artist: "Artist".to_owned(),
            album_title: "Album".to_owned(),
            album_artist: "Artist".to_owned(),
            genre: None,
            duration_seconds: 100,
            has_lyrics: true,
            is_favorite: false,
            rating: None,
            lyrics_sentiment: Some(sentiment(Some(-1.0), 1.0)),
            lyrics_analysis: None,
        };
        let second = CachedTrack {
            track_uuid: "second".to_owned(),
            title: "Second".to_owned(),
            artist: "Other Artist".to_owned(),
            lyrics_sentiment: Some(sentiment(Some(1.0), 1.0)),
            ..first.clone()
        };
        let loaded = LoadedIndex {
            database_path: PathBuf::new(),
            generation: 1,
            tracks: [("first".to_owned(), first), ("second".to_owned(), second)]
                .into_iter()
                .collect(),
            documents: vec![
                CachedDocument {
                    track_uuid: "first".to_owned(),
                    kind: "metadata".to_owned(),
                    text: "first".to_owned(),
                    normalized_text: "first".to_owned(),
                    embedding: vec![0.8, 0.6],
                },
                CachedDocument {
                    track_uuid: "second".to_owned(),
                    kind: "metadata".to_owned(),
                    text: "second".to_owned(),
                    normalized_text: "second".to_owned(),
                    embedding: vec![0.6, 0.8],
                },
            ],
        };
        let request: SearchTracksRequest = serde_json::from_value(serde_json::json!({
            "query": "mood",
            "mode": "semantic",
            "sentimentWeight": 0.0
        }))
        .expect("search request");
        let results = rank_tracks(&loaded, &[1.0, 0.0], None, &request);
        assert_eq!(
            results
                .iter()
                .map(|result| result.track_id.as_str())
                .collect::<Vec<_>>(),
            vec!["first", "second"]
        );
        assert_eq!(results[0].score.to_bits(), 0.8_f32.to_bits());
        assert_eq!(results[1].score.to_bits(), 0.6_f32.to_bits());

        let artist_request: SearchTracksRequest = serde_json::from_value(serde_json::json!({
            "query": "mood",
            "mode": "semantic",
            "artist": "artist",
            "sentimentWeight": 0.0
        }))
        .expect("artist-filtered search request");
        assert_eq!(
            rank_tracks(&loaded, &[1.0, 0.0], None, &artist_request)
                .iter()
                .map(|result| result.track_id.as_str())
                .collect::<Vec<_>>(),
            vec!["first"]
        );
    }

    #[test]
    fn zero_coverage_preserves_base_score_bits() {
        let query = sentiment(Some(0.8), 0.0);
        let track = sentiment(Some(0.8), 1.0);
        let base = 0.612_345_7_f32;
        let (score, similarity, effective_weight) =
            blend_sentiment_score(base, 0.3, &query, Some(&track));
        assert_eq!(score.to_bits(), base.to_bits());
        assert_eq!(similarity, Some(1.0));
        assert_eq!(effective_weight, 0.0);
    }

    #[test]
    fn sentiment_blend_uses_similarity_and_minimum_coverage() {
        let query = sentiment(Some(1.0), 0.5);
        let track = sentiment(Some(1.0), 0.8);
        let (score, similarity, effective_weight) =
            blend_sentiment_score(0.4, 0.2, &query, Some(&track));
        assert_eq!(similarity, Some(1.0));
        assert!((effective_weight - 0.1).abs() < 0.0001);
        assert!((score - 0.46).abs() < 0.0001);

        let unavailable = sentiment(None, 0.0);
        let base = 0.4_f32;
        let (score, similarity, effective_weight) =
            blend_sentiment_score(base, 0.2, &unavailable, Some(&track));
        assert_eq!(score.to_bits(), base.to_bits());
        assert_eq!(similarity, None);
        assert_eq!(effective_weight, 0.0);
    }

    #[test]
    fn sentiment_weight_defaults_and_validation_match_api_contract() {
        let search: SearchTracksRequest =
            serde_json::from_value(serde_json::json!({ "query": "rain" })).expect("search request");
        let recommendation: RecommendTracksRequest =
            serde_json::from_value(serde_json::json!({ "prompt": "rain" }))
                .expect("recommendation request");
        assert_eq!(search.sentiment_weight, 0.0);
        assert_eq!(recommendation.sentiment_weight, 0.15);
        assert!(validate_sentiment_weight(0.0).is_ok());
        assert!(validate_sentiment_weight(0.3).is_ok());
        assert!(validate_sentiment_weight(-0.01).is_err());
        assert!(validate_sentiment_weight(0.31).is_err());
        assert!(validate_sentiment_weight(f32::NAN).is_err());
    }

    #[test]
    fn voice_mood_requests_apply_the_public_defaults_and_bounds() {
        let search: LyricsMoodSearchRequest = serde_json::from_value(serde_json::json!({
            "prompt": " rainy night "
        }))
        .expect("voice search request");
        let play: LyricsMoodPlayRequest = serde_json::from_value(serde_json::json!({
            "prompt": " rainy night "
        }))
        .expect("voice play request");
        assert_eq!(search.limit, 20);
        assert_eq!(play.limit, 20);
        assert_eq!(play.max_tracks_per_artist, 2);
        assert_eq!(mood_strength_valence_weight(None), Ok(0.15));
        assert_eq!(mood_strength_valence_weight(Some("subtle")), Ok(0.08));
        assert_eq!(mood_strength_valence_weight(Some("balanced")), Ok(0.15));
        assert_eq!(mood_strength_valence_weight(Some("strong")), Ok(0.30));
        assert!(mood_strength_valence_weight(Some("loud")).is_err());
    }

    #[test]
    fn valence_and_grief_theme_strength_weights_remain_distinct() {
        let profile = GriefProfile {
            strong_loss_blocks: 2,
            separation_blocks: 0,
            aftermath_blocks: 0,
            sorrow_blocks: 0,
            resolution_blocks: 0,
            romantic_pursuit_blocks: 0,
            agency_blocks: 0,
            core_passed: true,
            loss_score: 1.0,
            tail_resolution_ratio: 0.0,
            repeated_romance: 0.0,
            repeated_agency: 0.0,
            anti_penalty: 0.0,
            evidence_block_ratio: 1.0,
        };
        let base = 0.4;

        for (strength, valence_weight, grief_weight) in [
            (GriefMoodStrength::Subtle, 0.08, 0.08),
            (GriefMoodStrength::Balanced, 0.15, 0.14),
            (GriefMoodStrength::Strong, 0.30, 0.20),
        ] {
            let name = match strength {
                GriefMoodStrength::Subtle => "subtle",
                GriefMoodStrength::Balanced => "balanced",
                GriefMoodStrength::Strong => "strong",
            };
            assert_eq!(mood_strength_valence_weight(Some(name)), Ok(valence_weight));
            let grief_score = apply_grief_policy(base, &profile, 1.0, GriefMoodPolicy { strength });
            assert!((grief_score - (base + grief_weight * 0.5)).abs() < f32::EPSILON);
        }
    }

    #[test]
    fn known_missing_library_error_is_typed_but_unknown_index_errors_propagate() {
        let response = lyrics_mood_known_index_error(
            "library.error.noLibraryScanned",
            "night drive".to_owned(),
        )
        .expect("known library state response");
        assert_eq!(response.status, LyricsMoodStatus::IndexNotReady);
        assert_eq!(response.can_build, Some(false));
        assert_eq!(response.reason_code.as_deref(), Some("noLibraryScanned"));
        assert!(response.results.is_empty());
        assert!(
            lyrics_mood_known_index_error("database corrupt", "night drive".to_owned()).is_err()
        );
    }

    #[test]
    fn voice_excerpt_never_returns_the_entire_matched_lyrics_document() {
        let long_lyrics = "long lyric ".repeat(40);
        for source in ["x", "short lyric", long_lyrics.as_str()] {
            let excerpt = voice_matched_excerpt(source);
            assert_ne!(excerpt, source);
            assert!(!excerpt.contains(source));
            assert!(excerpt.chars().count() <= super::MAX_VOICE_MATCHED_TEXT_CHARS);
        }
    }

    #[test]
    fn voice_recommendation_selection_applies_duration_artist_diversity_and_limit() {
        let (results, total_duration_seconds) = select_voice_lyrics_results(
            vec![
                voice_match("first", "Artist A", 100),
                voice_match("second", "Artist A", 200),
                voice_match("third", "Artist B", 150),
                voice_match("fourth", "Artist C", 150),
            ],
            3,
            1,
            Some(240),
        );
        assert_eq!(
            results
                .iter()
                .map(|result| result.track_id.as_str())
                .collect::<Vec<_>>(),
            vec!["first", "third"]
        );
        assert_eq!(total_duration_seconds, 250);

        let (limited, limited_total) = select_voice_lyrics_results(
            vec![
                voice_match("first", "Artist A", 100),
                voice_match("second", "Artist B", 200),
            ],
            1,
            2,
            None,
        );
        assert_eq!(limited.len(), 1);
        assert_eq!(limited_total, 100);
    }

    #[test]
    fn lyrics_persistence_counts_only_the_top_three_near_best_chunks() {
        assert_eq!(lyrics_persistence(&[]), 0.0);
        assert!((lyrics_persistence(&[0.9]) - 1.0 / 3.0).abs() < 0.0001);
        assert!((lyrics_persistence(&[0.9, 0.86, 0.84, 0.1]) - 1.0).abs() < 0.0001);
        assert!((lyrics_persistence(&[0.9, 0.83, 0.82]) - 1.0 / 3.0).abs() < 0.0001);
    }

    #[test]
    fn relative_voice_requests_disable_the_grief_policy() {
        assert!(grief_policy_for_voice_options(&mood_options("悲哀", Some("darker"))).is_none());
        assert!(grief_policy_for_voice_options(&mood_options("悲哀", None)).is_some());
    }

    #[test]
    fn lyrics_content_dedupe_uses_exact_hash_before_line_overlap() {
        let top_lines = vec![
            "line-0", "line-1", "line-2", "line-3", "line-4", "line-5", "line-6", "line-7",
        ];
        let results = dedupe_lyrics_results(
            vec![
                lyrics_result("top", 0.95, Some("same-hash"), top_lines),
                lyrics_result(
                    "same-content",
                    0.90,
                    Some("same-hash"),
                    vec!["different"; 8],
                ),
                lyrics_result("refill", 0.80, None, vec!["unique"; 8]),
            ],
            2,
        );
        assert_eq!(
            results
                .iter()
                .map(|result| result.track_id.as_str())
                .collect::<Vec<_>>(),
            vec!["top", "refill"]
        );
    }

    #[test]
    fn lyrics_content_dedupe_uses_eighty_five_percent_unique_line_overlap() {
        let common = (0..22).map(|i| format!("common-{i}")).collect::<Vec<_>>();
        let mut left = common.clone();
        left.extend((0..6).map(|i| format!("left-{i}")));
        let mut right = common.clone();
        right.extend((0..3).map(|i| format!("right-{i}")));
        let left_refs = left.iter().map(String::as_str).collect::<Vec<_>>();
        let right_refs = right.iter().map(String::as_str).collect::<Vec<_>>();
        assert!(super::lyrics_content_overlap(&left, &right));
        let deduped = dedupe_lyrics_results(
            vec![
                lyrics_result("left", 0.9, None, left_refs),
                lyrics_result("right", 0.8, None, right_refs),
            ],
            2,
        );
        assert_eq!(deduped.len(), 1);

        let mut lower = (0..21).map(|i| format!("common-{i}")).collect::<Vec<_>>();
        lower.extend((0..4).map(|i| format!("lower-{i}")));
        let mut upper = (0..21).map(|i| format!("common-{i}")).collect::<Vec<_>>();
        upper.extend((0..4).map(|i| format!("upper-{i}")));
        assert!(!super::lyrics_content_overlap(&lower, &upper));
        let retained = dedupe_lyrics_results(
            vec![
                lyrics_result(
                    "lower",
                    0.9,
                    None,
                    lower.iter().map(String::as_str).collect(),
                ),
                lyrics_result(
                    "upper",
                    0.8,
                    None,
                    upper.iter().map(String::as_str).collect(),
                ),
            ],
            2,
        );
        assert_eq!(retained.len(), 2);
    }

    #[test]
    fn lyrics_content_dedupe_comparisons_are_bounded_by_candidates_times_limit() {
        let mut candidates = Vec::with_capacity(1_000);
        for group in 0..20 {
            let lines = (0..8)
                .map(|line| format!("representative-{group}-{line}"))
                .collect::<Vec<_>>();
            candidates.push(lyrics_result(
                &format!("representative-{group}"),
                1.0 - group as f32 * 0.001,
                None,
                lines.iter().map(String::as_str).collect(),
            ));
        }
        let duplicate_lines = (0..8)
            .map(|line| format!("representative-19-{line}"))
            .collect::<Vec<_>>();
        for duplicate in 0..980 {
            candidates.push(lyrics_result(
                &format!("duplicate-{duplicate}"),
                0.5,
                None,
                duplicate_lines.iter().map(String::as_str).collect(),
            ));
        }

        let mut comparison_count = 0;
        let results = dedupe_lyrics_results_with_counter(candidates, 20, &mut comparison_count);
        assert_eq!(results.len(), 20);
        assert!(comparison_count <= 20_000);
    }

    #[test]
    fn lyrics_five_gram_fallback_matches_near_complete_whole_text() {
        let common = (0..334).map(|i| format!("g{i:03}"));
        let mut left = common.clone().collect::<Vec<_>>();
        left.extend((334..354).map(|i| format!("l{i:03}")));
        let mut right = common.collect::<Vec<_>>();
        right.extend((334..351).map(|i| format!("r{i:03}")));
        assert_eq!((left.len(), right.len()), (354, 351));
        assert!(lyrics_five_gram_overlap(544, &left, 541, &right));

        let mut first = lyrics_result("first", 0.9, None, vec!["one-long-line"]);
        first.lyrics_chars = Some("a".repeat(544));
        first.lyrics_five_grams = Some(left);
        let mut second = lyrics_result("second", 0.8, None, vec!["another-long-line"]);
        second.lyrics_chars = Some("b".repeat(541));
        second.lyrics_five_grams = Some(right);
        let deduped = dedupe_lyrics_results(vec![first, second], 2);
        assert_eq!(deduped.len(), 1);
    }

    #[test]
    fn lyrics_five_gram_fallback_rejects_short_length_or_chorus_only_matches() {
        let shared = (0..90).map(|i| format!("g{i:03}")).collect::<Vec<_>>();
        assert!(!lyrics_five_gram_overlap(159, &shared, 159, &shared));
        assert!(!lyrics_five_gram_overlap(1_000, &shared, 940, &shared));
        assert!(!lyrics_five_gram_overlap(1_000, &shared, 949, &shared));

        let left = (0..100).map(|i| format!("g{i:03}")).collect::<Vec<_>>();
        let mut right = left[..94].to_vec();
        right.extend((100..106).map(|i| format!("r{i:03}")));
        assert!(!lyrics_five_gram_overlap(500, &left, 500, &right));
    }

    #[test]
    fn strong_grief_ranking_rejects_romance_and_action_false_positives() {
        let grief = cached_lyrics_track(
            "grief",
            Some(grief_analysis_fixture(&[
                "死別と記憶",
                "失った記憶",
                "涙と孤独",
            ])),
        );
        let romance = cached_lyrics_track(
            "romance",
            Some(grief_analysis_fixture(&["愛を抱いて涙", "笑顔で明日"])),
        );
        let action = cached_lyrics_track(
            "action",
            Some(grief_analysis_fixture(&["孤独な夜", "強く戦い進む明日"])),
        );
        let missing = cached_lyrics_track("missing", None);
        let tracks = [grief, romance, action, missing]
            .into_iter()
            .map(|track| (track.track_uuid.clone(), track))
            .collect();
        let documents = ["grief", "romance", "action", "missing"]
            .into_iter()
            .enumerate()
            .map(|(index, track_id)| CachedDocument {
                track_uuid: track_id.to_owned(),
                kind: "lyrics".to_owned(),
                text: "lyric passage".to_owned(),
                normalized_text: "lyric passage".to_owned(),
                embedding: vec![1.0 - index as f32 * 0.05, index as f32 * 0.01],
            })
            .collect();
        let loaded = LoadedIndex {
            database_path: PathBuf::new(),
            generation: 1,
            tracks,
            documents,
        };
        let request: SearchTracksRequest = serde_json::from_value(serde_json::json!({
            "query": "悲哀の歌詞",
            "mode": "semantic",
            "target": "lyrics",
            "lyricsOnly": true,
            "sentimentWeight": 0.0,
            "limit": 10
        }))
        .expect("search request");
        let policy =
            grief_mood_policy_for_prompt("悲哀の歌詞", Some("strong")).expect("grief policy");
        let results = rank_tracks_with_policy(&loaded, &[1.0, 0.0], None, &request, Some(&policy));
        assert_eq!(
            results
                .iter()
                .map(|result| result.track_id.as_str())
                .collect::<Vec<_>>(),
            vec!["grief", "missing", "romance", "action"]
        );
        assert!(results[0].score > results[2].score);
        assert!(results[0].score > results[3].score);
    }

    #[test]
    fn exact_ties_choose_the_same_lyrics_dedupe_representative_for_reversed_input() {
        let request: SearchTracksRequest = serde_json::from_value(serde_json::json!({
            "query": "悲哀の歌詞",
            "mode": "semantic",
            "target": "lyrics",
            "lyricsOnly": true,
            "sentimentWeight": 0.0,
            "limit": 10
        }))
        .expect("search request");
        let policy =
            grief_mood_policy_for_prompt("悲哀の歌詞", Some("strong")).expect("grief policy");
        let representative_for = |track_ids: [&str; 2]| {
            let tracks = track_ids
                .iter()
                .map(|track_id| {
                    let mut analysis = grief_analysis_fixture(&["死別と記憶", "涙と孤独"]);
                    analysis.track_id = (*track_id).to_owned();
                    analysis.lyrics_hash = "identical-lyrics".to_owned();
                    let mut track = cached_lyrics_track(track_id, Some(analysis));
                    track.title = "Same Title".to_owned();
                    track.artist = "Same Artist".to_owned();
                    ((*track_id).to_owned(), track)
                })
                .collect();
            let documents = track_ids
                .iter()
                .map(|track_id| CachedDocument {
                    track_uuid: (*track_id).to_owned(),
                    kind: "lyrics".to_owned(),
                    text: "same lyric passage".to_owned(),
                    normalized_text: "same lyric passage".to_owned(),
                    embedding: vec![1.0, 0.0],
                })
                .collect();
            let loaded = LoadedIndex {
                database_path: PathBuf::new(),
                generation: 1,
                tracks,
                documents,
            };
            let ranked =
                rank_tracks_with_policy(&loaded, &[1.0, 0.0], None, &request, Some(&policy));
            dedupe_lyrics_results(ranked, 1)
                .into_iter()
                .next()
                .expect("representative")
                .track_id
        };

        assert_eq!(representative_for(["edition-b", "edition-a"]), "edition-a");
        assert_eq!(representative_for(["edition-a", "edition-b"]), "edition-a");
    }

    #[test]
    fn no_grief_policy_keeps_rank_tracks_scores_and_order_unchanged() {
        let first = cached_lyrics_track("first", None);
        let second = cached_lyrics_track("second", None);
        let loaded = LoadedIndex {
            database_path: PathBuf::new(),
            generation: 1,
            tracks: [("first".to_owned(), first), ("second".to_owned(), second)]
                .into_iter()
                .collect(),
            documents: vec![
                CachedDocument {
                    track_uuid: "first".to_owned(),
                    kind: "lyrics".to_owned(),
                    text: "first".to_owned(),
                    normalized_text: "first".to_owned(),
                    embedding: vec![0.8, 0.6],
                },
                CachedDocument {
                    track_uuid: "second".to_owned(),
                    kind: "lyrics".to_owned(),
                    text: "second".to_owned(),
                    normalized_text: "second".to_owned(),
                    embedding: vec![0.6, 0.8],
                },
            ],
        };
        let request: SearchTracksRequest = serde_json::from_value(serde_json::json!({
            "query": "mood",
            "mode": "semantic",
            "target": "lyrics",
            "lyricsOnly": true
        }))
        .expect("search request");
        let without_policy = rank_tracks(&loaded, &[1.0, 0.0], None, &request);
        let explicit_none = rank_tracks_with_policy(&loaded, &[1.0, 0.0], None, &request, None);
        assert_eq!(
            without_policy
                .iter()
                .map(|result| result.track_id.as_str())
                .collect::<Vec<_>>(),
            explicit_none
                .iter()
                .map(|result| result.track_id.as_str())
                .collect::<Vec<_>>()
        );
        assert_eq!(
            without_policy
                .iter()
                .map(|result| result.score.to_bits())
                .collect::<Vec<_>>(),
            explicit_none
                .iter()
                .map(|result| result.score.to_bits())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn initializes_sentiment_tables_in_a_v1_database_without_altering_meta() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        connection
            .execute_batch(
                "CREATE TABLE search_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO search_meta (key, value) VALUES ('schema_version', '1');",
            )
            .expect("v1 metadata");
        initialize_search_database(&connection).expect("initialize v2 tables");
        assert!(table_exists(&connection, "track_lyrics_sentiment").expect("track table"));
        assert!(table_exists(&connection, "lyrics_sentiment_blocks").expect("block table"));
        assert_eq!(
            read_meta(&connection, "schema_version").expect("schema metadata"),
            Some("1".to_owned())
        );
    }

    #[test]
    fn cached_analysis_is_reused_only_for_matching_lyrics_and_analysis_hashes() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_search_database(&connection).expect("initialize database");
        let summary = sentiment(Some(1.0), 1.0);
        let analysis = TrackLyricsAnalysis {
            track_id: "track-1".to_owned(),
            lyrics_hash: "lyrics-hash".to_owned(),
            sentiment: summary.clone(),
            blocks: vec![LyricsSentimentBlock {
                ordinal: 1,
                start_line: 1,
                end_line: 1,
                text: "喜び".to_owned(),
                sentiment: summary,
            }],
        };
        store_track_analysis(&connection, "analysis-hash", &analysis).expect("store analysis");

        let cached =
            load_cached_track_analysis(&connection, "track-1", "lyrics-hash", "analysis-hash")
                .expect("load analysis")
                .expect("matching cache");
        assert_eq!(cached, analysis);
        assert!(load_cached_track_analysis(
            &connection,
            "track-1",
            "changed-lyrics",
            "analysis-hash"
        )
        .expect("mismatched lyrics")
        .is_none());
        assert!(load_cached_track_analysis(
            &connection,
            "track-1",
            "lyrics-hash",
            "changed-analysis"
        )
        .expect("mismatched analysis")
        .is_none());
    }

    #[test]
    fn build_cache_reuse_refreshes_lyrics_hash_when_only_trailing_blank_lines_change() {
        let original_lyrics = "喜び\n";
        let current_lyrics = "喜び\n\n";
        let analysis_hash = crate::lyrics_sentiment::analysis_hash(original_lyrics);
        assert_eq!(
            analysis_hash,
            crate::lyrics_sentiment::analysis_hash(current_lyrics)
        );
        let original_lyrics_hash = crate::lyrics_sentiment::lyrics_hash(original_lyrics);
        let current_lyrics_hash = crate::lyrics_sentiment::lyrics_hash(current_lyrics);
        assert_ne!(original_lyrics_hash, current_lyrics_hash);

        let summary = sentiment(Some(1.0), 1.0);
        let cached = (
            analysis_hash.clone(),
            TrackLyricsAnalysis {
                track_id: "track-1".to_owned(),
                lyrics_hash: original_lyrics_hash,
                sentiment: summary.clone(),
                blocks: vec![LyricsSentimentBlock {
                    ordinal: 1,
                    start_line: 1,
                    end_line: 1,
                    text: "喜び".to_owned(),
                    sentiment: summary,
                }],
            },
        );

        let reused = reusable_cached_analysis(Some(&cached), &analysis_hash, &current_lyrics_hash)
            .expect("analysis should remain reusable");
        assert_eq!(reused.lyrics_hash, current_lyrics_hash);
        assert_eq!(reused.blocks, cached.1.blocks);
    }

    #[test]
    #[ignore = "downloads the multilingual embedding model; run when changing semantic search"]
    fn live_model_embeds_japanese_query_and_passage() {
        let cache_dir = std::env::var_os("MUSICAL_SEMANTIC_MODEL_TEST_CACHE")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("target")
                    .join("semantic-model-test-cache")
            });
        let mut model = initialize_pinned_embedding_model(&cache_dir)
            .expect("pinned multilingual embedding model should initialize");
        let embeddings = model
            .embed(
                vec![
                    embedding_query_input("雨の夜に静かに聴きたい曲"),
                    format!("{EMBEDDING_PASSAGE_PREFIX}窓を打つ雨を見ながら一人で夜を過ごす"),
                ],
                Some(2),
            )
            .expect("Japanese query and passage should embed");
        assert_eq!(embeddings.len(), 2);
        assert!(!embeddings[0].is_empty());
        assert_eq!(embeddings[0].len(), embeddings[1].len());
    }
}
