# Fire TV Display Protocol

## Purpose

This document defines the local protocol between the desktop app and Fire TV player UI. Fire TV owns media playback after the desktop app hands off streamable audio and session state.

## Transport

Primary transport:

```txt
WebSocket
```

Fallback candidates:

- SSE for one-way state updates.
- HTTP polling for minimal compatibility.

The protocol should not depend on Tauri APIs inside the TV UI.

## Session Lifecycle

```txt
created
  -> waiting_for_client
  -> connected
  -> active
  -> stale
  -> closed
```

Rules:

- A display session has a stable `sessionId`.
- Fire TV connects with `sessionId`.
- Desktop sends a full snapshot immediately after connection.
- Incremental updates may follow the snapshot.
- Player messages include streamable `audioUrl` values when Fire TV should play locally.
- If the WebSocket reconnects, desktop sends a fresh snapshot.
- Stale sessions are closed by policy, not by UI assumptions.

## Endpoint Shape

Initial candidate:

```txt
ws://{desktop-host}:{port}/tv/sessions/{sessionId}
```

Development browser route:

```txt
http://localhost:{port}/tv?sessionId={sessionId}
```

When Fire TV opens `/tv` from native Settings after a library selection, the
selected library is passed as a query parameter:

```txt
http://{desktop-host}:1422/tv?libraryId={libraryId}
```

The `/tv` route forwards `libraryId` to `/api/library_snapshot`. The local server
returns the current snapshot only when the id matches the active desktop
library.

## Library Selection

Fire TV native Settings reads the available TV libraries from the same desktop
base URL used for `/tv`:

```txt
GET http://{desktop-host}:1422/api/tv/libraries
```

Response shape:

```ts
type TvLibraryList = {
  libraries: TvLibrarySummary[];
};

type TvLibrarySummary = {
  id: string;
  name: string;
  path: string | null;
  albumCount: number;
  trackCount: number;
};
```

Selection policy:

- Fire TV persists the selected library id locally.
- A saved library is reused only when it still appears in the server response.
- If the saved library is missing, Fire TV keeps Settings visible and waits for
  an explicit user selection.
- The selected library is sent to `/tv` as `libraryId`.

## Message Envelope

```ts
type TvDisplayEnvelope = {
  id: string;
  sessionId: string;
  sentAt: string;
  message: TvDisplayMessage;
};
```

## Message Types

```ts
type TvDisplayMessage =
  | { type: "session_snapshot"; snapshot: TvSessionSnapshot }
  | { type: "session_ready"; sessionId: string }
  | { type: "player_state"; state: TvPlayerState }
  | { type: "lyrics_state"; state: TvLyricsState }
  | { type: "queue_state"; state: TvQueueState }
  | { type: "analysis_packet"; packet: TvAudioAnalysisPacket }
  | { type: "command_result"; result: TvCommandResult }
  | { type: "candidate_prompt"; prompt: TvCandidatePrompt }
  | { type: "session_closed"; reason: string };
```

## Snapshot

```ts
type TvSessionSnapshot = {
  player: TvPlayerState;
  lyrics?: TvLyricsState;
  queue?: TvQueueState;
  analysis?: TvAudioAnalysisPacket;
  activePrompt?: TvCandidatePrompt;
};
```

## Player State

```ts
type TvPlayerState = {
  trackId: string | null;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
  audioUrl?: string;
  isPlaying: boolean;
  durationSeconds: number;
  positionSeconds: number;
  updatedAt: string;
};
```

Clock policy:

- `positionSeconds` is valid at `updatedAt`.
- TV UI may estimate current position while playing.
- Fire TV is the source of truth for local play/pause/seek while it is the active playback target.
- Desktop remains the source of truth for library metadata, queue membership, artwork, lyrics, and stream URL refresh.

## Lyrics State

```ts
type TvLyricsState = {
  trackId: string;
  mode: "plain" | "synced";
  lines: Array<{
    id: string;
    text: string;
    startSeconds?: number;
    endSeconds?: number;
  }>;
  activeLineId?: string;
};
```

## Queue State

```ts
type TvQueueState = {
  currentTrackId: string | null;
  items: Array<{
    trackId: string;
    title: string;
    artist: string;
    album?: string;
    artworkUrl?: string;
    isCurrent: boolean;
  }>;
};
```

## Audio Analysis Packet

```ts
type TvAudioAnalysisPacket = {
  trackId: string;
  frameIntervalMs: number;
  frames: TvAudioAnalysisFrame[];
  isComplete?: boolean;
};

type TvAudioAnalysisFrame = {
  timeMs: number;
  bands: number[];
  peak?: number;
  rms?: number;
};
```

Performance rules:

- Fire TV does not create realtime FFT data from the WebView audio element.
- The app/local backend provides analysis data from the library audio analysis
  cache through `/api/track_analysis?compact=true` or an equivalent display
  message.
- Frame identity is the rounded `timeMs`; duplicate frames overwrite earlier
  frames with the same timestamp.
- Keep packets compact. The TV UI should request or receive a short window,
  normally around 1-4 seconds, instead of full-track analysis when possible.
- Cap visualizer rendering at 30fps by default.
- Drop late frames rather than queueing unbounded work.
- Reset the retained frame buffer on track change or seek jumps.

## Fire TV Native Diagnostics

The native Fire TV shell may send diagnostics to the WebView for debug display.
This is intentionally native-sourced so the value represents the Android app
process more closely than `performance.memory` inside the WebView.

```ts
type FireTvDiagnosticsEvent = CustomEvent<{
  memory?: FireTvMemoryInfo;
}>;

type FireTvMemoryInfo = {
  usedMb: number;
  totalMb: number;
  maxMb: number;
  availableMb?: number;
};
```

Transport:

```ts
window.dispatchEvent(
  new CustomEvent("musical-firetv-diagnostics", { detail })
);
```

Rules:

- Native updates should be low frequency, about every 2-5 seconds.
- The TV UI should show diagnostics only as a small, non-interactive overlay on
  Player.
- If diagnostics are unavailable, the TV UI keeps playback usable and may hide
  the memory strip.

## Command Result

```ts
type TvCommandResult = {
  id: string;
  status: "success" | "error" | "pending";
  title: string;
  detail?: string;
  createdAt: string;
};
```

## Candidate Prompt

```ts
type TvCandidatePrompt = {
  id: string;
  title: string;
  candidates: Array<{
    id: string;
    label: string;
    description?: string;
    shortcutNumber?: number;
  }>;
  expiresAt?: string;
};
```

TV UI returns selection with:

```ts
type TvDisplayClientMessage =
  | { type: "client_ready"; sessionId: string }
  | { type: "player_event"; event: TvPlayerEvent };
```

```ts
type TvPlayerEvent =
  | { type: "play"; trackId: string; positionSeconds: number }
  | { type: "pause"; trackId: string; positionSeconds: number }
  | { type: "seek"; trackId: string; positionSeconds: number }
  | { type: "ended"; trackId: string }
  | { type: "error"; trackId: string; message: string };
```

## Error Policy

- Unknown messages are ignored and logged.
- Invalid session id closes the socket.
- Stale snapshots are ignored if a newer snapshot was already applied.
- Client reconnect always requests a fresh snapshot.
