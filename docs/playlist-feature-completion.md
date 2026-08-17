# Playlist Feature Completion

## Scope

Playlists are file-backed collections stored under `.musical/playlist` in the scanned library root.
The editable native format is `.mplaylist` JSON. M3U, M3U8, and PLS files are imported read-only into
the library snapshot so they can be displayed and played without blocking normal library loading.

## Behavior

- Playlists can be created with a user-entered name, renamed, deleted, reloaded, and assigned artwork.
- Tracks can be added one at a time or in album-sized batches. Existing tracks are shown as already added and are not duplicated.
- Playlist detail uses a compact summary header and two-line track titles. Duration and lyrics remain directly available; album jump, removal, and up/down reordering live in each track's actions menu so narrow panels preserve readable metadata.
- Track action menus defer blur dismissal until focus settles, so WebKit can activate menu commands even when its blur event omits `relatedTarget`.
- Removing a track rewrites and reloads only the selected playlist, replaces that playlist in UI state, and publishes a targeted `refresh-playlist` command. It does not rebuild or apply a full library snapshot.
- Empty playlists disable play actions and explain that tracks must be added first.
- Missing playlist entries are preserved as `missingTrackPaths` so users can restore files and reload the library.
- Resolved tracks retain their original playlist-file indexes, so remove and reorder operations remain accurate when missing entries occur between playable tracks.
- Native playlist JSON writes use a same-directory temporary file and rename to avoid leaving a truncated playlist after an interrupted write.
- Existing playlist files are replaced with the platform-native replace operation, including `MoveFileExW` on Windows.
- Playlist deletion reports filesystem failures, and artwork metadata is committed before obsolete artwork is removed.
- Playlist mutations are serialized across Tauri, local HTTP, and MCP entry points to prevent concurrent read-modify-write operations from losing changes.
- On startup or library snapshot reset, the current track selected during restoration (the restored album's first track) stays first and only the remaining album tracks are shuffled when shuffle is enabled; playlist playback shuffles the entire playlist when shuffle is enabled and preserves stored order when shuffle is disabled. Shuffle toggling keeps playlist playback context, reshuffles only playlist tracks, and restores stored playlist order when shuffle is disabled.
- Broken `.mplaylist` files are skipped during snapshot loading instead of failing the entire library load.
- Rooted M3U/PLS entries such as `/Music/track.mp3` are normalized without a Windows drive prefix.
- Fire TV `/tv` display includes non-empty playlists as playable collections before albums.

## Tests

- Rust unit tests cover corrupt `.mplaylist` tolerance and M3U/PLS path parsing.
- Rust covers targeted playlist reload after removal. Playwright covers playlist create, duplicate add state, playlist source playback display, shuffled playlist queue order, rename, batch add, reorder, remove without resetting playback, WebKit-style null-target blur, album jump, and delete.
