# Next Step

## Summary

The project has been rebuilt from the old Java/JavaFX base into a Tauri application with a React frontend and a Rust backend.

The current state is no longer just a template. It now has the first working path for:

- scanning a local music folder
- reading audio tags in Rust
- storing albums and tracks in SQLite
- reloading the indexed library into the UI

## What was done

### Project refresh

- Removed the previous Java/Gradle application files
- Recreated the app as a Tauri + React + TypeScript project
- Added runtime version pinning for Node and Rust
- Added Playwright-based browser checks

### Frontend

- Replaced the default starter screen with a music library UI
- Added album search
- Added album and track display
- Added a scan form for desktop mode
- Kept mock data for web-only mode so UI work remains fast

### Rust backend

- Added `lofty` for metadata reading
- Added `rusqlite` with bundled SQLite
- Added recursive folder walking with `walkdir`
- Implemented scan logic for supported audio files
- Implemented SQLite schema creation
- Implemented album and track import flow
- Implemented snapshot loading for the frontend

### Validation

Checked and working:

- `npm run build`
- `cargo check`
- `npm run test:e2e`

## Current architecture

### Frontend responsibilities

- display library data
- search and selection
- scan initiation
- mock-mode fallback for browser-only work

### Rust responsibilities

- read local filesystem
- scan audio files
- read tags
- store library data in SQLite
- return snapshot data to the UI

## Current limitations

These are the main gaps in the current implementation:

1. Folder path must be typed manually
2. Album artwork is not yet extracted from tags
3. No actual audio playback yet
4. Tags are read-only for now
5. Each scan rebuilds the stored library instead of updating incrementally
6. Error reporting is still minimal

## Recommended next steps

### Phase 1: Make scanning easier

Priority: high

- add a native folder picker
- validate selected paths before scan
- show scan progress and summary more clearly
- preserve the last selected folder in the UI

### Phase 2: Improve library data quality

Priority: high

- extract embedded artwork
- store artwork cache paths in the database
- normalize album grouping rules
- improve handling for missing album, artist, and year fields

### Phase 3: Add playback

Priority: high

- choose a Rust-side playback approach
- add play, pause, next, previous
- keep player state in sync with the UI
- wire selected tracks to actual playback

### Phase 4: Add tag editing

Priority: medium

- add tag edit form in the UI
- update the Rust side to write tags back to files
- refresh the database after save
- handle write failures safely

### Phase 5: Improve library behavior

Priority: medium

- incremental rescan instead of full rebuild
- track file changes
- add deleted-file cleanup logic
- prepare for playlists and favorites

## Suggested immediate order

The next practical order is:

1. Add folder picker
2. Add artwork extraction
3. Add actual playback
4. Add tag editing
5. Improve incremental rescans

## Notes for future work

- Keep the web mode useful for layout and Playwright tests
- Keep filesystem and metadata logic on the Rust side
- Avoid pushing desktop-only behavior into browser-only flows
- Once playback is added, add E2E-safe UI checks around player state changes
