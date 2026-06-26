use crate::{
    app_config::{
        AUDIO_ANALYSER_MAX_DECIBELS, AUDIO_ANALYSER_MIN_DECIBELS,
        AUDIO_ANALYSER_SMOOTHING_TIME_CONSTANT, AUDIO_ANALYSIS_BUCKETS,
        AUDIO_ANALYSIS_CACHE_TTL_SECONDS, AUDIO_ANALYSIS_CACHE_VERSION, AUDIO_ANALYSIS_FFT_SIZE,
        AUDIO_ANALYSIS_FRAME_INTERVAL_MS,
    },
    app_settings,
};
use log::debug;
use rusqlite::{params, Connection, Error as SqliteError, ErrorCode, OpenFlags, OptionalExtension};
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{self, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use symphonia::core::{
    audio::{AudioBufferRef, Signal},
    codecs::DecoderOptions,
    conv::IntoSample,
    errors::Error,
    formats::FormatOptions,
    io::{MediaSource, MediaSourceStream},
    meta::MetadataOptions,
    probe::Hint,
};
use tauri::AppHandle;

const MUSICAL_DIR_NAME: &str = ".musical";
const AUDIO_ANALYSIS_DATABASE_NAME: &str = "audio_analysis.sqlite3";
static AUDIO_ANALYSIS_CACHE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioAnalysisFrame {
    pub timecode: f64,
    pub track_id: String,
    pub values: Vec<u8>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrackAnalysis {
    pub frame_interval_ms: f64,
    pub frames: Vec<AudioAnalysisFrame>,
}

pub struct TrackAnalysisLoad {
    pub analysis: TrackAnalysis,
    pub is_complete: bool,
}

pub struct TrackAnalysisBytes {
    pub bucket_count: usize,
    pub frame_count: usize,
    pub frame_interval_ms: f64,
    pub is_complete: bool,
    pub start_time_ms: f64,
    pub track_id: String,
    pub values: Vec<u8>,
}

impl TrackAnalysisBytes {
    pub fn from_frames(
        track_id: &str,
        frame_interval_ms: f64,
        is_complete: bool,
        frames: &[AudioAnalysisFrame],
    ) -> Self {
        let bucket_count = frames
            .first()
            .map(|frame| frame.values.len())
            .unwrap_or(AUDIO_ANALYSIS_BUCKETS);
        let mut values = Vec::with_capacity(frames.len() * bucket_count);
        for frame in frames {
            let copied_count = bucket_count.min(frame.values.len());
            values.extend_from_slice(&frame.values[..copied_count]);
            if copied_count < bucket_count {
                values.resize(values.len() + bucket_count - copied_count, 0);
            }
        }

        Self {
            bucket_count,
            frame_count: frames.len(),
            frame_interval_ms,
            is_complete,
            start_time_ms: frames
                .first()
                .map(|frame| frame.timecode * 1000.0)
                .unwrap_or(0.0),
            track_id: track_id.to_owned(),
            values,
        }
    }
}

pub fn get_or_analyze_track_segment(
    app: &AppHandle,
    track_id: &str,
    file_path: &str,
    from: f64,
    duration: f64,
) -> Result<TrackAnalysisLoad, String> {
    let cache_key = TrackAnalysisCacheKey::from_file(track_id, file_path)?;
    let cached_analysis = {
        let _cache_guard = audio_analysis_cache_lock()
            .lock()
            .map_err(|error| error.to_string())?;
        match open_existing_cache_database(app)? {
            Some(connection) => {
                load_cached_track_analysis(&connection, &cache_key, from + duration)?
            }
            None => None,
        }
    };
    if let Some(analysis) = cached_analysis {
        return Ok(TrackAnalysisLoad {
            analysis,
            is_complete: true,
        });
    }

    let segment_start = minute_segment_start(from);
    let segment_duration = duration.max(AUDIO_ANALYSIS_FRAME_INTERVAL_MS / 1000.0);
    Ok(TrackAnalysisLoad {
        analysis: analyze_track_file_segment(track_id, file_path, segment_start, segment_duration)?,
        is_complete: false,
    })
}

pub fn get_cached_track_analysis(
    app: &AppHandle,
    track_id: &str,
    file_path: &str,
    min_duration_seconds: f64,
) -> Result<Option<TrackAnalysis>, String> {
    let cache_key = TrackAnalysisCacheKey::from_file(track_id, file_path)?;
    let _cache_guard = audio_analysis_cache_lock()
        .lock()
        .map_err(|error| error.to_string())?;
    let result = match open_existing_cache_database(app)? {
        Some(connection) => {
            load_cached_track_analysis(&connection, &cache_key, min_duration_seconds)
        }
        None => Ok(None),
    }?;
    match &result {
        Some(analysis) => debug!(
            "audio analysis cache hit track_id={} frames={} min_duration={:.2}s",
            track_id,
            analysis.frames.len(),
            min_duration_seconds,
        ),
        None => debug!(
            "audio analysis cache miss track_id={} min_duration={:.2}s",
            track_id, min_duration_seconds,
        ),
    }
    Ok(result)
}

pub fn analyze_track_file_segment(
    track_id: &str,
    file_path: &str,
    from: f64,
    duration: f64,
) -> Result<TrackAnalysis, String> {
    let decoded = decode_mono_samples_until(file_path, from + duration)?;
    let frames = analyze_samples_range(
        track_id,
        decoded.sample_rate,
        &decoded.samples,
        from,
        duration,
    );

    Ok(TrackAnalysis {
        frame_interval_ms: AUDIO_ANALYSIS_FRAME_INTERVAL_MS,
        frames,
    })
}

pub fn save_track_analysis_cache(
    app: &AppHandle,
    track_id: &str,
    file_path: &str,
    analysis: &TrackAnalysis,
) -> Result<(), String> {
    let cache_key = TrackAnalysisCacheKey::from_file(track_id, file_path)
        .map_err(|error| format!("audio.analysis.cacheKey\t{file_path}\t{error}"))?;
    let _cache_guard = audio_analysis_cache_lock()
        .lock()
        .map_err(|error| error.to_string())?;
    let database_path = cache_database_path(app, true)?;
    let connection = open_cache_database_at(&database_path).map_err(|error| {
        format!(
            "audio.analysis.cacheOpen\t{}\t{error}",
            database_path.display()
        )
    })?;
    match save_cached_track_analysis(&connection, &cache_key, analysis) {
        Ok(()) => Ok(()),
        Err(error) if is_readonly_database_error(&error) => {
            drop(connection);
            recreate_cache_database(&database_path)?;
            let connection = open_cache_database_at(&database_path).map_err(|error| {
                format!(
                    "audio.analysis.cacheOpen\t{}\t{error}",
                    database_path.display()
                )
            })?;
            save_cached_track_analysis(&connection, &cache_key, analysis).map_err(to_error_string)
        }
        Err(error) => Err(format!(
            "audio.analysis.cacheWrite\t{}\t{}",
            database_path.display(),
            error
        )),
    }
}

struct TrackAnalysisCacheKey {
    analyzed_at: i64,
    file_modified_ms: i64,
    file_path: String,
    stream_hash: String,
    track_id: String,
}

fn open_existing_cache_database(app: &AppHandle) -> Result<Option<Connection>, String> {
    let database_path = cache_database_path(app, false)?;
    if !database_path.exists() || !cache_schema_is_current(&database_path)? {
        return Ok(None);
    }
    open_cache_read_connection(&database_path).map(Some)
}

fn open_cache_database_at(database_path: &Path) -> Result<Connection, String> {
    let should_initialize = if database_path.exists() {
        if cache_schema_is_current(database_path)? {
            false
        } else {
            fs::remove_file(database_path).map_err(to_error_string)?;
            true
        }
    } else {
        true
    };
    let connection = open_cache_connection(database_path)?;
    if !should_initialize {
        return Ok(connection);
    }
    match initialize_cache_database(&connection) {
        Ok(()) => Ok(connection),
        Err(error) if is_readonly_database_error(&error) => {
            drop(connection);
            recreate_cache_database(database_path)?;
            let connection = open_cache_connection(database_path)?;
            initialize_cache_database(&connection).map_err(to_error_string)?;
            Ok(connection)
        }
        Err(error) => Err(to_error_string(error)),
    }
}

fn audio_analysis_cache_lock() -> &'static Mutex<()> {
    AUDIO_ANALYSIS_CACHE_LOCK.get_or_init(|| Mutex::new(()))
}

fn open_cache_connection(database_path: &Path) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_PRIVATE_CACHE,
    )
    .map_err(to_error_string)?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(to_error_string)?;
    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            ",
        )
        .map_err(to_error_string)?;
    Ok(connection)
}

fn open_cache_read_connection(database_path: &Path) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_PRIVATE_CACHE,
    )
    .map_err(to_error_string)?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(to_error_string)?;
    Ok(connection)
}

fn initialize_cache_database(connection: &Connection) -> Result<(), SqliteError> {
    connection.execute_batch(
        "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS schema_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS track_analysis_cache (
                track_uuid TEXT NOT NULL,
                stream_hash TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_modified_ms INTEGER NOT NULL,
                analyzed_at INTEGER NOT NULL,
                analysis_version INTEGER NOT NULL DEFAULT 1,
                frame_interval_ms REAL NOT NULL,
                start_time_ms REAL NOT NULL DEFAULT 0,
                analyzed_duration_ms REAL NOT NULL DEFAULT 0,
                bucket_count INTEGER NOT NULL,
                frame_count INTEGER NOT NULL,
                frames_blob BLOB NOT NULL,
                PRIMARY KEY (track_uuid, stream_hash)
            );
            ",
    )?;
    connection.execute(
        "INSERT INTO schema_meta (key, value) VALUES ('analysis_version', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [AUDIO_ANALYSIS_CACHE_VERSION.to_string()],
    )?;
    Ok(())
}

fn recreate_cache_database(database_path: &Path) -> Result<(), String> {
    for path in cache_database_cleanup_paths(database_path) {
        if path.exists() {
            fs::remove_file(&path).map_err(to_error_string)?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn cache_database_cleanup_paths(database_path: &Path) -> Vec<PathBuf> {
    let database_path_text = database_path.to_string_lossy();
    vec![
        database_path.to_path_buf(),
        PathBuf::from(format!("{database_path_text}-wal")),
        PathBuf::from(format!("{database_path_text}-shm")),
    ]
}

#[cfg(not(windows))]
fn cache_database_cleanup_paths(database_path: &Path) -> Vec<PathBuf> {
    vec![database_path.to_path_buf()]
}

fn is_readonly_database_error(error: &SqliteError) -> bool {
    matches!(
        error,
        SqliteError::SqliteFailure(sqlite_error, _)
            if sqlite_error.code == ErrorCode::ReadOnly
    )
}

fn cache_database_path(app: &AppHandle, create_parent: bool) -> Result<PathBuf, String> {
    let settings = app_settings::load(app)?;
    let Some(last_library_path) = settings.last_library_path else {
        return Err("library.error.noLibraryScanned".to_owned());
    };
    // Keep analysis cache beside the library so moving the library to another
    // machine preserves expensive analysis work with the audio files.
    let cache_dir = PathBuf::from(last_library_path).join(MUSICAL_DIR_NAME);
    if create_parent {
        fs::create_dir_all(&cache_dir).map_err(to_error_string)?;
    }
    Ok(cache_dir.join(AUDIO_ANALYSIS_DATABASE_NAME))
}

fn cache_schema_is_current(database_path: &Path) -> Result<bool, String> {
    let connection = open_cache_read_connection(database_path)?;
    let has_schema_meta = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(to_error_string)?
        > 0;
    if !has_schema_meta {
        return Ok(false);
    }
    let version = connection
        .query_row(
            "SELECT value FROM schema_meta WHERE key = 'analysis_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_error_string)?;
    Ok(version.as_deref() == Some(AUDIO_ANALYSIS_CACHE_VERSION.to_string().as_str()))
}

fn load_cached_track_analysis(
    connection: &Connection,
    cache_key: &TrackAnalysisCacheKey,
    min_duration_seconds: f64,
) -> Result<Option<TrackAnalysis>, String> {
    connection
        .query_row(
            "SELECT frame_interval_ms, start_time_ms, bucket_count, frame_count, frames_blob
             FROM track_analysis_cache
             WHERE track_uuid = ?1
               AND stream_hash = ?2
               AND file_path = ?3
               AND file_modified_ms = ?4
               AND (?5 <= 0 OR analyzed_at >= ?6)
               AND analysis_version = ?7
               AND (?8 <= 0 OR analyzed_duration_ms >= ?8)",
            params![
                cache_key.track_id,
                cache_key.stream_hash,
                cache_key.file_path,
                cache_key.file_modified_ms,
                AUDIO_ANALYSIS_CACHE_TTL_SECONDS,
                cache_key.analyzed_at - AUDIO_ANALYSIS_CACHE_TTL_SECONDS,
                AUDIO_ANALYSIS_CACHE_VERSION,
                minimum_cached_duration_ms(min_duration_seconds),
            ],
            |row| {
                let frame_interval_ms = row.get::<_, f64>(0)?;
                let start_time_ms = row.get::<_, f64>(1)?;
                let bucket_count = row.get::<_, i64>(2)?;
                let frame_count = row.get::<_, i64>(3)?;
                let frames_blob = row.get::<_, Vec<u8>>(4)?;
                Ok((
                    frame_interval_ms,
                    start_time_ms,
                    bucket_count,
                    frame_count,
                    frames_blob,
                ))
            },
        )
        .optional()
        .map_err(to_error_string)?
        .map(
            |(frame_interval_ms, start_time_ms, bucket_count, frame_count, frames_blob)| {
                let frames = frames_from_blob(
                    &cache_key.track_id,
                    frame_interval_ms,
                    start_time_ms,
                    bucket_count,
                    frame_count,
                    &frames_blob,
                )?;
                Ok(TrackAnalysis {
                    frame_interval_ms,
                    frames,
                })
            },
        )
        .transpose()
}

fn save_cached_track_analysis(
    connection: &Connection,
    cache_key: &TrackAnalysisCacheKey,
    analysis: &TrackAnalysis,
) -> Result<(), SqliteError> {
    let start_time_ms = analysis
        .frames
        .first()
        .map(|frame| frame.timecode * 1000.0)
        .unwrap_or(0.0);
    let bucket_count = analysis
        .frames
        .first()
        .map(|frame| frame.values.len())
        .unwrap_or(AUDIO_ANALYSIS_BUCKETS);
    let frames_blob = frames_to_blob(&analysis.frames, bucket_count);
    let analyzed_duration_ms = analysis
        .frames
        .last()
        .map(|frame| frame.timecode * 1000.0 + analysis.frame_interval_ms)
        .unwrap_or(0.0);
    connection.execute(
        "INSERT INTO track_analysis_cache (
                track_uuid,
                stream_hash,
                file_path,
                file_modified_ms,
                analyzed_at,
                analysis_version,
                frame_interval_ms,
                start_time_ms,
                analyzed_duration_ms,
                bucket_count,
                frame_count,
                frames_blob
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(track_uuid, stream_hash) DO UPDATE SET
                file_path = excluded.file_path,
                file_modified_ms = excluded.file_modified_ms,
                analyzed_at = excluded.analyzed_at,
                analysis_version = excluded.analysis_version,
                frame_interval_ms = excluded.frame_interval_ms,
                start_time_ms = excluded.start_time_ms,
                analyzed_duration_ms = excluded.analyzed_duration_ms,
                bucket_count = excluded.bucket_count,
                frame_count = excluded.frame_count,
                frames_blob = excluded.frames_blob",
        params![
            cache_key.track_id,
            cache_key.stream_hash,
            cache_key.file_path,
            cache_key.file_modified_ms,
            cache_key.analyzed_at,
            AUDIO_ANALYSIS_CACHE_VERSION,
            analysis.frame_interval_ms,
            start_time_ms,
            analyzed_duration_ms,
            bucket_count as i64,
            analysis.frames.len() as i64,
            frames_blob,
        ],
    )?;
    debug!(
        "audio analysis cache saved track_id={} frames={} analyzed_duration_ms={:.0}",
        cache_key.track_id,
        analysis.frames.len(),
        analyzed_duration_ms,
    );
    Ok(())
}

fn frames_to_blob(frames: &[AudioAnalysisFrame], bucket_count: usize) -> Vec<u8> {
    let mut blob = Vec::with_capacity(frames.len() * bucket_count);
    for frame in frames {
        let copied_count = bucket_count.min(frame.values.len());
        blob.extend_from_slice(&frame.values[..copied_count]);
        if copied_count < bucket_count {
            blob.resize(blob.len() + bucket_count - copied_count, 0);
        }
    }
    blob
}

fn minimum_cached_duration_ms(min_duration_seconds: f64) -> f64 {
    (min_duration_seconds.max(0.0) * 1000.0 - AUDIO_ANALYSIS_FRAME_INTERVAL_MS * 4.0).max(0.0)
}

fn frames_from_blob(
    track_id: &str,
    frame_interval_ms: f64,
    start_time_ms: f64,
    bucket_count: i64,
    frame_count: i64,
    blob: &[u8],
) -> Result<Vec<AudioAnalysisFrame>, String> {
    let bucket_count = usize::try_from(bucket_count)
        .map_err(|_| "audio.analysis.invalidBucketCount".to_owned())?;
    let frame_count =
        usize::try_from(frame_count).map_err(|_| "audio.analysis.invalidFrameCount".to_owned())?;
    let expected_len = bucket_count
        .checked_mul(frame_count)
        .ok_or_else(|| "audio.analysis.invalidFrameBlob".to_owned())?;
    if bucket_count == 0 || blob.len() != expected_len {
        return Err("audio.analysis.invalidFrameBlob".to_owned());
    }

    Ok(blob
        .chunks_exact(bucket_count)
        .enumerate()
        .map(|(index, values)| AudioAnalysisFrame {
            timecode: (start_time_ms + index as f64 * frame_interval_ms) / 1000.0,
            track_id: track_id.to_owned(),
            values: values.to_vec(),
        })
        .collect())
}

fn minute_segment_start(from: f64) -> f64 {
    (from.max(0.0) / 60.0).floor() * 60.0
}

struct OffsetMediaSource {
    file: File,
    len: Option<u64>,
    position: u64,
    start: u64,
}

impl OffsetMediaSource {
    fn new(mut file: File, start: u64) -> Result<Self, String> {
        let len = file
            .metadata()
            .ok()
            .and_then(|metadata| metadata.len().checked_sub(start));
        file.seek(SeekFrom::Start(start)).map_err(to_error_string)?;
        Ok(Self {
            file,
            len,
            position: 0,
            start,
        })
    }
}

impl Read for OffsetMediaSource {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let read_count = self.file.read(buffer)?;
        self.position += read_count as u64;
        Ok(read_count)
    }
}

impl Seek for OffsetMediaSource {
    fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
        let next_position = match position {
            SeekFrom::Start(offset) => offset as i128,
            SeekFrom::Current(offset) => self.position as i128 + offset as i128,
            SeekFrom::End(offset) => {
                let len = self.len.ok_or_else(|| {
                    io::Error::new(io::ErrorKind::Unsupported, "unknown stream length")
                })?;
                len as i128 + offset as i128
            }
        };
        if next_position < 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid negative seek",
            ));
        }

        let next_position = next_position as u64;
        self.file
            .seek(SeekFrom::Start(self.start + next_position))?;
        self.position = next_position;
        Ok(self.position)
    }
}

impl MediaSource for OffsetMediaSource {
    fn is_seekable(&self) -> bool {
        true
    }

    fn byte_len(&self) -> Option<u64> {
        self.len
    }
}

fn open_audio_file_for_probe(path: &Path, file_path: &str) -> Result<Box<dyn MediaSource>, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("audio.analysis.fileOpen\t{file_path}\t{error}"))?;
    if let Some(offset) = detect_rmp3_data_offset(&mut file)? {
        return Ok(Box::new(OffsetMediaSource::new(file, offset)?));
    }
    Ok(Box::new(file))
}

fn make_audio_probe_hint<'a>(path: &'a Path, file_path: &str) -> Result<Hint, String> {
    let mut hint = Hint::new();
    if detect_rmp3_data_offset(
        &mut File::open(path)
            .map_err(|error| format!("audio.analysis.fileOpen\t{file_path}\t{error}"))?,
    )?
    .is_some()
    {
        hint.with_extension("mp3");
        return Ok(hint);
    }

    if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    Ok(hint)
}

fn detect_rmp3_data_offset(file: &mut File) -> Result<Option<u64>, String> {
    file.seek(SeekFrom::Start(0)).map_err(to_error_string)?;
    let mut bytes = Vec::new();
    file.take(64 * 1024)
        .read_to_end(&mut bytes)
        .map_err(to_error_string)?;
    file.seek(SeekFrom::Start(0)).map_err(to_error_string)?;

    let riff_index = bytes
        .windows(4)
        .position(|window| window == b"RIFF")
        .filter(|index| bytes.get(index + 8..index + 12) == Some(&b"RMP3"[..]));
    let Some(riff_index) = riff_index else {
        return Ok(None);
    };

    let mut chunk_index = riff_index + 12;
    while chunk_index + 8 <= bytes.len() {
        let chunk_id = &bytes[chunk_index..chunk_index + 4];
        let chunk_size = u32::from_le_bytes([
            bytes[chunk_index + 4],
            bytes[chunk_index + 5],
            bytes[chunk_index + 6],
            bytes[chunk_index + 7],
        ]) as usize;
        let data_offset = chunk_index + 8;
        if chunk_id == b"data" {
            return Ok(Some(data_offset as u64));
        }
        chunk_index = data_offset + chunk_size + (chunk_size % 2);
    }

    Ok(None)
}

impl TrackAnalysisCacheKey {
    fn from_file(track_id: &str, file_path: &str) -> Result<Self, String> {
        let metadata = fs::metadata(file_path)
            .map_err(|error| format!("audio.analysis.metadata\t{file_path}\t{error}"))?;
        let file_modified_ms = file_modified_millis_from_metadata(file_path, &metadata)?;
        Ok(Self {
            analyzed_at: unix_timestamp_seconds()?,
            file_modified_ms,
            file_path: file_path.to_owned(),
            stream_hash: format!("{file_modified_ms}:{}", metadata.len()),
            track_id: track_id.to_owned(),
        })
    }
}

fn file_modified_millis_from_metadata(
    file_path: &str,
    metadata: &fs::Metadata,
) -> Result<i64, String> {
    let modified = metadata
        .modified()
        .map_err(|error| format!("audio.analysis.metadata\t{file_path}\t{error}"))?;
    Ok(system_time_millis(modified)?)
}

fn unix_timestamp_seconds() -> Result<i64, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(to_error_string)?
        .as_secs() as i64)
}

fn system_time_millis(time: SystemTime) -> Result<i64, String> {
    Ok(time
        .duration_since(UNIX_EPOCH)
        .map_err(to_error_string)?
        .as_millis() as i64)
}

fn to_error_string<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

struct DecodedSamples {
    sample_rate: u32,
    samples: Vec<f32>,
}

fn decode_mono_samples_until(
    file_path: &str,
    decode_until_seconds: f64,
) -> Result<DecodedSamples, String> {
    let path = Path::new(file_path);
    let file = open_audio_file_for_probe(path, file_path)?;
    let media_stream = MediaSourceStream::new(file, Default::default());
    let hint = make_audio_probe_hint(path, file_path)?;

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            media_stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| format!("audio.analysis.unsupported\t{file_path}\t{error}"))?;
    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| format!("audio.analysis.noDefaultTrack\t{file_path}"))?;
    let track_id = track.id;
    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| format!("audio.analysis.noSampleRate\t{file_path}"))?;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|error| format!("audio.analysis.decoder\t{file_path}\t{error}"))?;
    let mut samples = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(Error::IoError(error)) if error.kind() == std::io::ErrorKind::UnexpectedEof => {
                break
            }
            Err(Error::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(error) => return Err(format!("audio.analysis.packet\t{file_path}\t{error}")),
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(Error::DecodeError(_)) => continue,
            Err(Error::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(error) => return Err(format!("audio.analysis.decode\t{file_path}\t{error}")),
        };

        append_mono_samples(decoded, &mut samples);
        if (samples.len() as f64) / (sample_rate as f64) >= decode_until_seconds {
            break;
        }
    }

    Ok(DecodedSamples {
        sample_rate,
        samples,
    })
}

fn append_mono_samples(buffer: AudioBufferRef<'_>, target: &mut Vec<f32>) {
    match buffer {
        AudioBufferRef::F32(buffer) => append_convert_planar(&buffer, target),
        AudioBufferRef::U8(buffer) => append_convert_planar(buffer.as_ref(), target),
        AudioBufferRef::U16(buffer) => append_convert_planar(buffer.as_ref(), target),
        AudioBufferRef::U24(buffer) => append_convert_planar(buffer.as_ref(), target),
        AudioBufferRef::U32(buffer) => append_convert_planar(buffer.as_ref(), target),
        AudioBufferRef::S8(buffer) => append_convert_planar(buffer.as_ref(), target),
        AudioBufferRef::S16(buffer) => append_convert_planar(buffer.as_ref(), target),
        AudioBufferRef::S24(buffer) => append_convert_planar(buffer.as_ref(), target),
        AudioBufferRef::S32(buffer) => append_convert_planar(buffer.as_ref(), target),
        AudioBufferRef::F64(buffer) => append_convert_planar(buffer.as_ref(), target),
    }
}

fn append_convert_planar<S>(buffer: &symphonia::core::audio::AudioBuffer<S>, target: &mut Vec<f32>)
where
    S: symphonia::core::sample::Sample + IntoSample<f32>,
{
    let channel = buffer.chan(0);
    target.extend(channel.iter().map(|sample| (*sample).into_sample()));
}

fn analyze_samples_range(
    track_id: &str,
    sample_rate: u32,
    samples: &[f32],
    from: f64,
    duration: f64,
) -> Vec<AudioAnalysisFrame> {
    if samples.is_empty() || sample_rate == 0 {
        return Vec::new();
    }

    let hop_samples = ((sample_rate as f64 * AUDIO_ANALYSIS_FRAME_INTERVAL_MS) / 1000.0)
        .round()
        .max(1.0) as usize;
    let from_sample = (from.max(0.0) * sample_rate as f64).floor() as usize;
    let to_sample = ((from.max(0.0) + duration.max(0.0)) * sample_rate as f64).ceil() as usize;
    let first_frame_index = from_sample / hop_samples;
    let frame_count = to_sample.min(samples.len()).div_ceil(hop_samples);
    let mut planner = FftPlanner::new();
    let fft: Arc<dyn rustfft::Fft<f32>> = planner.plan_fft_forward(AUDIO_ANALYSIS_FFT_SIZE);
    let window = make_hann_window(AUDIO_ANALYSIS_FFT_SIZE);
    let mut fft_buffer = vec![Complex::new(0.0, 0.0); AUDIO_ANALYSIS_FFT_SIZE];
    let mut frames = Vec::with_capacity(frame_count);
    let mut previous_decibels = vec![AUDIO_ANALYSER_MIN_DECIBELS; AUDIO_ANALYSIS_BUCKETS];

    for frame_index in first_frame_index..frame_count {
        let start = frame_index * hop_samples;

        for index in 0..AUDIO_ANALYSIS_FFT_SIZE {
            let sample = samples.get(start + index).copied().unwrap_or(0.0);
            fft_buffer[index] = Complex::new(sample * window[index], 0.0);
        }

        fft.process(&mut fft_buffer);
        frames.push(AudioAnalysisFrame {
            timecode: (start as f64) / (sample_rate as f64),
            track_id: track_id.to_owned(),
            values: make_analyser_buckets(&fft_buffer, &mut previous_decibels),
        });
    }

    frames
}

fn make_hann_window(size: usize) -> Vec<f32> {
    (0..size)
        .map(|index| {
            let phase = (index as f32) / ((size - 1) as f32);
            0.5 - 0.5 * (std::f32::consts::TAU * phase).cos()
        })
        .collect()
}

fn make_analyser_buckets(fft_buffer: &[Complex<f32>], previous_decibels: &mut [f32]) -> Vec<u8> {
    let usable_bins = AUDIO_ANALYSIS_FFT_SIZE / 2;
    let bins_per_bucket = (usable_bins as f32) / (AUDIO_ANALYSIS_BUCKETS as f32);
    let mut values = Vec::with_capacity(AUDIO_ANALYSIS_BUCKETS);

    for bucket in 0..AUDIO_ANALYSIS_BUCKETS {
        let start = ((bucket as f32) * bins_per_bucket).floor() as usize;
        let end = (((bucket + 1) as f32) * bins_per_bucket).ceil() as usize;
        let mut total = 0.0;
        let mut count = 0usize;

        for bin in start.max(1)..end.min(usable_bins) {
            total += fft_buffer[bin].norm();
            count += 1;
        }

        let average = total / count.max(1) as f32;
        let normalized_magnitude = average / (AUDIO_ANALYSIS_FFT_SIZE as f32 / 2.0);
        let decibels = 20.0 * normalized_magnitude.max(0.000_001).log10();
        let smoothed_decibels = previous_decibels[bucket] * AUDIO_ANALYSER_SMOOTHING_TIME_CONSTANT
            + decibels * (1.0 - AUDIO_ANALYSER_SMOOTHING_TIME_CONSTANT);
        previous_decibels[bucket] = smoothed_decibels;

        let byte_value = ((smoothed_decibels - AUDIO_ANALYSER_MIN_DECIBELS)
            / (AUDIO_ANALYSER_MAX_DECIBELS - AUDIO_ANALYSER_MIN_DECIBELS))
            .clamp(0.0, 1.0)
            * 255.0;
        values.push(byte_value.round() as u8);
    }

    values
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn detects_rmp3_data_offset_after_id3_padding() {
        let file_path = std::env::temp_dir().join("musical-rmp3-offset-test.mp3");
        let mut bytes = vec![0; 24];
        bytes.extend_from_slice(b"ID3\x03\0\0\0\0\0\x0e");
        bytes.extend_from_slice(&[0; 14]);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(b"RMP3");
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&4u32.to_le_bytes());
        bytes.extend_from_slice(&[0xff, 0xfb, 0x90, 0x64]);

        {
            let mut file = File::create(&file_path).expect("create test file");
            file.write_all(&bytes).expect("write test file");
        }

        let mut file = File::open(&file_path).expect("open test file");
        let offset = detect_rmp3_data_offset(&mut file).expect("detect offset");
        fs::remove_file(&file_path).ok();

        assert_eq!(offset, Some((24 + 10 + 14 + 12 + 8) as u64));
    }

    #[test]
    fn round_trips_analysis_frames_through_blob_storage() {
        let frames = vec![
            AudioAnalysisFrame {
                timecode: 1.5,
                track_id: "track-a".to_owned(),
                values: vec![1, 2, 3],
            },
            AudioAnalysisFrame {
                timecode: 1.533,
                track_id: "track-a".to_owned(),
                values: vec![4, 5, 6],
            },
        ];
        let blob = frames_to_blob(&frames, 3);
        let restored = frames_from_blob("track-a", 33.0, 1500.0, 3, 2, &blob).expect("restore");

        assert_eq!(blob, vec![1, 2, 3, 4, 5, 6]);
        assert_eq!(restored.len(), 2);
        assert_eq!(restored[0].timecode, 1.5);
        assert_eq!(restored[1].timecode, 1.533);
        assert_eq!(restored[1].values, vec![4, 5, 6]);
    }
}
