# Design QA — Color flow / カラーフロー

## Evidence

- Source visual truth: `/Users/takumi/.codex_lb/generated_images/019f8009-3e2b-7b13-bd0c-79efb5be4a4d/exec-5cd92a02-fe9b-477d-b134-8bdf1a841df3.png`
- Iteration 1 implementation: `/Users/takumi/.codex/visualizations/2026/07/26/019f9d57-038a-7c93-be15-b7d8ff7969de/color-flow-soft-resonance-iteration-1-stage.png`
- Iteration 1 comparison: `/Users/takumi/.codex/visualizations/2026/07/26/019f9d57-038a-7c93-be15-b7d8ff7969de/color-flow-soft-resonance-comparison-iteration-1.png`
- Iteration 2 Computer Use capture: `/Users/takumi/.codex/visualizations/2026/07/26/019f9d57-038a-7c93-be15-b7d8ff7969de/color-flow-soft-resonance-iteration-2-computer-use.png`
- Iteration 2 focused stage: `/Users/takumi/.codex/visualizations/2026/07/26/019f9d57-038a-7c93-be15-b7d8ff7969de/color-flow-soft-resonance-iteration-2-stage.png`
- Iteration 2 comparison: `/Users/takumi/.codex/visualizations/2026/07/26/019f9d57-038a-7c93-be15-b7d8ff7969de/color-flow-soft-resonance-comparison-iteration-2.png`
- Viewport: 1180 × 760 logical pixels.
- Runtime for iteration 2: real workspace Tauri backend, PID 12885 at capture time, bundle ID `com.circularmoonray.musical.dev`, exact Computer Use target, stopped at 0:00, Color flow, Rainbow, Player mode.

## Comparison history

### Iteration 1

- Changed ten dispersed surfaces into five frequency groups.
- Added broad outer halo, a more readable inner wash, and contact membranes.
- Independent reviewer result: FAIL.
- Blocking findings:
  - [P1] Ten visible pointed sub-shapes still read as one horizontal waveform band.
  - [P1] Contact membranes appeared as vertical bars and isolated light points.
  - [P2] Inner edges were too blurred to read as droplets.
  - [P2] Color distribution leaned too heavily toward green and cyan.

### Iteration 2

- Replaced paired sub-shapes with five actual droplet silhouettes.
- Reduced shape deformation, separated the five group colors, removed the membrane boundary stroke, and added a low-opacity group outline.
- Verified through Computer Use against the uniquely addressable real development process.
- Independent reviewer result: FAIL.
- Blocking findings:
  - [P1] Droplets were approximately 25–40% too small and too high, leaving the lower stage empty.
  - [P1] Contact areas read as overlap or point highlights instead of a short pearlescent shared membrane.
  - [P2] Some silhouettes remained angular.
  - [P2] Body colors and boundary light were too dark.
  - [P2] The captured locale was English while the source was Japanese.

### Iteration 3 implementation

- Increased resting droplet radius by approximately 25% and moved the composition downward.
- Increased curve points from 14 to 18 while reducing deformation amplitudes.
- Reduced inner blur, raised body and perimeter opacity, and changed contact light from radial points to softly blurred lens fills.
- Increased music responsiveness:
  - attack from 0.72 s to 0.16 s;
  - release from 1.25 s to 0.48 s;
  - nonlinear gain for low analysis energy;
  - audio-driven radius, aspect, and center-position motion with separate phases.
- `npm run build`, `cargo check`, and the macOS runner shell syntax check pass.
- Fresh real-Tauri visual and playing-state motion evidence is not available. During the required runner migration, the original Tauri launcher exited after a bad relative runner path. The path is corrected and no Musical process remains, but the repository rule permits at most one Tauri launcher per task, so a second launcher was not started.

## Required fidelity surfaces

- Fonts and typography: iteration 2 showed no blocking typography or clipping defect; dynamic content differed from the source.
- Spacing and layout: iteration 3 moves and enlarges the five droplets in response to the iteration 2 P1 finding, but requires a fresh capture.
- Colors and tokens: iteration 3 raises body and perimeter density while retaining the five-group gray-purple, green, blue, plum, and violet distribution.
- Image quality: point-like contact gradients were removed; the new blurred lens membranes require fresh visual confirmation.
- Copy and content: Japanese locale was successfully selected through Computer Use before the launcher ended; the next capture must retain that locale.
- Interaction and motion: code now responds substantially faster and more strongly to analysis energy, but playback motion has not been visually measured on the final implementation.
- Runtime identity: the development wrapper successfully exposed `com.circularmoonray.musical.dev` and Computer Use targeted it without launching an installed or bundled product copy. The final exec-style runner and its duplicate-process guard require one fresh launch validation.

## Remaining gate

1. In a new task, perform the full 1420/1422/1430 and process-parent preflight.
2. Start exactly one `npm run tauri dev`.
3. Verify the generated wrapper executable resolves to the current `target/debug/musical`, the bundle ID is `com.circularmoonray.musical.dev`, and only one Musical main process exists.
4. Use Computer Use only with `com.circularmoonray.musical.dev`.
5. Select Japanese, Color flow, and Rainbow; start playback.
6. Capture at least two frames 0.5–1.0 seconds apart and confirm visible frequency-driven shape change without large jumps.
7. Capture a fresh stopped-state comparison against the source.
8. Dispatch a fresh read-only reviewer; any actionable P0/P1/P2 remains blocking.

final result: blocked
