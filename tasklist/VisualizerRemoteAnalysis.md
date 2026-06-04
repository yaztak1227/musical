# Visualizer / Remote Analysis Notes

## Current Status

- Browser-side visualizer rendering was moved away from frequent React state updates and now uses refs plus canvas rendering.
- The visualizer overlay is lazy-loaded from `src/App.tsx`.
- Audio analysis is no longer tied to opening the app-side visualizer overlay.
- The attempted second hidden audio / ahead-of-playback analysis pipeline was removed because it was unstable when the Tauri WebView moved to the background.
- Remote browser visualization now uses analysis packets generated from the main playback audio only.
- Remote analysis packets are sent every 500ms and contain roughly 1 second of 50ms analysis frames.
- Each analysis frame includes a rounded 50ms timecode.
- Browser-side packet merging uses the timecode as the frame identity, so duplicate frames naturally overwrite instead of requiring packet-level duplicate checks.
- The browser keeps a short retained analysis buffer and renders by interpolating between timecoded frames.
- Canvas rendering was lightened for browser remote display:
  - capped remote canvas scale
  - reduced draw counts
  - avoided heavier compositing for remote mode
  - retained `requestAnimationFrame` rendering frequency

## Investigation History

### 1. Memory growth and React update pressure

Initial symptom:

- while music was playing, the `http://localhost:1420/` process kept growing in memory
- browser-side visualizer updates looked choppy

What was tried:

- moved visualizer analysis data out of React state and into refs
- avoided feeding visualizer frame data through props/state updates
- lazy-loaded the visualizer overlay
- reduced canvas allocation churn by reusing typed arrays and avoiding per-frame layout reads

Result:

- this reduced obvious React render/update pressure
- it did not fully solve remote browser smoothness because remote data delivery and rendering timing were still separate problems

### 2. Canvas rendering cost

Initial symptom:

- browser CPU usage became very high
- the browser visualizer looked heavy even when update frequency was kept high

What was tried:

- removed particle-style visual effects from the visualizer
- reduced bar/radial draw counts
- capped canvas pixel ratio for remote rendering
- avoided expensive blend/composite modes for remote display
- kept `requestAnimationFrame` instead of lowering draw frequency

Result:

- CPU cost was reduced while preserving frame-rate-oriented rendering
- rendering still appeared to pulse or stall when the incoming analysis packet timing was not stable

### 3. One-second packets at one-second frequency

Initial idea:

- analyze about 1 second of audio
- send that 1-second packet to the browser
- let the browser display the packet over 1 second

What was tried:

- Tauri side generated a packet of 20 frames at 50ms intervals
- browser side interpolated between packet frames using `requestAnimationFrame`

What went wrong:

- when packets arrived only once per second, any slight delivery delay caused the browser to reach the end of the packet and visually stick
- re-receiving the same packet could reset the browser-side playback phase, making the visualizer look like it paused or jumped

Result:

- the idea was directionally useful, but 1-second send cadence was too brittle

### 4. Send every 500ms, include 1 second of data

Adjustment:

- keep 1 second of frame data
- send a packet every 500ms
- make packets overlap so the browser has more continuity

What was tried:

- kept a rolling 20-frame buffer
- emitted the latest 1 second every 500ms

Result:

- this made data delivery more tolerant of timing jitter
- however, packet-level duplicate checks were still too coarse

### 5. Timecode-based frame identity

Observation:

- duplicate checks should not be packet-based
- each frame should be identified by its audio timecode

What was tried:

- rounded analysis frame timecodes to 50ms ticks
- added `audioAnalysisFrameTimecodes`
- merged browser-side frames by `Map<tick, frame>`
- retained only a short analysis buffer

Result:

- duplicate frame data became naturally idempotent
- this was a good protocol change and is still kept

What still went wrong:

- display clock handling could still drift or reset independently from the timecoded data
- an attempted guard against clock resets was too aggressive and caused the visualizer to disappear in some states

### 6. Second hidden audio element for ahead-of-playback analysis

Initial idea:

- create a second hidden audio element
- keep it about 1 second ahead of the real playback
- analyze that second audio element and send future analysis data to the browser

What was tried:

- added a hidden `<audio>` element
- synced it to `mainAudio.currentTime + 1s`
- sampled its analyser into remote packets
- tried to handle play, pause, seek, OS media controls, and remote commands

What went wrong:

- the second audio element was initially audible unless its Web Audio graph was muted
- muting the media element itself could make analyser data unusable in some browser/WebView behavior
- connecting `source -> analyser` without a destination could fail to advance analysis in some environments
- connecting through `GainNode(0)` fixed audibility but did not solve all lifecycle issues
- when the Tauri app was backgrounded or visually covered, the hidden audio element could stop or throttle
- the browser visualizer could break right when switching focus to the browser, because the producer side in Tauri had changed behavior

Result:

- the second audio approach introduced too many moving parts and was reverted

### 7. Fallback from second audio to main audio

What was tried:

- detect whether the hidden ahead-of-playback audio was advancing
- if it was not advancing, fall back to analysing the main playback audio

What went wrong:

- this reduced one failure mode but made the implementation harder to reason about
- the system now had two possible analysis clocks and two analyser sources
- the added complexity made bugs around timing and packet interpretation more likely

Result:

- this was also rejected
- the code was simplified back to a single playback audio analysis source

## Important Decision

The second audio element approach was reverted.

The hidden/audio-ahead pipeline had too many environment-dependent failure modes:

- hidden media could stop or throttle when the Tauri app was backgrounded
- muted media could produce unusable analyser data in some browser/WebView behavior
- keeping a second audio element synced across seek, pause, resume, and OS media controls added fragile complexity

The current design is intentionally simpler:

- one playback audio element
- one analyser attached to that audio element
- remote analysis packets derived from the same source as local playback

## Changed Areas

- `src/App.tsx`
  - owns the remote analysis packet ref
  - samples main playback audio every 50ms while playing
  - publishes 1-second analysis packets every 500ms
  - includes `audioAnalysisFrameTimecodes` in remote player state
  - merges remote packets by 50ms timecode on the browser side

- `src/components/PlayerVisualizerOverlay.tsx`
  - renders local analyser data or remote analysis packets
  - interpolates remote frames using frame timecodes
  - uses lighter canvas settings for remote browser rendering

- `src/lib/audioAnalysis.ts`
  - provides the single playback-audio analyser helper
  - keeps analyser sampling buffers reusable

- `src/lib/backend.ts`
  - adds remote analysis packet fields to `RemotePlayerState`

- `src-tauri/src/local_server.rs`
  - mirrors the remote analysis packet fields in the local server state

## Verification Done

- `npm run build` passes.
- `cargo check` passes.

## Follow-up Notes

- If browser visualization still stutters when the Tauri app is backgrounded, the remaining likely cause is timer/WebView throttling on the Tauri side.
- A more robust future direction would be Rust-side audio analysis from the playback pipeline, but that should be treated as a separate design task rather than reviving the hidden second audio element.
