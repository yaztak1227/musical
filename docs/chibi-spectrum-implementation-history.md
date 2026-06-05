# Chibi Character Spectrum Implementation History

This note records the implementation history of the chibi character spectrum feature. It is intentionally detailed because the feature was designed from a mostly blank slate during the session: visual concept, sprite generation, pose rules, audio-reactive behavior, fatigue behavior, asset organization, and configuration were all shaped together.

This file lives under `docs/` because the feature includes generated asset prompts, implementation decisions, tuning values, and historical context that should remain easy to find after the session.

## Current Files

- Main implementation: `src/components/PlayerVisualizerOverlay.tsx`
- Tunable constants: `src/config/appConfig.ts`
- Active generated sprites: `src/assets/generated/chibi_sprites/by_character/`
- Archived unused generated assets: `unused_assets/chibi_sprites_2026-06-06/`
- Archive explanation: `unused_assets/chibi_sprites_2026-06-06/Agents.md`
- Ignore rule: `.gitignore` includes `unused_assets/`

## Feature Summary

When the visualizer is opened and chibi mode is enabled, the spectrum view places eight chibi characters below the spectrum bars. The spectrum is split horizontally into eight bands, one band per character.

Each character has four active poses:

- `raised`: standing with the hammer raised or ready.
- `swing`: hammer held in a ready/swinging state while that band has audible activity.
- `impact`: hammer hit pose with an energetic effect.
- `collapsed`: tired "もうだめだー" pose used after too much repeated hitting.

The chibi mode toggle is persisted in `localStorage` with the key `musical.visualizerChibiMode`, so reopening the visualizer restores the previous ON/OFF state.

## Original Visual Direction

The initial request was to create transparent PNG chibi character sprites for an app/game UI:

- Cute Japanese chibi mascot style.
- Polished cel-shaded illustration.
- Rounded proportions.
- Crisp silhouette.
- Expressive face.
- Readable at small icon size.
- Full-body character.
- No cropping.
- Generous padding.
- Centered composition.
- No text or watermark.
- No gore, damage, injury, or scary violence.
- Transparent background if possible.
- If transparency was not supported, use flat `#00ff00` chroma key only.

The requested characters were:

1. Star idol chibi girl
   - White and gold idol dress with navy accents.
   - Star hair clip.
   - Short fluffy skirt.
   - Small boots.
   - Star-shaped toy hammer, glossy gold and white, stage-prop style.
2. Cat-ear hoodie chibi boy
   - Lavender cat-ear hoodie.
   - Cream shorts.
   - Striped socks.
   - Playful casual style.
   - Soft paw-shaped hammer, lavender and cream, like a cute plush hammer.
3. Seaside sailor explorer chibi girl
   - Light blue sailor-collar explorer outfit.
   - White beret.
   - Small ribbon.
   - Tan satchel.
   - Anchor-shaped hammer, small nautical mallet with blue-and-white details.
4. Festival kimono chibi boy
   - Red and indigo summer yukata-style festival outfit.
   - Obi sash.
   - Short haori.
   - Fox mask on side of head.
   - Wooden festival mallet, like a cute miniature shrine/festival hammer.
5. Pastel magic apprentice chibi girl
   - Pastel pink and lavender witch dress.
   - Crescent moon hair ornament.
   - Tiny cape.
   - Star buttons.
   - Magic wand-mace, a cute oversized star/moon-tipped wand that works like a hammer.
6. Space pilot chibi boy
   - White and orange tiny space pilot suit.
   - Navy gloves and boots.
   - Star patch.
   - Sci-fi wrench hammer, chunky futuristic tool-hammer with orange accents.
7. Pastry chef chibi girl
   - Cream and strawberry-pink patissier dress.
   - Small chef hat.
   - Apron with heart buttons.
   - Rolling-pin hammer or whisk-mallet, bakery themed, cute and harmless.
8. Marching band chibi boy
   - Crimson and white marching band uniform.
   - Gold buttons.
   - Small pillbox hat.
   - White gloves.
   - Giant drum mallet, marching-band themed, red and gold details.

The first pose set was:

1. Hammer raised overhead, preparing to strike.
2. Hammer swinging downward.
3. Hammer impact / powerful hit pose with strong action feeling.

The direction then changed in an important way: the characters should face away from the viewer. The reason was layout-driven. The chibi characters sit below the spectrum, and the hammer motion should visually push upward into the spectrum bars. So the final intended pose logic became:

1. Back-facing chibi character holding the hammer up in the right hand.
2. Back-facing chibi character swinging the hammer upward/toward the spectrum.
3. Back-facing hit pose at the top, with impact effects.

This makes the moment of impact feel like it causes the spectrum bar above the character to extend.

## Sprite Generation Prompt

The useful generation prompt evolved into a shared base plus character-specific outfit and weapon details. The key instruction was consistency across poses: same character design, same outfit, same weapon, same proportions, and same back-facing camera direction.

Base prompt template:

```text
Create a transparent PNG game UI sprite of a cute Japanese chibi mascot character.

Style:
Polished cel-shaded illustration, rounded chibi proportions, crisp silhouette,
expressive but simple small-icon-readable design, clean full-body sprite,
generous transparent padding, centered composition.

Camera / orientation:
Back-facing character, seen mostly from behind, with a slight three-quarter angle
only if needed to keep the pose readable. The character is placed below a game
spectrum bar and is hitting upward, so the hammer action must point upward.

Pose:
{POSE_DESCRIPTION}

Background:
Transparent background. No floor, no shadow, no gradient, no scenery, no texture.

Rules:
Full body, no cropping, no text, no watermark, no gore, no injury, no scary violence.
Keep the same character design, outfit, colors, hair, accessories, and weapon
across all poses for this character.
```

Pose descriptions:

```text
raised:
The character faces away and holds the hammer raised in the right hand,
preparing to strike upward. Body is energetic but readable, with stable footing.

swing:
The character faces away and swings the hammer upward toward the top of the image.
Use a clear arc, motion smear, or dynamic body twist, but keep the silhouette clean.

impact:
The character faces away and lands a powerful upward hit at the top of the image.
Add cute game-like impact effects such as star sparks, comic burst, motion lines,
or a small bright hit flash near the hammer head. No damage or injury.
```

Character-specific prompt details:

```text
Star idol chibi girl:
White and gold idol dress with navy accents, star hair clip, short fluffy skirt,
small boots. Weapon is a glossy gold and white star-shaped toy hammer,
stage-prop style.

Cat-ear hoodie chibi boy:
Lavender cat-ear hoodie, cream shorts, striped socks, playful casual style.
Weapon is a soft paw-shaped hammer in lavender and cream, like a cute plush hammer.

Seaside sailor explorer chibi girl:
Light blue sailor-collar explorer outfit, white beret, small ribbon, tan satchel.
Weapon is an anchor-shaped hammer, a small nautical mallet with blue-and-white details.

Festival kimono chibi boy:
Red and indigo summer yukata-style festival outfit, obi sash, short haori,
fox mask on the side of the head. Weapon is a wooden festival mallet,
like a cute miniature shrine/festival hammer.

Pastel magic apprentice chibi girl:
Pastel pink and lavender witch dress, crescent moon hair ornament, tiny cape,
star buttons. Weapon is a magic wand-mace, an oversized star/moon-tipped wand
that works like a hammer.

Space pilot chibi boy:
White and orange tiny space pilot suit, navy gloves and boots, star patch.
Weapon is a sci-fi wrench hammer, chunky futuristic tool-hammer with orange accents.

Pastry chef chibi girl:
Cream and strawberry-pink patissier dress, small chef hat,
apron with heart buttons. Weapon is a rolling-pin hammer or whisk-mallet,
bakery themed, cute and harmless.

Marching band chibi boy:
Crimson and white marching band uniform, gold buttons, small pillbox hat,
white gloves. Weapon is a giant drum mallet with red and gold details.
```

## Collapsed Sprite Prompt History

The collapsed pose went through several design corrections.

The first idea was "lying on the back" because the user wanted to see the character's face. The intended trigger at that point was: if the character had been in `raised` for more than 20 seconds, show a collapsed image for 5 seconds.

This was later corrected conceptually. The character should not look idle or forgotten. It should look exhausted from hitting too much. The user described it as:

- "疲れた感じ"
- "もうだめだー"
- Cute, not scary.
- Visible face.
- Character differences should remain clear.
- Avoid every character having the same face and same body.
- X-shaped eyes or dizzy marks were acceptable, but the expression still needed to be cute.

Useful collapsed prompt template:

```text
Create a transparent PNG game UI sprite of the same cute Japanese chibi mascot.

Pose:
The character has collapsed from overwork in a cute "もうだめだー" exhausted pose.
Show the face clearly. The character is lying on their back or tilted backward
so the expression is readable. Use a cute tired expression such as X eyes,
spiral/dizzy eyes, wavy mouth, tiny sweat drop, or soft exhausted blush.
Keep it charming and harmless, not injured, not scary, not sad in a dark way.

Character consistency:
Keep the same outfit, accessories, colors, hair, and weapon theme as the hammer
sprites. Preserve the character-specific silhouette and personality; do not use
the same body pose for every character.

Background:
Transparent background. No floor, no shadow, no gradient, no scenery.

Rules:
Full body, no cropping, generous padding, centered composition, no text,
no watermark, no gore, no injury.
```

The implementation ultimately treats `collapsed` as the result of fatigue from repeated `impact` events, not as an idle timeout.

## Asset Organization

The active sprite files are organized by character:

```text
src/assets/generated/chibi_sprites/by_character/
  chibi-star-idol/
    raised.png
    swing.png
    impact.png
    collapsed.png
  chibi-cat-hoodie-boy/
    raised.png
    swing.png
    impact.png
    collapsed.png
  chibi-sailor-explorer-girl/
    raised.png
    swing.png
    impact.png
    collapsed.png
  chibi-festival-kimono-boy/
    raised.png
    swing.png
    impact.png
    collapsed.png
  chibi-magic-apprentice-girl/
    raised.png
    swing.png
    impact.png
    collapsed.png
  chibi-space-pilot-boy/
    raised.png
    swing.png
    impact.png
    collapsed.png
  chibi-pastry-chef-girl/
    raised.png
    swing.png
    impact.png
    collapsed.png
  chibi-marching-band-boy/
    raised.png
    swing.png
    impact.png
    collapsed.png
```

Unused root-level duplicate exports and preview sheets were moved to:

```text
unused_assets/chibi_sprites_2026-06-06/
```

That folder has its own `Agents.md` explaining why the files are there and where they originally came from. The entire `unused_assets/` folder is ignored by Git.

## UI Integration History

The visualizer already had three modes:

- Wave
- Spectrum
- Circle

A chibi mode toggle was added to the visualizer control dock. It uses the `Sparkles` icon and the locale key `player.chibiMode`. Per repository instruction, UI copy changes were made only in:

- `src/locales/en.xml`
- `src/locales/ja.xml`

When chibi mode is enabled:

- Wave mode shows a surfing puchi-style character riding the waveform.
- Circle mode shows small chibi characters arranged around the circle visualizer.
- Spectrum mode shows the new hammer chibi characters below the spectrum.

The spectrum chibi behavior became the most developed part of the feature.

## Spectrum Layout

The spectrum uses `spectrumBarCount = 48`. The chibi spectrum has eight characters, so each character owns six bars:

```text
48 bars / 8 characters = 6 bars per character
```

For each character:

- The character index maps to one eighth of the frequency data.
- The sprite is positioned under the center of its six-bar group.
- The spectrum baseline is moved upward when chibi mode is active so there is room for the sprites.
- Sprite size is clamped so the characters remain readable but do not dominate the visualizer.

The core draw path is:

```text
drawSpectrum()
  -> draw spectrum bars
  -> if chibi images exist:
       drawChibiSpectrumCharacters()
         -> getChibiSpectrumBandStats()
         -> getChibiSpectrumAnimatedPose()
         -> drawChibiSpectrumPose()
```

## Audio Band Stats

Each chibi character receives stats for its frequency band:

- `average`: average normalized gain for the band.
- `peak`: highest normalized value in the band.
- `texture`: a combined value using peak and variance.

Current texture formula:

```ts
texture: peak * 0.68 + Math.sqrt(variance) * 0.32
```

Why texture exists:

Average rise alone works well for obvious build-ups, but it can miss music that stays loud while still having internal rhythmic movement. The texture value gives the impact detector another music-linked signal without using a timer that would hit off-beat.

## Pose Decision History

The early idea was based on absolute average:

- 10% to 50% of the upper range: `swing`
- Greater than 50%: `impact`

This changed after observing the animation. If a band stayed below 10%, characters looked too idle, especially in low-frequency or quiet bands where there was still sound. The swing threshold was changed to start at 1%.

Then the impact logic changed again. Absolute average made the hit pose feel too tied to loudness rather than musical change. The goal became:

- If band average is at least 1%, show `swing`.
- Show `impact` when the band has a meaningful music-linked increase.
- Avoid impacts that happen purely on a fixed timer, because that would not feel connected to the song.

The current impact trigger uses either:

- average rise over the smoothed previous average, or
- texture rise over the smoothed previous texture.

This preserves the "hit with the music" feeling, while allowing sections that stay loud but remain rhythmically active to continue producing hits.

Current logic:

```ts
if (normalizedAverage < chibiSpectrumConfig.swingThreshold) {
  return "raised";
}

if (
  time - lastImpactAt >= chibiSpectrumConfig.impactCooldownMs &&
  (rise >= chibiSpectrumConfig.impactRiseThreshold ||
   textureRise >= chibiSpectrumConfig.textureRiseThreshold)
) {
  return "impact";
}

return "swing";
```

## Current Tunable Config

The chibi spectrum behavior was moved into `src/config/appConfig.ts` so it can be adjusted without digging through the component:

```ts
export const chibiSpectrumConfig = {
  collapsedDurationMs: 2_600,
  fatigueHp: 15,
  fatigueRecoveryPerSecond: 0.42,
  impactCooldownMs: 190,
  impactHoldMs: 140,
  impactRiseThreshold: 0.035,
  restRecoveryPerSecond: 1.6,
  swingThreshold: 0.01,
  textureRiseThreshold: 0.055,
} as const;
```

Meaning:

- `swingThreshold`: minimum normalized average for a character to stop using `raised` and begin `swing`.
- `impactRiseThreshold`: average gain rise needed to trigger `impact`.
- `textureRiseThreshold`: texture rise needed to trigger `impact`.
- `impactCooldownMs`: minimum interval between impacts for the same character.
- `impactHoldMs`: how long the impact pose is held after a hit.
- `fatigueHp`: how many repeated impacts a character can survive before collapsing, after recovery is considered.
- `fatigueRecoveryPerSecond`: recovery rate while still active.
- `restRecoveryPerSecond`: faster recovery while the band is below `swingThreshold`.
- `collapsedDurationMs`: how long a collapsed sprite remains visible.

The HP was increased from the previous value to `15` to extend survival by roughly 20% or a little more, matching the desired feel that characters should not collapse too frequently.

## Fatigue Behavior

The collapsed behavior was reframed from idle timeout to overwork:

- Fatigue increases only when a character enters `impact`.
- Fatigue recovers over time.
- Recovery is faster when the band is resting.
- Fatigue is not added while collapsed.
- When a character collapses, fatigue resets to zero.
- While collapsed, previous average/texture are kept in sync with current band stats to avoid an immediate false impact when the character gets back up.

Current collapsed trigger:

```ts
if (fatigueScores[index] >= chibiSpectrumConfig.fatigueHp) {
  collapsedUntil[index] = time + chibiSpectrumConfig.collapsedDurationMs;
  fatigueScores[index] = 0;
  impactUntil[index] = 0;
  previousAverages[index] = 0;
  previousTextures[index] = 0;
  return "collapsed";
}
```

During collapsed:

```ts
fatigueScores[index] = 0;
impactUntil[index] = 0;
lastMotionUpdateAt[index] = time;
previousAverages[index] = bandStats.average;
previousTextures[index] = bandStats.texture;
return "collapsed";
```

The collapsed duration was shortened from the earlier 5-second concept because it felt too long in the actual visualizer. Current value is `2_600ms`.

## Chibi Mode Persistence

The user noticed that reopening the visualizer required pressing the chibi mode button again every time. The button state is now saved:

```ts
const chibiModeStorageKey = "musical.visualizerChibiMode";
const [isChibiModeEnabled, setIsChibiModeEnabled] = useState(
  () => window.localStorage.getItem(chibiModeStorageKey) === "true",
);

useEffect(() => {
  window.localStorage.setItem(chibiModeStorageKey, String(isChibiModeEnabled));
}, [isChibiModeEnabled]);
```

This matches existing app style, which already uses `musical.*` localStorage keys for sidebar, theme, locale, and other preferences.

## Verification Performed

After the config extraction and persistence changes, `npm run build` was run successfully.

The build currently emits Vite chunk size warnings because of large assets/chunks, but the TypeScript and production build complete successfully.

## Tuning Notes

For more frequent impacts:

- Lower `impactRiseThreshold`.
- Lower `textureRiseThreshold`.
- Lower `impactCooldownMs`.

For fewer impacts:

- Raise `impactRiseThreshold`.
- Raise `textureRiseThreshold`.
- Raise `impactCooldownMs`.

For characters that collapse less often:

- Raise `fatigueHp`.
- Raise `fatigueRecoveryPerSecond`.
- Raise `restRecoveryPerSecond`.

For characters that recover from collapsed faster/slower:

- Adjust `collapsedDurationMs`.

For more low-level movement:

- Lower `swingThreshold`, but keep it above zero to avoid every band always animating from noise.

For more visual punch:

- Increase the impact pose pulse in `getChibiSpectrumPosePulse()`.
- Increase `impactHoldMs` slightly, but avoid holding impact so long that it stops reading as a hit.

## Open Follow-Ups

- The collapsed sprites were the hardest to make feel cute and character-specific. If regenerated externally, replace only the `collapsed.png` files under each `by_character` folder.
- If bundle size becomes a problem, consider lazy-loading chibi sprite assets only after chibi mode is enabled or the visualizer opens.
- If the spectrum mode becomes the primary visualizer experience, consider persisting the visualizer mode itself too, not only chibi mode.
- If tuning becomes frequent, consider moving chibi spectrum config into a dedicated exported object with comments or a small in-app debug panel.
