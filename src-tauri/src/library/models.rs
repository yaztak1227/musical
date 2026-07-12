use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub albums: Vec<AlbumRecord>,
    pub playlists: Vec<PlaylistRecord>,
    pub last_scan_path: Option<String>,
    pub database_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TvLibraryList {
    pub libraries: Vec<TvLibrarySummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TvLibrarySummary {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    pub album_count: usize,
    pub track_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumRecord {
    pub id: String,
    pub group_key: String,
    pub title: String,
    pub artist: String,
    pub year: Option<i64>,
    pub year_label: Option<String>,
    pub genre: Option<String>,
    pub artwork_path: Option<String>,
    pub tracks: Vec<TrackRecord>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackRecord {
    pub id: String,
    pub uuid: String,
    pub title: String,
    pub artist: String,
    pub duration_seconds: i64,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
    pub file_path: String,
    pub has_lyrics: bool,
    pub is_favorite: bool,
    pub rating: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistRecord {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub artwork_path: Option<String>,
    pub track_count: usize,
    pub missing_track_paths: Vec<String>,
    pub track_indexes: Vec<usize>,
    pub tracks: Vec<TrackRecord>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PlaylistFile {
    pub(super) version: u8,
    pub(super) id: String,
    pub(super) name: String,
    pub(super) artwork_path: Option<String>,
    pub(super) track_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub scanned_files: usize,
    pub imported_tracks: usize,
    pub skipped_files: usize,
    pub albums: usize,
    pub library_path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScanProgress {
    pub status: &'static str,
    pub library_path: String,
    pub processed: usize,
    pub total: usize,
    pub imported: usize,
    pub skipped: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryLoadProgress {
    pub status: &'static str,
    pub processed: usize,
    pub total: usize,
    pub tracks: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumTagUpdateRequest {
    pub album_id: String,
    pub album_title: String,
    pub album_artist: String,
    pub artist: String,
    pub year: Option<i64>,
    pub genre: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackTagUpdateRequest {
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album_title: String,
    pub year: Option<i64>,
    pub genre: String,
    pub track_number: Option<i64>,
    pub disc_number: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackArtworkUpdateRequest {
    pub track_id: String,
    pub artwork_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumArtworkUpdateRequest {
    pub album_id: String,
    pub artwork_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkCandidateSearchRequest {
    pub request_id: Option<u64>,
    pub album_title: String,
    pub album_artist: String,
    pub first_track_title: Option<String>,
    pub first_track_artist: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkSearchProgress {
    pub request_id: Option<u64>,
    pub status: &'static str,
    pub message_key: &'static str,
    pub completed: usize,
    pub total: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkCandidatePreviewRequest {
    pub image_url: Option<String>,
    pub release_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkReleaseInspectRequest {
    pub release_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackUserStateUpdateRequest {
    pub track_id: String,
    pub is_favorite: bool,
    pub rating: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlaylistFromAlbumRequest {
    pub album_id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlaylistRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddTrackToPlaylistRequest {
    pub playlist_id: String,
    pub track_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddTracksToPlaylistRequest {
    pub playlist_id: String,
    pub track_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePlaylistRequest {
    pub playlist_id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePlaylistRequest {
    pub playlist_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovePlaylistTrackRequest {
    pub playlist_id: String,
    pub track_index: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderPlaylistTrackRequest {
    pub playlist_id: String,
    pub from_index: usize,
    pub to_index: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistArtworkUpdateRequest {
    pub playlist_id: String,
    pub artwork_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumTagUpdateResult {
    pub album_id: String,
    pub updated_files: usize,
    pub failed_files: Vec<TagWriteFailure>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackTagUpdateResult {
    pub track_id: String,
    pub album_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackArtworkUpdateResult {
    pub track_id: String,
    pub album_id: String,
    pub artwork_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumArtworkUpdateResult {
    pub album_id: String,
    pub artwork_path: String,
    pub updated_files: usize,
    pub failed_files: Vec<TagWriteFailure>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkCandidateSearchResult {
    pub candidates: Vec<ArtworkCandidate>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkCandidatePreviewResult {
    pub preview_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkReleaseInspectResult {
    pub release_id: String,
    pub title: String,
    pub artist: Option<String>,
    pub year: Option<String>,
    pub country: Option<String>,
    pub status: Option<String>,
    pub page_url: String,
    pub tracks: Vec<ArtworkReleaseTrack>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkReleaseTrack {
    pub position: String,
    pub title: String,
    pub length_seconds: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkCandidate {
    pub id: String,
    pub release_id: Option<String>,
    pub source: String,
    pub title: String,
    pub artist: Option<String>,
    pub year: Option<String>,
    pub thumbnail_path: Option<String>,
    pub preview_path: Option<String>,
    pub image_url: Option<String>,
    pub page_url: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistArtworkUpdateResult {
    pub playlist_id: String,
    pub artwork_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackUserStateUpdateResult {
    pub track_id: String,
    pub is_favorite: bool,
    pub rating: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagWriteFailure {
    pub file_path: String,
    pub reason: String,
}

#[derive(Debug)]
pub(super) struct PendingAlbum {
    pub(super) title: String,
    pub(super) artist: String,
    pub(super) artists: BTreeSet<String>,
    pub(super) year: Option<i64>,
    pub(super) years: BTreeSet<i64>,
    pub(super) genre: Option<String>,
    pub(super) artwork_path: Option<String>,
    pub(super) tracks: Vec<PendingTrack>,
}

#[derive(Debug)]
pub(super) struct PendingTrack {
    pub(super) uuid: String,
    pub(super) title: String,
    pub(super) artist: String,
    pub(super) duration_seconds: i64,
    pub(super) track_number: Option<i64>,
    pub(super) disc_number: Option<i64>,
    pub(super) file_path: String,
    pub(super) file_md5: String,
    pub(super) file_mtime: i64,
    pub(super) file_size: i64,
    pub(super) initial_rating: Option<i64>,
    pub(super) lyrics: Option<String>,
}

#[derive(Debug)]
pub(super) struct ExistingTrack {
    pub(super) uuid: String,
    pub(super) album_group_key: String,
    pub(super) file_path: String,
}

#[derive(Debug)]
pub(super) struct ExistingFileState {
    pub(super) file_md5: String,
    pub(super) file_mtime: i64,
    pub(super) file_size: i64,
}

#[derive(Debug)]
pub(super) struct ExistingAlbum {
    pub(super) group_key: String,
    pub(super) artist: String,
}
