# Fire TV TV UI Design

## Purpose

The TV UI is a 10-foot local player surface for music playback. It should be readable from a sofa, navigable with a Fire TV remote, and lightweight enough for Fire TV Stick class hardware.

## Surfaces

MVP surfaces:

- Now Playing
- synced lyrics
- queue
- visualizer
- local transport controls
- local playback status

## Layout Principles

- Optimize for 16:9 television viewports.
- Keep primary information readable at distance.
- Use strong focus states for remote navigation.
- Avoid dense desktop-style controls.
- Avoid hover-only interactions.
- Keep motion calm and performance-aware.

## Now Playing

Core elements:

- Album artwork
- Track title
- Artist
- Album
- Playback progress
- Play / pause state
- Play / pause / seek / volume controls
- Optional next-track preview

Behavior:

- Update progress locally between authoritative player state messages.
- When an `audioUrl` is available, Fire TV plays the audio locally.
- Fall back to text-only layout if artwork is missing.
- Keep title and artist readable without overflowing the viewport.

## Lyrics

Modes:

- Plain lyrics
- Synced lyrics

Behavior:

- Active line should be visually clear.
- Nearby lines should remain readable.
- Long lines should wrap naturally.
- Scrolling should be smooth but not mandatory at 60fps.

## Queue

Core elements:

- Current track marker
- Upcoming track list
- Title, artist, optional artwork

Behavior:

- Focus can move through queue items.
- Current item remains easy to find.
- Queue can be hidden or minimized during lyrics-first views.

## Visualizer

Allowed MVP effects:

- Blurred artwork background.
- CSS animation.
- Canvas 2D waveform or bars.
- Lightweight particles.
- Gradient derived from artwork.

Avoid in MVP:

- Full 4K canvas rendering.
- Heavy WebGL shaders.
- Large particle counts.
- High-frequency realtime FFT in WebView.
- Always-on 60fps requirement.

## Performance Budget

- DOM UI may render at full TV resolution.
- Canvas / WebGL internal resolution should be capped at 1920x1080.
- Use 1280x720 for low-power mode.
- Default visualizer target is 30fps.
- Drop late analysis frames rather than queueing them.

Canvas sizing candidate:

```ts
const displayWidth = canvas.clientWidth;
const displayHeight = canvas.clientHeight;

const maxWidth = 1920;
const maxHeight = 1080;

const scale = Math.min(
  maxWidth / displayWidth,
  maxHeight / displayHeight,
  1
);

canvas.width = Math.floor(displayWidth * scale);
canvas.height = Math.floor(displayHeight * scale);

const ctx = canvas.getContext("2d");
ctx?.scale(scale, scale);
```

## Background Video Mode

Background video can replace realtime visualizer effects.

Recommended source:

- 1920x1080
- 30fps
- H.264 or H.265
- 3-8Mbps
- seamless loop

Policy:

- When rich background video is on, reduce or disable realtime Canvas / WebGL.
- Keep React DOM UI above video.
- Provide a low-power mode without background video.

## Local Playback

Fire TV is not a controller surface. It is a playback target.

Input:

- Select / Play-Pause toggles local playback.
- Left / Right moves focus across local player controls.
- Up / Down adjusts local volume.
- Media previous / next can seek or move queue position once queue handoff is implemented.

Desktop responsibilities:

- Choose content.
- Launch or update the Fire TV session.
- Provide playable audio URLs, artwork, lyrics, queue, and refreshed tokens if needed.

Fire TV responsibilities:

- Play audio.
- Maintain local play/pause/seek/volume.
- Report playback events back to desktop when the protocol is available.

## Command Result

Use short overlays for:

- successful launch
- connection failed
- device not found
- command pending
- command completed

The overlay should not permanently cover Now Playing.

## Remote Key Mapping

Initial mapping:

```txt
Up / Down
  -> move focus

Left / Right
  -> move focused player control

Select
  -> activate focused player control

Back
  -> close overlay or return to Now Playing

Play / Pause
  -> toggle local Fire TV playback
```

## Implementation Targets

Candidate files:

```txt
src/features/tv-display/presentation/TvDisplayApp.tsx
src/features/tv-display/presentation/NowPlayingView.tsx
src/features/tv-display/presentation/LyricsView.tsx
src/features/tv-display/presentation/QueueView.tsx
src/features/tv-display/presentation/VisualizerView.tsx
src/features/tv-display/presentation/CandidatePromptOverlay.tsx
src/features/tv-display/presentation/useTvRemoteNavigation.ts
```

## MVP Completion

- TV UI renders in a browser route.
- Now Playing updates from mock or local WebSocket state.
- Lyrics, queue, visualizer, and candidate prompt have usable first implementations.
- Keyboard navigation approximates Fire TV remote navigation.
- 16:9 desktop and TV-like viewport checks pass without text overlap.
