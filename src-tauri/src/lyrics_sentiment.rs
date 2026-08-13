use crate::atomic_file;
use lindera::{dictionary::load_dictionary, mode::Mode, segmenter::Segmenter};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
    fs,
    panic::{catch_unwind, AssertUnwindSafe},
    path::Path,
    sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};
use unicode_normalization::UnicodeNormalization;

const WAGO_URL: &str = "https://www.cl.ecei.tohoku.ac.jp/resources/sent_lex/wago.121808.pn";
const WAGO_FILE_NAME: &str = "wago.121808.pn";
const WAGO_SHA256: &str = "968b8f758e79531a70b26600e943f11e9fc2962c5c30174b2bc96a342c1bb8b4";
const NOUN_URL: &str = "https://www.cl.ecei.tohoku.ac.jp/resources/sent_lex/pn.csv.m3.120408.trim";
const NOUN_FILE_NAME: &str = "pn.csv.m3.120408.trim";
const NOUN_SHA256: &str = "94f545a49028c8a07929c0ac35afa56fbfce9e8a277ce70233c6340845439ae3";
const DICTIONARY_CACHE_DIRECTORY: &str = "lyrics-sentiment-dictionaries";
const SEGMENTATION_VERSION: &str = "stanza-nonoverlap-6-v1";
const ANALYZER_VERSION: &str = "ja-lyrics-sentiment-v1";
const SENTIMENT_PIPELINE_ID: &str = "lindera=5.1.0;lindera-dictionary=5.1.0;lindera-ipadic=5.1.0;ipadic-artifact=mecab-ipadic-2.7.0-20250920;ipadic-md5=a95c409f12f1023fce8ef91f991ef042;ipadic-sha256=a7ba9f645ffe7094e56ae1c4a81d100df8fbb1e28bbe1792622e9728e162db3d;nfkc=unicode-normalization-0.1.25";
const LEXICON_RETRY_COOLDOWN: Duration = Duration::from_secs(60);

pub const ANALYZER_ID: &str = concat!(
    "ja-lyrics-sentiment-v1/lindera-5.1.0/ipadic/",
    "968b8f758e79531a70b26600e943f11e9fc2962c5c30174b2bc96a342c1bb8b4/",
    "94f545a49028c8a07929c0ac35afa56fbfce9e8a277ce70233c6340845439ae3",
    "#pipeline:",
    "lindera=5.1.0;lindera-dictionary=5.1.0;lindera-ipadic=5.1.0;ipadic-artifact=mecab-ipadic-2.7.0-20250920;ipadic-md5=a95c409f12f1023fce8ef91f991ef042;ipadic-sha256=a7ba9f645ffe7094e56ae1c4a81d100df8fbb1e28bbe1792622e9728e162db3d;nfkc=unicode-normalization-0.1.25"
);

static ANALYZER_RUNTIME: OnceLock<AnalyzerRuntime> = OnceLock::new();

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SentimentLabel {
    Positive,
    Neutral,
    Negative,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsSentimentSummary {
    pub score: Option<f32>,
    pub label: SentimentLabel,
    pub coverage: f32,
    pub eligible_token_count: usize,
    pub matched_token_count: usize,
    pub scored_token_count: usize,
    pub positive_count: usize,
    pub negative_count: usize,
    pub analyzer_id: String,
    pub diagnostic: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsSentimentBlock {
    pub ordinal: usize,
    pub start_line: usize,
    pub end_line: usize,
    pub text: String,
    pub sentiment: LyricsSentimentSummary,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackLyricsAnalysis {
    pub track_id: String,
    pub lyrics_hash: String,
    pub sentiment: LyricsSentimentSummary,
    pub blocks: Vec<LyricsSentimentBlock>,
}

/// A policy activated only for an explicitly grief-oriented voice request.
///
/// This is deliberately kept out of the serialized search response.  The
/// ordinary semantic and recommendation paths must retain their historical
/// score ordering and response shape.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum GriefMoodStrength {
    Subtle,
    Balanced,
    Strong,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct GriefMoodPolicy {
    pub(crate) strength: GriefMoodStrength,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct GriefProfile {
    pub(crate) strong_loss_blocks: usize,
    pub(crate) separation_blocks: usize,
    pub(crate) aftermath_blocks: usize,
    pub(crate) sorrow_blocks: usize,
    pub(crate) resolution_blocks: usize,
    pub(crate) romantic_pursuit_blocks: usize,
    pub(crate) agency_blocks: usize,
    pub(crate) core_passed: bool,
    pub(crate) loss_score: f32,
    pub(crate) tail_resolution_ratio: f32,
    pub(crate) repeated_romance: f32,
    pub(crate) repeated_agency: f32,
    pub(crate) anti_penalty: f32,
    pub(crate) evidence_block_ratio: f32,
}

const GRIEF_PROMPT_EXPLICIT_TERMS: &[&str] = &[
    "悲哀",
    "哀歌",
    "挽歌",
    "追悼",
    "死別",
    "elegy",
    "lament",
    "grief",
    "bereavement",
];

const GRIEF_PROMPT_LOSS_TERMS: &[&str] = &[
    "喪失",
    "失う",
    "失った",
    "失くす",
    "亡く",
    "死別",
    "別れ",
    "さよなら",
    "帰らない",
    "還らない",
    "戻らない",
    "loss",
    "lost",
    "death",
    "dead",
    "farewell",
    "goodbye",
    "parting",
    "separation",
];

const GRIEF_PROMPT_SORROW_TERMS: &[&str] = &[
    "悲", "哀", "涙", "泣", "孤独", "寂", "痛", "苦", "切な", "絶望", "sorrow", "sad", "cry",
    "tear", "lonely", "alone", "pain",
];

const STRONG_LOSS_TERMS: &[&str] = &[
    "死別",
    "亡く",
    "失った",
    "帰らない",
    "戻らない",
    "最期",
    "bereaved",
    "death",
    "died",
    "gone",
    "lost",
    "final goodbye",
];

const SEPARATION_TERMS: &[&str] = &[
    "もう会えない",
    "二度と会えない",
    "さよなら",
    "別れ",
    "届かない",
    "見送る",
    "farewell",
    "goodbye",
    "parting",
    "separation",
    "never see again",
    "can't meet again",
];

const AFTERMATH_TERMS: &[&str] = &[
    "記憶",
    "思い出",
    "面影",
    "残された",
    "消えない",
    "写真",
    "memory",
    "memories",
    "remembrance",
    "trace",
    "photograph",
    "picture",
    "left behind",
];

const SORROW_TERMS: &[&str] = &[
    "悲し",
    "哀し",
    "泣",
    "涙",
    "孤独",
    "ひとり",
    "寂し",
    "痛み",
    "苦し",
    "切な",
    "嘆き",
    "sorrow",
    "sadness",
    "cry",
    "tears",
    "lonely",
    "alone",
    "pain",
    "suffering",
    "grief",
    "lament",
];

const RESOLUTION_TERMS: &[&str] = &[
    "ひとりぼっちじゃない",
    "願いは叶う",
    "笑って",
    "明日へ",
    "未来へ",
    "歩き出す",
    "立ち上がる",
    "乗り越える",
    "連れ出す",
    "smile",
    "hope",
    "tomorrow",
    "future",
    "walk on",
    "rise again",
    "overcome",
];

const ROMANTIC_PURSUIT_TERMS: &[&str] = &[
    "抱きしめ",
    "キス",
    "恋する",
    "愛してる",
    "会いたい",
    "求める",
    "embrace",
    "kiss",
    "fall in love",
    "love you",
    "miss you",
    "desire",
    "want you",
];

const AGENCY_TERMS: &[&str] = &[
    "戦う",
    "闘う",
    "守る",
    "走り出す",
    "駆け抜ける",
    "飛び立つ",
    "翔び立つ",
    "ぶっ壊す",
    "限界",
    "fight",
    "protect",
    "run away",
    "break through",
    "fly away",
];

/// Returns a grief policy only when the user's prompt explicitly asks for
/// grief/loss, or combines a loss concept with a sorrow concept.  A generic
/// mood request, including "darker than the current track", remains outside
/// this policy.
pub(crate) fn grief_mood_policy_for_prompt(
    prompt: &str,
    mood_strength: Option<&str>,
) -> Option<GriefMoodPolicy> {
    let normalized = normalize_analysis_text(prompt).to_lowercase();
    let explicit = contains_any(&normalized, GRIEF_PROMPT_EXPLICIT_TERMS);
    let loss = contains_any(&normalized, GRIEF_PROMPT_LOSS_TERMS);
    let sorrow = contains_any(&normalized, GRIEF_PROMPT_SORROW_TERMS);
    if !explicit && !(loss && sorrow) {
        return None;
    }
    let strength = match mood_strength.unwrap_or("balanced") {
        "subtle" => GriefMoodStrength::Subtle,
        "strong" => GriefMoodStrength::Strong,
        _ => GriefMoodStrength::Balanced,
    };
    Some(GriefMoodPolicy { strength })
}

/// Classifies saved lyrics into short, generic thematic families.  Repeated
/// chunks are removed before counting so overlapping or duplicated source
/// blocks cannot manufacture evidence.  Missing blocks, unavailable
/// sentiment, and analyzer mismatches intentionally return `None`; callers
/// then fail open to the existing S0 ranking.
pub(crate) fn grief_profile(analysis: &TrackLyricsAnalysis) -> Option<GriefProfile> {
    if analysis.blocks.is_empty()
        || analysis.sentiment.analyzer_id != ANALYZER_ID
        || is_retryable_unavailable(&analysis.sentiment)
    {
        return None;
    }
    if analysis.blocks.iter().any(|block| {
        block.sentiment.analyzer_id != ANALYZER_ID || is_retryable_unavailable(&block.sentiment)
    }) {
        return None;
    }

    let mut seen = HashSet::new();
    let mut families = Vec::new();
    for block in &analysis.blocks {
        let normalized = normalize_analysis_text(&block.text).to_lowercase();
        if normalized.trim().is_empty() || !seen.insert(normalized.clone()) {
            continue;
        }
        families.push(BlockFamilies {
            strong_loss: contains_any(&normalized, STRONG_LOSS_TERMS),
            separation: contains_any(&normalized, SEPARATION_TERMS),
            aftermath: contains_any(&normalized, AFTERMATH_TERMS),
            sorrow: contains_any(&normalized, SORROW_TERMS),
            resolution: contains_any(&normalized, RESOLUTION_TERMS),
            romantic_pursuit: contains_any(&normalized, ROMANTIC_PURSUIT_TERMS),
            agency: contains_any(&normalized, AGENCY_TERMS),
        });
    }
    if families.is_empty() {
        return None;
    }

    let strong_loss_blocks = families.iter().filter(|f| f.strong_loss).count();
    let separation_blocks = families.iter().filter(|f| f.separation).count();
    let aftermath_blocks = families.iter().filter(|f| f.aftermath).count();
    let sorrow_blocks = families.iter().filter(|f| f.sorrow).count();
    let resolution_blocks = families.iter().filter(|f| f.resolution).count();
    let romantic_pursuit_blocks = families.iter().filter(|f| f.romantic_pursuit).count();
    let agency_blocks = families.iter().filter(|f| f.agency).count();

    let evidence_blocks = families
        .iter()
        .filter(|f| f.strong_loss || f.separation || f.aftermath || f.sorrow)
        .count();
    let evidence_block_ratio = evidence_blocks as f32 / families.len() as f32;
    let evidence_families = [
        strong_loss_blocks > 0,
        separation_blocks > 0,
        aftermath_blocks > 0,
        sorrow_blocks > 0,
    ]
    .into_iter()
    .filter(|present| *present)
    .count();
    let core_passed = evidence_blocks >= 2 && evidence_families >= 2;

    let tail_count = ((families.len() + 3) / 4).max(2).min(families.len());
    let tail_start = families.len().saturating_sub(tail_count);
    let tail = &families[tail_start..];
    let tail_resolution_ratio = if tail.is_empty() {
        0.0
    } else {
        tail.iter().filter(|f| f.resolution).count() as f32 / tail.len() as f32
    };
    let loss_score = 0.45 * (strong_loss_blocks as f32 / 2.0).min(1.0)
        + 0.30 * (separation_blocks as f32 / 3.0).min(1.0)
        + 0.15 * (aftermath_blocks as f32 / 2.0).min(1.0)
        + 0.10 * (sorrow_blocks as f32 / 3.0).min(1.0);
    let repeated_romance = (romantic_pursuit_blocks as f32 / 2.0).min(1.0);
    let repeated_agency = (agency_blocks as f32 / 2.0).min(1.0);
    let anti_raw = 0.50 * tail_resolution_ratio + 0.25 * repeated_romance + 0.25 * repeated_agency;
    let anti_penalty = anti_raw * (1.0 - loss_score);

    Some(GriefProfile {
        strong_loss_blocks,
        separation_blocks,
        aftermath_blocks,
        sorrow_blocks,
        resolution_blocks,
        romantic_pursuit_blocks,
        agency_blocks,
        core_passed,
        loss_score,
        tail_resolution_ratio,
        repeated_romance,
        repeated_agency,
        anti_penalty: anti_penalty.min(1.0),
        evidence_block_ratio,
    })
}

/// Applies the policy-specific correction to an existing S0 score.  Every
/// valid profile is retained and softly reranked; the caller must skip this
/// function entirely when the profile is unavailable so missing data remains
/// fail-open.
pub(crate) fn apply_grief_policy(
    base_score: f32,
    profile: &GriefProfile,
    persistence: f32,
    policy: GriefMoodPolicy,
) -> f32 {
    let weight = match policy.strength {
        GriefMoodStrength::Subtle => 0.08,
        GriefMoodStrength::Balanced => 0.14,
        GriefMoodStrength::Strong => 0.20,
    };
    let persistence = persistence.clamp(0.0, 1.0);
    let positive = (0.65 * profile.loss_score + 0.35 * persistence).clamp(0.0, 1.0);
    let anti = profile.anti_penalty.clamp(0.0, 1.0);
    let theme_delta = (positive - 0.35).clamp(-0.5, 0.5);
    // Theme evidence may raise S0 only when grief persists across multiple
    // blocks and thematic families. A weak/single-block profile may still be
    // softly downranked, but is never promoted by an isolated loss phrase.
    let bounded_theme_delta = if profile.core_passed {
        theme_delta
    } else {
        theme_delta.min(0.0)
    };
    let current = base_score + weight * bounded_theme_delta - weight * anti;
    if policy.strength != GriefMoodStrength::Strong {
        return current;
    }
    let weak_loss = (1.0 - profile.loss_score / 0.22).clamp(0.0, 1.0);
    let weak_evidence = (1.0 - profile.evidence_block_ratio / 0.50).clamp(0.0, 1.0);
    current - 0.12 * weak_loss * weak_evidence
}

#[derive(Clone, Copy)]
struct BlockFamilies {
    strong_loss: bool,
    separation: bool,
    aftermath: bool,
    sorrow: bool,
    resolution: bool,
    romantic_pursuit: bool,
    agency: bool,
}

fn contains_any(text: &str, terms: &[&str]) -> bool {
    terms.iter().any(|term| {
        if term.is_ascii() {
            let text_tokens = text
                .split(|character: char| !character.is_ascii_alphanumeric())
                .filter(|token| !token.is_empty())
                .collect::<Vec<_>>();
            let term_tokens = term.split_whitespace().collect::<Vec<_>>();
            !term_tokens.is_empty()
                && text_tokens
                    .windows(term_tokens.len())
                    .any(|window| window == term_tokens.as_slice())
        } else {
            text.contains(term)
        }
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LexiconPolarity {
    Positive,
    Negative,
    Neutral,
}

#[derive(Default)]
struct Lexicon {
    entries: HashMap<Vec<String>, LexiconPolarity>,
    max_expression_tokens: usize,
}

#[derive(Clone, Debug)]
struct AnalysisToken {
    surface: String,
    lemma: String,
    eligible: bool,
}

struct SourceBlock {
    ordinal: usize,
    start_line: usize,
    end_line: usize,
    text: String,
    normalized_text: String,
}

#[derive(Default)]
struct AnalyzerRuntime {
    segmenter: OnceLock<Arc<Segmenter>>,
    state: Mutex<AnalyzerState>,
    changed: Condvar,
}

#[derive(Default)]
enum AnalyzerState {
    #[default]
    Empty,
    Loading,
    Ready(Arc<AnalyzerResources>),
    Failed(AnalyzerFailure),
}

struct AnalyzerResources {
    segmenter: Arc<Segmenter>,
    lexicon: Lexicon,
}

#[derive(Clone, Debug)]
struct AnalyzerFailure {
    diagnostic: String,
    retry_after: Instant,
}

impl AnalyzerRuntime {
    fn get_or_initialize<F>(&self, initializer: F) -> Result<Arc<AnalyzerResources>, String>
    where
        F: FnOnce() -> Result<AnalyzerResources, String>,
    {
        loop {
            let mut state = self.lock_state();
            match &*state {
                AnalyzerState::Ready(resources) => return Ok(Arc::clone(resources)),
                AnalyzerState::Failed(failure) if Instant::now() < failure.retry_after => {
                    return Err(failure.diagnostic.clone());
                }
                AnalyzerState::Loading => {
                    state = self.wait_for_change(state);
                    drop(state);
                }
                AnalyzerState::Empty | AnalyzerState::Failed(_) => {
                    *state = AnalyzerState::Loading;
                    drop(state);
                    return self.run_initializer(initializer);
                }
            }
        }
    }

    fn run_initializer<F>(&self, initializer: F) -> Result<Arc<AnalyzerResources>, String>
    where
        F: FnOnce() -> Result<AnalyzerResources, String>,
    {
        let outcome = catch_unwind(AssertUnwindSafe(initializer))
            .unwrap_or_else(|_| {
                Err("Japanese tokenizer unavailable: analyzer initialization panicked".to_owned())
            })
            .map(Arc::new);

        let mut state = self.lock_state();
        debug_assert!(matches!(*state, AnalyzerState::Loading));
        *state = match &outcome {
            Ok(resources) => AnalyzerState::Ready(Arc::clone(resources)),
            Err(diagnostic) => AnalyzerState::Failed(AnalyzerFailure {
                diagnostic: diagnostic.clone(),
                retry_after: Instant::now() + LEXICON_RETRY_COOLDOWN,
            }),
        };
        self.changed.notify_all();
        outcome
    }

    fn shared_segmenter(&self) -> Result<Arc<Segmenter>, String> {
        if let Some(segmenter) = self.segmenter.get() {
            return Ok(Arc::clone(segmenter));
        }

        let segmenter = Arc::new(
            create_segmenter()
                .map_err(|error| format!("Japanese tokenizer unavailable: {error}"))?,
        );
        match self.segmenter.set(Arc::clone(&segmenter)) {
            Ok(()) => Ok(segmenter),
            Err(_) => self
                .segmenter
                .get()
                .cloned()
                .ok_or_else(|| "Japanese tokenizer unavailable: missing segmenter".to_owned()),
        }
    }

    fn lock_state(&self) -> MutexGuard<'_, AnalyzerState> {
        match self.state.lock() {
            Ok(state) => state,
            Err(poisoned) => {
                let state = poisoned.into_inner();
                self.state.clear_poison();
                state
            }
        }
    }

    fn wait_for_change<'a>(
        &self,
        state: MutexGuard<'a, AnalyzerState>,
    ) -> MutexGuard<'a, AnalyzerState> {
        match self.changed.wait(state) {
            Ok(state) => state,
            Err(poisoned) => {
                let state = poisoned.into_inner();
                self.state.clear_poison();
                state
            }
        }
    }
}

struct LexiconResource<'a> {
    url: &'a str,
    file_name: &'a str,
    sha256: &'a str,
}

const LEXICON_RESOURCES: [LexiconResource<'static>; 2] = [
    LexiconResource {
        url: WAGO_URL,
        file_name: WAGO_FILE_NAME,
        sha256: WAGO_SHA256,
    },
    LexiconResource {
        url: NOUN_URL,
        file_name: NOUN_FILE_NAME,
        sha256: NOUN_SHA256,
    },
];

pub fn lyrics_hash(lyrics: &str) -> String {
    sha256_hex(normalize_newlines(lyrics).as_bytes())
}

pub fn analysis_hash(lyrics: &str) -> String {
    analysis_hash_with_analyzer_id(lyrics, ANALYZER_ID)
}

fn analysis_hash_with_analyzer_id(lyrics: &str, analyzer_id: &str) -> String {
    let mut hasher = Sha256::new();
    update_hash_field(&mut hasher, analyzer_id);
    update_hash_field(&mut hasher, ANALYZER_VERSION);
    update_hash_field(&mut hasher, SEGMENTATION_VERSION);
    update_hash_field(&mut hasher, WAGO_SHA256);
    update_hash_field(&mut hasher, NOUN_SHA256);
    for block in source_blocks(lyrics) {
        update_hash_field(&mut hasher, &block.ordinal.to_string());
        update_hash_field(&mut hasher, &block.start_line.to_string());
        update_hash_field(&mut hasher, &block.end_line.to_string());
        update_hash_field(&mut hasher, &block.text);
        update_hash_field(&mut hasher, &block.normalized_text);
    }
    format!("{:x}", hasher.finalize())
}

pub fn analyze_summary(app: &AppHandle, text: &str) -> LyricsSentimentSummary {
    analyze_track(app, "query", text).sentiment
}

pub fn analyze_track(app: &AppHandle, track_id: &str, lyrics: &str) -> TrackLyricsAnalysis {
    let blocks = source_blocks(lyrics);
    let hash = lyrics_hash(lyrics);
    if blocks.is_empty() {
        return TrackLyricsAnalysis {
            track_id: track_id.to_owned(),
            lyrics_hash: hash,
            sentiment: unknown_summary("no saved lyrics"),
            blocks: Vec::new(),
        };
    }

    let cache_root = match app.path().app_cache_dir() {
        Ok(path) => path.join(DICTIONARY_CACHE_DIRECTORY),
        Err(error) => {
            return unavailable_analysis(
                track_id,
                hash,
                blocks,
                format!("sentiment dictionary unavailable: {error}"),
            );
        }
    };
    analyze_with_runtime(track_id, hash, blocks, &cache_root)
}

pub fn no_lyrics_analysis(track_id: &str) -> TrackLyricsAnalysis {
    TrackLyricsAnalysis {
        track_id: track_id.to_owned(),
        lyrics_hash: lyrics_hash(""),
        sentiment: unknown_summary("no saved lyrics"),
        blocks: Vec::new(),
    }
}

pub(crate) fn is_retryable_unavailable(summary: &LyricsSentimentSummary) -> bool {
    summary.diagnostic.as_deref().is_some_and(|diagnostic| {
        diagnostic.starts_with("sentiment dictionary unavailable:")
            || diagnostic.starts_with("Japanese tokenizer unavailable:")
    })
}

pub(crate) fn retry_cooldown() -> Duration {
    LEXICON_RETRY_COOLDOWN
}

fn analyze_with_runtime(
    track_id: &str,
    lyrics_hash: String,
    blocks: Vec<SourceBlock>,
    cache_root: &Path,
) -> TrackLyricsAnalysis {
    let runtime = analyzer_runtime();
    let resources = match runtime.get_or_initialize(|| {
        let segmenter = runtime.shared_segmenter()?;
        let lexicon = load_runtime_lexicon(cache_root, segmenter.as_ref())
            .map_err(|error| format!("sentiment dictionary unavailable: {error}"))?;
        Ok(AnalyzerResources { segmenter, lexicon })
    }) {
        Ok(resources) => resources,
        Err(diagnostic) => {
            return unavailable_analysis(track_id, lyrics_hash, blocks, diagnostic);
        }
    };
    analyze_blocks(
        track_id,
        lyrics_hash,
        blocks,
        resources.segmenter.as_ref(),
        &resources.lexicon,
    )
}

fn create_segmenter() -> Result<Segmenter, String> {
    let dictionary = load_dictionary("embedded://ipadic").map_err(|error| error.to_string())?;
    Ok(Segmenter::new(Mode::Normal, dictionary, None))
}

fn load_runtime_lexicon(cache_root: &Path, segmenter: &Segmenter) -> Result<Lexicon, String> {
    fs::create_dir_all(cache_root).map_err(|error| {
        format!(
            "failed to create dictionary cache {}: {error}",
            cache_root.display()
        )
    })?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("Musical lyrics sentiment analyzer")
        .build()
        .map_err(|error| format!("failed to initialize HTTPS client: {error}"))?;
    let wago = read_or_download_resource(cache_root, &LEXICON_RESOURCES[0], &client)?;
    let nouns = read_or_download_resource(cache_root, &LEXICON_RESOURCES[1], &client)?;
    parse_lexicon(&wago, &nouns, segmenter)
}

fn read_or_download_resource(
    cache_root: &Path,
    resource: &LexiconResource<'_>,
    client: &reqwest::blocking::Client,
) -> Result<Vec<u8>, String> {
    read_or_download_resource_with(cache_root, resource, |url| {
        let response = client
            .get(url)
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| format!("failed to download {url}: {error}"))?;
        response
            .bytes()
            .map(|bytes| bytes.to_vec())
            .map_err(|error| format!("failed to read {url}: {error}"))
    })
}

fn read_or_download_resource_with<F>(
    cache_root: &Path,
    resource: &LexiconResource<'_>,
    fetch: F,
) -> Result<Vec<u8>, String>
where
    F: FnOnce(&str) -> Result<Vec<u8>, String>,
{
    let destination = cache_root.join(resource.file_name);
    if let Ok(bytes) = fs::read(&destination) {
        if sha256_hex(&bytes) == resource.sha256 {
            return Ok(bytes);
        }
    }

    let bytes = fetch(resource.url)?;
    let actual_hash = sha256_hex(&bytes);
    if actual_hash != resource.sha256 {
        return Err(format!(
            "SHA-256 mismatch for {} (expected {}, got {})",
            resource.file_name, resource.sha256, actual_hash
        ));
    }
    atomic_file::write(&destination, &bytes).map_err(|error| {
        format!(
            "failed to atomically cache {} at {}: {error}",
            resource.file_name,
            destination.display()
        )
    })?;
    Ok(bytes)
}

fn parse_lexicon(wago: &[u8], nouns: &[u8], segmenter: &Segmenter) -> Result<Lexicon, String> {
    let wago = std::str::from_utf8(wago)
        .map_err(|error| format!("wago dictionary is not UTF-8: {error}"))?;
    let nouns = std::str::from_utf8(nouns)
        .map_err(|error| format!("noun dictionary is not UTF-8: {error}"))?;
    let mut lexicon = Lexicon::default();

    for line in wago.lines().filter(|line| !line.trim().is_empty()) {
        let mut fields = line.split('\t');
        let category = fields.next().unwrap_or_default().trim();
        let expression = fields.next().unwrap_or_default().trim();
        let polarity = if category.starts_with("ポジ") {
            Some(LexiconPolarity::Positive)
        } else if category.starts_with("ネガ") {
            Some(LexiconPolarity::Negative)
        } else {
            None
        };
        if let Some(polarity) = polarity {
            insert_expression(&mut lexicon, expression, polarity, segmenter)?;
        }
    }

    for line in nouns.lines().filter(|line| !line.trim().is_empty()) {
        let mut fields = line.split('\t');
        let expression = unquote_field(fields.next().unwrap_or_default().trim());
        let polarity = match fields.next().unwrap_or_default().trim() {
            "p" => Some(LexiconPolarity::Positive),
            "n" => Some(LexiconPolarity::Negative),
            "e" => Some(LexiconPolarity::Neutral),
            _ => None,
        };
        if let Some(polarity) = polarity {
            insert_expression(&mut lexicon, &expression, polarity, segmenter)?;
        }
    }

    let has_positive = lexicon
        .entries
        .values()
        .any(|polarity| *polarity == LexiconPolarity::Positive);
    let has_negative = lexicon
        .entries
        .values()
        .any(|polarity| *polarity == LexiconPolarity::Negative);
    if lexicon.entries.is_empty() || !has_positive || !has_negative {
        return Err("parsed sentiment dictionaries contained no usable polar entries".to_owned());
    }
    Ok(lexicon)
}

fn unquote_field(value: &str) -> String {
    value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(value)
        .replace("\"\"", "\"")
}

fn insert_expression(
    lexicon: &mut Lexicon,
    expression: &str,
    polarity: LexiconPolarity,
    segmenter: &Segmenter,
) -> Result<(), String> {
    let expression = normalize_analysis_text(expression);
    if expression.trim().is_empty() {
        return Ok(());
    }
    let tokens = tokenize(segmenter, &expression)?;
    let key = tokens
        .into_iter()
        .map(|token| token.lemma)
        .filter(|lemma| !lemma.trim().is_empty())
        .collect::<Vec<_>>();
    if key.is_empty() {
        return Ok(());
    }
    lexicon.max_expression_tokens = lexicon.max_expression_tokens.max(key.len());
    lexicon.entries.entry(key).or_insert(polarity);
    Ok(())
}

fn analyze_blocks(
    track_id: &str,
    lyrics_hash: String,
    blocks: Vec<SourceBlock>,
    segmenter: &Segmenter,
    lexicon: &Lexicon,
) -> TrackLyricsAnalysis {
    let analyzed = blocks
        .into_iter()
        .map(|block| {
            let sentiment = match tokenize(segmenter, &block.normalized_text) {
                Ok(tokens) => analyze_tokens(&tokens, lexicon),
                Err(error) => unknown_summary(format!("Japanese tokenizer unavailable: {error}")),
            };
            LyricsSentimentBlock {
                ordinal: block.ordinal,
                start_line: block.start_line,
                end_line: block.end_line,
                text: block.text,
                sentiment,
            }
        })
        .collect::<Vec<_>>();
    let sentiment = aggregate_blocks(&analyzed);
    TrackLyricsAnalysis {
        track_id: track_id.to_owned(),
        lyrics_hash,
        sentiment,
        blocks: analyzed,
    }
}

fn tokenize(segmenter: &Segmenter, text: &str) -> Result<Vec<AnalysisToken>, String> {
    let mut segmented = segmenter
        .segment(Cow::Borrowed(text))
        .map_err(|error| error.to_string())?;
    let mut tokens = Vec::with_capacity(segmented.len());
    for token in &mut segmented {
        let surface = token.surface.to_string();
        let details = token.details();
        let part_of_speech = details.first().copied().unwrap_or("UNK");
        let lemma = details
            .get(6)
            .copied()
            .filter(|lemma| *lemma != "*" && !lemma.is_empty())
            .unwrap_or(&surface)
            .to_owned();
        tokens.push(AnalysisToken {
            surface,
            lemma,
            eligible: matches!(part_of_speech, "名詞" | "動詞" | "形容詞" | "副詞"),
        });
    }
    Ok(tokens)
}

fn analyze_tokens(tokens: &[AnalysisToken], lexicon: &Lexicon) -> LyricsSentimentSummary {
    let eligible_token_count = tokens.iter().filter(|token| token.eligible).count();
    let lemmas = tokens
        .iter()
        .map(|token| token.lemma.as_str())
        .collect::<Vec<_>>();
    let mut matched_token_count = 0usize;
    let mut scored_token_count = 0usize;
    let mut positive_count = 0usize;
    let mut negative_count = 0usize;
    let mut index = 0usize;

    while index < tokens.len() {
        let available = tokens.len() - index;
        let max_length = lexicon.max_expression_tokens.min(available);
        let matched = (1..=max_length).rev().find_map(|length| {
            let key = lemmas[index..index + length]
                .iter()
                .map(|lemma| (*lemma).to_owned())
                .collect::<Vec<_>>();
            lexicon
                .entries
                .get(&key)
                .copied()
                .map(|polarity| (length, polarity))
        });
        let Some((match_length, mut polarity)) = matched else {
            index += 1;
            continue;
        };

        let mut consumed = match_length;
        if polarity != LexiconPolarity::Neutral
            && index + consumed < tokens.len()
            && is_negation(&tokens[index + consumed])
        {
            polarity = match polarity {
                LexiconPolarity::Positive => LexiconPolarity::Negative,
                LexiconPolarity::Negative => LexiconPolarity::Positive,
                LexiconPolarity::Neutral => LexiconPolarity::Neutral,
            };
            consumed += 1;
        }
        let matched_eligible = tokens[index..index + consumed]
            .iter()
            .filter(|token| token.eligible)
            .count();
        if matched_eligible > 0 {
            matched_token_count += matched_eligible;
            match polarity {
                LexiconPolarity::Positive => {
                    scored_token_count += matched_eligible;
                    positive_count += matched_eligible;
                }
                LexiconPolarity::Negative => {
                    scored_token_count += matched_eligible;
                    negative_count += matched_eligible;
                }
                LexiconPolarity::Neutral => {}
            }
        }
        index += consumed;
    }

    summary_from_counts(
        eligible_token_count,
        matched_token_count,
        scored_token_count,
        positive_count,
        negative_count,
        None,
    )
}

fn is_negation(token: &AnalysisToken) -> bool {
    matches!(token.lemma.as_str(), "ない" | "ぬ" | "ず" | "ん")
        || matches!(token.surface.as_str(), "ない" | "ぬ" | "ず" | "ん")
}

fn aggregate_blocks(blocks: &[LyricsSentimentBlock]) -> LyricsSentimentSummary {
    let eligible_token_count = blocks
        .iter()
        .map(|block| block.sentiment.eligible_token_count)
        .sum();
    let matched_token_count = blocks
        .iter()
        .map(|block| block.sentiment.matched_token_count)
        .sum();
    let scored_token_count = blocks
        .iter()
        .map(|block| block.sentiment.scored_token_count)
        .sum();
    let positive_count = blocks
        .iter()
        .map(|block| block.sentiment.positive_count)
        .sum();
    let negative_count = blocks
        .iter()
        .map(|block| block.sentiment.negative_count)
        .sum();
    let diagnostic = blocks.iter().find_map(|block| {
        block
            .sentiment
            .diagnostic
            .as_deref()
            .filter(|diagnostic| {
                diagnostic.starts_with("Japanese tokenizer unavailable:")
                    || diagnostic.starts_with("sentiment dictionary unavailable:")
            })
            .map(str::to_owned)
    });
    summary_from_counts(
        eligible_token_count,
        matched_token_count,
        scored_token_count,
        positive_count,
        negative_count,
        diagnostic,
    )
}

fn summary_from_counts(
    eligible_token_count: usize,
    matched_token_count: usize,
    scored_token_count: usize,
    positive_count: usize,
    negative_count: usize,
    diagnostic: Option<String>,
) -> LyricsSentimentSummary {
    let coverage = if eligible_token_count == 0 {
        0.0
    } else {
        matched_token_count as f32 / eligible_token_count as f32
    };
    let score = (scored_token_count > 0)
        .then(|| (positive_count as f32 - negative_count as f32) / scored_token_count as f32);
    let label = label_for_score(score);
    let diagnostic = diagnostic.or_else(|| {
        if scored_token_count > 0 {
            None
        } else if eligible_token_count == 0 {
            Some("no eligible Japanese tokens".to_owned())
        } else if matched_token_count > 0 {
            Some("only neutral dictionary matches".to_owned())
        } else {
            Some("no scored sentiment dictionary matches".to_owned())
        }
    });
    LyricsSentimentSummary {
        score,
        label,
        coverage,
        eligible_token_count,
        matched_token_count,
        scored_token_count,
        positive_count,
        negative_count,
        analyzer_id: ANALYZER_ID.to_owned(),
        diagnostic,
    }
}

fn label_for_score(score: Option<f32>) -> SentimentLabel {
    match score {
        Some(score) if score > 0.05 => SentimentLabel::Positive,
        Some(score) if score < -0.05 => SentimentLabel::Negative,
        Some(_) => SentimentLabel::Neutral,
        None => SentimentLabel::Unknown,
    }
}

fn unavailable_analysis(
    track_id: &str,
    lyrics_hash: String,
    blocks: Vec<SourceBlock>,
    diagnostic: String,
) -> TrackLyricsAnalysis {
    let blocks = blocks
        .into_iter()
        .map(|block| LyricsSentimentBlock {
            ordinal: block.ordinal,
            start_line: block.start_line,
            end_line: block.end_line,
            text: block.text,
            sentiment: unknown_summary(&diagnostic),
        })
        .collect();
    TrackLyricsAnalysis {
        track_id: track_id.to_owned(),
        lyrics_hash,
        sentiment: unknown_summary(diagnostic),
        blocks,
    }
}

fn unknown_summary(diagnostic: impl Into<String>) -> LyricsSentimentSummary {
    LyricsSentimentSummary {
        score: None,
        label: SentimentLabel::Unknown,
        coverage: 0.0,
        eligible_token_count: 0,
        matched_token_count: 0,
        scored_token_count: 0,
        positive_count: 0,
        negative_count: 0,
        analyzer_id: ANALYZER_ID.to_owned(),
        diagnostic: Some(diagnostic.into()),
    }
}

fn source_blocks(lyrics: &str) -> Vec<SourceBlock> {
    let normalized_newlines = normalize_newlines(lyrics);
    let mut stanzas = Vec::<Vec<(usize, String)>>::new();
    let mut stanza = Vec::<(usize, String)>::new();
    for (index, line) in normalized_newlines.split('\n').enumerate() {
        if line.trim().is_empty() {
            if !stanza.is_empty() {
                stanzas.push(std::mem::take(&mut stanza));
            }
            continue;
        }
        stanza.push((index + 1, line.to_owned()));
    }
    if !stanza.is_empty() {
        stanzas.push(stanza);
    }

    let mut blocks = Vec::new();
    for stanza in stanzas {
        let chunk_size = if stanza.len() > 6 { 6 } else { stanza.len() };
        for chunk in stanza.chunks(chunk_size) {
            let Some((start_line, _)) = chunk.first() else {
                continue;
            };
            let Some((end_line, _)) = chunk.last() else {
                continue;
            };
            let text = chunk
                .iter()
                .map(|(_, line)| line.as_str())
                .collect::<Vec<_>>()
                .join("\n");
            if text.trim().is_empty() {
                continue;
            }
            blocks.push(SourceBlock {
                ordinal: blocks.len() + 1,
                start_line: *start_line,
                end_line: *end_line,
                normalized_text: normalize_analysis_text(&text),
                text,
            });
        }
    }
    blocks
}

fn normalize_newlines(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn normalize_analysis_text(value: &str) -> String {
    normalize_newlines(value).nfkc().collect()
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn update_hash_field(hasher: &mut Sha256, value: &str) {
    hasher.update((value.len() as u64).to_le_bytes());
    hasher.update(value.as_bytes());
}

fn analyzer_runtime() -> &'static AnalyzerRuntime {
    ANALYZER_RUNTIME.get_or_init(AnalyzerRuntime::default)
}

#[cfg(test)]
mod tests {
    use super::{
        aggregate_blocks, analysis_hash, analysis_hash_with_analyzer_id, analyze_blocks,
        analyze_tokens, apply_grief_policy, create_segmenter, grief_mood_policy_for_prompt,
        grief_profile, insert_expression, load_runtime_lexicon, read_or_download_resource_with,
        sha256_hex, source_blocks, unavailable_analysis, AnalyzerResources, AnalyzerRuntime,
        AnalyzerState, GriefMoodPolicy, GriefMoodStrength, Lexicon, LexiconPolarity,
        LexiconResource, LyricsSentimentBlock, SentimentLabel, TrackLyricsAnalysis, ANALYZER_ID,
        SENTIMENT_PIPELINE_ID,
    };
    use std::{
        fs,
        path::PathBuf,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc, Barrier,
        },
        thread,
        time::{Instant, SystemTime, UNIX_EPOCH},
    };

    fn temporary_cache_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "musical-sentiment-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ))
    }

    fn fixture_lexicon(
        entries: &[(&str, LexiconPolarity)],
    ) -> (lindera::segmenter::Segmenter, Lexicon) {
        let segmenter = create_segmenter().expect("embedded IPADIC should load");
        let mut lexicon = Lexicon::default();
        for (expression, polarity) in entries {
            insert_expression(&mut lexicon, expression, *polarity, &segmenter)
                .expect("fixture lexicon entry should tokenize");
        }
        (segmenter, lexicon)
    }

    fn grief_fixture_analysis(texts: &[&str]) -> TrackLyricsAnalysis {
        let blocks = texts
            .iter()
            .enumerate()
            .map(|(index, text)| LyricsSentimentBlock {
                ordinal: index + 1,
                start_line: index + 1,
                end_line: index + 1,
                text: (*text).to_owned(),
                sentiment: super::summary_from_counts(1, 1, 1, 0, 1, None),
            })
            .collect::<Vec<_>>();
        TrackLyricsAnalysis {
            track_id: "fixture".to_owned(),
            lyrics_hash: "hash".to_owned(),
            sentiment: super::aggregate_blocks(&blocks),
            blocks,
        }
    }

    #[test]
    fn grief_prompt_gate_requires_explicit_or_loss_and_sorrow_language() {
        assert!(grief_mood_policy_for_prompt("悲哀の歌", None).is_some());
        assert!(grief_mood_policy_for_prompt("死別と涙の歌", None).is_some());
        assert!(grief_mood_policy_for_prompt("悲しい歌", None).is_none());
        assert!(grief_mood_policy_for_prompt("前向きな歌", None).is_none());
        assert!(grief_mood_policy_for_prompt("darker than the current track", None).is_none());
        assert_eq!(
            grief_mood_policy_for_prompt("elegy", Some("strong")),
            Some(GriefMoodPolicy {
                strength: GriefMoodStrength::Strong
            })
        );
    }

    #[test]
    fn grief_profile_deduplicates_blocks_and_requires_two_evidence_blocks() {
        let profile = grief_profile(&grief_fixture_analysis(&[
            "死別と記憶",
            "死別と記憶",
            "涙でひとり",
        ]))
        .expect("valid profile");
        assert_eq!(profile.strong_loss_blocks, 1);
        assert_eq!(profile.aftermath_blocks, 1);
        assert_eq!(profile.sorrow_blocks, 1);
        assert!(profile.core_passed);

        let weak = grief_profile(&grief_fixture_analysis(&["記憶と涙", "笑顔で明日"]))
            .expect("valid weak profile");
        assert!(!weak.core_passed);
    }

    #[test]
    fn grief_profile_does_not_promote_short_broad_japanese_fragments() {
        let profile = grief_profile(&grief_fixture_analysis(&[
            "悲 哀 痛 苦 寂 跡 傷 過去 遠く",
            "光 明日 未来 笑 救 君 あなた 愛 行く 進 立つ",
        ]))
        .expect("nonempty lyrics still produce a profile");
        assert_eq!(profile.strong_loss_blocks, 0);
        assert_eq!(profile.separation_blocks, 0);
        assert_eq!(profile.aftermath_blocks, 0);
        assert_eq!(profile.sorrow_blocks, 0);
        assert_eq!(profile.resolution_blocks, 0);
        assert_eq!(profile.romantic_pursuit_blocks, 0);
        assert_eq!(profile.agency_blocks, 0);
        assert!(!profile.core_passed);
    }

    #[test]
    fn grief_profile_protects_sorrow_that_remains_in_the_tail() {
        let profile = grief_profile(&grief_fixture_analysis(&[
            "別れた記憶",
            "痛みと涙",
            "明日に進む涙",
        ]))
        .expect("valid profile");
        assert!(profile.core_passed);
        assert_eq!(profile.anti_penalty, 0.0);
    }

    #[test]
    fn grief_profile_fails_open_for_missing_or_mismatched_analysis() {
        let mut analysis = grief_fixture_analysis(&["死別と記憶", "涙"]);
        analysis.blocks[0].sentiment.analyzer_id = "other-analyzer".to_owned();
        assert!(grief_profile(&analysis).is_none());
        analysis.blocks.clear();
        assert!(grief_profile(&analysis).is_none());
    }

    #[test]
    fn grief_score_softly_reranks_every_strength() {
        let weak = grief_profile(&grief_fixture_analysis(&["記憶と涙", "笑顔で明日"]))
            .expect("valid profile");
        let strong = GriefMoodPolicy {
            strength: GriefMoodStrength::Strong,
        };
        let balanced = GriefMoodPolicy {
            strength: GriefMoodStrength::Balanced,
        };
        let strong_score = apply_grief_policy(0.6, &weak, 0.5, strong);
        let balanced_score = apply_grief_policy(0.6, &weak, 0.5, balanced);
        assert!(strong_score.is_finite());
        assert!(balanced_score.is_finite());
        assert_ne!(strong_score.to_bits(), 0.6_f32.to_bits());
        assert_ne!(balanced_score.to_bits(), 0.6_f32.to_bits());
    }

    #[test]
    fn grief_theme_promotes_only_profiles_with_persistent_multifamily_evidence() {
        let isolated =
            grief_profile(&grief_fixture_analysis(&["死別と記憶"])).expect("isolated profile");
        let persistent = grief_profile(&grief_fixture_analysis(&["もう会えない", "涙と孤独"]))
            .expect("persistent profile");
        let strong = GriefMoodPolicy {
            strength: GriefMoodStrength::Strong,
        };
        let base = 0.6;

        assert!(!isolated.core_passed);
        assert_eq!(
            apply_grief_policy(base, &isolated, 0.9, strong).to_bits(),
            base.to_bits()
        );
        assert!(persistent.core_passed);
        assert!(apply_grief_policy(base, &persistent, 0.9, strong) > base);
    }

    #[test]
    fn core_failure_still_applies_anti_and_strong_specificity_penalties() {
        let profile = grief_profile(&grief_fixture_analysis(&[
            "記憶",
            "静かな夜",
            "青い海",
            "笑って歩き出す",
        ]))
        .expect("profile");
        let strong = GriefMoodPolicy {
            strength: GriefMoodStrength::Strong,
        };
        let balanced = GriefMoodPolicy {
            strength: GriefMoodStrength::Balanced,
        };
        let base = 0.6;

        assert!(!profile.core_passed);
        assert!(profile.anti_penalty > 0.0);
        let balanced_score = apply_grief_policy(base, &profile, 0.9, balanced);
        let strong_score = apply_grief_policy(base, &profile, 0.9, strong);
        assert!(balanced_score < base);
        assert!(strong_score < balanced_score);
    }

    #[test]
    fn strong_low_specificity_penalty_only_affects_sparse_low_loss_profiles() {
        let low_sparse = grief_profile(&grief_fixture_analysis(&[
            "記憶",
            "静かな夜",
            "青い海",
            "風が吹く",
        ]))
        .expect("profile");
        let low_dense = grief_profile(&grief_fixture_analysis(&["記憶", "涙", "孤独", "悲しみ"]))
            .expect("profile");
        let high_loss = grief_profile(&grief_fixture_analysis(&[
            "死別と記憶",
            "失った面影",
            "涙と孤独",
        ]))
        .expect("profile");
        let strong = GriefMoodPolicy {
            strength: GriefMoodStrength::Strong,
        };
        let balanced = GriefMoodPolicy {
            strength: GriefMoodStrength::Balanced,
        };

        let sparse_strong = apply_grief_policy(0.6, &low_sparse, 0.5, strong);
        let sparse_balanced = apply_grief_policy(0.6, &low_sparse, 0.5, balanced);
        assert!(sparse_strong < 0.54);
        assert!(sparse_strong > 0.50);
        assert!(sparse_balanced > sparse_strong);
        assert_eq!(low_dense.evidence_block_ratio, 1.0);
        assert!(low_dense.loss_score < 0.22);
        assert_eq!(
            apply_grief_policy(0.6, &low_dense, 0.5, strong).to_bits(),
            (0.6 + 0.20 * (0.65 * low_dense.loss_score + 0.35 * 0.5 - 0.35)).to_bits()
        );
        assert!(high_loss.loss_score >= 0.22);
        assert_eq!(
            apply_grief_policy(0.6, &high_loss, 0.5, strong).to_bits(),
            (0.6 + 0.20 * (0.65 * high_loss.loss_score + 0.35 * 0.5 - 0.35)).to_bits()
        );
    }

    #[test]
    fn strong_penalty_preserves_eight_high_specificity_profile_scores_and_order() {
        let fixtures = [
            vec!["死別と記憶", "涙と孤独"],
            vec!["失った面影", "涙"],
            vec!["戻らない思い出", "悲しみ"],
            vec!["帰らない写真", "孤独"],
            vec!["最期の記憶", "涙"],
            vec!["亡くした面影", "泣いている"],
            vec!["死別", "思い出", "涙"],
            vec!["失った", "面影", "苦しみ"],
        ];
        let strong = GriefMoodPolicy {
            strength: GriefMoodStrength::Strong,
        };
        let mut previous_scores = Vec::new();
        let mut current_scores = Vec::new();
        for (index, texts) in fixtures.iter().enumerate() {
            let profile = grief_profile(&grief_fixture_analysis(texts)).expect("profile");
            assert!(profile.core_passed);
            assert!(profile.loss_score >= 0.22);
            let base = 0.8 - index as f32 * 0.02;
            let persistence = 0.4 + index as f32 * 0.03;
            let positive = (0.65 * profile.loss_score + 0.35 * persistence).clamp(0.0, 1.0);
            let previous = base + 0.20 * (positive - 0.35).clamp(-0.5, 0.5)
                - 0.20 * profile.anti_penalty.clamp(0.0, 1.0);
            let current = apply_grief_policy(base, &profile, persistence, strong);
            assert_eq!(current.to_bits(), previous.to_bits());
            previous_scores.push(previous);
            current_scores.push(current);
        }
        let mut previous_order = (0..fixtures.len()).collect::<Vec<_>>();
        previous_order
            .sort_by(|left, right| previous_scores[*right].total_cmp(&previous_scores[*left]));
        let mut current_order = (0..fixtures.len()).collect::<Vec<_>>();
        current_order
            .sort_by(|left, right| current_scores[*right].total_cmp(&current_scores[*left]));
        assert_eq!(current_order, previous_order);
    }

    fn fixture_resources() -> AnalyzerResources {
        let (segmenter, lexicon) = fixture_lexicon(&[("喜び", LexiconPolarity::Positive)]);
        AnalyzerResources {
            segmenter: Arc::new(segmenter),
            lexicon,
        }
    }

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn shared_analyzer_types_are_send_and_sync() {
        assert_send_sync::<lindera::segmenter::Segmenter>();
        assert_send_sync::<Lexicon>();
        assert_send_sync::<AnalyzerResources>();
        assert_send_sync::<AnalyzerRuntime>();
    }

    #[test]
    fn empty_and_blank_lyrics_have_no_blocks() {
        assert!(source_blocks("").is_empty());
        assert!(source_blocks(" \r\n\t\r\n").is_empty());
    }

    #[test]
    fn analysis_hash_preserves_source_text_across_nfkc_equivalents() {
        assert_ne!(analysis_hash("Ａ"), analysis_hash("A"));
    }

    #[test]
    fn analyzer_identity_contains_the_exact_tokenization_and_nfkc_pipeline() {
        for component in [
            "lindera=5.1.0",
            "lindera-dictionary=5.1.0",
            "lindera-ipadic=5.1.0",
            "ipadic-artifact=mecab-ipadic-2.7.0-20250920",
            "ipadic-md5=a95c409f12f1023fce8ef91f991ef042",
            "ipadic-sha256=a7ba9f645ffe7094e56ae1c4a81d100df8fbb1e28bbe1792622e9728e162db3d",
            "nfkc=unicode-normalization-0.1.25",
        ] {
            assert!(SENTIMENT_PIPELINE_ID.contains(component));
        }
        assert!(ANALYZER_ID.contains(SENTIMENT_PIPELINE_ID));

        let current = analysis_hash("ＡＢＣ\n喜び");
        let previous_analyzer_id = ANALYZER_ID.replace(
            SENTIMENT_PIPELINE_ID,
            "lindera=5.0.0;lindera-dictionary=5.0.0;lindera-ipadic=5.0.0;ipadic-artifact=mecab-ipadic-2.7.0-20070801;nfkc=unicode-normalization-0.1.24",
        );
        assert_ne!(
            current,
            analysis_hash_with_analyzer_id("ＡＢＣ\n喜び", &previous_analyzer_id)
        );
    }

    #[test]
    fn bundled_ipadic_notice_matches_the_embedded_archive_generation() {
        let notice = include_str!("../resources/THIRD_PARTY_NOTICES.txt");
        for required in [
            "mecab-ipadic-2.7.0-20250920.tar.gz",
            "a95c409f12f1023fce8ef91f991ef042",
            "a7ba9f645ffe7094e56ae1c4a81d100df8fbb1e28bbe1792622e9728e162db3d",
            "Copyright 2000, 2001, 2002, 2003 Nara Institute of Science",
            "Use, reproduction, and distribution of this software is permitted.",
            "must include both the above copyright notice and the following",
        ] {
            assert!(
                notice.contains(required),
                "missing IPADIC notice: {required}"
            );
        }
    }

    #[test]
    fn blank_lines_split_stanzas_and_preserve_source_lines() {
        let blocks = source_blocks("一行目\r\n二行目\r\n\r\n\r\n四行目");
        assert_eq!(blocks.len(), 2);
        assert_eq!(
            (blocks[0].ordinal, blocks[0].start_line, blocks[0].end_line),
            (1, 1, 2)
        );
        assert_eq!(
            (blocks[1].ordinal, blocks[1].start_line, blocks[1].end_line),
            (2, 5, 5)
        );
    }

    #[test]
    fn long_stanzas_use_non_overlapping_six_line_blocks() {
        let lyrics = (1..=13)
            .map(|line| format!("line {line}"))
            .collect::<Vec<_>>()
            .join("\n");
        let blocks = source_blocks(&lyrics);
        assert_eq!(blocks.len(), 3);
        assert_eq!((blocks[0].start_line, blocks[0].end_line), (1, 6));
        assert_eq!((blocks[1].start_line, blocks[1].end_line), (7, 12));
        assert_eq!((blocks[2].start_line, blocks[2].end_line), (13, 13));
        assert!(!blocks[1].text.contains("line 6\n"));
    }

    #[test]
    fn counts_positive_negative_neutral_and_unknown_tokens() {
        let (segmenter, lexicon) = fixture_lexicon(&[
            ("喜び", LexiconPolarity::Positive),
            ("悲しみ", LexiconPolarity::Negative),
            ("日常", LexiconPolarity::Neutral),
        ]);
        let tokens = super::tokenize(&segmenter, "喜び 悲しみ 日常 机").expect("tokenize");
        let summary = analyze_tokens(&tokens, &lexicon);
        assert_eq!(summary.eligible_token_count, 4);
        assert_eq!(summary.matched_token_count, 3);
        assert_eq!(summary.scored_token_count, 2);
        assert_eq!((summary.positive_count, summary.negative_count), (1, 1));
        assert!((summary.coverage - 0.75).abs() < 0.0001);
        assert_eq!(summary.score, Some(0.0));
        assert_eq!(summary.label, SentimentLabel::Neutral);
    }

    #[test]
    fn matches_ipadic_basic_forms() {
        let (segmenter, lexicon) = fixture_lexicon(&[("嬉しい", LexiconPolarity::Positive)]);
        let tokens = super::tokenize(&segmenter, "昨日は嬉しかった").expect("tokenize");
        let summary = analyze_tokens(&tokens, &lexicon);
        assert!(summary.positive_count >= 1);
        assert_eq!(summary.label, SentimentLabel::Positive);
    }

    #[test]
    fn immediate_unregistered_negation_reverses_polarity() {
        let (segmenter, lexicon) = fixture_lexicon(&[("嬉しい", LexiconPolarity::Positive)]);
        let tokens = super::tokenize(&segmenter, "嬉しくない").expect("tokenize");
        let summary = analyze_tokens(&tokens, &lexicon);
        assert_eq!(summary.positive_count, 0);
        assert!(summary.negative_count >= 1);
        assert_eq!(summary.label, SentimentLabel::Negative);
    }

    #[test]
    fn explicit_longest_expression_wins_over_negation_fallback() {
        let (segmenter, lexicon) = fixture_lexicon(&[
            ("幸せ", LexiconPolarity::Positive),
            ("幸せではない", LexiconPolarity::Neutral),
        ]);
        let tokens = super::tokenize(&segmenter, "幸せではない").expect("tokenize");
        let summary = analyze_tokens(&tokens, &lexicon);
        assert_eq!(summary.scored_token_count, 0);
        assert!(summary.matched_token_count >= 1);
        assert_eq!(summary.label, SentimentLabel::Unknown);
    }

    #[test]
    fn aggregates_blocks_by_scored_token_weight() {
        let (segmenter, lexicon) = fixture_lexicon(&[
            ("喜び", LexiconPolarity::Positive),
            ("悲しみ", LexiconPolarity::Negative),
        ]);
        let analysis = analyze_blocks(
            "track-1",
            "hash".to_owned(),
            source_blocks("喜び\n\n悲しみ 悲しみ 悲しみ"),
            &segmenter,
            &lexicon,
        );
        assert_eq!(analysis.sentiment.scored_token_count, 4);
        assert!((analysis.sentiment.score.unwrap_or_default() + 0.5).abs() < 0.0001);
        assert_eq!(analysis.sentiment.label, SentimentLabel::Negative);
    }

    #[test]
    fn aggregate_coverage_uses_total_eligible_tokens() {
        let blocks = vec![
            LyricsSentimentBlock {
                ordinal: 1,
                start_line: 1,
                end_line: 1,
                text: "a".to_owned(),
                sentiment: super::summary_from_counts(2, 1, 1, 1, 0, None),
            },
            LyricsSentimentBlock {
                ordinal: 2,
                start_line: 3,
                end_line: 3,
                text: "b".to_owned(),
                sentiment: super::summary_from_counts(6, 3, 3, 0, 3, None),
            },
        ];
        let summary = aggregate_blocks(&blocks);
        assert_eq!(
            (summary.eligible_token_count, summary.matched_token_count),
            (8, 4)
        );
        assert!((summary.coverage - 0.5).abs() < 0.0001);
    }

    #[test]
    fn english_unknown_tokens_do_not_become_neutral() {
        let (segmenter, lexicon) = fixture_lexicon(&[("喜び", LexiconPolarity::Positive)]);
        let tokens = super::tokenize(&segmenter, "untranslatable melody").expect("tokenize");
        let summary = analyze_tokens(&tokens, &lexicon);
        assert_eq!(summary.score, None);
        assert_eq!(summary.label, SentimentLabel::Unknown);
        assert_eq!(summary.coverage, 0.0);
    }

    #[test]
    fn initializer_is_single_flight_and_does_not_hold_the_state_lock() {
        const CALLERS: usize = 8;
        let runtime = AnalyzerRuntime::default();
        let initializer_calls = AtomicUsize::new(0);
        let initializer_entered = Barrier::new(2);
        let release_initializer = Barrier::new(2);
        let callers_ready = Barrier::new(CALLERS + 1);

        thread::scope(|scope| {
            let loader = scope.spawn(|| {
                runtime.get_or_initialize(|| {
                    initializer_calls.fetch_add(1, Ordering::SeqCst);
                    initializer_entered.wait();
                    release_initializer.wait();
                    Ok(fixture_resources())
                })
            });

            initializer_entered.wait();
            let state = runtime
                .state
                .try_lock()
                .expect("initializer must not retain the global state lock");
            assert!(matches!(*state, AnalyzerState::Loading));
            drop(state);

            let waiters = (0..CALLERS)
                .map(|_| {
                    scope.spawn(|| {
                        callers_ready.wait();
                        runtime.get_or_initialize(|| {
                            initializer_calls.fetch_add(1, Ordering::SeqCst);
                            Ok(fixture_resources())
                        })
                    })
                })
                .collect::<Vec<_>>();
            callers_ready.wait();
            release_initializer.wait();

            let first = loader
                .join()
                .expect("loader thread")
                .unwrap_or_else(|error| panic!("initializer failed: {error}"));
            for waiter in waiters {
                let resources = waiter
                    .join()
                    .expect("waiter thread")
                    .unwrap_or_else(|error| panic!("waiter failed: {error}"));
                assert!(Arc::ptr_eq(&first, &resources));
            }
        });

        assert_eq!(initializer_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn ready_resources_support_parallel_block_analysis() {
        const CALLERS: usize = 8;
        let runtime = AnalyzerRuntime::default();
        let resources = runtime
            .get_or_initialize(|| Ok(fixture_resources()))
            .unwrap_or_else(|error| panic!("fixture initialization failed: {error}"));
        let unexpected_initializers = AtomicUsize::new(0);
        let callers_ready = Barrier::new(CALLERS + 1);

        thread::scope(|scope| {
            let callers = (0..CALLERS)
                .map(|ordinal| {
                    let runtime = &runtime;
                    let callers_ready = &callers_ready;
                    let unexpected_initializers = &unexpected_initializers;
                    scope.spawn(move || {
                        callers_ready.wait();
                        let shared = runtime
                            .get_or_initialize(|| {
                                unexpected_initializers.fetch_add(1, Ordering::SeqCst);
                                Ok(fixture_resources())
                            })
                            .unwrap_or_else(|error| panic!("ready runtime failed: {error}"));
                        let analysis = analyze_blocks(
                            &format!("track-{ordinal}"),
                            "hash".to_owned(),
                            source_blocks("喜び"),
                            shared.segmenter.as_ref(),
                            &shared.lexicon,
                        );
                        (shared, analysis.sentiment.label)
                    })
                })
                .collect::<Vec<_>>();
            callers_ready.wait();

            for caller in callers {
                let (shared, label) = caller.join().expect("analysis thread");
                assert!(Arc::ptr_eq(&resources, &shared));
                assert_eq!(label, SentimentLabel::Positive);
            }
        });

        assert_eq!(unexpected_initializers.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn failed_flight_is_shared_during_cooldown_and_expiry_allows_one_retry() {
        const CALLERS: usize = 8;
        let runtime = AnalyzerRuntime::default();
        let initializer_calls = AtomicUsize::new(0);
        let diagnostic = "sentiment dictionary unavailable: fixture failure".to_owned();

        let first_error = runtime
            .get_or_initialize(|| {
                initializer_calls.fetch_add(1, Ordering::SeqCst);
                Err(diagnostic.clone())
            })
            .err()
            .expect("fixture initialization must fail");
        assert_eq!(first_error, diagnostic);

        let callers_ready = Barrier::new(CALLERS + 1);
        thread::scope(|scope| {
            let callers = (0..CALLERS)
                .map(|_| {
                    scope.spawn(|| {
                        callers_ready.wait();
                        runtime.get_or_initialize(|| {
                            initializer_calls.fetch_add(1, Ordering::SeqCst);
                            Ok(fixture_resources())
                        })
                    })
                })
                .collect::<Vec<_>>();
            callers_ready.wait();

            for caller in callers {
                let error = caller
                    .join()
                    .expect("cooldown caller")
                    .err()
                    .expect("cooldown must suppress initialization");
                assert_eq!(error, diagnostic);
            }
        });
        assert_eq!(initializer_calls.load(Ordering::SeqCst), 1);

        let unavailable = unavailable_analysis(
            "track-1",
            "lyrics-hash".to_owned(),
            source_blocks("喜び"),
            first_error,
        );
        assert_eq!(unavailable.sentiment.label, SentimentLabel::Unknown);
        assert_eq!(unavailable.sentiment.score, None);

        {
            let mut state = runtime.lock_state();
            let AnalyzerState::Failed(failure) = &mut *state else {
                panic!("runtime must retain the failed flight");
            };
            failure.retry_after = Instant::now();
        }

        let retry_ready = Barrier::new(CALLERS + 1);
        let retried = thread::scope(|scope| {
            let callers = (0..CALLERS)
                .map(|_| {
                    scope.spawn(|| {
                        retry_ready.wait();
                        runtime.get_or_initialize(|| {
                            initializer_calls.fetch_add(1, Ordering::SeqCst);
                            Ok(fixture_resources())
                        })
                    })
                })
                .collect::<Vec<_>>();
            retry_ready.wait();
            callers
                .into_iter()
                .map(|caller| {
                    caller
                        .join()
                        .expect("retry caller")
                        .unwrap_or_else(|error| panic!("retry failed: {error}"))
                })
                .collect::<Vec<_>>()
        });
        let first = &retried[0];
        assert!(retried
            .iter()
            .skip(1)
            .all(|resources| Arc::ptr_eq(first, resources)));
        assert_eq!(initializer_calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn initializer_panic_publishes_failure_and_wakes_waiter() {
        let runtime = AnalyzerRuntime::default();
        let initializer_entered = Barrier::new(2);
        let release_initializer = Barrier::new(2);
        let waiter_holds_state = Barrier::new(2);

        thread::scope(|scope| {
            let loader = scope.spawn(|| {
                runtime.get_or_initialize(|| -> Result<AnalyzerResources, String> {
                    initializer_entered.wait();
                    release_initializer.wait();
                    panic!("fixture initializer panic");
                })
            });
            initializer_entered.wait();

            let waiter = scope.spawn(|| {
                let mut state = runtime.lock_state();
                assert!(matches!(*state, AnalyzerState::Loading));
                waiter_holds_state.wait();
                while matches!(*state, AnalyzerState::Loading) {
                    state = runtime.wait_for_change(state);
                }
                let AnalyzerState::Failed(failure) = &*state else {
                    panic!("panic must publish a failed state");
                };
                failure.diagnostic.clone()
            });

            waiter_holds_state.wait();
            release_initializer.wait();

            let loader_error = match loader.join().expect("loader catches initializer panic") {
                Ok(_) => panic!("panicking initializer unexpectedly succeeded"),
                Err(error) => error,
            };
            let waiter_error = waiter.join().expect("waiter thread");
            assert_eq!(loader_error, waiter_error);
            assert!(loader_error.starts_with("Japanese tokenizer unavailable:"));
        });

        let unexpected_initializers = AtomicUsize::new(0);
        let cached_error = runtime
            .get_or_initialize(|| {
                unexpected_initializers.fetch_add(1, Ordering::SeqCst);
                Ok(fixture_resources())
            })
            .err()
            .expect("panic failure must observe cooldown");
        assert!(cached_error.starts_with("Japanese tokenizer unavailable:"));
        assert_eq!(unexpected_initializers.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn poisoned_state_lock_is_recovered() {
        let runtime = Arc::new(AnalyzerRuntime::default());
        let poisoner_runtime = Arc::clone(&runtime);
        let poisoner = thread::spawn(move || {
            let _state = poisoner_runtime.state.lock().expect("fresh state lock");
            panic!("fixture state-lock panic");
        });
        assert!(poisoner.join().is_err());
        assert!(runtime.state.is_poisoned());

        let resources = runtime
            .get_or_initialize(|| Ok(fixture_resources()))
            .unwrap_or_else(|error| panic!("poison recovery failed: {error}"));
        assert!(!runtime.state.is_poisoned());
        assert_eq!(
            analyze_blocks(
                "track-1",
                "hash".to_owned(),
                source_blocks("喜び"),
                resources.segmenter.as_ref(),
                &resources.lexicon,
            )
            .sentiment
            .label,
            SentimentLabel::Positive
        );
    }

    #[test]
    fn verified_download_atomically_replaces_a_corrupt_cache_entry() {
        let cache_root = temporary_cache_root("verified-replacement");
        fs::create_dir_all(&cache_root).expect("create fixture cache");
        let destination = cache_root.join("fixture.pn");
        fs::write(&destination, b"corrupt cache").expect("write corrupt cache");
        let valid_bytes = b"fixture dictionary\n";
        let expected_hash = sha256_hex(valid_bytes);
        let resource = LexiconResource {
            url: "https://fixture.invalid/dictionary",
            file_name: "fixture.pn",
            sha256: &expected_hash,
        };

        let result = read_or_download_resource_with(&cache_root, &resource, |url| {
            assert_eq!(url, resource.url);
            Ok(valid_bytes.to_vec())
        })
        .expect("verified fixture download");

        assert_eq!(result, valid_bytes);
        assert_eq!(
            fs::read(&destination).expect("read replacement"),
            valid_bytes
        );
        let cached_paths = fs::read_dir(&cache_root)
            .expect("read fixture cache")
            .map(|entry| entry.expect("cache entry").path())
            .collect::<Vec<_>>();
        assert_eq!(cached_paths, vec![destination]);
        fs::remove_dir_all(cache_root).expect("remove fixture cache");
    }

    #[test]
    fn http_status_failure_preserves_corrupt_cache_and_yields_unknown_fallback() {
        let cache_root = temporary_cache_root("status-failure");
        fs::create_dir_all(&cache_root).expect("create fixture cache");
        let destination = cache_root.join("fixture.pn");
        fs::write(&destination, b"corrupt cache").expect("write corrupt cache");
        let expected_hash = sha256_hex(b"expected dictionary");
        let resource = LexiconResource {
            url: "https://fixture.invalid/dictionary",
            file_name: "fixture.pn",
            sha256: &expected_hash,
        };

        let error = read_or_download_resource_with(&cache_root, &resource, |url| {
            Err(format!(
                "failed to download {url}: HTTP status 503 Service Unavailable"
            ))
        })
        .expect_err("status failure must not use corrupt cache");
        assert!(error.contains("HTTP status 503 Service Unavailable"));
        assert_eq!(
            fs::read(&destination).expect("read preserved cache"),
            b"corrupt cache"
        );

        let diagnostic = format!("sentiment dictionary unavailable: {error}");
        let analysis = unavailable_analysis(
            "track-1",
            "lyrics-hash".to_owned(),
            source_blocks("喜び"),
            diagnostic.clone(),
        );
        assert_eq!(analysis.sentiment.label, SentimentLabel::Unknown);
        assert_eq!(analysis.sentiment.score, None);
        assert_eq!(analysis.sentiment.coverage, 0.0);
        assert_eq!(
            analysis.sentiment.diagnostic.as_deref(),
            Some(diagnostic.as_str())
        );
        assert_eq!(analysis.blocks.len(), 1);
        assert_eq!(analysis.blocks[0].sentiment.label, SentimentLabel::Unknown);
        fs::remove_dir_all(cache_root).expect("remove fixture cache");
    }

    #[test]
    fn sha_mismatch_does_not_replace_a_corrupt_cache_entry() {
        let cache_root = temporary_cache_root("hash-mismatch");
        fs::create_dir_all(&cache_root).expect("create fixture cache");
        let destination = cache_root.join("fixture.pn");
        fs::write(&destination, b"corrupt cache").expect("write corrupt cache");
        let expected_hash = sha256_hex(b"expected dictionary");
        let resource = LexiconResource {
            url: "https://fixture.invalid/dictionary",
            file_name: "fixture.pn",
            sha256: &expected_hash,
        };

        let error = read_or_download_resource_with(&cache_root, &resource, |_| {
            Ok(b"tampered download".to_vec())
        })
        .expect_err("hash mismatch must fail");

        assert!(error.contains("SHA-256 mismatch"));
        assert_eq!(
            fs::read(&destination).expect("read preserved cache"),
            b"corrupt cache"
        );
        assert_eq!(
            fs::read_dir(&cache_root)
                .expect("read fixture cache")
                .count(),
            1
        );
        fs::remove_dir_all(cache_root).expect("remove fixture cache");
    }

    #[test]
    #[ignore = "downloads and verifies the two official Tohoku sentiment dictionaries"]
    fn live_official_dictionaries_parse_and_score() {
        let cache_root = std::env::temp_dir().join(format!(
            "musical-sentiment-dictionary-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        let segmenter = create_segmenter().expect("embedded IPADIC should load");
        let lexicon = load_runtime_lexicon(&cache_root, &segmenter)
            .expect("official dictionaries should download and parse");
        assert!(lexicon.entries.len() > 10_000);
        let tokens = super::tokenize(&segmenter, "幸せと悲しみ").expect("tokenize");
        let summary = analyze_tokens(&tokens, &lexicon);
        assert!(summary.positive_count > 0);
        assert!(summary.negative_count > 0);
        fs::remove_dir_all(cache_root).expect("remove temporary dictionary cache");
    }
}
