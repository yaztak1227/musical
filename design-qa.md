# Design QA — Playlist detail panel

## Evidence

- Problem/source capture: `/var/folders/r0/jzj3sbjn0rgc7kp9kbzpk3nh0000gn/T/codex-clipboard-3eaed130-9434-4973-9da3-081f0641c5b6.png`
- Iteration 1 full view: `/tmp/musical-playlist-mock-ja-full.png`
- Iteration 1 focused menu view: `/tmp/musical-playlist-mock-ja-panel-menu.png`
- Iteration 2 full view: `/tmp/musical-playlist-mock-ja-full-v2.png`
- Iteration 2 focused lower-row menu view: `/tmp/musical-playlist-mock-ja-panel-menu-up-v2.png`
- Viewport: 1180 × 760 logical pixels
- State: Crimson light theme, Japanese locale, library panel collapsed, selected nine-track playlist
- Implementation capture runtime: `VITE_MOCK_DATA=true`

The supplied source is evidence of the broken state rather than a desired pixel-perfect target. The comparison therefore checks whether the implementation preserves Musical's visual language while restoring track readability, hierarchy, and usable actions.

## Comparison history

### Iteration 1

- Widened the desktop detail column from 360px to 420px.
- Replaced the full-size artwork/header with an 84px artwork and compact metadata header.
- Gave each track a 64px row with a two-line title and separate artist/album metadata.
- Kept duration and lyrics directly visible; moved album jump, reorder, and remove into a three-dot disclosure.
- Reset panel scroll when changing playlists and display only the playlist filename instead of a wrapping full path.
- Independent reviewer: `blocked`.
- P2 findings:
  - A lower-row disclosure always opened downward and could collide with the fixed player/panel boundary.
  - `role="menu"` / `role="menuitem"` promised an APG menu keyboard model that the native disclosure did not implement.

### Iteration 2

- Measures the visible panel/viewport space whenever a disclosure opens and flips it above the anchor when the lower space is insufficient.
- Closes other track disclosures, closes on outside blur and Escape, and returns focus to the summary on Escape.
- Uses native disclosure/Tab semantics without `menu` or `menuitem` roles.
- Keeps the track number visible while its action disclosure has focus.
- Uses 44px lyrics/disclosure targets on mobile.
- Added Playwright coverage for lower-row upward collision handling and Escape closure.
- Fresh independent reviewer: `passed`; no P0, P1, P2, or P3 findings.

## Required fidelity surfaces

- Typography: passed in mock evidence. Track title, artist/album, and duration have a clear hierarchy and remain readable.
- Spacing and layout: passed in mock evidence. Header, 64px rows, fixed duration, and compact actions preserve scanning room at the source viewport.
- Colors and tokens: passed in mock evidence. Selection, destructive actions, borders, and controls remain consistent with the Crimson theme.
- Image quality: passed in mock evidence. Playlist artwork and icons remain sharp without mismatched assets.
- Copy and content: passed in Japanese mock evidence. Menu labels are concise and do not wrap at the tested width.
- Interaction: automated coverage passed for add, reorder, remove, album jump, upward menu collision handling, and Escape closure.

## Runtime verification blocker

The real workspace Tauri process was identified without starting another copy:

- PID: `80187`
- Bundle ID: `com.circularmoonray.musical.dev`
- Executable: `/Users/takumi/git/musical/src-tauri/target/codex-dev-apps/Musical Dev.app/Contents/MacOS/musical`
- Executable symlink target: `/Users/takumi/git/musical/src-tauri/target/debug/musical`
- Ports: Vite on 1420 and Musical/MCP host on 1422; no AI-test listener on 1430

Computer Use was targeted only by the verified development bundle ID. Every fresh state request returned `cgWindowNotFound`. Direct read-only `screencapture` attempts also failed to create an image from the verified window or display. No extra Musical process was launched, and the pre-existing launcher was not stopped.

The mock/WebKit-independent design review passes, but the project requires a fresh real-Tauri capture and comparison. That evidence is unavailable in this task.

final result: blocked

# Design QA — Aurora-style DNA Helix filament update

## Evidence

- Source visual truth: `/var/folders/r0/jzj3sbjn0rgc7kp9kbzpk3nh0000gn/T/codex-clipboard-178208a5-6bd5-435d-9713-4250289c8e72.png`
  - 1834×1272 Tauri Warp/Aurora-family capture supplied by the user.
  - Used as art-direction truth for fine luminous fibers, translucent mist, cool Rainbow continuity, and restrained white point. The vortex geometry itself is not a DNA layout target.
- Baseline DNA renderer: `/tmp/musical-design-qa/dna-before/helix-band-4.png`
  - 960×540, DPR 1, isolated WebGL renderer, one representative band pulse.
- Current representative implementation: `/tmp/musical-design-qa/dna-rainbow-iter2/dna-rainbow-latest.png`
  - 960×540, DPR 1, Rainbow, 40 frames of representative eight-band input.
- Current real-Tauri integration: `/tmp/musical-design-qa/dna-tauri-idle-after.png`
  - 1180×760, real `com.circularmoonray.musical.dev`, DNA Helix and Rainbow selected, overlay visible.
  - The library remained in artwork-access preparation, so this evidence is an unselected/idle state; active audio behavior is covered by the isolated renderer capture and automated band tests.
- Full comparison input: `/tmp/musical-design-qa/aurora-style-target-vs-dna-after.png`
- Focused fiber/color comparison input: `/tmp/musical-design-qa/aurora-style-target-vs-dna-after-focus.png`

## State normalization and limits

- The source is an active Warp/Aurora-family still while the target effect is DNA, so composition and geometry are intentionally different.
- The active DNA evidence matches a 16:9 960×540 renderer viewport; the real Tauri evidence verifies integration at 1180×760 but is idle and includes the player overlay.
- Pixel equality was not used across these state differences. The comparison gate covers the requested art direction: filament fineness, mist, color range, highlight behavior, and DNA readability.

## Comparison history

1. Baseline inspection found that each DNA backbone was perceived as one smooth neon rail, each history rung was a single uniform line, and the input palette was reduced to six shader stops.
2. The renderer was changed to six independently seeded hairs per backbone and three per rung. Low-frequency wander, fine flutter, per-band energy, and positive rise now affect individual fibers.
3. Palette sampling was expanded to the same eight stops used by Aurora. Each rung maps low-to-high frequency across the complete palette, while veil and atmosphere retain a shared spatial hue field.
4. Saturation-preserving highlight compression was added with RGB capped at 0.88 and alpha at 0.84. The revised active and real-Tauri captures above were then produced.
5. A fresh read-only reviewer compared the full and focused combined inputs plus all original-resolution evidence. It found no actionable P0, P1, or P2 mismatch.

## Findings

- P0: none.
- P1: none.
- P2: none.
- P3: at the highest active energy, a few central horizontal three-fiber rungs visually merge into a slightly thicker tube. Further separation would trade away DNA readability and is not acceptance-blocking.
- P3 test gap: the real-Tauri capture is idle, so live motion and peak exposure are verified by deterministic WebGL frames rather than a same-track Tauri video.

## Required fidelity surfaces

- Fonts and typography: no copy was changed. Existing Tauri overlay type remains legible, unclipped, and correctly layered; the canvas-only source has no comparable typography.
- Spacing and layout rhythm: the central primary helix and quieter side helices preserve hierarchy. In Tauri, the canvas fills the stage without colliding with the control dock or queue.
- Colors and visual tokens: green/teal, cyan, blue/lilac, magenta, and rose remain visibly separated through the mist and fibers. Highlights stay local rather than becoming a large white or gray surface.
- Image quality and asset fidelity: fine lines remain continuous at 960×540 without visible mask halos, compression artifacts, or obvious gradient banding. This is a procedural WebGL effect and introduces no substitute raster asset.
- Copy and content: no app-specific copy changed. The visible Japanese idle copy remains coherent and unobscured.
- Icons and visible state: DNA Helix and Rainbow selected states are visible in the real-Tauri capture.

## Verification

- Production frontend build passed.
- DNA source-contract, eight-band distinction, Rainbow gamut/white-point, and low-energy visibility tests passed.
- The Rainbow test requires at least six occupied hue bins, less than 0.1% near-white pixels, p99 luminance at or below 0.78, and alpha at or below 0.84.
- The shader compiled and rendered successfully in Chromium WebGL and in the real Tauri WebView.

final result: passed

---

# Design QA — Web Warp Hole bundle parity

## Evidence

- Pre-fix Web capture: `/var/folders/r0/jzj3sbjn0rgc7kp9kbzpk3nh0000gn/T/codex-clipboard-fcd1da15-ae8c-4b1f-b308-2eda1b9aa391.png`
- Visual source of truth, desired Tauri rendering: `/var/folders/r0/jzj3sbjn0rgc7kp9kbzpk3nh0000gn/T/codex-clipboard-178208a5-6bd5-435d-9713-4250289c8e72.png`
- Fresh implementation capture from the real Web backend URL: `/tmp/musical-design-qa/web-warp-after-live-dist-original.png`
- Fresh full browser capture: `/tmp/musical-design-qa/web-warp-after-live-dist-full.png`
- Full comparison input: `/tmp/musical-design-qa/tauri-target-vs-web-after-fix-full.png`
- Focused comparison input: `/tmp/musical-design-qa/tauri-target-vs-web-after-fix-focus.png`
- Pre-fix Web image: 1684 × 1004 pixels, sparse gray rail rendering.
- Desired Tauri image: 1834 × 1272 pixels, dense cyan/violet hair and mist rendering.
- Fresh Web state: `http://127.0.0.1:1422/`, 1512 × 694 visualizer stage, playing, Original palette, real remote analysis, track/queue overlay visible.

The target and fresh implementation do not share identical viewport, track, audio frame, or overlay visibility. Exact pixel comparison would therefore be false precision. The blocking product criterion is renderer parity: the Web view must load the current dense procedural hair, Aurora silk, veil, mist, aperture, and palette implementation rather than the obsolete sparse gray rail bundle.

## Root cause

- The Tauri WebView loaded the live Vite source from port 1420.
- The browser/LAN URL on port 1422 served `FRONTEND_DIST`, embedded by `include_dir!` when Cargo compiled the running executable.
- Before the fix, `GET /` on port 1422 returned `assets/index-DEamE-0r.js`, while the current workspace `dist/index.html` referenced `assets/index-BE4tqlPi.js`.
- A browser hard reload could not fix this: the server itself continued returning the older embedded bytes.
- This discrepancy was entirely in frontend asset delivery. `/api/track_analysis_bytes`, analysis packets, remote-player commands, and playback-clock synchronization were not the cause.

## Fix

- Debug builds now prefer the current workspace `dist` for non-API frontend requests and send `Cache-Control: no-store`.
- If the disk build is unavailable, debug builds fall back to the embedded bundle.
- Release builds remain self-contained and continue serving the embedded bundle.
- No `/api/*` route, analysis payload, transport, or synchronization code was changed.

## Runtime verification

- The existing `tauri dev` launcher rebuilt and restarted its owned app child without starting a second launcher.
- Port 1422 now returns the same `index-BE4tqlPi.js` reference as disk `dist/index.html`.
- The JavaScript served by port 1422 and `dist/assets/index-BE4tqlPi.js` have the same SHA-256: `27fe5c2771871adb82804fc3fc4eefe4cf33fad7df794f059211e09ec17ea60c`.
- HTML and JavaScript responses contain `Cache-Control: no-store`.
- The fresh real-Web capture visibly uses the dense hair field, translucent mist, dark aperture, and current Original palette. It no longer shows the pre-fix sparse gray parent rails.
- Browser console check after opening Player mode, selecting Warp Hole, and switching to Original reported no warnings or errors.
- `cargo test local_server::tests::serves_current_debug_frontend_files_without_caching`: passed.

## Fidelity surfaces

- Fonts and typography: the target is canvas-only while the fresh Web capture includes the normal track and queue overlay; typography is not part of the renderer-parity defect and remains the shared Player mode implementation.
- Spacing and layout: viewport and overlay state differ, but the visualizer fills the stage and keeps the aperture/spiral composition intact.
- Colors and tokens: the fresh Web Original palette restores cyan/blue/violet/magenta color transport instead of the pre-fix gray rails. Exact hue and exposure vary with the real audio frame and overlay vignette.
- Image quality: the current high-density procedural hairs and translucent veil are present. The old low-detail rail asset is absent.
- Copy and content: no app copy was changed; the visible title and queue are real dynamic content.

## Independent review

Fresh read-only review passed with no actionable P0, P1, or P2 renderer mismatch.

- The Web capture has changed from sparse thick gray rails to high-density procedural hair with a translucent teal/lavender Aurora and mist field.
- Colors include the intended teal left field, blue-white/lilac vortex hair, and magenta right field.
- The darker exposure and different vortex placement are attributable to non-comparable real-audio frames, viewport/crop, Player mode overlays, and vignette rather than an obsolete renderer.
- P3 residual gap: exact pixel calibration requires future captures at the same aspect ratio, audio frame, and overlay-free state. This does not block the frontend-bundle serving fix.

final result: passed

---

# Design QA — Aurora-like Warp Hole

## Evidence

- Visual target: `/tmp/musical-design-qa/aurora-rainbow-source.png`
- Real Tauri iteration 2: `/tmp/musical-design-qa/warp-rainbow-iteration-2.png`
- Real Tauri iteration 4: `/tmp/musical-design-qa/warp-rainbow-iteration-4-fresh.png`
- Latest browser/WebGL support capture: `/tmp/musical-design-qa/latest-browser/warp-rainbow-latest.png`
- Audio-role Rainbow support capture: `/tmp/musical-design-qa/audio-roles-browser/warp-rainbow-latest.png`
- Sustained role captures: `/tmp/musical-design-qa/audio-roles-sustained/warp-role-low.png`, `/tmp/musical-design-qa/audio-roles-sustained/warp-role-low-mid.png`, `/tmp/musical-design-qa/audio-roles-sustained/warp-role-mid-high.png`, `/tmp/musical-design-qa/audio-roles-sustained/warp-role-high.png`
- Iteration 2 comparisons: `/tmp/musical-design-qa/comparison-full-iteration-2.png`, `/tmp/musical-design-qa/comparison-focused-iteration-2.png`, `/tmp/musical-design-qa/comparison-closeup-iteration-2.png`
- Iteration 4 comparisons: `/tmp/musical-design-qa/aurora-vs-warp-iteration-4-full.png`, `/tmp/musical-design-qa/aurora-vs-warp-iteration-4-focus.png`, `/tmp/musical-design-qa/aurora-vs-warp-iteration-4-core.png`
- Real Tauri viewport/state: 1180 × 760 logical pixels, playing, Rainbow palette
- Latest support capture: 960 × 540 canvas on black, fixed synthetic 20-band input

The Aurora capture is the visual target. Browser/WebGL evidence is useful for shader structure, palette coverage, alpha, and white-point checks, but it does not replace the required final capture from the real workspace Tauri app.

## Root-cause audit

- Palette transport differed: Warp previously received the raw palette, ignored Original through `paletteDriven=false`, and used six shader stops while Aurora used the normalized eight-stop palette.
- Lighting transport differed: Aurora builds a broad translucent curtain and lets only narrow bright cores cross the bloom threshold. Warp's broad contribution was roughly an order of magnitude weaker, so isolated rails were the only visible bloom sources.
- Spatial structure differed: Aurora fills several continuous curtains with many filaments; Warp was dominated by a small number of separated parent spirals, rails, particles, spikes, and stars.
- Color addition differed: family-specific complementary colors overlapped at the vanishing point and desaturated into white/gray instead of preserving Aurora's local shared hue.
- Source-alpha and post-processing differed: Warp divided radiance by alpha and applied a hard final clamp, changing what bloom received and flattening saturated highlights.
- Sampling differed: repeated history sampling and many nested procedural evaluations raised the rendering cost without producing Aurora's dense continuous fibers.

## Iteration history

### Iteration 2 — independent review blocked

- P1: six-to-eight thick spiral arms still dominated instead of many independent fibers.
- P1: middle luminance and translucent veil coverage remained far below Aurora.
- P2: Rainbow colors occupied isolated regions separated by dark gaps.
- P2: periodic gates made thin lines look dotted or beaded.

### Iteration 4 — fresh independent review blocked

- Parent contours were weaker but still read as regular wireframe bands.
- The center and middle remained too dark, while green/cyan and magenta separated into large regions.
- Periodic dots and a mechanical center lobe remained visible.

### Current implementation

- Uses the same normalized eight-stop Aurora palette and visual profile for Original, Theme, Artwork, and Rainbow.
- Uses Aurora's Rainbow progression and a shared screen-space hue coordinate so overlapping families remain chromatic instead of whitening through complementary addition.
- Uses `RenderPass → UnrealBloomPass → OutputPass → chroma-aware highlight/alpha limiter`, DPR up to 1.2, source-radiance RGB without alpha division, Rainbow exposure 1.65, bloom threshold 0.34, strength 0.31, radius 0.62, and output alpha at most 0.84.
- Replaces fixed guide strands with a variable-density cell field. Only the nearest three cells are evaluated per fragment, while stable per-cell hashes provide independent frequency grouping, wander, drift, flutter, intensity, and long luminance variation.
- Uses derivative-aware widths, soft strand mist, edge fading, center attenuation, and per-strand start/end depth fades. The Aurora silk and low-strength parent veil/shoulder/halo remain active beneath the crisp hair field; legacy emitted rays, rings, particles, spikes, and stars are disabled.
- Fetches each of the five current and five older RGBA history texels once per fragment.
- Preserves the five strided groups for per-hair frequency placement while also summarizing blocks 1–4, 5–9, 10–15, and 16–20 into four separately smoothed energy/rise roles.
- Low energy changes aperture radius, tunnel twist, and depth speed; low-mid changes veil/mist/family width; mid-high changes long and fine hair wander; high adds short-period colored shimmer only along existing cores and halos.
- Positive history rise enters at the outer edge and travels inward with the existing 32-row texture. It does not create a global white flash, extra particles, or large hue jumps.

The latest support captures confirm numerous continuous subpixel-scale spiral hairs, broad eight-hue coverage, a dark aperture, no large pure-white surface, and no legacy particle/dot layer. After the critical reviewer identified that `auroraSilk` and `familyLight` had been accidentally zeroed, both were restored at controlled strength. The new capture shows translucent cyan/violet/magenta curtain bodies and halo beneath the sharp hairs instead of a pure wireframe. Per-strand depth fades, long-period density variation, softer silk peaks, and shared low-alpha atmospheric haze further reduce equal-length contours and hard family gaps. Sustained single-region captures show a deeper/tighter low response, a visibly broader low-mid mist response, and distinct mid-high/high image fingerprints; the latter two are principally differentiated by spatial hair displacement versus moving shimmer and therefore require motion evidence for a final perceptual judgment.

### Latest independent support review

- The previous implementation-level P0 was resolved: Aurora silk, veil, shoulder, halo, and a restrained parent core now contribute again.
- Rainbow coverage and white-point control were judged materially improved; no large white clipping is present.
- Remaining visual risks are P1/P2 rather than a known disabled-lighting defect: the spiral can still read as luminous rails rather than one continuous Aurora curtain, some family gaps remain geometric, and independent swaying cannot be judged from a single frame.
- Final result remains blocked because the latest image is browser/WebGL support evidence, not a same-state real-Tauri capture.

## Automated verification

- `npm run build`: passed.
- `PLAYWRIGHT_SKIP_WEB_SERVER=true npx playwright test tests/e2e/visualizer-webgl.spec.ts --project=chromium`: 7 passed, 1 skipped. The WebGL suite runs serially to avoid shared-GPU contention between full-screen composers.
- Rainbow regression requires at least six occupied hue bins, maximum alpha at most 0.84, luminance p99 at most 0.78, near-white pixels below 0.10%, and saturated pixels above 0.50%.
- Palette regression verifies that selected red and blue palettes immediately dominate their respective renders within the same alpha ceiling.
- Audio-role regression verifies that all 20 single-block pulses retain their five strided hair groups and that sustained low, low-mid, mid-high, and high inputs produce four distinct image fingerprints under the same alpha ceiling.

## Final real-Tauri verification blocker

The already-running real workspace development process was re-verified without launching another copy:

- Root launcher PID: `38622`
- Tauri process PID: `38990`
- Bundle ID: `com.circularmoonray.musical.dev`
- Executable: `/Users/takumi/git/musical/src-tauri/target/codex-dev-apps/Musical Dev.app/Contents/MacOS/musical`
- Executable symlink target: `/Users/takumi/git/musical/src-tauri/target/debug/musical`
- Ports: Vite on 1420, real local backend on 1422, no AI-test listener on 1430

The process and local backend remain alive. The 2026-08-11 preflight again returned `visibleWindowCount=[ NULL ]` for the exact verified LaunchServices entry. Computer Use was not invoked in this iteration because the required preflight found no existing window to target; prior exact-bundle attempts returned `cgWindowNotFound`. No installed copy, display-name target, AI-test launcher, or second Tauri launcher was used. Therefore a fresh latest real-Tauri capture, same-state comparison, and final independent pass/fail review are unavailable.

final result: blocked
