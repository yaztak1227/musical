#[cfg(debug_assertions)]
use log::info;
use reqwest::{blocking::Client, Url};
use serde::Deserialize;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};

use super::{
    allow_asset_directory, current_library_root, musical_dir_for_root, sniff_picture_extension,
    stable_hash, stable_hash_bytes, to_error_string, ArtworkCandidate,
    ArtworkCandidatePreviewRequest, ArtworkCandidatePreviewResult, ArtworkCandidateSearchRequest,
    ArtworkCandidateSearchResult, ArtworkReleaseInspectRequest, ArtworkReleaseInspectResult,
    ArtworkReleaseTrack, ArtworkSearchProgress,
};

const ARTWORK_SEARCH_PROGRESS_EVENT: &str = "musical-artwork-search-progress";
const ARTWORK_CANDIDATE_DIR_NAME: &str = "artwork_candidates";
const CANDIDATE_PREVIEW_DIR_NAME: &str = "previews";
const COVER_ART_ARCHIVE_SOURCE: &str = "cover-art-archive";
const MAX_CANDIDATE_LIMIT: usize = 12;
const DEFAULT_CANDIDATE_LIMIT: usize = 8;
const MUSICBRAINZ_SEARCH_LIMIT: usize = 24;
const MUSICBRAINZ_QUERY_LIMIT: usize = 10;
const MUSICBRAINZ_RELEASE_GROUP_QUERY_LIMIT: usize = 4;
const MUSICBRAINZ_RECORDING_QUERY_LIMIT: usize = 4;
const TITLE_VARIANT_LIMIT: usize = 8;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_SECONDS: u64 = 12;
const USER_AGENT: &str = "Musical/0.1.4 (https://github.com/yaztak1227/musical)";

pub fn search_artwork_candidates(
    app: &AppHandle,
    request: ArtworkCandidateSearchRequest,
) -> Result<ArtworkCandidateSearchResult, String> {
    let album_title = request.album_title.trim();
    if album_title.is_empty() {
        return Err("artworkSearch.error.emptyQuery".to_owned());
    }

    let client = http_client()?;
    let candidate_limit = request
        .limit
        .unwrap_or(DEFAULT_CANDIDATE_LIMIT)
        .clamp(1, MAX_CANDIDATE_LIMIT);
    let mut progress = ArtworkSearchProgressReporter::new(app, request.request_id);
    progress.add_total(2);
    progress.finish_task("preparing", "artworkSearch.progressPreparing");
    let title_variants =
        expanded_album_title_variants(&client, album_title, request.album_artist.trim());
    let queries = musicbrainz_queries(&title_variants, request.album_artist.trim());
    progress.add_total(limited_count(&queries, MUSICBRAINZ_QUERY_LIMIT));
    let mut releases = search_musicbrainz_releases(
        &client,
        &queries,
        MUSICBRAINZ_SEARCH_LIMIT,
        &mut progress,
        "release-search",
        "artworkSearch.progressSearchingReleases",
    )?;
    progress.add_total(limited_count(
        &queries,
        MUSICBRAINZ_RELEASE_GROUP_QUERY_LIMIT,
    ));
    merge_musicbrainz_releases(
        &mut releases,
        search_musicbrainz_release_group_releases(
            &client,
            &queries,
            MUSICBRAINZ_SEARCH_LIMIT,
            &mut progress,
            "release-group-search",
            "artworkSearch.progressCheckingGroups",
        )?,
    );
    let track_recording_queries = recording_queries(
        request.first_track_title.as_deref().unwrap_or_default(),
        request
            .first_track_artist
            .as_deref()
            .unwrap_or(request.album_artist.trim()),
        request.album_artist.trim(),
    );
    progress.add_total(limited_count(
        &track_recording_queries,
        MUSICBRAINZ_RECORDING_QUERY_LIMIT,
    ));
    merge_musicbrainz_releases(
        &mut releases,
        search_musicbrainz_recording_releases(
            &client,
            &track_recording_queries,
            MUSICBRAINZ_SEARCH_LIMIT,
            &mut progress,
            "recording-search",
            "artworkSearch.progressCheckingTracks",
        )?,
    );
    if should_search_without_artist_constraint(&releases, request.album_artist.trim()) {
        let fallback_queries = musicbrainz_queries(&title_variants, "");
        progress.add_total(limited_count(&fallback_queries, MUSICBRAINZ_QUERY_LIMIT));
        merge_musicbrainz_releases(
            &mut releases,
            search_musicbrainz_releases(
                &client,
                &fallback_queries,
                MUSICBRAINZ_SEARCH_LIMIT,
                &mut progress,
                "fallback-release-search",
                "artworkSearch.progressFallbackSearch",
            )?,
        );
        progress.add_total(limited_count(
            &fallback_queries,
            MUSICBRAINZ_RELEASE_GROUP_QUERY_LIMIT,
        ));
        merge_musicbrainz_releases(
            &mut releases,
            search_musicbrainz_release_group_releases(
                &client,
                &fallback_queries,
                MUSICBRAINZ_SEARCH_LIMIT,
                &mut progress,
                "fallback-release-group-search",
                "artworkSearch.progressFallbackSearch",
            )?,
        );
    }
    sort_musicbrainz_releases_for_search(
        &mut releases,
        request.album_artist.trim(),
        &title_variants,
    );
    if releases.is_empty() && !request.album_artist.trim().is_empty() {
        let fallback_queries = musicbrainz_queries(&title_variants, "");
        progress.add_total(limited_count(&fallback_queries, MUSICBRAINZ_QUERY_LIMIT));
        let fallback_releases = search_musicbrainz_releases(
            &client,
            &fallback_queries,
            MUSICBRAINZ_SEARCH_LIMIT,
            &mut progress,
            "empty-fallback-release-search",
            "artworkSearch.progressFallbackSearch",
        )?;
        let mut fallback_releases = fallback_releases;
        progress.add_total(limited_count(
            &fallback_queries,
            MUSICBRAINZ_RELEASE_GROUP_QUERY_LIMIT,
        ));
        merge_musicbrainz_releases(
            &mut fallback_releases,
            search_musicbrainz_release_group_releases(
                &client,
                &fallback_queries,
                MUSICBRAINZ_SEARCH_LIMIT,
                &mut progress,
                "empty-fallback-release-group-search",
                "artworkSearch.progressFallbackSearch",
            )?,
        );
        let fallback_recording_queries = recording_queries(
            request.first_track_title.as_deref().unwrap_or_default(),
            "",
            "",
        );
        progress.add_total(limited_count(
            &fallback_recording_queries,
            MUSICBRAINZ_RECORDING_QUERY_LIMIT,
        ));
        merge_musicbrainz_releases(
            &mut fallback_releases,
            search_musicbrainz_recording_releases(
                &client,
                &fallback_recording_queries,
                MUSICBRAINZ_SEARCH_LIMIT,
                &mut progress,
                "empty-fallback-recording-search",
                "artworkSearch.progressCheckingTracks",
            )?,
        );
        sort_musicbrainz_releases_for_search(
            &mut fallback_releases,
            request.album_artist.trim(),
            &title_variants,
        );
        let candidates = release_candidates(&fallback_releases, candidate_limit);
        let candidates =
            load_candidate_images(app, &client, candidates, &mut progress, "thumbnail-search");
        log_artwork_search_result(
            album_title,
            request.album_artist.trim(),
            &fallback_queries,
            &candidates,
        );
        progress.finish_task("completed", "artworkSearch.progressComplete");
        return Ok(ArtworkCandidateSearchResult { candidates });
    }
    let candidates = release_candidates(&releases, candidate_limit);
    let candidates =
        load_candidate_images(app, &client, candidates, &mut progress, "thumbnail-search");
    log_artwork_search_result(
        album_title,
        request.album_artist.trim(),
        &queries,
        &candidates,
    );
    progress.finish_task("completed", "artworkSearch.progressComplete");

    Ok(ArtworkCandidateSearchResult { candidates })
}

pub fn preview_artwork_candidate(
    app: &AppHandle,
    request: ArtworkCandidatePreviewRequest,
) -> Result<ArtworkCandidatePreviewResult, String> {
    let image_url = request.image_url.as_deref().unwrap_or_default().trim();
    let release_id = request.release_id.as_deref().unwrap_or_default().trim();
    if image_url.is_empty() && release_id.is_empty() {
        return Err("artworkSearch.error.emptyUrl".to_owned());
    }

    let client = http_client()?;
    let preview_dir = candidate_preview_dir(app)?;
    allow_asset_directory(app, &preview_dir)?;
    let image_url = if image_url.is_empty() {
        cover_art_image_url_for_release(&client, release_id)?
    } else {
        image_url.to_owned()
    };
    let bytes = download_image_bytes(&client, &image_url, true)?;
    let preview_path = write_candidate_image(&preview_dir, &image_url, &bytes)?;

    Ok(ArtworkCandidatePreviewResult { preview_path })
}

pub fn inspect_artwork_release(
    _app: &AppHandle,
    request: ArtworkReleaseInspectRequest,
) -> Result<ArtworkReleaseInspectResult, String> {
    let release_id = request.release_id.trim();
    if release_id.is_empty() {
        return Err("artworkSearch.error.emptyRelease".to_owned());
    }

    let client = http_client()?;
    let release = lookup_musicbrainz_release(&client, release_id)?;
    Ok(ArtworkReleaseInspectResult {
        release_id: release.id.clone(),
        title: release.title,
        artist: release_artist_from_credit(release.artist_credit.as_deref()),
        year: release.date.as_deref().and_then(release_year),
        country: release.country,
        status: release.status,
        page_url: musicbrainz_cover_art_page_url(&release.id),
        tracks: release_tracks(&release.media),
    })
}

fn search_musicbrainz_releases(
    client: &Client,
    queries: &[String],
    limit: usize,
    progress: &mut ArtworkSearchProgressReporter<'_>,
    status: &'static str,
    message_key: &'static str,
) -> Result<Vec<MusicBrainzRelease>, String> {
    let mut releases = Vec::new();
    for query in queries.iter().take(MUSICBRAINZ_QUERY_LIMIT) {
        let mut url =
            Url::parse("https://musicbrainz.org/ws/2/release/").map_err(to_error_string)?;
        url.query_pairs_mut()
            .append_pair("query", query)
            .append_pair("fmt", "json")
            .append_pair("limit", &limit.to_string());

        let response = client.get(url).send().map_err(to_error_string)?;
        let http_status = response.status();
        if http_status.as_u16() == 503 || http_status.as_u16() == 429 {
            if releases.is_empty() {
                thread::sleep(Duration::from_millis(900));
                continue;
            }
            break;
        }
        if !http_status.is_success() {
            return Err(format!("artworkSearch.error.musicBrainz\t{}", http_status));
        }

        let body = response
            .json::<MusicBrainzReleaseSearchResponse>()
            .map_err(to_error_string)?;
        log_musicbrainz_release_query_result(query, &body.releases);
        for release in body.releases {
            if let Some(existing_index) = releases
                .iter()
                .position(|existing: &MusicBrainzRelease| existing.id == release.id)
            {
                if release.score.unwrap_or_default()
                    > releases[existing_index].score.unwrap_or_default()
                {
                    releases[existing_index] = release;
                }
            } else {
                releases.push(release);
            }
        }
        thread::sleep(Duration::from_millis(350));
        progress.finish_task(status, message_key);
    }
    releases.sort_by(|left, right| compare_musicbrainz_releases(left, right));
    Ok(releases)
}

fn search_musicbrainz_release_group_releases(
    client: &Client,
    queries: &[String],
    limit: usize,
    progress: &mut ArtworkSearchProgressReporter<'_>,
    status: &'static str,
    message_key: &'static str,
) -> Result<Vec<MusicBrainzRelease>, String> {
    let mut releases = Vec::new();
    for query in queries.iter().take(MUSICBRAINZ_RELEASE_GROUP_QUERY_LIMIT) {
        let mut url =
            Url::parse("https://musicbrainz.org/ws/2/release-group/").map_err(to_error_string)?;
        url.query_pairs_mut()
            .append_pair("query", query)
            .append_pair("fmt", "json")
            .append_pair("limit", &limit.to_string());

        let response = client.get(url).send().map_err(to_error_string)?;
        let http_status = response.status();
        if http_status.as_u16() == 503 || http_status.as_u16() == 429 {
            if releases.is_empty() {
                thread::sleep(Duration::from_millis(900));
                continue;
            }
            break;
        }
        if !http_status.is_success() {
            return Err(format!("artworkSearch.error.musicBrainz\t{}", http_status));
        }

        let body = response
            .json::<MusicBrainzReleaseGroupSearchResponse>()
            .map_err(to_error_string)?;
        log_musicbrainz_release_group_query_result(query, &body.release_groups);
        for release_group in body.release_groups {
            for release in release_group.releases {
                let title = if release.title.trim().is_empty() {
                    release_group.title.clone()
                } else {
                    release.title
                };
                releases.push(MusicBrainzRelease {
                    id: release.id,
                    title,
                    date: release
                        .date
                        .or_else(|| release_group.first_release_date.clone()),
                    score: release_group.score,
                    artist_credit: release_group.artist_credit.clone(),
                });
            }
        }
        thread::sleep(Duration::from_millis(350));
        progress.finish_task(status, message_key);
    }
    sort_and_dedupe_musicbrainz_releases(&mut releases);
    Ok(releases)
}

fn search_musicbrainz_recording_releases(
    client: &Client,
    queries: &[String],
    limit: usize,
    progress: &mut ArtworkSearchProgressReporter<'_>,
    status: &'static str,
    message_key: &'static str,
) -> Result<Vec<MusicBrainzRelease>, String> {
    let mut releases = Vec::new();
    for query in queries.iter().take(MUSICBRAINZ_RECORDING_QUERY_LIMIT) {
        let mut url =
            Url::parse("https://musicbrainz.org/ws/2/recording/").map_err(to_error_string)?;
        url.query_pairs_mut()
            .append_pair("query", query)
            .append_pair("fmt", "json")
            .append_pair("limit", &limit.to_string());

        let response = client.get(url).send().map_err(to_error_string)?;
        let http_status = response.status();
        if http_status.as_u16() == 503 || http_status.as_u16() == 429 {
            if releases.is_empty() {
                thread::sleep(Duration::from_millis(900));
                continue;
            }
            break;
        }
        if !http_status.is_success() {
            return Err(format!("artworkSearch.error.musicBrainz\t{}", http_status));
        }

        let body = response
            .json::<MusicBrainzRecordingSearchResponse>()
            .map_err(to_error_string)?;
        for recording in body.recordings {
            for release in recording.releases {
                releases.push(MusicBrainzRelease {
                    id: release.id,
                    title: release.title,
                    date: release.date,
                    score: recording.score,
                    artist_credit: release
                        .artist_credit
                        .or_else(|| recording.artist_credit.clone()),
                });
            }
        }
        thread::sleep(Duration::from_millis(350));
        progress.finish_task(status, message_key);
    }
    sort_and_dedupe_musicbrainz_releases(&mut releases);
    Ok(releases)
}

fn limited_count(queries: &[String], limit: usize) -> usize {
    queries.iter().take(limit).count()
}

struct ArtworkSearchProgressReporter<'a> {
    app: Option<&'a AppHandle>,
    request_id: Option<u64>,
    completed: usize,
    total: usize,
}

impl<'a> ArtworkSearchProgressReporter<'a> {
    fn new(app: &'a AppHandle, request_id: Option<u64>) -> Self {
        Self {
            app: Some(app),
            request_id,
            completed: 0,
            total: 0,
        }
    }

    #[cfg(test)]
    fn disabled() -> Self {
        Self {
            app: None,
            request_id: None,
            completed: 0,
            total: 0,
        }
    }

    fn add_total(&mut self, total: usize) {
        self.total += total;
    }

    fn finish_task(&mut self, status: &'static str, message_key: &'static str) {
        self.completed = (self.completed + 1).min(self.total.max(1));
        let payload = ArtworkSearchProgress {
            request_id: self.request_id,
            status,
            message_key,
            completed: self.completed,
            total: self.total.max(self.completed),
        };
        #[cfg(debug_assertions)]
        info!(
            "[artwork-search] request={:?} status={} completed={}/{}",
            payload.request_id, payload.status, payload.completed, payload.total
        );
        if let Some(app) = self.app {
            let _ = app.emit(ARTWORK_SEARCH_PROGRESS_EVENT, payload);
        }
    }
}

fn merge_musicbrainz_releases(
    releases: &mut Vec<MusicBrainzRelease>,
    additional_releases: Vec<MusicBrainzRelease>,
) {
    releases.extend(additional_releases);
    sort_and_dedupe_musicbrainz_releases(releases);
}

fn sort_and_dedupe_musicbrainz_releases(releases: &mut Vec<MusicBrainzRelease>) {
    releases.sort_by(compare_musicbrainz_releases);
    let mut seen_release_ids = HashSet::new();
    releases.retain(|release| seen_release_ids.insert(release.id.clone()));
}

fn compare_musicbrainz_releases(
    left: &MusicBrainzRelease,
    right: &MusicBrainzRelease,
) -> std::cmp::Ordering {
    right
        .score
        .unwrap_or_default()
        .cmp(&left.score.unwrap_or_default())
        .then_with(|| left.title.cmp(&right.title))
}

#[cfg(test)]
fn sort_musicbrainz_releases_for_artist(releases: &mut [MusicBrainzRelease], album_artist: &str) {
    let normalized_artist = normalize_artist_for_query(album_artist);
    if normalized_artist.is_empty() {
        return;
    }
    releases.sort_by(|left, right| {
        compare_musicbrainz_releases_for_artist(left, right, &normalized_artist)
    });
}

fn sort_musicbrainz_releases_for_search(
    releases: &mut [MusicBrainzRelease],
    album_artist: &str,
    title_variants: &[String],
) {
    let normalized_artist = normalize_artist_for_query(album_artist);
    releases.sort_by(|left, right| {
        title_match_score(right, title_variants)
            .cmp(&title_match_score(left, title_variants))
            .then_with(|| {
                if normalized_artist.is_empty() {
                    compare_musicbrainz_releases(left, right)
                } else {
                    compare_musicbrainz_releases_for_artist(left, right, &normalized_artist)
                }
            })
    });
}

fn title_match_score(release: &MusicBrainzRelease, title_variants: &[String]) -> i32 {
    let normalized_release_title = normalize_query_text(&release.title).to_ascii_lowercase();
    if normalized_release_title.is_empty() {
        return 0;
    }
    let release_words = normalized_release_title
        .split_whitespace()
        .collect::<Vec<_>>();

    title_variants
        .iter()
        .map(|variant| {
            let normalized_variant = normalize_query_text(variant).to_ascii_lowercase();
            if normalized_variant.is_empty() {
                return 0;
            }
            if normalized_release_title == normalized_variant {
                return 5;
            }
            if normalized_release_title.contains(&normalized_variant)
                || normalized_variant.contains(&normalized_release_title)
            {
                return 4;
            }
            let variant_words = normalized_variant.split_whitespace().collect::<Vec<_>>();
            if variant_words.iter().all(|word| {
                release_words
                    .iter()
                    .any(|release_word| release_word == word)
            }) {
                return 3;
            }
            0
        })
        .max()
        .unwrap_or_default()
}

fn compare_musicbrainz_releases_for_artist(
    left: &MusicBrainzRelease,
    right: &MusicBrainzRelease,
    normalized_artist: &str,
) -> std::cmp::Ordering {
    let left_score = left.score.unwrap_or_default();
    let right_score = right.score.unwrap_or_default();
    if left_score.abs_diff(right_score) >= 20 {
        return compare_musicbrainz_releases(left, right);
    }

    artist_match_score(right, normalized_artist)
        .cmp(&artist_match_score(left, normalized_artist))
        .then_with(|| compare_musicbrainz_releases(left, right))
}

fn should_search_without_artist_constraint(
    releases: &[MusicBrainzRelease],
    album_artist: &str,
) -> bool {
    let normalized_artist = normalize_artist_for_query(album_artist);
    !releases.is_empty()
        && !normalized_artist.is_empty()
        && releases
            .iter()
            .all(|release| artist_match_score(release, &normalized_artist) == 0)
}

fn artist_match_score(release: &MusicBrainzRelease, normalized_artist: &str) -> i32 {
    let Some(release_artist) = release_artist(release) else {
        return 0;
    };
    let normalized_release_artist = normalize_query_text(&release_artist);
    if normalized_release_artist.is_empty() {
        return 0;
    }
    if normalized_release_artist.eq_ignore_ascii_case(normalized_artist) {
        return 3;
    }
    if normalized_release_artist
        .to_ascii_lowercase()
        .contains(&normalized_artist.to_ascii_lowercase())
        || normalized_artist
            .to_ascii_lowercase()
            .contains(&normalized_release_artist.to_ascii_lowercase())
    {
        return 2;
    }
    0
}

fn lookup_musicbrainz_release(
    client: &Client,
    release_id: &str,
) -> Result<MusicBrainzReleaseLookupResponse, String> {
    let mut url = Url::parse(&format!(
        "https://musicbrainz.org/ws/2/release/{release_id}"
    ))
    .map_err(to_error_string)?;
    url.query_pairs_mut()
        .append_pair("fmt", "json")
        .append_pair("inc", "artists+recordings");

    let response = client.get(url).send().map_err(to_error_string)?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("artworkSearch.error.musicBrainz\t{}", status));
    }
    response
        .json::<MusicBrainzReleaseLookupResponse>()
        .map_err(to_error_string)
}

fn musicbrainz_queries(album_titles: &[String], album_artist: &str) -> Vec<String> {
    let normalized_artist = normalize_artist_for_query(album_artist);
    let mut queries = Vec::new();
    for album_title in album_titles.iter().take(TITLE_VARIANT_LIMIT) {
        let normalized_title = normalize_query_text(album_title);
        if normalized_title.is_empty() {
            continue;
        }
        if !normalized_artist.is_empty() {
            queries.push(format!(
                "artist:\"{normalized_artist}\" AND release:\"{normalized_title}\""
            ));
        }
        queries.push(format!("release:\"{normalized_title}\""));
    }
    for album_title in album_titles.iter().take(TITLE_VARIANT_LIMIT) {
        let normalized_title = normalize_query_text(album_title);
        if normalized_title.is_empty() {
            continue;
        }
        if !normalized_artist.is_empty() {
            queries.push(format!(
                "artist:\"{normalized_artist}\" AND {normalized_title}"
            ));
        }
        queries.push(normalized_title);
    }
    queries
}

fn recording_queries(track_title: &str, track_artist: &str, album_artist: &str) -> Vec<String> {
    let normalized_title = normalize_query_text(track_title);
    if normalized_title.is_empty() || !is_meaningful_track_query(&normalized_title) {
        return Vec::new();
    }

    let normalized_track_artist = normalize_artist_for_query(track_artist);
    let normalized_album_artist = normalize_artist_for_query(album_artist);
    let mut queries = Vec::new();

    if !normalized_track_artist.is_empty() {
        push_unique_raw_query(
            &mut queries,
            format!("artist:\"{normalized_track_artist}\" AND recording:\"{normalized_title}\""),
        );
    }
    if !normalized_album_artist.is_empty()
        && !normalized_album_artist.eq_ignore_ascii_case(&normalized_track_artist)
    {
        push_unique_raw_query(
            &mut queries,
            format!("artist:\"{normalized_album_artist}\" AND recording:\"{normalized_title}\""),
        );
    }
    push_unique_raw_query(&mut queries, format!("recording:\"{normalized_title}\""));
    push_unique_raw_query(&mut queries, normalized_title);
    queries
}

fn expanded_album_title_variants(
    client: &Client,
    album_title: &str,
    album_artist: &str,
) -> Vec<String> {
    let mut variants = Vec::new();
    let cleaned_title = strip_album_lookup_noise(album_title);
    let artist_stripped_title = strip_trailing_album_artist(&cleaned_title, album_artist);
    push_unique(&mut variants, cleaned_title.clone());
    push_unique(&mut variants, artist_stripped_title.clone());
    push_unique(
        &mut variants,
        strip_trailing_album_artist(
            &strip_trailing_artist_noise(&normalize_query_text(album_title)),
            album_artist,
        ),
    );
    for variant in wikidata_english_title_variants(client, &cleaned_title) {
        push_unique(&mut variants, variant);
    }
    if cleaned_title != normalize_query_text(album_title) {
        for variant in wikidata_english_title_variants(client, album_title) {
            push_unique(&mut variants, variant);
        }
    }
    for variant in local_album_title_variants(&artist_stripped_title) {
        push_unique(&mut variants, variant);
    }
    for variant in local_album_title_variants(&cleaned_title) {
        push_unique(&mut variants, variant);
    }
    for variant in local_album_title_variants(album_title) {
        push_unique(&mut variants, variant);
    }
    variants.truncate(TITLE_VARIANT_LIMIT);
    variants
}

fn local_album_title_variants(album_title: &str) -> Vec<String> {
    let normalized = normalize_roman_numerals(album_title);
    let without_parentheses = strip_parenthetical_text(&normalized);
    let mut variants = Vec::new();
    for variant in piano_collection_title_variants(&without_parentheses) {
        push_unique(&mut variants, variant);
    }
    for variant in piano_collection_title_variants(&normalized) {
        push_unique(&mut variants, variant);
    }
    for variant in disc_soundtrack_title_variants(&without_parentheses) {
        push_unique(&mut variants, variant);
    }
    for variant in disc_soundtrack_title_variants(&normalized) {
        push_unique(&mut variants, variant);
    }
    if let Some(latin) = extract_latin_title_fragment(&without_parentheses) {
        push_unique(&mut variants, latin.clone());
        if let Some(expanded) = expand_ost_title(&latin) {
            push_unique(&mut variants, expanded);
        }
        if let Some(shortened) = shorten_soundtrack_title(&latin) {
            push_unique(&mut variants, shortened);
        }
    }
    if let Some(latin) = extract_latin_title_fragment(&normalized) {
        push_unique(&mut variants, latin.clone());
        if let Some(expanded) = expand_ost_title(&latin) {
            push_unique(&mut variants, expanded);
        }
        if let Some(shortened) = shorten_soundtrack_title(&latin) {
            push_unique(&mut variants, shortened);
        }
    }
    if let Some(core) = soundtrack_core_title(&without_parentheses) {
        push_unique(&mut variants, core.clone());
        if let Some(expanded) = expand_ost_title(&core) {
            push_unique(&mut variants, expanded);
        }
    }
    if let Some(core) = soundtrack_core_title(&normalized) {
        push_unique(&mut variants, core.clone());
        if let Some(expanded) = expand_ost_title(&core) {
            push_unique(&mut variants, expanded);
        }
    }
    variants
}

fn wikidata_english_title_variants(client: &Client, album_title: &str) -> Vec<String> {
    let query = strip_album_lookup_noise(album_title);
    if query.trim().is_empty() {
        return Vec::new();
    }

    let mut url = match Url::parse("https://www.wikidata.org/w/api.php") {
        Ok(url) => url,
        Err(_) => return Vec::new(),
    };
    url.query_pairs_mut()
        .append_pair("action", "wbsearchentities")
        .append_pair("format", "json")
        .append_pair("language", "ja")
        .append_pair("uselang", "en")
        .append_pair("limit", "6")
        .append_pair("search", query.trim());

    let Ok(response) = client.get(url).send() else {
        return Vec::new();
    };
    if !response.status().is_success() {
        return Vec::new();
    }
    let Ok(body) = response.json::<WikidataSearchResponse>() else {
        return Vec::new();
    };

    let mut variants = Vec::new();
    for item in body.search {
        let label = item
            .display
            .and_then(|display| display.label.map(|label| label.value))
            .unwrap_or(item.label);
        if label.trim().is_empty() || label.chars().any(is_japanese_character) {
            continue;
        }
        push_unique(&mut variants, label.clone());
        for suffix in soundtrack_suffixes(album_title) {
            push_unique(&mut variants, format!("{label} {suffix}"));
            if let Some(expanded_suffix) = expand_ost_title(&suffix) {
                push_unique(&mut variants, format!("{label} {expanded_suffix}"));
            }
        }
    }
    variants
}

fn release_candidates(
    releases: &[MusicBrainzRelease],
    candidate_limit: usize,
) -> Vec<ArtworkCandidate> {
    releases
        .iter()
        .take(candidate_limit)
        .map(|release| ArtworkCandidate {
            id: release.id.clone(),
            release_id: Some(release.id.clone()),
            source: COVER_ART_ARCHIVE_SOURCE.to_owned(),
            title: release.title.clone(),
            artist: release_artist(release),
            year: release.date.as_deref().and_then(release_year),
            thumbnail_path: None,
            preview_path: None,
            image_url: None,
            page_url: Some(musicbrainz_cover_art_page_url(&release.id)),
            width: None,
            height: None,
        })
        .collect()
}

fn load_candidate_images(
    app: &AppHandle,
    client: &Client,
    mut candidates: Vec<ArtworkCandidate>,
    progress: &mut ArtworkSearchProgressReporter<'_>,
    status: &'static str,
) -> Vec<ArtworkCandidate> {
    if candidates.is_empty() {
        return candidates;
    }

    let preview_dir = match candidate_preview_dir(app).and_then(|dir| {
        allow_asset_directory(app, &dir)?;
        Ok(dir)
    }) {
        Ok(dir) => dir,
        Err(_) => return candidates,
    };

    progress.add_total(candidates.len());
    for candidate in &mut candidates {
        if let Some(release_id) = candidate.release_id.as_deref() {
            if let Ok(urls) = cover_art_urls_for_release(client, release_id) {
                candidate.image_url = Some(urls.preview_url.clone());
                if let Ok(bytes) = download_image_bytes(client, &urls.thumbnail_url, true) {
                    if let Ok(thumbnail_path) =
                        write_candidate_image(&preview_dir, &urls.thumbnail_url, &bytes)
                    {
                        candidate.thumbnail_path = Some(thumbnail_path);
                    }
                }
            }
        }
        progress.finish_task(status, "artworkSearch.progressLoadingImages");
    }
    candidates
}

#[cfg(debug_assertions)]
fn log_artwork_search_result(
    album_title: &str,
    album_artist: &str,
    queries: &[String],
    candidates: &[ArtworkCandidate],
) {
    info!(
        "artwork search result: album_title={album_title:?}, album_artist={album_artist:?}, queries=[{}], candidate_count={}",
        queries
            .iter()
            .take(MUSICBRAINZ_QUERY_LIMIT)
            .map(|query| format!("{query:?}"))
            .collect::<Vec<_>>()
            .join(", "),
        candidates.len()
    );
    for (index, candidate) in candidates.iter().enumerate() {
        info!(
            "artwork search candidate {}: release_id={:?}, title={:?}, artist={:?}, year={:?}, page_url={:?}",
            index + 1,
            candidate.release_id,
            candidate.title,
            candidate.artist,
            candidate.year,
            candidate.page_url
        );
    }
}

#[cfg(not(debug_assertions))]
fn log_artwork_search_result(
    _album_title: &str,
    _album_artist: &str,
    _queries: &[String],
    _candidates: &[ArtworkCandidate],
) {
}

#[cfg(debug_assertions)]
fn log_musicbrainz_release_query_result(query: &str, releases: &[MusicBrainzRelease]) {
    info!(
        "artwork search MusicBrainz release query: query={query:?}, returned_count={}, top=[{}]",
        releases.len(),
        releases
            .iter()
            .take(5)
            .map(|release| format!(
                "{}:{}:{:?}",
                release.id,
                release.score.unwrap_or_default(),
                release.title
            ))
            .collect::<Vec<_>>()
            .join(", ")
    );
}

#[cfg(not(debug_assertions))]
fn log_musicbrainz_release_query_result(_query: &str, _releases: &[MusicBrainzRelease]) {}

#[cfg(debug_assertions)]
fn log_musicbrainz_release_group_query_result(
    query: &str,
    release_groups: &[MusicBrainzReleaseGroup],
) {
    info!(
        "artwork search MusicBrainz release-group query: query={query:?}, returned_count={}, top=[{}]",
        release_groups.len(),
        release_groups
            .iter()
            .take(5)
            .map(|release_group| format!(
                "{}:{}:{:?}",
                release_group
                    .releases
                    .first()
                    .map(|release| release.id.as_str())
                    .unwrap_or(""),
                release_group.score.unwrap_or_default(),
                release_group.title
            ))
            .collect::<Vec<_>>()
            .join(", ")
    );
}

#[cfg(not(debug_assertions))]
fn log_musicbrainz_release_group_query_result(
    _query: &str,
    _release_groups: &[MusicBrainzReleaseGroup],
) {
}

fn normalize_query_text(value: &str) -> String {
    let normalized_text = normalize_roman_numerals(value)
        .replace(['"', '“', '”'], "")
        .replace(['（', '）', '(', ')', '[', ']'], " ");
    let normalized_text = normalized_text.replace(['〜', '～'], " ");
    let normalized = normalized_text.split_whitespace().collect::<Vec<_>>();
    let mut words = Vec::new();
    let mut index = 0usize;
    while index < normalized.len() {
        if index + 1 < normalized.len()
            && normalized[index].eq_ignore_ascii_case("album")
            && normalized[index + 1].eq_ignore_ascii_case("cover")
        {
            index += 2;
            continue;
        }
        words.push(normalized[index]);
        index += 1;
    }
    words.join(" ")
}

fn normalize_artist_for_query(value: &str) -> String {
    let normalized = normalize_query_text(value);
    if is_various_artists_label(&normalized) {
        String::new()
    } else {
        normalized
    }
}

fn strip_album_lookup_noise(value: &str) -> String {
    let without_parentheses = strip_parenthetical_text(&normalize_roman_numerals(value));
    let normalized_hyphens = without_parentheses
        .replace(['‐', '‑', '‒', '–', '—', '―', '−'], "-")
        .replace(['〜', '～'], " ")
        .replace(['_', '／', '/'], " ");
    let without_box_markers = normalized_hyphens
        .replace("CD-BOX", " ")
        .replace("Cd-Box", " ")
        .replace("cd-box", " ")
        .replace("CD BOX", " ")
        .replace("Cd Box", " ")
        .replace("cd box", " ");
    let cleaned = without_box_markers
        .split_whitespace()
        .filter(|word| !is_lookup_noise_token(word))
        .collect::<Vec<_>>()
        .join(" ");
    strip_trailing_artist_noise(&normalize_query_text(&cleaned))
}

fn normalize_roman_numerals(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            'Ⅰ' => "I".to_owned(),
            'Ⅱ' => "II".to_owned(),
            'Ⅲ' => "III".to_owned(),
            'Ⅳ' => "IV".to_owned(),
            'Ⅴ' => "V".to_owned(),
            'Ⅵ' => "VI".to_owned(),
            'Ⅶ' => "VII".to_owned(),
            'Ⅷ' => "VIII".to_owned(),
            'Ⅸ' => "IX".to_owned(),
            'Ⅹ' => "X".to_owned(),
            _ => return character.to_string(),
        })
        .collect::<Vec<_>>()
        .join("")
}

fn strip_parenthetical_text(value: &str) -> String {
    let mut output = String::new();
    let mut depth = 0usize;
    for character in value.chars() {
        match character {
            '(' | '（' | '[' | '［' => depth += 1,
            ')' | '）' | ']' | '］' => depth = depth.saturating_sub(1),
            _ if depth == 0 => output.push(character),
            _ => {}
        }
    }
    output
}

fn extract_latin_title_fragment(value: &str) -> Option<String> {
    let normalized_value = normalize_roman_numerals(value);
    let mut current = String::new();
    let mut best = String::new();
    for character in normalized_value.chars() {
        if character.is_ascii_alphanumeric()
            || matches!(character, ' ' | '-' | '_' | ':' | '\'' | '.')
        {
            current.push(character);
        } else {
            maybe_keep_latin_fragment(&current, &mut best);
            current.clear();
        }
    }
    maybe_keep_latin_fragment(&current, &mut best);
    let normalized = normalize_query_text(&best.replace('_', " "));
    (normalized
        .chars()
        .filter(|character| character.is_ascii_alphabetic())
        .count()
        >= 3
        && !is_latin_noise_fragment(&normalized))
    .then_some(normalized)
}

fn maybe_keep_latin_fragment(current: &str, best: &mut String) {
    let normalized = normalize_query_text(current);
    if is_latin_noise_fragment(&normalized) {
        return;
    }
    let letters = normalized
        .chars()
        .filter(|character| character.is_ascii_alphabetic())
        .count();
    let best_letters = best
        .chars()
        .filter(|character| character.is_ascii_alphabetic())
        .count();
    if letters >= 3 && letters > best_letters {
        *best = normalized;
    }
}

fn shorten_soundtrack_title(value: &str) -> Option<String> {
    let words = value.split_whitespace().collect::<Vec<_>>();
    let ost_index = words
        .iter()
        .position(|word| word.eq_ignore_ascii_case("OST") || word.eq_ignore_ascii_case("O.S.T."));
    let Some(index) = ost_index else {
        return None;
    };
    let start = index.saturating_sub(3);
    let shortened = words[start..].join(" ");
    (shortened != value && !shortened.trim().is_empty()).then_some(shortened)
}

fn piano_collection_title_variants(value: &str) -> Vec<String> {
    let normalized = strip_trailing_artist_noise(&normalize_query_text(value));
    let words = normalized.split_whitespace().collect::<Vec<_>>();
    let Some(index) = words
        .iter()
        .position(|word| word.eq_ignore_ascii_case("Piano"))
    else {
        return Vec::new();
    };
    let Some(collection_word) = words.get(index + 1) else {
        return Vec::new();
    };
    if !collection_word.eq_ignore_ascii_case("Collection")
        && !collection_word.eq_ignore_ascii_case("Collections")
    {
        return Vec::new();
    }
    let base = words[..index].join(" ");
    if base
        .chars()
        .filter(|character| character.is_ascii_alphabetic())
        .count()
        < 3
    {
        return Vec::new();
    }

    vec![
        format!("Piano Collections: {base}"),
        format!("Piano Collection: {base}"),
    ]
}

fn soundtrack_core_title(value: &str) -> Option<String> {
    let words = value.split_whitespace().collect::<Vec<_>>();
    let ost_index = words
        .iter()
        .position(|word| word.eq_ignore_ascii_case("OST") || word.eq_ignore_ascii_case("O.S.T."));
    let Some(index) = ost_index else {
        return None;
    };
    let mut end = index + 1;
    if let Some(next_word) = words.get(end) {
        if is_volume_token(next_word) {
            end += 1;
        }
    }
    Some(words[..end].join(" "))
}

fn disc_soundtrack_title_variants(value: &str) -> Vec<String> {
    let normalized = strip_trailing_artist_noise(&normalize_query_text(value));
    let words = normalized.split_whitespace().collect::<Vec<_>>();
    let Some((disc_index, disc_number)) = find_disc_marker_words(&words) else {
        return Vec::new();
    };
    let base = words[..disc_index].join(" ");
    if base
        .chars()
        .filter(|character| character.is_ascii_alphabetic())
        .count()
        < 3
    {
        return Vec::new();
    }

    vec![
        format!("{base} Original Soundtrack Disc {disc_number}"),
        format!("{base} Soundtrack Disc {disc_number}"),
        format!("{base} Disc {disc_number}"),
        format!("{base} Original Soundtrack"),
    ]
}

fn find_disc_marker_words(words: &[&str]) -> Option<(usize, String)> {
    for (index, word) in words.iter().enumerate() {
        let upper = word
            .trim_matches(|character: char| matches!(character, ':' | '-' | '_' | '#'))
            .to_ascii_uppercase();
        if matches!(upper.as_str(), "DISC" | "DISK" | "CD") {
            let Some(next_word) = words.get(index + 1) else {
                continue;
            };
            if is_volume_token(next_word) {
                return Some((index, normalize_query_text(next_word)));
            }
        }
        if let Some(marker) = upper
            .strip_prefix("DISC")
            .or_else(|| upper.strip_prefix("DISK"))
            .or_else(|| upper.strip_prefix("CD"))
        {
            let marker =
                marker.trim_matches(|character: char| matches!(character, '-' | '_' | ':' | '#'));
            if !marker.is_empty() && is_volume_token(marker) {
                return Some((index, normalize_query_text(marker)));
            }
        }
    }
    None
}

fn is_volume_token(value: &str) -> bool {
    let upper = value
        .trim_matches(|character: char| matches!(character, '[' | ']' | '(' | ')' | '（' | '）'))
        .to_ascii_uppercase();
    matches!(
        upper.as_str(),
        "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII" | "IX" | "X"
    ) || upper.chars().all(|character| character.is_ascii_digit())
}

fn strip_trailing_artist_noise(value: &str) -> String {
    let words = value.split_whitespace().collect::<Vec<_>>();
    if words.len() >= 2 {
        let tail = words[words.len() - 2..].join(" ");
        if is_various_artists_label(&tail) {
            return words[..words.len() - 2].join(" ");
        }
    }
    if words
        .last()
        .is_some_and(|word| is_various_artists_label(word))
    {
        return words[..words.len().saturating_sub(1)].join(" ");
    }
    value.to_owned()
}

fn strip_trailing_album_artist(value: &str, album_artist: &str) -> String {
    let normalized_value = normalize_query_text(value);
    let normalized_artist = normalize_artist_for_query(album_artist);
    if normalized_value.is_empty() || normalized_artist.is_empty() {
        return normalized_value;
    }

    let value_lower = normalized_value.to_ascii_lowercase();
    let artist_lower = normalized_artist.to_ascii_lowercase();
    if value_lower == artist_lower {
        return normalized_value;
    }
    let Some(prefix) = value_lower.strip_suffix(artist_lower.as_str()) else {
        return normalized_value;
    };
    if !prefix.chars().next_back().is_some_and(char::is_whitespace) {
        return normalized_value;
    }
    normalized_value[..prefix.trim_end().len()].to_owned()
}

fn is_various_artists_label(value: &str) -> bool {
    let normalized = normalize_query_text(value).to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "various artists" | "various artist" | "va" | "v a" | "v.a." | "オムニバス"
    )
}

fn is_meaningful_track_query(value: &str) -> bool {
    if value.len() < 2 || value.chars().all(|character| character.is_ascii_digit()) {
        return false;
    }
    let normalized = value.to_ascii_lowercase();
    if matches!(
        normalized.as_str(),
        "untitled"
            | "untitle"
            | "unknown"
            | "unknown track"
            | "no title"
            | "audio track"
            | "track"
            | "trk"
            | "名称未設定"
            | "無題"
            | "不明な曲"
    ) {
        return false;
    }
    let words = normalized.split_whitespace().collect::<Vec<_>>();
    if words.len() >= 2
        && words[1..]
            .iter()
            .all(|word| word.chars().all(|character| character.is_ascii_digit()))
    {
        let head = words[0];
        if matches!(
            head,
            "untitled"
                | "untitle"
                | "unknown"
                | "track"
                | "trk"
                | "名称未設定"
                | "無題"
                | "不明な曲"
        ) {
            return false;
        }
    }
    true
}

fn is_lookup_noise_token(value: &str) -> bool {
    let trimmed = value.trim_matches(|character: char| {
        matches!(
            character,
            ':' | ';' | ',' | '.' | '!' | '?' | '"' | '\'' | '「' | '」' | '『' | '』'
        )
    });
    if matches!(
        trimmed,
        "サントラ" | "サウンドトラック" | "オリジナルサウンドトラック"
    ) {
        return true;
    }

    let upper = trimmed.to_ascii_uppercase();
    matches!(upper.as_str(), "BOX" | "CD-BOX" | "CDBOX")
        || is_disc_marker(&upper)
        || is_media_disc_token(&upper)
}

fn is_disc_marker(value: &str) -> bool {
    let rest = value
        .strip_prefix("DISC")
        .or_else(|| value.strip_prefix("DISK"));
    let Some(rest) = rest else {
        return false;
    };
    let marker = rest.trim_matches(|character: char| matches!(character, '-' | '_' | ':' | '#'));
    !marker.is_empty()
        && (marker.chars().all(|character| character.is_ascii_digit()) || is_volume_token(marker))
}

fn is_media_disc_token(value: &str) -> bool {
    let Some(marker) = value.strip_prefix("ディスク") else {
        return false;
    };
    let marker = marker.trim_matches(|character: char| matches!(character, '-' | '_' | ':' | '#'));
    !marker.is_empty() && marker.chars().all(|character| character.is_ascii_digit())
}

fn is_latin_noise_fragment(value: &str) -> bool {
    let words = value.split_whitespace().collect::<Vec<_>>();
    !words.is_empty()
        && words.iter().all(|word| {
            let upper = word.to_ascii_uppercase();
            matches!(upper.as_str(), "CD" | "BOX" | "CD-BOX" | "CDBOX")
                || is_disc_marker(&upper)
                || is_volume_token(&upper)
        })
}

fn expand_ost_title(value: &str) -> Option<String> {
    let words = value.split_whitespace().collect::<Vec<_>>();
    let ost_index = words
        .iter()
        .position(|word| word.eq_ignore_ascii_case("OST") || word.eq_ignore_ascii_case("O.S.T."));
    let Some(index) = ost_index else {
        return None;
    };
    let mut expanded_words = words;
    expanded_words.splice(index..=index, ["Original", "Soundtrack"]);
    Some(expanded_words.join(" "))
}

fn soundtrack_suffixes(value: &str) -> Vec<String> {
    let Some(latin) = extract_latin_title_fragment(&normalize_roman_numerals(value)) else {
        return Vec::new();
    };
    let Some(ost_index) = latin
        .split_whitespace()
        .position(|word| word.eq_ignore_ascii_case("OST") || word.eq_ignore_ascii_case("O.S.T."))
    else {
        return Vec::new();
    };
    let words = latin.split_whitespace().collect::<Vec<_>>();
    vec![words[ost_index..].join(" ")]
}

fn push_unique(values: &mut Vec<String>, value: String) {
    let normalized = normalize_query_text(&value);
    if normalized.is_empty()
        || values
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(&normalized))
    {
        return;
    }
    values.push(normalized);
}

fn push_unique_raw_query(values: &mut Vec<String>, value: String) {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || values
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(trimmed))
    {
        return;
    }
    values.push(trimmed.to_owned());
}

fn is_japanese_character(character: char) -> bool {
    matches!(
        character,
        '\u{3040}'..='\u{30ff}' | '\u{3400}'..='\u{9fff}' | '\u{f900}'..='\u{faff}'
    )
}

struct CoverArtImageUrls {
    preview_url: String,
    thumbnail_url: String,
}

fn cover_art_image_url_for_release(client: &Client, release_id: &str) -> Result<String, String> {
    cover_art_urls_for_release(client, release_id).map(|urls| urls.preview_url)
}

fn cover_art_urls_for_release(
    client: &Client,
    release_id: &str,
) -> Result<CoverArtImageUrls, String> {
    let release_id = release_id.trim();
    if release_id.is_empty() {
        return Err("artworkSearch.error.emptyUrl".to_owned());
    }

    let url = format!("https://coverartarchive.org/release/{release_id}/");
    let response = client.get(&url).send().map_err(to_error_string)?;
    if response.status().as_u16() == 404 {
        return Err("artworkSearch.error.coverArtArchive\t404".to_owned());
    }
    if !response.status().is_success() {
        return Err(format!(
            "artworkSearch.error.coverArtArchive\t{}",
            response.status()
        ));
    }

    let cover_art = response
        .json::<CoverArtArchiveResponse>()
        .map_err(to_error_string)?;
    let Some(image) = cover_art
        .images
        .iter()
        .find(|image| image.front)
        .or_else(|| {
            cover_art.images.iter().find(|image| {
                image
                    .types
                    .iter()
                    .any(|image_type| image_type.eq_ignore_ascii_case("front"))
            })
        })
    else {
        return Err("artworkSearch.error.coverArtArchive\tno front image".to_owned());
    };

    let preview_url = image
        .thumbnails
        .get("large")
        .or_else(|| image.thumbnails.get("500"))
        .or_else(|| image.thumbnails.get("small"))
        .cloned()
        .unwrap_or_else(|| image.image.clone());
    let thumbnail_url = image
        .thumbnails
        .get("small")
        .or_else(|| image.thumbnails.get("250"))
        .or_else(|| image.thumbnails.get("500"))
        .or_else(|| image.thumbnails.get("large"))
        .cloned()
        .unwrap_or_else(|| image.image.clone());

    Ok(CoverArtImageUrls {
        preview_url,
        thumbnail_url,
    })
}

fn release_artist(release: &MusicBrainzRelease) -> Option<String> {
    release_artist_from_credit(release.artist_credit.as_deref())
}

fn release_artist_from_credit(artist_credit: Option<&[MusicBrainzArtistCredit]>) -> Option<String> {
    artist_credit
        .map(|credits| {
            credits
                .iter()
                .map(|credit| credit.name.as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .filter(|value| !value.trim().is_empty())
}

fn release_year(date: &str) -> Option<String> {
    date.get(0..4).map(str::to_owned)
}

fn release_tracks(media: &[MusicBrainzMedium]) -> Vec<ArtworkReleaseTrack> {
    media
        .iter()
        .flat_map(|medium| {
            medium.tracks.iter().map(|track| {
                let position = if media.len() > 1 {
                    format!(
                        "{}.{}",
                        medium.position.unwrap_or(1),
                        track
                            .number
                            .as_deref()
                            .map(str::to_owned)
                            .unwrap_or_else(|| track.position.unwrap_or(0).to_string())
                    )
                } else {
                    track
                        .number
                        .as_deref()
                        .map(str::to_owned)
                        .unwrap_or_else(|| track.position.unwrap_or(0).to_string())
                };
                ArtworkReleaseTrack {
                    position,
                    title: track.title.clone(),
                    length_seconds: track.length.map(|length| length / 1000),
                }
            })
        })
        .collect()
}

fn musicbrainz_cover_art_page_url(release_id: &str) -> String {
    format!("https://musicbrainz.org/release/{release_id}/cover-art")
}

fn download_image_bytes(
    client: &Client,
    image_url: &str,
    enforce_allowlist: bool,
) -> Result<Vec<u8>, String> {
    if enforce_allowlist {
        validate_download_url(image_url)?;
    }

    let response = client.get(image_url).send().map_err(to_error_string)?;
    if !response.status().is_success() {
        return Err(format!(
            "artworkSearch.error.download\t{}",
            response.status()
        ));
    }
    if let Some(content_length) = response.content_length() {
        if content_length > MAX_IMAGE_BYTES as u64 {
            return Err("artworkSearch.error.imageTooLarge".to_owned());
        }
    }

    let bytes = response.bytes().map_err(to_error_string)?.to_vec();
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("artworkSearch.error.imageTooLarge".to_owned());
    }
    if sniff_picture_extension(&bytes).is_none() {
        return Err("library.error.unsupportedArtwork".to_owned());
    }
    Ok(bytes)
}

fn validate_download_url(image_url: &str) -> Result<(), String> {
    let url = Url::parse(image_url).map_err(to_error_string)?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err("artworkSearch.error.unsupportedUrl".to_owned());
    }
    let host = url.host_str().unwrap_or_default();
    let allowed = host == "coverartarchive.org"
        || host == "musicbrainz.org"
        || host == "archive.org"
        || host.ends_with(".archive.org");
    if !allowed {
        return Err("artworkSearch.error.unsupportedUrl".to_owned());
    }
    Ok(())
}

fn write_candidate_image(dir: &Path, source: &str, bytes: &[u8]) -> Result<String, String> {
    fs::create_dir_all(dir).map_err(to_error_string)?;
    let extension = sniff_picture_extension(bytes).unwrap_or("bin");
    let path = dir.join(format!(
        "{:016x}-{:016x}.{extension}",
        stable_hash(source),
        stable_hash_bytes(bytes)
    ));
    if !path.exists() {
        fs::write(&path, bytes).map_err(to_error_string)?;
    }
    Ok(path.to_string_lossy().into_owned())
}

fn candidate_preview_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(candidate_cache_dir(app)?.join(CANDIDATE_PREVIEW_DIR_NAME))
}

fn candidate_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let library_root = current_library_root(app)?;
    Ok(musical_dir_for_root(&library_root).join(ARTWORK_CANDIDATE_DIR_NAME))
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS))
        .user_agent(USER_AGENT)
        .build()
        .map_err(to_error_string)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzReleaseSearchResponse {
    releases: Vec<MusicBrainzRelease>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzReleaseGroupSearchResponse {
    release_groups: Vec<MusicBrainzReleaseGroup>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzReleaseGroup {
    title: String,
    first_release_date: Option<String>,
    score: Option<i64>,
    artist_credit: Option<Vec<MusicBrainzArtistCredit>>,
    #[serde(default)]
    releases: Vec<MusicBrainzReleaseGroupRelease>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzReleaseGroupRelease {
    id: String,
    title: String,
    date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzRecordingSearchResponse {
    recordings: Vec<MusicBrainzRecording>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzRecording {
    score: Option<i64>,
    artist_credit: Option<Vec<MusicBrainzArtistCredit>>,
    #[serde(default)]
    releases: Vec<MusicBrainzRecordingRelease>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzRecordingRelease {
    id: String,
    title: String,
    date: Option<String>,
    artist_credit: Option<Vec<MusicBrainzArtistCredit>>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzRelease {
    id: String,
    title: String,
    date: Option<String>,
    score: Option<i64>,
    artist_credit: Option<Vec<MusicBrainzArtistCredit>>,
}

#[derive(Clone, Debug, Deserialize)]
struct MusicBrainzArtistCredit {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct MusicBrainzReleaseLookupResponse {
    id: String,
    title: String,
    date: Option<String>,
    country: Option<String>,
    status: Option<String>,
    artist_credit: Option<Vec<MusicBrainzArtistCredit>>,
    media: Vec<MusicBrainzMedium>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzMedium {
    position: Option<u64>,
    tracks: Vec<MusicBrainzTrack>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzTrack {
    position: Option<u64>,
    number: Option<String>,
    title: String,
    length: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct CoverArtArchiveResponse {
    images: Vec<CoverArtArchiveImage>,
}

#[derive(Debug, Deserialize)]
struct CoverArtArchiveImage {
    image: String,
    front: bool,
    types: Vec<String>,
    thumbnails: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct WikidataSearchResponse {
    search: Vec<WikidataSearchItem>,
}

#[derive(Debug, Deserialize)]
struct WikidataSearchItem {
    label: String,
    display: Option<WikidataSearchDisplay>,
}

#[derive(Debug, Deserialize)]
struct WikidataSearchDisplay {
    label: Option<WikidataSearchValue>,
}

#[derive(Debug, Deserialize)]
struct WikidataSearchValue {
    value: String,
}

#[cfg(test)]
mod tests {
    use super::{
        expanded_album_title_variants, extract_latin_title_fragment, http_client,
        is_latin_noise_fragment, limited_count, local_album_title_variants,
        merge_musicbrainz_releases, musicbrainz_queries, normalize_artist_for_query,
        normalize_query_text, push_unique, recording_queries, release_artist, release_candidates,
        release_tracks, search_musicbrainz_release_group_releases, search_musicbrainz_releases,
        should_search_without_artist_constraint, sort_musicbrainz_releases_for_artist,
        sort_musicbrainz_releases_for_search, strip_album_lookup_noise,
        strip_trailing_album_artist, ArtworkSearchProgressReporter, MusicBrainzArtistCredit,
        MusicBrainzRecordingSearchResponse, MusicBrainzRelease,
        MusicBrainzReleaseGroupSearchResponse, MusicBrainzReleaseLookupResponse,
        DEFAULT_CANDIDATE_LIMIT, MUSICBRAINZ_QUERY_LIMIT, MUSICBRAINZ_RELEASE_GROUP_QUERY_LIMIT,
        MUSICBRAINZ_SEARCH_LIMIT,
    };

    fn title_variants_for_candidate_test(
        album_title: &str,
        album_artist: &str,
        extra_variants: &[&str],
    ) -> Vec<String> {
        let cleaned_title = strip_album_lookup_noise(album_title);
        let artist_stripped_title = strip_trailing_album_artist(&cleaned_title, album_artist);
        let mut title_variants = Vec::new();
        push_unique(&mut title_variants, cleaned_title);
        push_unique(&mut title_variants, artist_stripped_title.clone());
        for variant in extra_variants {
            push_unique(&mut title_variants, (*variant).to_owned());
        }
        for variant in local_album_title_variants(&artist_stripped_title) {
            push_unique(&mut title_variants, variant);
        }
        for variant in local_album_title_variants(album_title) {
            push_unique(&mut title_variants, variant);
        }
        title_variants
    }

    fn release(
        id: &str,
        title: &str,
        artist: &str,
        score: i64,
        date: Option<&str>,
    ) -> MusicBrainzRelease {
        MusicBrainzRelease {
            id: id.to_owned(),
            title: title.to_owned(),
            date: date.map(str::to_owned),
            score: Some(score),
            artist_credit: Some(vec![MusicBrainzArtistCredit {
                name: artist.to_owned(),
            }]),
        }
    }

    fn assert_search_logic_includes_release(
        album_title: &str,
        album_artist: &str,
        extra_title_variants: &[&str],
        expected_query: &str,
        expected_release_id: &str,
        releases: Vec<MusicBrainzRelease>,
    ) {
        let title_variants =
            title_variants_for_candidate_test(album_title, album_artist, extra_title_variants);
        let queries = musicbrainz_queries(&title_variants, album_artist);
        assert!(
            queries
                .iter()
                .take(super::MUSICBRAINZ_QUERY_LIMIT)
                .any(|query| query == expected_query),
            "expected query {expected_query:?} in first {} queries, got {queries:?}",
            super::MUSICBRAINZ_QUERY_LIMIT
        );

        let mut releases = releases;
        sort_musicbrainz_releases_for_search(&mut releases, album_artist, &title_variants);
        let candidates = release_candidates(&releases, 8);
        assert!(
            candidates
                .iter()
                .any(|candidate| { candidate.release_id.as_deref() == Some(expected_release_id) }),
            "expected release {expected_release_id} in candidates, got {:?}",
            candidates
                .iter()
                .map(|candidate| candidate.release_id.as_deref().unwrap_or(""))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn strips_album_lookup_noise_from_japanese_soundtrack_box_titles() {
        assert_eq!(
            strip_album_lookup_noise("サントラ カウボーイビバップ CD-BOX DISC-01"),
            "カウボーイビバップ"
        );
    }

    #[test]
    fn keeps_meaningful_soundtrack_fragments() {
        assert_eq!(
            extract_latin_title_fragment("機動戦士ガンダムSEED DESTINY OST Ⅰ (音楽)佐橋俊彦")
                .as_deref(),
            Some("SEED DESTINY OST I")
        );
    }

    #[test]
    fn ignores_media_marker_latin_fragments() {
        assert!(is_latin_noise_fragment("CD-BOX DISC-01"));
        assert_eq!(
            extract_latin_title_fragment("サントラ カウボーイビバップ CD-BOX DISC-01"),
            None
        );
    }

    #[test]
    fn derives_chrono_cross_original_soundtrack_disc_query() {
        let variants = local_album_title_variants("Chrono Cross Disc 3 Various Artists");
        assert!(variants
            .iter()
            .any(|variant| variant == "Chrono Cross Original Soundtrack Disc 3"));
        assert!(variants
            .iter()
            .any(|variant| variant == "Chrono Cross Disc 3"));
    }

    #[test]
    fn removes_album_cover_phrase_case_insensitively() {
        assert_eq!(
            normalize_query_text("Final Fantasy IV Piano Collection Nobuo Uematsu Album cover"),
            "Final Fantasy IV Piano Collection Nobuo Uematsu"
        );
    }

    #[test]
    fn strips_trailing_album_artist_from_lookup_title() {
        assert_eq!(
            strip_trailing_album_artist(
                "Final Fantasy IV Piano Collection Nobuo Uematsu",
                "Nobuo Uematsu",
            ),
            "Final Fantasy IV Piano Collection"
        );
    }

    #[test]
    fn derives_piano_collections_inverted_musicbrainz_title() {
        let variants =
            local_album_title_variants("Final Fantasy IV Piano Collection Nobuo Uematsu");
        assert!(variants
            .iter()
            .any(|variant| variant == "Piano Collections: Final Fantasy IV"));
    }

    #[test]
    fn ignores_various_artists_as_release_artist_constraint() {
        assert_eq!(normalize_artist_for_query("Various Artists"), "");
        let queries = musicbrainz_queries(
            &[
                "Chrono Cross Disc 3".to_owned(),
                "Chrono Cross Original Soundtrack Disc 3".to_owned(),
            ],
            "Various Artists",
        );
        assert!(queries
            .iter()
            .any(|query| query == "Chrono Cross Original Soundtrack Disc 3"));
        assert!(!queries
            .iter()
            .any(|query| query.contains("artist:") || query.contains("Various Artists")));
    }

    #[test]
    fn puts_artist_constrained_musicbrainz_queries_first() {
        let queries = musicbrainz_queries(&["Violinism Acoustic Best".to_owned()], "葉加瀬太郎");
        assert_eq!(
            queries.first().map(String::as_str),
            Some("artist:\"葉加瀬太郎\" AND release:\"Violinism Acoustic Best\"")
        );
    }

    #[test]
    fn keeps_derived_title_only_query_inside_musicbrainz_query_limit() {
        let queries = musicbrainz_queries(
            &[
                "Final Fantasy IV Piano Collection".to_owned(),
                "Piano Collections: Final Fantasy IV".to_owned(),
            ],
            "Nobuo Uematsu",
        );

        assert!(queries
            .iter()
            .take(super::MUSICBRAINZ_QUERY_LIMIT)
            .any(|query| query == "release:\"Piano Collections: Final Fantasy IV\""));
    }

    #[test]
    fn sorts_matching_artist_releases_before_higher_scored_other_artists() {
        let mut releases = vec![
            MusicBrainzRelease {
                id: "other".to_owned(),
                title: "Other Album".to_owned(),
                date: Some("2018-01-01".to_owned()),
                score: Some(100),
                artist_credit: Some(vec![MusicBrainzArtistCredit {
                    name: "Other Artist".to_owned(),
                }]),
            },
            MusicBrainzRelease {
                id: "hakase".to_owned(),
                title: "VIOLINISM III".to_owned(),
                date: Some("2017-09-13".to_owned()),
                score: Some(91),
                artist_credit: Some(vec![MusicBrainzArtistCredit {
                    name: "葉加瀬太郎".to_owned(),
                }]),
            },
        ];

        sort_musicbrainz_releases_for_artist(&mut releases, "葉加瀬太郎");
        assert_eq!(releases[0].id, "hakase");
    }

    #[test]
    fn searches_without_artist_constraint_when_artist_credit_does_not_match() {
        let releases = vec![MusicBrainzRelease {
            id: "ff4-piano".to_owned(),
            title: "Piano Collections: Final Fantasy IV".to_owned(),
            date: Some("1999".to_owned()),
            score: Some(100),
            artist_credit: Some(vec![MusicBrainzArtistCredit {
                name: "植松伸夫".to_owned(),
            }]),
        }];

        assert!(should_search_without_artist_constraint(
            &releases,
            "Nobuo Uematsu"
        ));
    }

    #[test]
    fn keeps_high_score_title_match_in_candidate_limit_over_weak_artist_matches() {
        let mut releases = (0..8)
            .map(|index| MusicBrainzRelease {
                id: format!("weak-artist-{index}"),
                title: format!("Piano Collections: Final Fantasy {}", index + 5),
                date: Some("2000".to_owned()),
                score: Some(40),
                artist_credit: Some(vec![MusicBrainzArtistCredit {
                    name: "Nobuo Uematsu".to_owned(),
                }]),
            })
            .collect::<Vec<_>>();
        releases.push(MusicBrainzRelease {
            id: "920d6333-364b-488c-b973-b30b11049b7a".to_owned(),
            title: "Piano Collections: Final Fantasy IV".to_owned(),
            date: Some("1999".to_owned()),
            score: Some(100),
            artist_credit: Some(vec![MusicBrainzArtistCredit {
                name: "植松伸夫".to_owned(),
            }]),
        });

        sort_musicbrainz_releases_for_artist(&mut releases, "Nobuo Uematsu");
        let candidates = release_candidates(&releases, 8);

        assert!(candidates.iter().any(|candidate| {
            candidate.release_id.as_deref() == Some("920d6333-364b-488c-b973-b30b11049b7a")
        }));
    }

    #[test]
    fn includes_ff4_piano_collections_release_in_search_candidate_logic() {
        assert_search_logic_includes_release(
            "Final Fantasy IV Piano Collection Nobuo Uematsu album cover",
            "Nobuo Uematsu",
            &[],
            "release:\"Piano Collections: Final Fantasy IV\"",
            "920d6333-364b-488c-b973-b30b11049b7a",
            vec![
                release(
                    "83d2042b-5a76-4cd6-91d8-b4eaa29a2dc8",
                    "FINAL FANTASY IV Special Soundtrack \"Timelapse Remix\"",
                    "Nobuo Uematsu",
                    49,
                    Some("2021"),
                ),
                release(
                    "87d577b6-6670-408c-b90b-b4d08c9f3d62",
                    "Final Fantasy IV Official Soundtrack: Music From Final Fantasy Chronicles",
                    "Nobuo Uematsu",
                    49,
                    Some("2001"),
                ),
                release(
                    "f0f5ab61-3ea2-474a-b1d4-270dbd3c9a6a",
                    "Piano Collections FINAL FANTASY IX",
                    "Nobuo Uematsu",
                    40,
                    Some("2005"),
                ),
                release(
                    "920d6333-364b-488c-b973-b30b11049b7a",
                    "Piano Collections: Final Fantasy IV",
                    "植松伸夫",
                    100,
                    Some("1999"),
                ),
            ],
        );
    }

    #[test]
    #[ignore = "hits MusicBrainz/Wikidata; run only when changing artwork search logic"]
    fn live_includes_ff4_piano_collections_release_in_search_candidates() {
        let client = http_client().expect("HTTP client should be created");
        let mut progress = ArtworkSearchProgressReporter::disabled();
        let album_title = "Final Fantasy IV Piano Collection";
        let album_artist = "Nobuo Uematsu";
        let title_variants = expanded_album_title_variants(&client, album_title, album_artist);
        let queries = musicbrainz_queries(&title_variants, album_artist);
        progress.add_total(limited_count(&queries, MUSICBRAINZ_QUERY_LIMIT));
        eprintln!("title_variants={title_variants:?}");
        eprintln!(
            "queries(first {})={:?}",
            MUSICBRAINZ_QUERY_LIMIT,
            queries
                .iter()
                .take(MUSICBRAINZ_QUERY_LIMIT)
                .collect::<Vec<_>>()
        );
        let mut releases = search_musicbrainz_releases(
            &client,
            &queries,
            MUSICBRAINZ_SEARCH_LIMIT,
            &mut progress,
            "release-search",
            "artworkSearch.progressSearchingReleases",
        )
        .expect("MusicBrainz release search should succeed");
        eprintln!(
            "release search contains target={}, top={:?}",
            releases
                .iter()
                .any(|release| release.id == "920d6333-364b-488c-b973-b30b11049b7a"),
            releases
                .iter()
                .take(12)
                .map(|release| (
                    release.id.as_str(),
                    release.score.unwrap_or_default(),
                    release.title.as_str(),
                    release_artist(release).unwrap_or_default()
                ))
                .collect::<Vec<_>>()
        );
        progress.add_total(limited_count(
            &queries,
            MUSICBRAINZ_RELEASE_GROUP_QUERY_LIMIT,
        ));
        merge_musicbrainz_releases(
            &mut releases,
            search_musicbrainz_release_group_releases(
                &client,
                &queries,
                MUSICBRAINZ_SEARCH_LIMIT,
                &mut progress,
                "release-group-search",
                "artworkSearch.progressCheckingGroups",
            )
            .expect("MusicBrainz release-group search should succeed"),
        );
        eprintln!(
            "after release-group contains target={}, top={:?}",
            releases
                .iter()
                .any(|release| release.id == "920d6333-364b-488c-b973-b30b11049b7a"),
            releases
                .iter()
                .take(12)
                .map(|release| (
                    release.id.as_str(),
                    release.score.unwrap_or_default(),
                    release.title.as_str(),
                    release_artist(release).unwrap_or_default()
                ))
                .collect::<Vec<_>>()
        );
        if should_search_without_artist_constraint(&releases, album_artist) {
            let fallback_queries = musicbrainz_queries(&title_variants, "");
            progress.add_total(limited_count(&fallback_queries, MUSICBRAINZ_QUERY_LIMIT));
            merge_musicbrainz_releases(
                &mut releases,
                search_musicbrainz_releases(
                    &client,
                    &fallback_queries,
                    MUSICBRAINZ_SEARCH_LIMIT,
                    &mut progress,
                    "fallback-release-search",
                    "artworkSearch.progressFallbackSearch",
                )
                .expect("MusicBrainz fallback release search should succeed"),
            );
            progress.add_total(limited_count(
                &fallback_queries,
                MUSICBRAINZ_RELEASE_GROUP_QUERY_LIMIT,
            ));
            merge_musicbrainz_releases(
                &mut releases,
                search_musicbrainz_release_group_releases(
                    &client,
                    &fallback_queries,
                    MUSICBRAINZ_SEARCH_LIMIT,
                    &mut progress,
                    "fallback-release-group-search",
                    "artworkSearch.progressFallbackSearch",
                )
                .expect("MusicBrainz fallback release-group search should succeed"),
            );
        }
        sort_musicbrainz_releases_for_search(&mut releases, album_artist, &title_variants);
        let candidates = release_candidates(&releases, DEFAULT_CANDIDATE_LIMIT);

        assert!(
            candidates.iter().any(|candidate| {
                candidate.release_id.as_deref() == Some("920d6333-364b-488c-b973-b30b11049b7a")
            }),
            "expected FF4 Piano Collections release in candidates, got {:?}",
            candidates
                .iter()
                .map(|candidate| (
                    candidate.release_id.as_deref().unwrap_or(""),
                    candidate.title.as_str(),
                    candidate.artist.as_deref().unwrap_or("")
                ))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn includes_seed_destiny_ost_release_in_search_candidate_logic() {
        assert_search_logic_includes_release(
            "機動戦士ガンダムSEED DESTINY OST Ⅰ (音楽)佐橋俊彦 album cover",
            "佐橋俊彦",
            &[],
            "artist:\"佐橋俊彦\" AND release:\"SEED DESTINY OST I\"",
            "d23b748e-253c-42fc-8f56-55085ab85995",
            vec![
                release(
                    "noise-seed-complete",
                    "Mobile Suit Gundam SEED DESTINY Complete Best",
                    "Toshihiko Sahashi",
                    62,
                    Some("2005"),
                ),
                release(
                    "d23b748e-253c-42fc-8f56-55085ab85995",
                    "Mobile Suit Gundam SEED DESTINY ORIGINAL SOUNDTRACK I",
                    "佐橋俊彦",
                    100,
                    Some("2004"),
                ),
            ],
        );
    }

    #[test]
    fn includes_cowboy_bebop_box_release_in_search_candidate_logic() {
        assert_search_logic_includes_release(
            "サントラ カウボーイビバップ CD-BOX DISC-01 album cover",
            "菅野よう子シートベルツ",
            &["Cowboy Bebop"],
            "artist:\"菅野よう子シートベルツ\" AND release:\"Cowboy Bebop\"",
            "22638e35-336a-448c-9232-fc7670263687",
            vec![
                release(
                    "cowboy-noise",
                    "COWBOY BEBOP Knockin' on heaven's door O.S.T. FUTURE BLUES",
                    "菅野よう子",
                    70,
                    Some("2001"),
                ),
                release(
                    "22638e35-336a-448c-9232-fc7670263687",
                    "COWBOY BEBOP",
                    "菅野よう子シートベルツ",
                    100,
                    Some("1998-05-21"),
                ),
            ],
        );
    }

    #[test]
    fn includes_chrono_cross_disc_release_in_search_candidate_logic() {
        assert_search_logic_includes_release(
            "Chrono Cross Disc 3 Various Artists album cover",
            "Various Artists",
            &[],
            "release:\"Chrono Cross Original Soundtrack Disc 3\"",
            "7ecffc8f-d477-499c-ad91-243f3cd70b91",
            vec![
                release(
                    "chrono-noise",
                    "Chrono Cross: The Radical Dreamers Edition",
                    "Various Artists",
                    75,
                    Some("2022"),
                ),
                release(
                    "7ecffc8f-d477-499c-ad91-243f3cd70b91",
                    "Chrono Cross Original Soundtrack Disc 3",
                    "光田康典",
                    100,
                    Some("1999"),
                ),
            ],
        );
    }

    #[test]
    fn includes_violinism_release_group_release_in_search_candidate_logic() {
        assert_search_logic_includes_release(
            "H.葉加瀬太郎 Violinism ～Acoustic Best～ 葉加瀬太郎 album cover",
            "葉加瀬太郎",
            &["Violinism Acoustic Best", "VIOLINISM III"],
            "artist:\"葉加瀬太郎\" AND release:\"Violinism Acoustic Best\"",
            "97af1758-8e98-4fd3-8982-d47dc3b87369",
            vec![
                release(
                    "violinism-noise",
                    "VIOLINISM II",
                    "葉加瀬太郎",
                    72,
                    Some("2001"),
                ),
                release(
                    "97af1758-8e98-4fd3-8982-d47dc3b87369",
                    "VIOLINISM III",
                    "葉加瀬太郎",
                    91,
                    Some("2017-09-13"),
                ),
            ],
        );
    }

    #[test]
    fn builds_recording_queries_from_first_track_and_artist() {
        let queries = recording_queries("情熱大陸", "葉加瀬太郎", "葉加瀬太郎");
        assert_eq!(
            queries.first().map(String::as_str),
            Some("artist:\"葉加瀬太郎\" AND recording:\"情熱大陸\"")
        );
        assert!(queries
            .iter()
            .any(|query| query == "recording:\"情熱大陸\""));
    }

    #[test]
    fn skips_placeholder_recording_queries() {
        assert!(recording_queries("Untitled 01", "葉加瀬太郎", "葉加瀬太郎").is_empty());
    }

    #[test]
    fn parses_recording_search_releases() {
        let response = serde_json::from_str::<MusicBrainzRecordingSearchResponse>(
            r#"{
                "recordings": [{
                    "id": "caa0190d-0079-43ca-a0c8-adb6b14c750d",
                    "score": 100,
                    "title": "情熱大陸",
                    "artist-credit": [{ "name": "葉加瀬太郎" }],
                    "releases": [{
                        "id": "e9c5b980-b558-4836-a0ba-42589217fe4b",
                        "title": "Sweet Melodies 〜TARO plays HAKASE〜",
                        "date": "2006-09-06",
                        "artist-credit": [{ "name": "葉加瀬太郎" }]
                    }]
                }]
            }"#,
        )
        .expect("MusicBrainz recording search should deserialize releases");

        assert_eq!(
            response.recordings[0].releases[0].title,
            "Sweet Melodies 〜TARO plays HAKASE〜"
        );
    }

    #[test]
    fn parses_release_group_search_releases() {
        let response = serde_json::from_str::<MusicBrainzReleaseGroupSearchResponse>(
            r#"{
                "release-groups": [{
                    "id": "b1b9d9e8-7736-4bb5-bbb2-0fa7e6272efb",
                    "title": "VIOLINISM III",
                    "first-release-date": "2017-09-13",
                    "score": 91,
                    "artist-credit": [{ "name": "葉加瀬太郎" }],
                    "releases": [{
                        "id": "97af1758-8e98-4fd3-8982-d47dc3b87369",
                        "title": "VIOLINISM III",
                        "date": "2017-09-13"
                    }]
                }]
            }"#,
        )
        .expect("MusicBrainz release-group search should deserialize releases");

        let release_group = &response.release_groups[0];
        assert_eq!(release_group.title, "VIOLINISM III");
        assert_eq!(
            release_group.first_release_date.as_deref(),
            Some("2017-09-13")
        );
        assert_eq!(
            release_group.releases[0].id,
            "97af1758-8e98-4fd3-8982-d47dc3b87369"
        );
    }

    #[test]
    fn parses_musicbrainz_release_lookup_track_positions() {
        let release = serde_json::from_str::<MusicBrainzReleaseLookupResponse>(
            r#"{
                "id": "22638e35-336a-448c-9232-fc7670263687",
                "title": "COWBOY BEBOP",
                "date": "1998-05-21",
                "country": "JP",
                "status": "Official",
                "artist-credit": [{ "name": "菅野よう子シートベルツ" }],
                "media": [{
                    "position": 1,
                    "tracks": [{
                        "position": 1,
                        "number": "1",
                        "title": "Tank!",
                        "length": 210000
                    }]
                }]
            }"#,
        )
        .expect("MusicBrainz release lookup should deserialize numeric positions");

        let tracks = release_tracks(&release.media);
        assert_eq!(tracks[0].position, "1");
        assert_eq!(tracks[0].title, "Tank!");
        assert_eq!(tracks[0].length_seconds, Some(210));
    }
}
