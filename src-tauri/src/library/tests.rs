use super::{
    display_album_artist, display_album_year, find_audio_files, load_playlist_file_best_effort,
    parse_m3u_playlist, parse_pls_playlist, persist_album_tag_update, repair_mojibake,
    resolve_playlist_tracks, strip_windows_drive_prefix, update_playlist_artwork_file,
    ExistingAlbum, PlaylistArtworkUpdateRequest, PlaylistFile,
};
use rusqlite::{params, Connection};
use std::{
    collections::{BTreeSet, HashMap},
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

#[test]
fn preserves_source_indexes_when_playlist_tracks_are_missing() {
    let available_track = super::TrackRecord {
        id: "available".to_owned(),
        uuid: "available".to_owned(),
        title: "Available".to_owned(),
        artist: "Artist".to_owned(),
        duration_seconds: 180,
        track_number: Some(1),
        disc_number: Some(1),
        file_path: "/music/available.mp3".to_owned(),
        has_lyrics: false,
        is_favorite: false,
        rating: None,
    };
    let tracks_by_path = HashMap::from([("available.mp3".to_owned(), available_track)]);
    let paths = vec!["missing.mp3".to_owned(), "available.mp3".to_owned()];

    let (missing_paths, track_indexes, tracks) = resolve_playlist_tracks(&paths, &tracks_by_path);

    assert_eq!(missing_paths, vec!["missing.mp3"]);
    assert_eq!(track_indexes, vec![1]);
    assert_eq!(tracks[0].id, "available");
}

#[test]
fn finds_supported_audio_files_recursively() {
    let root = unique_temp_dir();
    let nested = root.join("Artist").join("Album");
    fs::create_dir_all(&nested).expect("create nested fixture directory");
    fs::write(root.join("root.MP3"), []).expect("write root audio fixture");
    fs::write(nested.join("track.flac"), []).expect("write nested audio fixture");
    fs::write(nested.join("notes.txt"), []).expect("write non-audio fixture");

    let (files, skipped_entries) = find_audio_files(&root);
    let mut names = files
        .iter()
        .map(|path| path.file_name().unwrap().to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    names.sort();

    assert_eq!(skipped_entries, 0);
    assert_eq!(names, vec!["root.MP3", "track.flac"]);

    fs::remove_dir_all(root).expect("remove fixture directory");
}

#[test]
fn repairs_common_japanese_mojibake() {
    assert_eq!(repair_mojibake("ã‚¢ãƒ«ãƒ\u{0090}ãƒ "), "アルバム");
    assert_eq!(repair_mojibake("ƒAƒ‹ƒoƒ€"), "アルバム");
    assert_eq!(
            repair_mojibake(
                "\u{008b}@\u{0093}®\u{0090}í\u{008e}m\u{0083}K\u{0083}\u{0093}\u{0083}_\u{0083}\u{0080}SEED DESTINY OST \u{0087}T\n(\u{0089}¹\u{008a}y)\u{008d}²\u{008b}´\u{008f}r\u{0095}F"
            ),
            "機動戦士ガンダムSEED DESTINY OST Ⅰ\n(音楽)佐橋俊彦"
        );
    assert_eq!(repair_mojibake("Midnight Transit"), "Midnight Transit");
}

#[test]
fn displays_multiple_album_artists_as_etc() {
    let artists = BTreeSet::from(["Transit Ensemble".to_owned(), "Mica Notes".to_owned()]);

    assert_eq!(display_album_artist(&artists), "Mica Notesなど");
}

#[test]
fn displays_multiple_album_years_as_etc() {
    assert_eq!(
        display_album_year(&BTreeSet::from([2024])),
        Some("2024".to_owned())
    );
    assert_eq!(
        display_album_year(&BTreeSet::from([2024, 2026])),
        Some("2026など".to_owned())
    );
}

#[test]
fn skips_corrupt_mplaylist_without_failing_library_load() {
    let root = unique_temp_dir();
    let playlist_dir = root.join(".musical").join("playlist");
    fs::create_dir_all(&playlist_dir).expect("create playlist fixture directory");
    let playlist_path = playlist_dir.join("broken.mplaylist");
    fs::write(&playlist_path, "{ this is not json").expect("write corrupt playlist");

    assert!(load_playlist_file_best_effort(&root, &playlist_path).is_none());

    fs::remove_dir_all(root).expect("remove fixture directory");
}

#[test]
fn parses_m3u_and_pls_playlist_paths_relative_to_playlist_file() {
    let root = unique_temp_dir();
    let playlist_dir = root.join(".musical").join("playlist");
    fs::create_dir_all(&playlist_dir).expect("create playlist fixture directory");
    let m3u_path = playlist_dir.join("road.m3u");
    let pls_path = playlist_dir.join("radio.pls");
    let absolute_track = root.join("Artist").join("Album").join("absolute.mp3");

    let m3u = parse_m3u_playlist(
        &root,
        &m3u_path,
        "#EXTM3U\n../../Artist/Album/relative.mp3\n/Outside/missing.mp3\n",
    );
    let pls = parse_pls_playlist(
        &root,
        &pls_path,
        "[playlist]\nFile2=../../Artist/Album/two.mp3\nFile1=../../Artist/Album/one.mp3\n",
    );
    let absolute = parse_m3u_playlist(&root, &m3u_path, &absolute_track.to_string_lossy());

    assert_eq!(m3u.id, "road");
    assert_eq!(
        m3u.track_paths,
        vec!["Artist/Album/relative.mp3", "Outside/missing.mp3"]
    );
    assert_eq!(
        pls.track_paths,
        vec!["Artist/Album/one.mp3", "Artist/Album/two.mp3"]
    );
    assert_eq!(absolute.track_paths, vec!["Artist/Album/absolute.mp3"]);

    fs::remove_dir_all(root).expect("remove fixture directory");
}

#[test]
fn strips_windows_drive_from_rooted_playlist_entries() {
    assert_eq!(
        strip_windows_drive_prefix("C:/Outside/missing.mp3"),
        "Outside/missing.mp3"
    );
    assert_eq!(
        strip_windows_drive_prefix("Artist/Album/relative.mp3"),
        "Artist/Album/relative.mp3"
    );
}

#[test]
fn saves_playlist_artwork_next_to_mplaylist_file() {
    let root = unique_temp_dir();
    let playlist_dir = root.join(".musical").join("playlist");
    fs::create_dir_all(&playlist_dir).expect("create playlist fixture directory");
    let playlist_path = playlist_dir.join("road-set.mplaylist");
    let source_artwork_path = root.join("source.png");
    let playlist_file = PlaylistFile {
        version: 1,
        id: "road-set".to_owned(),
        name: "Road Set".to_owned(),
        artwork_path: None,
        track_paths: vec!["Artist/Album/one.mp3".to_owned()],
    };
    fs::write(
        &playlist_path,
        serde_json::to_vec_pretty(&playlist_file).expect("serialize playlist"),
    )
    .expect("write playlist");
    fs::write(
        &source_artwork_path,
        [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a],
    )
    .expect("write source artwork");

    let result = update_playlist_artwork_file(
        &root,
        PlaylistArtworkUpdateRequest {
            playlist_id: "road-set".to_owned(),
            artwork_path: source_artwork_path.to_string_lossy().into_owned(),
        },
    )
    .expect("save playlist artwork");
    let updated_playlist =
        super::read_mplaylist_file(&playlist_path).expect("read updated playlist");

    assert_eq!(result.playlist_id, "road-set");
    assert!(result.artwork_path.ends_with("road-set.png"));
    assert!(PathBuf::from(&result.artwork_path).is_file());
    assert_eq!(updated_playlist.artwork_path, Some(result.artwork_path));

    fs::remove_dir_all(root).expect("remove fixture directory");
}

#[test]
fn merges_album_tag_update_into_existing_album_key() {
    let mut connection = Connection::open_in_memory().expect("open in-memory database");
    connection
        .execute_batch(
            "
                CREATE TABLE albums (
                    group_key TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    year INTEGER,
                    year_label TEXT,
                    genre TEXT,
                    artwork_path TEXT
                );
                CREATE TABLE tracks (
                    uuid TEXT PRIMARY KEY,
                    album_group_key TEXT NOT NULL,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    duration_seconds INTEGER NOT NULL,
                    track_number INTEGER,
                    disc_number INTEGER,
                    file_path TEXT NOT NULL UNIQUE
                );
                ",
        )
        .expect("create library schema");

    connection
        .execute(
            "INSERT INTO albums (group_key, title, artist, year)
                 VALUES ('source album', 'Source Album', 'Source Artist', 2024)",
            [],
        )
        .expect("insert source album");
    connection
        .execute(
            "INSERT INTO albums (group_key, title, artist, year)
                 VALUES ('target album', 'Target Album', 'Target Artist', 2025)",
            [],
        )
        .expect("insert target album");
    connection
            .execute(
                "INSERT INTO tracks (uuid, album_group_key, title, artist, duration_seconds, file_path)
                 VALUES ('moved.mp3', 'source album', 'Moved Track', 'Source Artist', 180, '/music/moved.mp3')",
                [],
            )
            .expect("insert moved track");
    connection
            .execute(
                "INSERT INTO tracks (uuid, album_group_key, title, artist, duration_seconds, file_path)
                 VALUES ('existing.mp3', 'target album', 'Existing Track', 'Target Artist', 180, '/music/existing.mp3')",
                [],
            )
            .expect("insert existing track");

    let updated_album_id = persist_album_tag_update(
        &mut connection,
        &ExistingAlbum {
            group_key: "source album".to_owned(),
            artist: "Source Artist".to_owned(),
        },
        &["/music/moved.mp3".to_owned()],
        "Target Album",
        "Target Artist",
        "Target Artist",
        Some(2025),
        "Rock",
    )
    .expect("merge source album into target album");

    let album_count = connection
        .query_row("SELECT COUNT(*) FROM albums", [], |row| {
            row.get::<_, i64>(0)
        })
        .expect("count albums");
    let target_track_count = connection
        .query_row(
            "SELECT COUNT(*) FROM tracks WHERE album_group_key = 'target album'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .expect("count target tracks");
    let moved_track_artist = connection
        .query_row(
            "SELECT artist FROM tracks WHERE file_path = ?1",
            params!["/music/moved.mp3"],
            |row| row.get::<_, String>(0),
        )
        .expect("load moved track artist");

    assert_eq!(album_count, 1);
    assert_eq!(target_track_count, 2);
    assert_eq!(moved_track_artist, "Target Artist");
    assert_eq!(updated_album_id, "target album");
}

fn unique_temp_dir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock after unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("musical-library-test-{nanos}"))
}
