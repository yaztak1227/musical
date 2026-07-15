# Playlist Feature Completion

## Scope

Playlists are file-backed collections stored under `.musical/playlist` in the scanned library root.
The editable native format is `.mplaylist` JSON. M3U, M3U8, and PLS files are imported read-only into
the library snapshot so they can be displayed and played without blocking normal library loading.

## Behavior

- Playlists can be created with a user-entered name, renamed, deleted, reloaded, and assigned artwork.
- Tracks can be added one at a time or in album-sized batches. Existing tracks are shown as already added and are not duplicated.
- Playlist detail supports play, add-track navigation, album jump, track removal, and up/down reordering.
- Empty playlists disable play actions and explain that tracks must be added first.
- Missing playlist entries are preserved as `missingTrackPaths` so users can restore files and reload the library.
- Resolved tracks retain their original playlist-file indexes, so remove and reorder operations remain accurate when missing entries occur between playable tracks.
- Native playlist JSON writes use a same-directory temporary file and rename to avoid leaving a truncated playlist after an interrupted write.
- Existing playlist files are replaced with the platform-native replace operation, including `MoveFileExW` on Windows.
- Playlist deletion reports filesystem failures, and artwork metadata is committed before obsolete artwork is removed.
- Playlist mutations are serialized across Tauri, local HTTP, and MCP entry points to prevent concurrent read-modify-write operations from losing changes.
- Shuffle toggling keeps playlist playback context, reshuffles only playlist tracks, and restores stored playlist order when shuffle is disabled.
- Broken `.mplaylist` files are skipped during snapshot loading instead of failing the entire library load.
- Rooted M3U/PLS entries such as `/Music/track.mp3` are normalized without a Windows drive prefix.
- Fire TV `/tv` display includes non-empty playlists as playable collections before albums.

## Tests

- Rust unit tests cover corrupt `.mplaylist` tolerance and M3U/PLS path parsing.
- Playwright covers playlist create, duplicate add state, playlist source playback display, rename, batch add, reorder, remove, album jump, and delete.
