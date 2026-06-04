use rusqlite::{params, Connection, OptionalExtension};
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use symphonia::core::{
    audio::{AudioBufferRef, Signal},
    codecs::DecoderOptions,
    conv::IntoSample,
    errors::Error,
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
};
use tauri::{AppHandle, Manager};

const ANALYSIS_BUCKETS: usize = 256;
const ANALYSIS_CACHE_DATABASE_NAME: &str = "audio-analysis-cache.sqlite";
const ANALYSIS_CACHE_TTL_SECONDS: i64 = 24 * 60 * 60;
const ANALYSIS_CACHE_VERSION: i64 = 2;
const ANALYSIS_FRAME_INTERVAL_MS: f64 = 33.0;
const ANALYSER_MAX_DECIBELS: f32 = -18.0;
const ANALYSER_MIN_DECIBELS: f32 = -88.0;
const ANALYSER_SMOOTHING_TIME_CONSTANT: f32 = 0.58;
const FFT_SIZE: usize = 512;

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioAnalysisFrame {
    pub timecode: f64,
    pub track_id: i64,
    pub values: Vec<u8>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrackAnalysis {
    pub frame_interval_ms: f64,
    pub frames: Vec<AudioAnalysisFrame>,
}

pub fn get_or_analyze_track_file(
    app: &AppHandle,
    track_id: i64,
    file_path: &str,
) -> Result<TrackAnalysis, String> {
    let cache_key = TrackAnalysisCacheKey::from_file(track_id, file_path)?;
    let connection = open_cache_database(app)?;
    if let Some(analysis) = load_cached_track_analysis(&connection, &cache_key)? {
        return Ok(analysis);
    }

    let analysis = analyze_track_file(track_id, file_path)?;
    save_cached_track_analysis(&connection, &cache_key, &analysis)?;
    Ok(analysis)
}

pub fn analyze_track_file(track_id: i64, file_path: &str) -> Result<TrackAnalysis, String> {
    let decoded = decode_mono_samples(file_path)?;
    let frames = analyze_samples(track_id, decoded.sample_rate, &decoded.samples);

    Ok(TrackAnalysis {
        frame_interval_ms: ANALYSIS_FRAME_INTERVAL_MS,
        frames,
    })
}

struct TrackAnalysisCacheKey {
    analyzed_at: i64,
    file_modified_ms: i64,
    file_path: String,
    track_id: i64,
}

fn open_cache_database(app: &AppHandle) -> Result<Connection, String> {
    let database_path = cache_database_path(app)?;
    let connection = Connection::open(database_path).map_err(to_error_string)?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS track_analysis_cache (
                track_id INTEGER PRIMARY KEY,
                file_path TEXT NOT NULL,
                file_modified_ms INTEGER NOT NULL,
                analyzed_at INTEGER NOT NULL,
                analysis_version INTEGER NOT NULL DEFAULT 1,
                frame_interval_ms REAL NOT NULL,
                frames_json TEXT NOT NULL
            );
            ",
        )
        .map_err(to_error_string)?;
    ensure_cache_column(
        &connection,
        "analysis_version",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    Ok(connection)
}

fn cache_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(to_error_string)?;
    fs::create_dir_all(&app_data_dir).map_err(to_error_string)?;
    Ok(app_data_dir.join(ANALYSIS_CACHE_DATABASE_NAME))
}

fn load_cached_track_analysis(
    connection: &Connection,
    cache_key: &TrackAnalysisCacheKey,
) -> Result<Option<TrackAnalysis>, String> {
    connection
        .query_row(
            "SELECT frame_interval_ms, frames_json
             FROM track_analysis_cache
             WHERE track_id = ?1
               AND file_path = ?2
               AND file_modified_ms = ?3
               AND analyzed_at >= ?4
               AND analysis_version = ?5",
            params![
                cache_key.track_id,
                cache_key.file_path,
                cache_key.file_modified_ms,
                cache_key.analyzed_at - ANALYSIS_CACHE_TTL_SECONDS,
                ANALYSIS_CACHE_VERSION,
            ],
            |row| {
                let frame_interval_ms = row.get::<_, f64>(0)?;
                let frames_json = row.get::<_, String>(1)?;
                Ok((frame_interval_ms, frames_json))
            },
        )
        .optional()
        .map_err(to_error_string)?
        .map(|(frame_interval_ms, frames_json)| {
            let frames = serde_json::from_str::<Vec<AudioAnalysisFrame>>(&frames_json)
                .map_err(to_error_string)?;
            Ok(TrackAnalysis {
                frame_interval_ms,
                frames,
            })
        })
        .transpose()
}

fn save_cached_track_analysis(
    connection: &Connection,
    cache_key: &TrackAnalysisCacheKey,
    analysis: &TrackAnalysis,
) -> Result<(), String> {
    let frames_json = serde_json::to_string(&analysis.frames).map_err(to_error_string)?;
    connection
        .execute(
            "INSERT INTO track_analysis_cache (
                track_id,
                file_path,
                file_modified_ms,
                analyzed_at,
                analysis_version,
                frame_interval_ms,
                frames_json
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(track_id) DO UPDATE SET
                file_path = excluded.file_path,
                file_modified_ms = excluded.file_modified_ms,
                analyzed_at = excluded.analyzed_at,
                analysis_version = excluded.analysis_version,
                frame_interval_ms = excluded.frame_interval_ms,
                frames_json = excluded.frames_json",
            params![
                cache_key.track_id,
                cache_key.file_path,
                cache_key.file_modified_ms,
                cache_key.analyzed_at,
                ANALYSIS_CACHE_VERSION,
                analysis.frame_interval_ms,
                frames_json,
            ],
        )
        .map_err(to_error_string)?;
    Ok(())
}

fn ensure_cache_column(
    connection: &Connection,
    column_name: &str,
    column_definition: &str,
) -> Result<(), String> {
    let existing_columns = connection
        .prepare("PRAGMA table_info(track_analysis_cache)")
        .and_then(|mut statement| {
            let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
            rows.collect::<Result<Vec<_>, _>>()
        })
        .map_err(to_error_string)?;

    if existing_columns.iter().any(|column| column == column_name) {
        return Ok(());
    }

    connection
        .execute(
            &format!(
                "ALTER TABLE track_analysis_cache ADD COLUMN {column_name} {column_definition}"
            ),
            [],
        )
        .map_err(to_error_string)?;
    Ok(())
}

impl TrackAnalysisCacheKey {
    fn from_file(track_id: i64, file_path: &str) -> Result<Self, String> {
        Ok(Self {
            analyzed_at: unix_timestamp_seconds()?,
            file_modified_ms: file_modified_millis(file_path)?,
            file_path: file_path.to_owned(),
            track_id,
        })
    }
}

fn file_modified_millis(file_path: &str) -> Result<i64, String> {
    let modified = fs::metadata(file_path)
        .map_err(|error| format!("audio.analysis.metadata\t{file_path}\t{error}"))?
        .modified()
        .map_err(to_error_string)?;
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

fn decode_mono_samples(file_path: &str) -> Result<DecodedSamples, String> {
    let path = Path::new(file_path);
    let file = File::open(path)
        .map_err(|error| format!("audio.analysis.fileOpen\t{file_path}\t{error}"))?;
    let media_source = Box::new(file);
    let media_stream = MediaSourceStream::new(media_source, Default::default());
    let mut hint = Hint::new();

    if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }

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

fn analyze_samples(track_id: i64, sample_rate: u32, samples: &[f32]) -> Vec<AudioAnalysisFrame> {
    if samples.is_empty() || sample_rate == 0 {
        return Vec::new();
    }

    let hop_samples = ((sample_rate as f64 * ANALYSIS_FRAME_INTERVAL_MS) / 1000.0)
        .round()
        .max(1.0) as usize;
    let frame_count = samples.len().div_ceil(hop_samples);
    let mut planner = FftPlanner::new();
    let fft: Arc<dyn rustfft::Fft<f32>> = planner.plan_fft_forward(FFT_SIZE);
    let window = make_hann_window(FFT_SIZE);
    let mut fft_buffer = vec![Complex::new(0.0, 0.0); FFT_SIZE];
    let mut frames = Vec::with_capacity(frame_count);
    let mut previous_decibels = vec![ANALYSER_MIN_DECIBELS; ANALYSIS_BUCKETS];

    for frame_index in 0..frame_count {
        let start = frame_index * hop_samples;

        for index in 0..FFT_SIZE {
            let sample = samples.get(start + index).copied().unwrap_or(0.0);
            fft_buffer[index] = Complex::new(sample * window[index], 0.0);
        }

        fft.process(&mut fft_buffer);
        frames.push(AudioAnalysisFrame {
            timecode: (start as f64) / (sample_rate as f64),
            track_id,
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
    let usable_bins = FFT_SIZE / 2;
    let bins_per_bucket = (usable_bins as f32) / (ANALYSIS_BUCKETS as f32);
    let mut values = Vec::with_capacity(ANALYSIS_BUCKETS);

    for bucket in 0..ANALYSIS_BUCKETS {
        let start = ((bucket as f32) * bins_per_bucket).floor() as usize;
        let end = (((bucket + 1) as f32) * bins_per_bucket).ceil() as usize;
        let mut total = 0.0;
        let mut count = 0usize;

        for bin in start.max(1)..end.min(usable_bins) {
            total += fft_buffer[bin].norm();
            count += 1;
        }

        let average = total / count.max(1) as f32;
        let normalized_magnitude = average / (FFT_SIZE as f32 / 2.0);
        let decibels = 20.0 * normalized_magnitude.max(0.000_001).log10();
        let smoothed_decibels = previous_decibels[bucket] * ANALYSER_SMOOTHING_TIME_CONSTANT
            + decibels * (1.0 - ANALYSER_SMOOTHING_TIME_CONSTANT);
        previous_decibels[bucket] = smoothed_decibels;

        let byte_value = ((smoothed_decibels - ANALYSER_MIN_DECIBELS)
            / (ANALYSER_MAX_DECIBELS - ANALYSER_MIN_DECIBELS))
            .clamp(0.0, 1.0)
            * 255.0;
        values.push(byte_value.round() as u8);
    }

    values
}
