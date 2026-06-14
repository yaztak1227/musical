# Fire TV Display Architecture

## Purpose

The Fire TV feature runs a television-first player surface:

- Now Playing
- synced lyrics
- queue
- visualizer
- local playback controls
- audio playback on Fire TV

This feature is not screen mirroring, and Fire TV should not be treated as a passive controller. The desktop app selects and hands off playable media/session state; Fire TV owns playback once the session starts.

## Decision

Use a Fire TV player client instead of embedding a Miracast transmitter.

Miracast sender support requires Wi-Fi Direct, RTSP, RTP, audio/video encoding, pairing, HDCP, UIBC, network switching, and latency control. That is too heavy for this app and does not match the product goal.

The preferred shape is:

```txt
Tauri Desktop App
  -> DIAL discovery / launch
  -> local HTTP / WebSocket/media server
  -> library, queue, lyrics, artwork, and stream publisher

Fire TV App
  -> Android/Kotlin WebView wrapper
  -> native tab shell and settings
  -> React TV UI
  -> local audio player
  -> remote key adapter for TV-local playback
```

## Responsibilities

### Tauri Desktop App

- Owns music library and session preparation.
- Starts and maintains local display sessions.
- Publishes TV player messages over WebSocket.
- Provides streamable audio URLs to Fire TV.
- Discovers and launches Fire TV apps with DIAL.
- Maintains the Device Registry.
- Resolves fuzzy device names and references.
- Dispatches voice commands to select content and launch/handoff playback sessions.

### Fire TV App

- Provides a thin Android/Kotlin shell.
- Owns the native top tab bar and Settings surface.
- Discovers reachable Musical desktop servers on the local network.
- Displays selectable libraries returned by the selected server.
- Persists the selected display URL and selected library.
- Hosts the React TV UI in WebView.
- Receives launch parameters such as host URL and session id.
- Bridges Fire TV remote key input into the TV UI.
- Plays audio locally through WebView media APIs.
- Owns play/pause/seek/volume while a Fire TV session is active.
- Handles WebView lifecycle, reconnect, and visible error states.

### React TV UI

- Renders TV-first Now Playing, lyrics, queue, visualizer, and candidate prompts.
- Connects to the local WebSocket display server.
- Maintains local focus state and remote-key playback navigation.
- Uses `<audio>` for local playback when the session provides an `audioUrl`.
- Avoids Tauri, Android, and Cloud dependencies.

### Cloud Command API

- Receives Alexa Skill commands.
- Authenticates the user.
- Queues commands for the desktop agent.
- Stores cloud-side command history when required.

Cloud is not responsible for LAN discovery, local playback, or final fuzzy resolution when the desktop agent has better context.

## Launch And Connect Sequence

```txt
Desktop app creates display session
  -> Desktop app discovers Fire TV with DIAL
  -> Desktop app launches Fire TV app
  -> Launch includes host URL and session id
  -> Fire TV WebView opens React TV UI
  -> TV UI connects to local WebSocket
  -> Desktop sends session snapshot
  -> Desktop streams player, lyrics, queue, visualizer, and audio URL messages
  -> Fire TV plays audio locally
```

## Fire TV Direct Launch And Library Selection

The Fire TV app also supports direct launch without a desktop-initiated DIAL
handoff. In that mode the Android shell discovers the desktop server and lets
the user select a library before opening `/tv`.

```txt
Fire TV app starts
  -> Read saved display URL and selected library
  -> Validate saved server through /api/app_status
  -> If unavailable, scan local IPv4 subnets for Musical servers
  -> Build one or more discovered server candidates
  -> For each reachable server, derive {baseUrl}/tv
  -> Fetch available libraries from {baseUrl}/api/tv/libraries
  -> Show candidates in the Settings tab
  -> User selects a library
  -> Persist selected URL and library id
  -> Load /tv?libraryId={libraryId}
  -> Switch to Player tab
```

The existing discovery code can continue to open the first reachable server for
the initial MVP, but the internal model should allow multiple server candidates.

Android-side model:

```txt
DiscoveredServer
  baseUrl: String
  tvUrl: String
  reachable: Boolean
  fallback: Boolean
  libraries: List<RemoteLibrary>
  libraryError: String?

RemoteLibrary
  id: String
  name: String
  path: String?
  albumCount: Int
  trackCount: Int
```

Discovery responsibilities should be split into small units:

- collect local IPv4 addresses
- generate subnet candidates
- check Musical server reachability
- generate `/tv` URLs
- fetch library lists
- apply results to native UI state

`loadDisplayUrl()` remains the single WebView loading entry point. Library
selection should produce the next `/tv` URL and call
`loadDisplayUrl(nextUrl, remember = true)`.

## MVP Boundaries

In scope:

- Browser-runnable TV UI.
- Local WebSocket display protocol.
- Now Playing synchronization.
- Fire TV local audio playback from provided stream URLs.
- Basic lyrics, queue, and visualizer surfaces.
- Fire TV WebView wrapper design and path.
- Native Fire TV tab bar.
- Native Settings tab for server discovery and library selection.
- Device Registry data model.
- Candidate prompt model.

Out of scope for the first MVP:

- Full Alexa Skill production implementation.
- Local embedding search.
- Heavy WebGL visualizer.
- Miracast transmitter integration.
- Multi-room audio playback.

## Future Extension Points

- DIAL launch fallback to manual pairing.
- SSE or polling fallback when WebSocket is unavailable.
- Local semantic search for device and memory events.
- Cloud command sync for out-of-home scenarios.
- OS-level wireless display as a separate optional feature.
