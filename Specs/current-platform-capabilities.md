# Current Platform Capabilities

This document records the current Musical behavior by runtime so future design
changes can be checked for regressions. It describes the implemented product
surface, not aspirational roadmap items.

## Scope

Platforms covered:

- Desktop app: Tauri runtime on Windows, macOS, and Linux.
- Browser app: the React/Vite app opened in a normal browser.
- Fire TV app: Android/Kotlin Fire TV shell hosting the `/tv` React display.

Primary implementation references:

- Desktop/browser shell: `src/app/AppShell.tsx`, `src/app/hooks/useAppController.ts`
- Backend runtime detection: `src/lib/backend.ts`
- Local desktop HTTP server: `src-tauri/src/local_server.rs`
- Library backend: `src-tauri/src/library.rs`
- TV display route: `src/features/tv-display/presentation/TvDisplayApp.tsx`
- Fire TV shell: `apps/firetv/app/src/main/java/app/musical/firetv/MainActivity.kt`
- Fire TV discovery/settings: `apps/firetv/app/src/main/java/app/musical/firetv/FireTvDiscoveryRepository.kt`,
  `apps/firetv/app/src/main/java/app/musical/firetv/FireTvSettingsPanel.kt`

## Shared Product Model

The app organizes music into:

- Albums, each with title, album artist, year, genre, artwork, and tracks.
- Tracks, each with title, artist, duration, track/disc number, file path,
  lyrics presence, favorite state, and optional rating.
- Playlists, each with name, artwork, ordered track paths, missing-track
  reporting, and resolved tracks.

Supported library audio extensions are currently:

- `aac`, `aif`, `aiff`, `alac`, `ape`, `flac`, `m4a`, `m4b`, `mka`, `mp3`,
  `mp4`, `oga`, `ogg`, `opus`, `wav`, `wma`

The common playback model includes:

- Current track.
- Playback album or playlist context.
- Queue track IDs.
- Play/pause state.
- Shuffle state.
- Repeat mode: `off`, `all`, or `one`.
- Current time and volume.

## Desktop App

### What It Can Do

Library:

- Choose a local music folder through the native Tauri folder picker.
- Scan the folder recursively and store the indexed library in a local SQLite
  database under the library's `.musical` data area.
- Reload the last scanned library on startup.
- Emit and display scan/load progress while discovering files, reading tags,
  writing database rows, and preparing artwork access.
- Read embedded metadata, duration, lyrics presence, and artwork.
- Cache/expose artwork from the scanned library for display.

Browsing and selection:

- Browse albums as large icons, small icons, album table, track table, and
  playlist view.
- Search albums, artists, years, playlists, track titles, track artists, and
  file paths depending on the active view.
- Sort albums by title, artist, or year in ascending or descending order.
- Filter library views to albums/tracks that have lyrics.
- Select an album without changing the current playback queue.
- Select a track title without changing playback.
- Open track detail from desktop click/context interactions and mobile-style
  long press in narrow layouts.
- Use a narrow responsive layout where the album panel can collapse and expand
  with vertical swipes.

Playback:

- Play an album from card, table row, or selected album controls.
- Play an individual track and build a queue from its album context.
- Play a playlist in its stored order.
- Play/pause, previous, next, seek, mute, volume, shuffle, and repeat.
- Restart the current track when pressing previous after more than 3 seconds of
  playback.
- Continue after track end according to repeat/shuffle rules.
- Display a queue popover from the player.
- Open Player mode with artwork, visualizer, lyrics panel, queue controls, and
  transport controls.
- Use the browser Media Session API for playback metadata and play/pause/stop
  actions when available.
- Load real audio only in Tauri runtime via Tauri file asset conversion.

Desktop playback buttons and controls:

- Album card center play button:
  - Plays the album from its first queued track.
  - Does not select the album when the button itself is activated.
  - Changes to pause while the same album is the active playback album and the
    player is playing.
- Album card body:
  - Selects the album.
  - Must not start playback.
- Album table row play button:
  - Plays or pauses that album.
  - Must mirror the bottom player state for the active album.
- Track row/title button in the selected album panel:
  - Selects the track for detail context.
  - Must not change the current playback track.
- Track hover play button:
  - Starts that track and rebuilds the queue from its album context.
- Player bar play/pause button:
  - If there is no current track and an album is selected, starts the selected
    album.
  - Otherwise toggles `isPlaying` for the current track.
- Previous button:
  - If current playback time is greater than 3 seconds, seeks to `0`.
  - Otherwise moves to the previous queue item, wrapping to the last item.
- Next button:
  - Moves according to queue/repeat rules.
  - If repeat rules produce no next track, stops playback and seeks to `0`.
- Seek control:
  - Updates the audio element position through the player bar.
  - Clears the current audio-analysis packet so the visualizer cannot continue
    using stale frames after a jump.
- Volume and mute controls:
  - Update only the player bar/audio element in desktop mode.
  - In browser-backend mode, send remote commands to the desktop player.
- Shuffle button:
  - Rebuilds queue order around the current track.
  - Sends a remote command with the next `queueTrackIds` when acting as a remote
    browser.
- Repeat button:
  - Cycles `off -> all -> one -> off`.
- Queue toggle:
  - Shows the queue popover on hover.
  - Pins/unpins the queue popover on click.
- Player mode button:
  - Opens the full-screen `PlayerVisualizerOverlay`.
  - Keeps the underlying current track, queue, play/pause state, and player bar
    state.

Desktop Player mode buttons and tabs:

- Close button:
  - Closes the visualizer overlay; Escape also closes it.
- Chibi mode button:
  - Toggles character rendering in the visualizer.
  - Persists to `localStorage` key `musical.visualizerChibiMode`.
- Visualizer mode buttons:
  - `Wave` draws a wave visualization.
  - `Spectrum` draws bar/spectrum visualization and is the default mode.
  - `Circle` draws circular visualization.
  - The selected mode updates immediately without changing playback.
- Player mode transport:
  - Previous, play/pause, and next call the same playback handlers as the player
    bar.
  - Buttons are disabled when no current track exists.
- Player mode queue:
  - Lists the current queue in order.
  - Current track is marked current.
  - Play button on the current row toggles playback; play button on another row
    switches to that queued track.
- Player mode lyrics panel:
  - Appears only when loaded lyrics for the current track are non-empty.
  - Lyrics are loaded when Player mode opens and whenever the current track
    changes while Player mode remains open.

Desktop visualizer rendering:

- The overlay always creates a canvas.
- If playback is not live, the canvas draws an idle state:
  - Idle wave for Wave mode.
  - Idle circle for Circle mode.
  - Idle spectrum for Spectrum mode.
  - If Chibi mode is enabled, the relevant character scene is drawn with zeroed
    frequency values instead of the plain idle scene.
- If playback is live, animation runs through `requestAnimationFrame`.
- A visualizer is considered live only when `isPlaying` is true and at least one
  of these is true:
  - Web Audio analyser is available.
  - Remote/offline analysis is preferred for the runtime.
  - An audio-analysis packet already has frames.
- In current desktop and browser-backend usage, remote/offline analysis is
  preferred, so the canvas uses cached/decoded analysis frames rather than
  sampling the live `<audio>` element.
- If a remote/offline analysis frame is available, the renderer interpolates
  between frame timecodes around the estimated playback time.
- If no remote/offline frame is available and Web Audio is available, the
  renderer samples `AnalyserNode.getByteFrequencyData`.
- Frequency data is smoothed, dynamically expanded, and then drawn in the active
  visualizer mode.

Music-analysis timing:

- Analysis frame interval is 33 ms.
- Analysis bucket count is 256.
- Backend FFT size is 512.
- Backend analyser range is `-88 dB` to `-18 dB` with smoothing constant `0.58`.
- Frontend remote-analysis requests use chunks of 30 seconds.
- Requested analysis duration is `max(15 minutes, track duration + 2 seconds)`.
- Frontend retains at most 5 completed analysis packets in memory.
- When `currentTrack` changes:
  - Playback error is cleared.
  - Player position is reset.
  - The HTML audio source is replaced in Tauri runtime.
  - The current analysis packet is cleared immediately.
- When `isPlaying` changes to true with a current track in Tauri or
  browser-backend runtime:
  - `loadTrackAnalysis(currentTrack)` runs.
  - If a completed packet for that track is already cached in memory, it is
    reused and rebased to the current playback time.
  - If the same track is already loading, no duplicate frontend load is started.
  - Otherwise the track is requested in 30-second chunks from
    `/api/track_analysis`.
  - After every returned chunk, a partial packet is written to
    `audioAnalysisPacketRef`, allowing the visualizer to start moving before the
    whole track request is finished.
  - Only a completed packet is stored in the in-memory packet cache.
- When `isPlaying` changes to false, or when there is no current track:
  - `audioAnalysisPacketRef` is cleared.
  - The active analysis load state is cleared.
  - The loaded analysis track marker is cleared.
  - The completed packet cache is cleared.
  - This means pause/stop intentionally removes the cached visualizer packet
    from frontend memory.
- While Tauri desktop playback is active:
  - The current track analysis cache is warmed best-effort.
  - The next queue item after the current track is warmed best-effort.
  - Warmup is skipped when there is no current track, playback is stopped, or the
    track is already warming.
  - Warmup errors are ignored so playback continues.
- Backend `/api/track_analysis` behavior:
  - Reads `trackId`, `from`, `duration`, optional `totalDuration`, and optional
    `compact`.
  - Clamps `duration` to 0.25 seconds through 4 hours.
  - Clamps `totalDuration` to at least `duration` and at most 4 hours.
  - If a complete cache entry exists for the requested file/version/duration, it
    returns cached frames and marks `isComplete: true`.
  - If no complete cache exists, it decodes/analyzes from the start for the
    requested total duration, saves the result, and returns `isComplete: true`
    from that request path.
  - Concurrent analysis requests for the same track are deduplicated through
    `active_track_analysis_loads`; later requests wait for the first to finish
    and then read the cache.
  - After serving a track analysis request, the backend attempts to prefetch the
    next track based on the published desktop `player_state.queueTrackIds`.
- Backend next-track prefetch:
  - Runs only when `player_state` exists and the requested/analyzed track has a
    following track in that queue.
  - Uses track duration + 2 seconds.
  - Deduplicates active prefetches with `active_track_analysis_prefetches`.
  - Logs and skips errors without failing the original analysis request.
- Mock web mode:
  - When playing, creates a mock analysis packet for the current track.
  - When stopped or no current track exists, clears the mock analysis packet.
- Browser-backend remote mode:
  - Syncs playback state from `/api/player_state` every 250 ms.
  - Uses the remote playback clock to estimate current time while playing.
  - Cancels/ignores analysis loads when the remote clock changes to another
    track.
- Player mode transition requirement:
  - Opening Player mode while a track is already playing must either reuse an
    existing analysis packet or trigger/continue current-track analysis so the
    visualizer starts moving.
  - Moving to the next track must clear stale frames, start loading the new
    track, and best-effort warm the next queue item.
  - Pausing/stopping must show idle visualizer motion only, not stale frequency
    movement from the previous play state.

Tagging and metadata:

- Edit album title, album artist, track artist across the album, year, and genre.
- Edit track title, artist, album title, year, genre, track number, and disc
  number.
- Validate required album title and track title before saving.
- Persist tag changes to the audio files through the Rust backend.
- Report partial album-tag save failures when some files cannot be written.
- Update track artwork from a native image file picker.
- Browse MusicBrainz / Cover Art Archive artwork candidates inside the Tauri
  main window, preview a selected candidate, and save it as album artwork across
  the album's tracks.
- Open Google Images in the default browser as a helper path without scraping
  Google Images results inside the app.
- Update playlist artwork from a native image file picker.
- Mark a track favorite/not favorite.
- Set or clear a track rating.
- Load and display saved track lyrics.

Playlists:

- Create an empty playlist.
- Create a playlist from the selected album.
- Rename and delete playlists.
- Add one track or all tracks from an album to a playlist.
- Prevent duplicate playlist additions in the UI.
- Remove playlist tracks.
- Reorder playlist tracks up/down.
- Jump from a playlist track back to its source album.
- Display missing playlist tracks and allow reload after files are restored.

Localization and preferences:

- Switch between Japanese and English in the main UI.
- Persist locale, theme, sidebar state, library menu state, and playback
  preferences in local storage.
- Select themes: crimson, ocean, violet, forest, amber, mono.

Updates and local services:

- Check for and install app updates through the Tauri updater when supported.
- Toggle LAN access to the local HTTP server.
- In dev mode, optionally publish a public dev tunnel when the dev tunnel API is
  available.
- Show QR codes for LAN/public control URLs.
- Toggle the local MCP endpoint. The `/mcp` endpoint is local-only and returns
  404 when disabled.

Remote browser control:

- Publish player state to the local desktop HTTP server.
- Poll remote browser commands and apply them to the desktop player.
- Serve library snapshots, lyrics, media files, audio analysis segments, player
  state, and command queues over `/api/*`.
- Serve media files with HTTP byte-range support for stream clients.
- Deny non-local HTTP access unless LAN access is explicitly enabled.

TV/Fire TV support:

- Serve `/tv` and static frontend assets from the local server.
- Expose `/api/tv/libraries` for the currently scanned library.
- Accept `libraryId` on `/api/library_snapshot` and reject mismatched library IDs.
- Provide `/api/media`, `/api/track_lyrics`, `/api/track_analysis`, and
  `/api/track_analysis_bytes` to TV clients.
- Accept `/tv/sessions/{sessionId}` WebSocket connections and send an initial
  `session_ready` plus `session_snapshot`.
- Record TV player events from HTTP or WebSocket clients.
- Maintain in-memory display device registration and fuzzy resolution APIs.
- Queue Fire TV launch and voice-command requests as player commands.

### Desktop Constraints

- Real scanning, file playback, tag writes, artwork writes, update checks, folder
  pickers, and playlist persistence require Tauri.
- Artwork candidate search, candidate image downloads, and album-wide artwork
  writes are Tauri main-window-only and are not exposed through the local HTTP
  server.
- Remote HTTP state, queued player commands, display devices, and TV player
  events are in-memory for the current app process.
- Non-local HTTP clients receive `403 remote access is private` until LAN access
  is enabled.
- LAN access requires a discoverable LAN IPv4 address.
- MCP settings and `/mcp` are local-only.
- Public tunnel support is development-only and depends on the dev server
  exposing `/api/public-dev-tunnel`.
- The WebSocket TV session currently sends an initial snapshot; ongoing TV state
  sync is limited and the TV route also polls HTTP endpoints.
- Fire TV/DIAL launch and voice command endpoints currently enqueue commands and
  record state, but do not represent a complete production Alexa/DIAL flow.

## Browser App

The browser app has two current operating modes.

### Mock Web Mode

Run with:

```bash
VITE_MOCK_DATA=true npm run dev -- --host 127.0.0.1 --port 1423
```

What it can do:

- Render the full main UI against bundled mock albums.
- Browse, search, sort, filter lyrics, select albums/tracks, open track detail,
  switch language, and switch theme.
- Exercise playback state in the UI without loading real local audio files.
- Exercise Player mode and animated mock audio analysis.
- Create, rename, delete, reorder, and play mock playlists in memory.
- Simulate tag, favorite/rating, and non-artwork playlist changes in memory.
- Run Playwright UI regression tests.

Constraints:

- It does not scan local folders.
- It does not persist a real library database.
- It does not play real local files.
- It does not write audio tags or artwork.
- Native folder/image pickers are unavailable.
- Update checks are reported as desktop-only.
- Mock playlist and mock tag changes are not durable beyond the browser session
  unless local storage happens to preserve UI preferences.

Mock browser controls and visualizer:

- The main tabs and buttons behave like the desktop UI where no native capability
  is needed.
- Player bar play/pause, previous, next, shuffle, repeat, queue popover, and
  Player mode update React playback state only.
- Opening Player mode while mock playback is active creates a mock analysis
  packet for the current track and renders animated visualizer movement.
- Mock analysis is generated once per current track/play state change from
  `getMockAudioAnalysisSegment(currentTrack.id, 0, duration)`.
- Mock analysis duration uses the same frontend rule as desktop remote analysis:
  `max(15 minutes, track duration + 2 seconds)`.
- Stopping playback or clearing the current track clears the mock packet.
- Desktop-only buttons:
  - Folder picker is disabled.
  - Artwork picker reports desktop-only.
  - Update check reports desktop-only.
  - Mock tag/playlist changes may update screen state but are not real file
    writes.

### Browser Backend Mode

Run the desktop local server first, then open the served app from the desktop
server, normally `http://127.0.0.1:1422/` locally or the LAN URL after enabling
LAN access.

What it can do:

- Load the real library snapshot through HTTP.
- Browse the same albums/playlists exposed by the desktop app.
- Request lyrics, artwork/media URLs, and audio-analysis data through the local
  server.
- Send remote player commands to the desktop app instead of playing locally:
  play, pause, previous, next, seek, volume, mute, shuffle, repeat, play album,
  play track, select album, select track, and refresh library.
- Sync display state from `/api/player_state` and command queues.
- Act as a remote control from another device when LAN access is enabled.

Constraints:

- The browser backend runtime is a remote/control surface, not the owner of
  local desktop playback.
- It cannot use Tauri native dialogs.
- Artwork selection is desktop-only.
- Real audio loading in the main app is guarded by Tauri runtime checks, so the
  browser main route should not be treated as a standalone local-file player.
- Remote access must be explicitly enabled for non-local clients.
- Network clients can only reach files and APIs made available by the desktop
  local server.

Browser backend buttons and timing:

- Main playback buttons send `/api/player_command` messages instead of mutating
  local audio playback directly.
- The browser polls `/api/player_state` every 250 ms and applies the desktop
  player's current track, queue, play state, shuffle, repeat, time, and volume.
- The browser polls `/api/player_commands` every 1000 ms for library refresh
  commands.
- Current-time display and visualizer timing are estimated from the remote
  playback clock between state polls.
- If the remote player changes to another track while an analysis request is in
  progress, the stale response is ignored.
- Seek, next, previous, play, pause, volume, mute, shuffle, repeat, play-album,
  and play-track must remain command-based in this mode.

## Fire TV App

### What It Can Do

Native shell:

- Launch as an Android/Fire TV app.
- Host the React `/tv` route in a WebView.
- Enable JavaScript, DOM storage, no-cache loading, mixed-content compatibility,
  and media playback without a user gesture.
- Disable Android WebView automatic darkening so the TV player surface keeps its
  app-defined colors.
- Display a native top tab shell with Player, Albums, Tracks, and Settings.
- Show a splash overlay while the WebView is starting.
- Show a status message for loading, discovery, errors, and shutdown.
- Confirm exit; on confirmed exit, ask the WebView player to shut down and then
  destroy the WebView surface.
- Send native memory diagnostics to the WebView every 3 seconds.
- Persist display URL, selected library ID, and selected locale in Android shared
  preferences.

Discovery and settings:

- Accept an explicit `display_url` intent extra or a `musical-firetv://display`
  deep link URL.
- Validate a saved server through `/api/app_status`.
- Discover Musical desktop servers on local IPv4 subnets by probing port `1422`.
- Fetch libraries from `/api/tv/libraries`.
- Show detected servers, TV URLs, reachability, fallback state, libraries, and
  selected library in native Settings.
- Select a library and load `/tv?libraryId={id}`.
- Reuse a saved library only if the server still reports it.
- Rescan servers from Settings.
- Switch Fire TV UI locale between English and Japanese and forward it to the
  WebView.

Remote control bridge:

- Map Fire TV DPAD keys to `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`,
  and `Enter`.
- Map media keys to play/pause, play, pause, next, and previous.
- Map number keys `0` to `9` for candidate prompts.
- Send selected native tab changes to the WebView.
- Use Back first to leave WebView focus, then to switch tabs or exit from Player.

React TV route:

- Load `/api/library_snapshot`, optionally with `libraryId`, on start and every
  15 seconds.
- Render albums and playlists as TV collections.
- Sort TV collections by title, artist, or year and toggle direction.
- Navigate TV collections, tracks, player controls, side-panel tabs, queue, and
  prompts with remote/keyboard events.
- Show Now Playing with artwork backdrop, title, artist, album, progress,
  previous/next hints, and transport controls.
- Keep the TV player readable on WebView engines without
  `color-mix(in oklch, ...)` by using explicit fallback colors for the player
  shell, panels, progress, buttons, selected/focused states, and errors.
- Play audio locally through the WebView `<audio>` element using
  `/api/media?path=...`.
- Seek back/forward 15 seconds from TV controls.
- Play albums, tracks, queue items, previous track, and next track locally inside
  the TV UI.
- Show a Player side panel with queue and lyrics tabs.
- Disable lyrics tab when the current track has no lyrics.
- Fetch lyrics for the current track from `/api/track_lyrics`.
- Fetch compact audio-analysis frames from `/api/track_analysis_bytes` or JSON
  analysis from `/api/track_analysis` and render the Fire TV visualizer.
- Connect to `/tv/sessions/{sessionId}` when `sessionId` is present and apply
  session, player, lyrics, queue, analysis, command result, candidate prompt,
  and close messages.
- Record TV player events to `/api/tv/player_event`.
- Show command result and native memory diagnostics overlays when present.

Fire TV native tabs:

- Native tab order is Settings, Albums, Tracks, Player.
- Settings has no WebView surface; it shows the native settings panel.
- Albums sends `musical-firetv-tab` with `tab: "albums"` to the WebView.
- Tracks sends `musical-firetv-tab` with `tab: "tracks"` to the WebView.
- Player sends `musical-firetv-tab` with `tab: "player"` to the WebView.
- Left/right on the native tab bar moves focus between tabs.
- Enter on a focused tab selects it.
- Back from a WebView surface returns focus to the native tab bar.
- Back from Settings content returns focus to the tab bar.
- Back from a non-Player tab selects Player.
- Back from Player opens the exit confirmation.

Fire TV Player tab buttons and panels:

- Rewind button seeks back 15 seconds.
- Center play/pause button plays or pauses the WebView audio element.
- Forward button seeks forward 15 seconds.
- Previous adjacent-track button plays the previous track in the selected
  collection, wrapping around.
- Next adjacent-track button plays the next track in the selected collection,
  wrapping around.
- Queue side-panel tab shows up to 3 visible queue rows.
- Lyrics side-panel tab is disabled when the current track has no lyric lines.
- Selecting a queue row plays the matching track when it exists in the selected
  collection; otherwise a `queue_select` TV client event is sent.
- The memory strip shows native Android process memory when diagnostics are
  available.

Fire TV Albums tab buttons:

- Collection tabs switch between Albums and Playlists.
- Album/playlist rail shows 4 columns by 2 rows, up to 8 visible collection
  items.
- Selecting a collection starts playback at track index 0.
- Sort rail supports title, artist, and year.
- Selecting the active sort mode toggles ascending/descending direction.
- Switching sort preserves selected/focused collection by collection ID when
  possible.

Fire TV Tracks tab buttons:

- Tracks tab lists up to 7 visible tracks from the selected collection.
- Selecting a row starts that track and sets pending autoplay.
- Tracks with lyrics show the lyrics indicator.

Fire TV focus and remote navigation:

- Focus zones are controls, collection tabs, albums, album sort, tracks,
  side-panel tabs, side panel, and prompt.
- Arrow keys move within or between zones according to the active tab.
- Enter activates the focused item.
- MediaPlayPause toggles playback.
- MediaPlay starts playback.
- MediaPause pauses playback.
- MediaTrackPrevious and MediaTrackNext move to adjacent tracks.
- Number keys choose candidate-prompt items by shortcut number.

Fire TV audio and analysis timing:

- The WebView owns audio through a local `<audio preload="metadata">` element.
- `loadedmetadata` updates duration from the audio element.
- `timeupdate` updates current time from the audio element.
- `ended` reports a TV player event and moves to the next adjacent track.
- `error` stops playback, shows audio error, and reports a TV player event.
- When the current track changes:
  - Current time resets to `0`.
  - Duration resets to the track duration.
  - Analysis frames are cleared.
  - Lyrics are fetched for the new track.
  - Analysis loading restarts for the new track.
- Analysis fetch for the current track:
  - Runs immediately on track selection/change.
  - Repeats every 2 seconds while the track remains current.
  - Requests a 4-second window from `max(0, currentTime - 0.5)`.
  - Sends `totalDuration` as current audio duration, track duration, or `1`.
  - Tries `/api/track_analysis_bytes?compact=true` first.
  - Falls back to `/api/track_analysis?compact=true` if bytes loading fails.
  - Aborts the in-flight request when the track changes or the component effect
    is cleaned up.
  - Prevents overlapping analysis loads with an `isLoadingAnalysis` guard.
  - Merges new frames into the retained frame window around the current time.
  - On fetch failure, retains only the current visible analysis window.
- Fire TV visualizer rendering:
  - Draws at a target maximum of 30 fps.
  - Caps canvas size to 1280 x 720 and device scale no higher than 1.
  - Renders 32 bars.
  - Chooses the nearest analysis frame to playback time.
  - Ignores frames more than 900 ms away from playback time and decays the bars
    instead.
  - While playing, playback time is estimated from the last received current time
    plus elapsed wall-clock time.
  - While paused, playback time stays fixed at the last received current time.
  - If there are no frames and playback is stopped, the canvas is cleared.

### Fire TV Constraints

- Fire TV depends on a reachable desktop local server for real libraries, media,
  lyrics, artwork, and audio analysis.
- Fire TV discovery currently targets local IPv4 subnet candidates on port
  `1422`; it does not discover arbitrary ports unless an explicit URL is passed.
- If no server is discovered, Fire TV falls back to `BuildConfig.DEFAULT_TV_URL`
  and opens Settings.
- Fire TV plays audio in the WebView; it is not screen mirroring.
- Fire TV owns local play/pause/seek while playing inside the WebView, but the
  desktop remains the source for library metadata and media stream URLs.
- The current `/tv` direct-library flow polls HTTP; WebSocket support exists for
  initial session snapshots but is not the only source of TV state.
- Fire TV does not edit tags, artwork, ratings, favorites, playlists, or library
  scan settings.
- Fire TV does not scan folders or persist the desktop library.
- Fire TV locale choices are currently English and Japanese only.
- Fire TV Settings strings are native Android resources and are not part of the
  React locale XML files.
- Fire TV WebView playback depends on Android WebView codec/support behavior for
  the streamed file type.

## Regression Checklist For Design Changes

Use this checklist when changing architecture, navigation, layout, playback, or
platform integration. A change should not be considered non-regressing unless the
app still satisfies the relevant platform items below.

### Desktop Main UI

- App starts in Tauri runtime and loads the last scanned library or shows the
  no-library state.
- Library Settings can choose a folder only in Tauri and can scan by typed path.
- Scan progress and load progress remain visible and localized.
- Album large/small/list/track-list/playlist views still render and preserve
  search, sort, lyrics filter, and album selection behavior.
- Selecting an album does not change the playing track or queue.
- Selecting a track title does not change playback; using a track play action
  does.
- Album card center play and table-row play remain playback actions.
- Player controls remain reachable: play/pause, previous, next, seek, volume,
  mute, shuffle, repeat, queue popover, Player mode.
- Playback state is mirrored between album controls and the player bar.
- Player mode visualizer renders nonblank animated content and lyrics/queue
  panels remain usable.
- Opening Player mode during playback starts or continues current-track analysis
  and the canvas begins moving before the full-track analysis is necessarily
  complete.
- Opening Player mode while paused shows idle visualization and does not display
  stale moving bars from the last play state.
- Pressing play after pause reloads/reuses analysis for the current track.
- Pressing pause clears the frontend analysis packet/cache and returns the
  visualizer to idle behavior.
- Pressing next clears stale current-track frames, resets player position, starts
  analysis for the new current track, and warms the next queue item.
- Pressing previous after more than 3 seconds seeks to 0 and clears the current
  analysis packet.
- Pressing previous at the start of a track switches tracks and starts analysis
  for the new current track.
- Seeking clears stale analysis packets and the next analysis load/rebase matches
  the new playback time.
- Current-track analysis requests must not duplicate while the same track is
  already loading.
- Partial analysis chunks must be visible to the visualizer before complete
  analysis is cached.
- Narrow layout remains flush to the viewport and the album panel can collapse
  and expand.
- Track detail opens from desktop interaction and mobile long press.
- Album tag, track tag, favorite/rating, track artwork, and playlist artwork
  save paths still update the UI and notify remote clients.
- Playlist create, add, duplicate prevention, play, rename, reorder, remove,
  jump-to-album, reload, and delete still work.
- Locale switch between English and Japanese still updates visible UI.
- Theme and playback preferences still restore from local storage.
- Media Session play/pause/stop handlers continue to sync with the UI.

### Desktop Local Server And Remote Browser

- `/api/app_status` returns the ready marker.
- `/api/local-dev-access` is local-only for writes and returns LAN URL details
  when enabled.
- Non-local requests are rejected while LAN access is disabled.
- `/api/library_snapshot` returns the current snapshot and respects `libraryId`.
- `/api/tv/libraries` returns the current library summary or an empty list when
  no library is scanned.
- `/api/media` serves files with `Accept-Ranges` and honors valid Range requests.
- `/api/track_lyrics`, `/api/track_analysis`, and `/api/track_analysis_bytes`
  work for known track IDs.
- `/api/track_analysis` returns frames with 33 ms interval and 256 buckets.
- Concurrent `/api/track_analysis` requests for the same track are deduplicated.
- After a track analysis request, backend next-track prefetch uses the published
  queue state and does not fail the original request.
- `/api/player_state`, `/api/player_command`, and `/api/player_commands` still
  synchronize remote browser controls with the desktop player.
- Browser backend mode sends commands instead of trying to own real local
  playback.
- Browser backend mode ignores stale analysis responses when the remote desktop
  player has already moved to another track.
- `/mcp` remains local-only and disabled unless MCP is enabled.

### Mock Browser Mode

- `VITE_MOCK_DATA=true npm run dev -- --host 127.0.0.1 --port 1423` starts the
  mock app.
- Mock albums render with 13 albums in English E2E fixtures.
- Mock playback, queue, Player mode visualizer, lyrics filter, language switch,
  playlists, and responsive layout tests still pass.
- Mock Player mode creates mock analysis only while playing and clears it while
  stopped.
- Desktop-only actions remain clearly disabled or reported as desktop-only.

### Fire TV Native Shell

- Fire TV accepts explicit intent/deep-link display URLs.
- Saved display URLs are validated before reuse.
- Local subnet discovery finds a reachable desktop server on port `1422`.
- Settings shows detected servers, libraries, selected library, language, and
  rescan action.
- Selecting a library persists it and loads `/tv?libraryId={id}`.
- A missing saved library is cleared instead of silently using a stale ID.
- Native tabs switch WebView surfaces and Settings reliably.
- DPAD, Enter, media keys, number keys, and Back behavior remain mapped to the
  expected WebView events or shell navigation.
- Exit confirmation shuts down and destroys the player surface.
- Memory diagnostics are forwarded to the WebView at low frequency.

### Fire TV React TV Route

- `/tv?tab=albums` can render albums/playlists from `/api/library_snapshot`.
- Playlist collections appear under the Albums surface and can be played.
- Player tab shows Now Playing, transport controls, progress, next/previous
  hints, queue, and lyrics side panel.
- Tracks tab lists the selected collection's tracks and allows playback.
- TV focus navigation does not strand the user in controls, tabs, albums,
  tracks, side-panel tabs, side panel, or prompts.
- TV playback uses `/api/media?path=...` and local WebView audio.
- Lyrics load from `/api/track_lyrics` and the lyrics tab is disabled when no
  lyrics exist.
- Visualizer data loads from compact bytes or JSON analysis endpoints and
  remains bounded for Fire TV performance.
- Fire TV clears frames on track change and requests a fresh 4-second analysis
  window immediately.
- Fire TV repeats analysis-window requests every 2 seconds for the current track.
- Fire TV visualizer continues to animate at up to 30 fps while playing when
  frames exist near the current playback time.
- Fire TV visualizer decays/clears instead of showing stale frames when frames
  are missing, too old, or playback is stopped.
- Fire TV ended event moves to the next adjacent track and starts the new track's
  lyrics/analysis load cycle.
- `sessionId` WebSocket connections still receive and apply the initial session
  messages.
- TV player events continue to be recorded through `/api/tv/player_event`.

## Suggested Verification Commands

Desktop/browser build:

```bash
npm run build
```

Mock browser regression:

```bash
npm run test:e2e
```

Desktop manual run against the real Tauri/local backend:

```bash
npm run tauri dev
```

Mock browser manual run:

```bash
VITE_MOCK_DATA=true npm run dev -- --host 127.0.0.1 --port 1423
```

Fire TV unit tests:

```bash
cd apps/firetv
gradle :app:testDebugUnitTest
```

Fire TV debug APK:

```bash
cd apps/firetv
gradle :app:assembleDebug
```
