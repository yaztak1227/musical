import { type CSSProperties, type MouseEvent, type PointerEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import chibiCatHoodieBoyHandsDownSrc from "@/assets/chibi-cat-hoodie-boy-hands-down.png";
import chibiCatHoodieBoyHandsUpSrc from "@/assets/chibi-cat-hoodie-boy-hands-up.png";
import chibiFestivalKimonoBoyHandsDownSrc from "@/assets/chibi-festival-kimono-boy-hands-down.png";
import chibiFestivalKimonoBoyHandsUpSrc from "@/assets/chibi-festival-kimono-boy-hands-up.png";
import chibiMagicApprenticeGirlHandsDownSrc from "@/assets/chibi-magic-apprentice-girl-hands-down.png";
import chibiMagicApprenticeGirlHandsUpSrc from "@/assets/chibi-magic-apprentice-girl-hands-up.png";
import chibiMarchingBandBoyHandsDownSrc from "@/assets/chibi-marching-band-boy-hands-down.png";
import chibiMarchingBandBoyHandsUpSrc from "@/assets/chibi-marching-band-boy-hands-up.png";
import chibiPastryChefGirlHandsDownSrc from "@/assets/chibi-pastry-chef-girl-hands-down.png";
import chibiPastryChefGirlHandsUpSrc from "@/assets/chibi-pastry-chef-girl-hands-up.png";
import chibiSailorExplorerGirlHandsDownSrc from "@/assets/chibi-sailor-explorer-girl-hands-down.png";
import chibiSailorExplorerGirlHandsUpSrc from "@/assets/chibi-sailor-explorer-girl-hands-up.png";
import chibiSpacePilotBoyHandsDownSrc from "@/assets/chibi-space-pilot-boy-hands-down.png";
import chibiSpacePilotBoyHandsUpSrc from "@/assets/chibi-space-pilot-boy-hands-up.png";
import chibiStarIdolHandsDownSrc from "@/assets/chibi-star-idol-hands-down.png";
import chibiStarIdolHandsUpSrc from "@/assets/chibi-star-idol-hands-up.png";
import chibiCatHoodieBoyHammerCollapsedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-cat-hoodie-boy/collapsed.png";
import chibiCatHoodieBoyHammerImpactSrc from "@/assets/generated/chibi_sprites/by_character/chibi-cat-hoodie-boy/impact.png";
import chibiCatHoodieBoyHammerRaisedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-cat-hoodie-boy/raised.png";
import chibiCatHoodieBoyHammerSwingSrc from "@/assets/generated/chibi_sprites/by_character/chibi-cat-hoodie-boy/swing.png";
import chibiFestivalKimonoBoyHammerCollapsedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-festival-kimono-boy/collapsed.png";
import chibiFestivalKimonoBoyHammerImpactSrc from "@/assets/generated/chibi_sprites/by_character/chibi-festival-kimono-boy/impact.png";
import chibiFestivalKimonoBoyHammerRaisedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-festival-kimono-boy/raised.png";
import chibiFestivalKimonoBoyHammerSwingSrc from "@/assets/generated/chibi_sprites/by_character/chibi-festival-kimono-boy/swing.png";
import chibiMagicApprenticeGirlHammerCollapsedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-magic-apprentice-girl/collapsed.png";
import chibiMagicApprenticeGirlHammerImpactSrc from "@/assets/generated/chibi_sprites/by_character/chibi-magic-apprentice-girl/impact.png";
import chibiMagicApprenticeGirlHammerRaisedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-magic-apprentice-girl/raised.png";
import chibiMagicApprenticeGirlHammerSwingSrc from "@/assets/generated/chibi_sprites/by_character/chibi-magic-apprentice-girl/swing.png";
import chibiMarchingBandBoyHammerCollapsedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-marching-band-boy/collapsed.png";
import chibiMarchingBandBoyHammerImpactSrc from "@/assets/generated/chibi_sprites/by_character/chibi-marching-band-boy/impact.png";
import chibiMarchingBandBoyHammerRaisedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-marching-band-boy/raised.png";
import chibiMarchingBandBoyHammerSwingSrc from "@/assets/generated/chibi_sprites/by_character/chibi-marching-band-boy/swing.png";
import chibiPastryChefGirlHammerCollapsedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-pastry-chef-girl/collapsed.png";
import chibiPastryChefGirlHammerImpactSrc from "@/assets/generated/chibi_sprites/by_character/chibi-pastry-chef-girl/impact.png";
import chibiPastryChefGirlHammerRaisedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-pastry-chef-girl/raised.png";
import chibiPastryChefGirlHammerSwingSrc from "@/assets/generated/chibi_sprites/by_character/chibi-pastry-chef-girl/swing.png";
import chibiSailorExplorerGirlHammerCollapsedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-sailor-explorer-girl/collapsed.png";
import chibiSailorExplorerGirlHammerImpactSrc from "@/assets/generated/chibi_sprites/by_character/chibi-sailor-explorer-girl/impact.png";
import chibiSailorExplorerGirlHammerRaisedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-sailor-explorer-girl/raised.png";
import chibiSailorExplorerGirlHammerSwingSrc from "@/assets/generated/chibi_sprites/by_character/chibi-sailor-explorer-girl/swing.png";
import chibiSpacePilotBoyHammerCollapsedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-space-pilot-boy/collapsed.png";
import chibiSpacePilotBoyHammerImpactSrc from "@/assets/generated/chibi_sprites/by_character/chibi-space-pilot-boy/impact.png";
import chibiSpacePilotBoyHammerRaisedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-space-pilot-boy/raised.png";
import chibiSpacePilotBoyHammerSwingSrc from "@/assets/generated/chibi_sprites/by_character/chibi-space-pilot-boy/swing.png";
import chibiStarIdolHammerCollapsedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-star-idol/collapsed.png";
import chibiStarIdolHammerImpactSrc from "@/assets/generated/chibi_sprites/by_character/chibi-star-idol/impact.png";
import chibiStarIdolHammerRaisedSrc from "@/assets/generated/chibi_sprites/by_character/chibi-star-idol/raised.png";
import chibiStarIdolHammerSwingSrc from "@/assets/generated/chibi_sprites/by_character/chibi-star-idol/swing.png";
import orchestraHoldingBackgroundSrc from "@/assets/generated/orchestra_visualizer/backgrounds/holding-background.png";
import orchestraPlayingBackgroundSrc from "@/assets/generated/orchestra_visualizer/backgrounds/playing-background.png";
import orchestraHoldingCelloSrc from "@/assets/generated/orchestra_visualizer/characters/holding/02-cello.png";
import orchestraHoldingClarinetSrc from "@/assets/generated/orchestra_visualizer/characters/holding/04-clarinet.png";
import orchestraHoldingFluteSrc from "@/assets/generated/orchestra_visualizer/characters/holding/03-flute.png";
import orchestraHoldingFrenchHornSrc from "@/assets/generated/orchestra_visualizer/characters/holding/07-french_horn.png";
import orchestraHoldingHarpSrc from "@/assets/generated/orchestra_visualizer/characters/holding/09-harp.png";
import orchestraHoldingTimpaniSrc from "@/assets/generated/orchestra_visualizer/characters/holding/08-timpani.png";
import orchestraHoldingTromboneSrc from "@/assets/generated/orchestra_visualizer/characters/holding/06-trombone.png";
import orchestraHoldingTrumpetSrc from "@/assets/generated/orchestra_visualizer/characters/holding/05-trumpet.png";
import orchestraHoldingViolinSrc from "@/assets/generated/orchestra_visualizer/characters/holding/01-violin.png";
import orchestraPlayingCelloSrc from "@/assets/generated/orchestra_visualizer/characters/playing/02-cello.png";
import orchestraPlayingClarinetSrc from "@/assets/generated/orchestra_visualizer/characters/playing/04-clarinet.png";
import orchestraPlayingFluteSrc from "@/assets/generated/orchestra_visualizer/characters/playing/03-flute.png";
import orchestraPlayingFrenchHornSrc from "@/assets/generated/orchestra_visualizer/characters/playing/07-french_horn.png";
import orchestraPlayingHarpSrc from "@/assets/generated/orchestra_visualizer/characters/playing/09-harp.png";
import orchestraPlayingTimpaniSrc from "@/assets/generated/orchestra_visualizer/characters/playing/08-timpani.png";
import orchestraPlayingTromboneSrc from "@/assets/generated/orchestra_visualizer/characters/playing/06-trombone.png";
import orchestraPlayingTrumpetSrc from "@/assets/generated/orchestra_visualizer/characters/playing/05-trumpet.png";
import orchestraPlayingViolinSrc from "@/assets/generated/orchestra_visualizer/characters/playing/01-violin.png";
import surfPuchiBoyPaddlingSrc from "@/assets/surf-puchi-boy-paddling.png";
import surfPuchiBoyStandingSrc from "@/assets/surf-puchi-boy-standing.png";
import surfPuchiGirlPaddlingSrc from "@/assets/surf-puchi-girl-paddling.png";
import surfPuchiGirlStandingSrc from "@/assets/surf-puchi-girl-standing.png";
import type { Album, EntityId, Track } from "@/types/audio";
import type { TFunction } from "@/types/app";
import { chibiSpectrumConfig } from "@/config/appConfig";
import { getAudioVisualizerNode } from "@/lib/audioAnalysis";
import { AuroraWebGLVisualizer, resolveAuroraVisualProfile, type AuroraVisualProfile } from "@/lib/auroraWebgl";
import { FrequencyHelixWebGLVisualizer } from "@/lib/helixWebgl";
import { getArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";
import { prepareMarquee } from "@/lib/marqueeUtils";
import { captureScatteredAngularEnergy, warpAngularSectorCount, WarpStarfieldWebGLVisualizer } from "@/lib/starfieldWebgl";
import { WarpHoleWebGLVisualizer } from "@/lib/warpHoleWebgl";

type VisualizerMode = "wave" | "spectrum" | "circle" | "mountains" | "aurora" | "starfield" | "tunnel" | "ink" | "vu" | "warp";
type VisualizerPaletteMode = "theme" | "artwork" | "rainbow" | "original";
type VisualizerColor = readonly [number, number, number];
type VisualizerPalette = readonly VisualizerColor[];
type SurfPuchiGender = "boy" | "girl";
type SurfPuchiPose = "paddling" | "standing";
type SurfPuchiImages = Record<SurfPuchiPose, HTMLImageElement | null>;
type SurfPuchiMotionState = {
  standingWeight: number;
  targetPose: SurfPuchiPose;
};
type ChibiCharacterImages = {
  down: HTMLImageElement | null;
  up: HTMLImageElement | null;
};
type ChibiCharacterSource = {
  down: string;
  up: string;
};
type ChibiSpectrumPose = "raised" | "swing" | "impact" | "collapsed";
type ChibiSpectrumImages = Record<ChibiSpectrumPose, HTMLImageElement | null>;

function VisualizerModeIcon({ mode }: { mode: VisualizerMode }) {
  const sharedProps = {
    "aria-hidden": true,
    className: "visualizer-mode-glyph",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
    viewBox: "0 0 24 24",
  };

  if (mode === "wave") {
    return <svg {...sharedProps}><path d="M3 8.5c2.2-2.7 4.3-2.7 6.4 0s4.3 2.7 6.4 0 3.9-2.5 5.2-.8" /><path d="M3 15.5c2.2-2.7 4.3-2.7 6.4 0s4.3 2.7 6.4 0 3.9-2.5 5.2-.8" opacity=".7" /></svg>;
  }
  if (mode === "spectrum") {
    return <svg {...sharedProps}><path d="M4 18v-5M8 18V9m4 9V5m4 13v-7m4 7v-3" /><path d="M3 20h18" opacity=".55" /></svg>;
  }
  if (mode === "circle") {
    return <svg {...sharedProps}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2" /><path d="M12 2.5v3M21.5 12h-3M12 21.5v-3M2.5 12h3M5.3 5.3l2.1 2.1M18.7 5.3l-2.1 2.1M18.7 18.7l-2.1-2.1M5.3 18.7l2.1-2.1" opacity=".72" /></svg>;
  }
  if (mode === "mountains") {
    return <svg {...sharedProps}><path d="M2.5 19 8.2 8.5l3.1 5 2.8-4.2L21.5 19Z" /><path d="m6.5 11.7 1.7 1.7 1.5-1.5M12.6 11.5l1.5 1.6 1.7-1.8" opacity=".7" /></svg>;
  }
  if (mode === "aurora") {
    return <svg {...sharedProps}><path d="M3 6.5c3.2-2.6 5.8 1.8 9-.3s5.7 1.3 9-.6" /><path d="M5.2 6.2c-1.4 4.3 1.6 7.6-.7 12.1M10.1 6.8c-1.7 3.7 1.9 7.7-.5 12M15.1 6.2c-1.4 4.4 1.8 7.9-.3 12.3M19.4 6.1c-1.1 3.8 1.2 7.2-.8 11.2" opacity=".82" /></svg>;
  }
  if (mode === "starfield") {
    return <svg {...sharedProps}><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" /><path d="m10 10-6.5-5M14 10l5-6.5M14 14l6.5 5M10 14l-5 6.5M8.6 12H2.5M15.4 12h6.1M12 8.6V2.5M12 15.4v6.1" /><path d="m6.7 7.2-2.3-.8m12.9 10.4 2.4.8M17 7l1.5-2.1" opacity=".58" /></svg>;
  }
  if (mode === "tunnel") {
    return <svg {...sharedProps}><path d="M7 3c7 3.1 7 14.9 0 18M17 3c-7 3.1-7 14.9 0 18" /><path d="M8.4 6h7.2M7.1 10h9.8M7.1 14h9.8M8.4 18h7.2" opacity=".7" /></svg>;
  }
  if (mode === "warp") {
    return <svg {...sharedProps}><ellipse cx="12" cy="12" rx="8.8" ry="4.9" /><ellipse cx="12" cy="12" rx="4.4" ry="2.3" opacity=".78" /><path d="M3.6 9.2c2.6-4.1 7.3-6.1 11.8-4.3M20.4 14.8c-2.5 4.1-7.2 6-11.7 4.3M7 14.6c1.7 1.7 4.6 2.1 6.9.9M17 9.4c-1.8-1.7-4.6-2.1-6.9-.9" opacity=".72" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /></svg>;
  }
  if (mode === "ink") {
    return <svg {...sharedProps}><path d="M4 14.2c1.3-5.9 10.2-7.6 13.8-3.1 2.8 3.6-.6 8.4-4.8 7.1-3.1-1-2.7-5.3.3-5.7 2-.2 2.8 2.1 1.2 3.1" /><path d="M6.3 7.2c-.9-1.6.1-3.2 1.2-4.5 1.1 1.3 2.1 2.9 1.2 4.5-.5.9-1.9.9-2.4 0Z" opacity=".72" /></svg>;
  }
  return <svg {...sharedProps}><path d="M3 17a6 6 0 0 1 12 0M13 17a4 4 0 0 1 8 0" /><path d="m9 15 2.7-3.4M17 16l1.7-2.2" /><path d="M3 20h18" opacity=".55" /></svg>;
}

function ArtworkPaletteIcon() {
  return (
    <svg aria-hidden="true" className="visualizer-palette-artwork-icon" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="13" rx="2.5" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m5.5 14 4-4 3.1 3 2.5-2.2 3.4 3.2" />
      <circle className="artwork-color-dot cyan" cx="7" cy="20" r="2" />
      <circle className="artwork-color-dot violet" cx="12" cy="20" r="2" />
      <circle className="artwork-color-dot rose" cx="17" cy="20" r="2" />
    </svg>
  );
}
type ChibiSpectrumSource = Record<ChibiSpectrumPose, string>;
type ChibiSpectrumMotionState = {
  collapsedUntil: Float64Array;
  fatigueScores: Float64Array;
  impactUntil: Float64Array;
  lastImpactAt: Float64Array;
  lastMotionUpdateAt: Float64Array;
  lastRaisedAt: Float64Array;
  previousAverages: Float64Array;
  previousTextures: Float64Array;
};
type ChibiCircleMotionState = {
  upWeights: Float32Array;
};
type OrchestraVisualizerPose = "holding" | "playing";
type OrchestraCharacterImages = Record<OrchestraVisualizerPose, HTMLImageElement | null>;
type OrchestraCharacterSource = Record<OrchestraVisualizerPose, string> & {
  band: number;
  baseScale: number;
  floorX: number;
  floorY: number;
};
type OrchestraVisualizerImages = {
  backgrounds: OrchestraCharacterImages;
  characters: OrchestraCharacterImages[];
};
type OrchestraVisualizerMotionState = {
  energyWeights: Float32Array;
  playingWeights: Float32Array;
};
type FrequencyHelixTimelineState = {
  frames: Float32Array[];
  lastCapturedAt: number;
};
type AuroraTimelineState = {
  frames: Float32Array[];
  lastCapturedAt: number;
};

type RemoteAudioAnalysisPacket = {
  currentTimeAtReceived: number;
  duration: number;
  frameTimecodes: number[];
  frames: number[][];
  receivedAt: number;
  startTime: number;
};

type RemotePlaybackClock = {
  currentTime: number;
  isPlaying: boolean;
  receivedAt: number;
  trackId: EntityId | null;
};

type PlayerVisualizerOverlayProps = {
  audioAnalysisPacketRef: RefObject<RemoteAudioAnalysisPacket | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  currentAlbum: Album | null;
  currentLyrics?: string | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  onClose: () => void;
  onNextTrack: () => void;
  onPreviousTrack: () => void;
  onQueueTrackPlay: (track: Track) => void;
  onTogglePlayback: () => void;
  preferRemoteAudioAnalysis?: boolean;
  remotePlaybackClockRef?: RefObject<RemotePlaybackClock | null>;
  queueTracks: Track[];
  t: TFunction;
};

const visualizerCanvasMaxScale = 1.35;
const remoteVisualizerCanvasMaxScale = 1;
const spectrumBarCount = 48;
const chibiModeStorageKey = "musical.visualizerChibiMode";
const visualizerModeStorageKey = "musical.visualizerMode";
const visualizerPaletteStorageKey = "musical.visualizerPalette";
const chibiToggleDoubleTapMs = 320;
const frequencyHelixBandCount = 24;
const frequencyHelixFrameCount = 42;
const frequencyHelixCaptureIntervalMs = 55;
const auroraBandCount = 5;
const auroraFrameCount = 7;
const auroraCaptureIntervalMs = 120;

const visualizerModes = ["wave", "spectrum", "circle", "mountains", "aurora", "starfield", "tunnel", "ink", "vu", "warp"] as const;
const visualizerPaletteModes = ["theme", "artwork", "rainbow", "original"] as const;
const rainbowVisualizerPalette: VisualizerPalette = [
  [154, 232, 91],
  [69, 225, 145],
  [61, 216, 199],
  [72, 177, 235],
  [104, 126, 239],
  [169, 96, 235],
  [232, 83, 197],
  [245, 126, 185],
];
const originalVisualizerPalette: VisualizerPalette = [
  [92, 219, 255],
  [65, 164, 243],
  [99, 119, 232],
  [151, 91, 218],
  [66, 194, 183],
];

function isVisualizerMode(value: string | null): value is VisualizerMode {
  return visualizerModes.some((mode) => mode === value);
}

function isVisualizerPaletteMode(value: string | null): value is VisualizerPaletteMode {
  return visualizerPaletteModes.some((mode) => mode === value);
}

function rgba(color: VisualizerColor, alpha = 1) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Math.max(0, Math.min(1, alpha))})`;
}

function paletteColor(palette: VisualizerPalette, index: number) {
  return palette[((index % palette.length) + palette.length) % palette.length] ?? rainbowVisualizerPalette[0];
}

function mixVisualizerColors(first: VisualizerColor, second: VisualizerColor, amount: number): VisualizerColor {
  const blend = Math.max(0, Math.min(1, amount));
  return [
    Math.round(first[0] + (second[0] - first[0]) * blend),
    Math.round(first[1] + (second[1] - first[1]) * blend),
    Math.round(first[2] + (second[2] - first[2]) * blend),
  ];
}

function resolveCssVisualizerColor(value: string, fallback: VisualizerColor): VisualizerColor {
  const probe = document.createElement("span");
  probe.style.position = "fixed";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  probe.style.color = value;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return fallback;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = resolved;
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return pixel[3] ? [pixel[0], pixel[1], pixel[2]] : fallback;
}

function getThemeVisualizerPalette(): VisualizerPalette {
  const primary = resolveCssVisualizerColor("var(--primary)", rainbowVisualizerPalette[0]);
  const accent = resolveCssVisualizerColor("var(--accent)", rainbowVisualizerPalette[1]);
  const foreground = resolveCssVisualizerColor("var(--foreground)", [255, 255, 255]);
  return [
    mixVisualizerColors(primary, foreground, 0.2),
    mixVisualizerColors(primary, accent, 0.42),
    mixVisualizerColors(primary, foreground, 0.5),
    mixVisualizerColors(accent, foreground, 0.18),
    mixVisualizerColors(primary, [0, 0, 0], 0.18),
  ];
}

function rgbToHue([red, green, blue]: VisualizerColor) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  if (delta === 0) return 0;
  const hue = maximum === r
    ? ((g - b) / delta) % 6
    : maximum === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}

function enhanceArtworkColor(color: VisualizerColor): VisualizerColor {
  const average = (color[0] + color[1] + color[2]) / 3;
  return color.map((channel) => Math.round(Math.max(24, Math.min(246, average + (channel - average) * 1.32 + 18)))) as unknown as VisualizerColor;
}

async function extractArtworkVisualizerPalette(src: string): Promise<VisualizerPalette | null> {
  if (!src) return null;
  const image = new Image();
  image.crossOrigin = "anonymous";
  const loaded = new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
  });
  image.src = src;
  if (!(await loaded)) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 36;
  canvas.height = 36;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const buckets = Array.from({ length: 12 }, () => ({ color: [0, 0, 0] as [number, number, number], count: 0, score: 0 }));
    for (let index = 0; index < pixels.length; index += 16) {
      const color: VisualizerColor = [pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0];
      const alpha = pixels[index + 3] ?? 0;
      const maximum = Math.max(...color);
      const minimum = Math.min(...color);
      const saturation = maximum - minimum;
      const lightness = (maximum + minimum) / 2;
      if (alpha < 180 || lightness < 22 || lightness > 238) continue;
      const bucket = buckets[Math.floor(rgbToHue(color) / 30) % buckets.length];
      bucket.color[0] += color[0];
      bucket.color[1] += color[1];
      bucket.color[2] += color[2];
      bucket.count += 1;
      bucket.score += 1 + saturation / 80;
    }
    const colors = buckets
      .filter((bucket) => bucket.count > 0)
      .sort((first, second) => second.score - first.score)
      .slice(0, 4)
      .map((bucket) => enhanceArtworkColor([
        Math.round(bucket.color[0] / bucket.count),
        Math.round(bucket.color[1] / bucket.count),
        Math.round(bucket.color[2] / bucket.count),
      ]));
    if (colors.length === 0) return null;
    while (colors.length < 5) {
      const base = colors[colors.length % Math.max(1, colors.length)] ?? rainbowVisualizerPalette[0];
      colors.push(mixVisualizerColors(base, colors.length % 2 === 0 ? [255, 255, 255] : [0, 0, 0], 0.28));
    }
    return colors;
  } catch {
    return null;
  }
}

const surfPuchiSources: Record<SurfPuchiGender, Record<SurfPuchiPose, string>> = {
  boy: {
    paddling: surfPuchiBoyPaddlingSrc,
    standing: surfPuchiBoyStandingSrc,
  },
  girl: {
    paddling: surfPuchiGirlPaddlingSrc,
    standing: surfPuchiGirlStandingSrc,
  },
};

const chibiCharacterSources: ChibiCharacterSource[] = [
  { down: chibiStarIdolHandsDownSrc, up: chibiStarIdolHandsUpSrc },
  { down: chibiCatHoodieBoyHandsDownSrc, up: chibiCatHoodieBoyHandsUpSrc },
  { down: chibiSailorExplorerGirlHandsDownSrc, up: chibiSailorExplorerGirlHandsUpSrc },
  { down: chibiFestivalKimonoBoyHandsDownSrc, up: chibiFestivalKimonoBoyHandsUpSrc },
  { down: chibiMagicApprenticeGirlHandsDownSrc, up: chibiMagicApprenticeGirlHandsUpSrc },
  { down: chibiSpacePilotBoyHandsDownSrc, up: chibiSpacePilotBoyHandsUpSrc },
  { down: chibiPastryChefGirlHandsDownSrc, up: chibiPastryChefGirlHandsUpSrc },
  { down: chibiMarchingBandBoyHandsDownSrc, up: chibiMarchingBandBoyHandsUpSrc },
];

const chibiSpectrumSources: ChibiSpectrumSource[] = [
  { raised: chibiStarIdolHammerRaisedSrc, swing: chibiStarIdolHammerSwingSrc, impact: chibiStarIdolHammerImpactSrc, collapsed: chibiStarIdolHammerCollapsedSrc },
  { raised: chibiCatHoodieBoyHammerRaisedSrc, swing: chibiCatHoodieBoyHammerSwingSrc, impact: chibiCatHoodieBoyHammerImpactSrc, collapsed: chibiCatHoodieBoyHammerCollapsedSrc },
  { raised: chibiSailorExplorerGirlHammerRaisedSrc, swing: chibiSailorExplorerGirlHammerSwingSrc, impact: chibiSailorExplorerGirlHammerImpactSrc, collapsed: chibiSailorExplorerGirlHammerCollapsedSrc },
  { raised: chibiFestivalKimonoBoyHammerRaisedSrc, swing: chibiFestivalKimonoBoyHammerSwingSrc, impact: chibiFestivalKimonoBoyHammerImpactSrc, collapsed: chibiFestivalKimonoBoyHammerCollapsedSrc },
  { raised: chibiMagicApprenticeGirlHammerRaisedSrc, swing: chibiMagicApprenticeGirlHammerSwingSrc, impact: chibiMagicApprenticeGirlHammerImpactSrc, collapsed: chibiMagicApprenticeGirlHammerCollapsedSrc },
  { raised: chibiSpacePilotBoyHammerRaisedSrc, swing: chibiSpacePilotBoyHammerSwingSrc, impact: chibiSpacePilotBoyHammerImpactSrc, collapsed: chibiSpacePilotBoyHammerCollapsedSrc },
  { raised: chibiPastryChefGirlHammerRaisedSrc, swing: chibiPastryChefGirlHammerSwingSrc, impact: chibiPastryChefGirlHammerImpactSrc, collapsed: chibiPastryChefGirlHammerCollapsedSrc },
  { raised: chibiMarchingBandBoyHammerRaisedSrc, swing: chibiMarchingBandBoyHammerSwingSrc, impact: chibiMarchingBandBoyHammerImpactSrc, collapsed: chibiMarchingBandBoyHammerCollapsedSrc },
];

const orchestraCharacterSources: OrchestraCharacterSource[] = [
  { holding: orchestraHoldingTromboneSrc, playing: orchestraPlayingTromboneSrc, band: 0, floorX: 0.17, floorY: 0.78, baseScale: 1 },
  { holding: orchestraHoldingFrenchHornSrc, playing: orchestraPlayingFrenchHornSrc, band: 1, floorX: 0.31, floorY: 0.82, baseScale: 0.98 },
  { holding: orchestraHoldingTimpaniSrc, playing: orchestraPlayingTimpaniSrc, band: 2, floorX: 0.51, floorY: 0.82, baseScale: 1.06 },
  { holding: orchestraHoldingHarpSrc, playing: orchestraPlayingHarpSrc, band: 3, floorX: 0.77, floorY: 0.82, baseScale: 1.1 },
  { holding: orchestraHoldingViolinSrc, playing: orchestraPlayingViolinSrc, band: 4, floorX: 0.17, floorY: 0.51, baseScale: 0.88 },
  { holding: orchestraHoldingCelloSrc, playing: orchestraPlayingCelloSrc, band: 5, floorX: 0.34, floorY: 0.52, baseScale: 0.92 },
  { holding: orchestraHoldingFluteSrc, playing: orchestraPlayingFluteSrc, band: 6, floorX: 0.52, floorY: 0.51, baseScale: 0.9 },
  { holding: orchestraHoldingClarinetSrc, playing: orchestraPlayingClarinetSrc, band: 7, floorX: 0.66, floorY: 0.52, baseScale: 0.88 },
  { holding: orchestraHoldingTrumpetSrc, playing: orchestraPlayingTrumpetSrc, band: 8, floorX: 0.81, floorY: 0.51, baseScale: 0.9 },
];

function drawIdleSpectrum(context: CanvasRenderingContext2D, width: number, height: number, palette: VisualizerPalette, useOriginalColors: boolean) {
  const barCount = 36;
  const gap = 6;
  const barWidth = Math.max(4, Math.min(10, (width * 0.48) / barCount - gap));
  const startX = (width - (barWidth + gap) * barCount) / 2;
  const baseY = height * 0.72;

  context.save();
  context.shadowBlur = 12;
  for (let index = 0; index < barCount; index += 1) {
    const centerBias = 1 - Math.abs(index / Math.max(1, barCount - 1) - 0.5) * 1.35;
    const barHeight = Math.max(5, height * (0.018 + centerBias * 0.018));
    const color = paletteColor(palette, index);
    const nextColor = paletteColor(palette, index + 1);
    const hue = 190 + (index / barCount) * 120;
    const gradient = context.createLinearGradient(0, baseY - barHeight, 0, baseY);

    gradient.addColorStop(0, useOriginalColors ? `hsla(${hue}, 84%, 70%, 0.36)` : rgba(color, 0.36));
    gradient.addColorStop(1, useOriginalColors ? "hsla(330, 72%, 60%, 0.2)" : rgba(nextColor, 0.2));
    context.beginPath();
    context.fillStyle = gradient;
    context.shadowColor = useOriginalColors ? `hsla(${hue}, 84%, 64%, 0.16)` : rgba(color, 0.16);
    context.roundRect(startX + index * (barWidth + gap), baseY - barHeight, barWidth, barHeight, 999);
    context.fill();
  }
  context.restore();
}

function drawIdleWave(context: CanvasRenderingContext2D, width: number, height: number, palette: VisualizerPalette, useOriginalColors: boolean) {
  const centerY = height * 0.58;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowBlur = 14;

  for (let layer = 0; layer < 2; layer += 1) {
    context.beginPath();
    const color = paletteColor(palette, layer);
    context.strokeStyle = useOriginalColors
      ? (layer === 0 ? "rgba(99, 230, 255, 0.34)" : "rgba(255, 79, 216, 0.2)")
      : rgba(color, layer === 0 ? 0.34 : 0.2);
    context.lineWidth = layer === 0 ? 5 : 3;
    context.shadowColor = useOriginalColors
      ? (layer === 0 ? "rgba(99, 230, 255, 0.2)" : "rgba(255, 79, 216, 0.16)")
      : rgba(color, layer === 0 ? 0.2 : 0.16);

    for (let x = width * 0.26; x <= width * 0.74; x += 16) {
      const y = centerY + Math.sin((x / width) * Math.PI * 4 + layer * 0.8) * height * 0.018;
      if (x === width * 0.26) context.moveTo(x, y);
      else context.lineTo(x, y);
    }

    context.stroke();
  }

  context.restore();
}

function drawIdleCircle(context: CanvasRenderingContext2D, width: number, height: number, palette: VisualizerPalette, useOriginalColors: boolean) {
  const centerX = width / 2;
  const centerY = height * 0.55;
  const radius = Math.min(width, height) * 0.15;
  const barCount = 72;

  context.save();
  context.translate(centerX, centerY);
  context.lineCap = "round";
  context.shadowBlur = 12;

  for (let index = 0; index < barCount; index += 1) {
    const angle = (index / barCount) * Math.PI * 2;
    const centerBias = Math.sin((index / barCount) * Math.PI);
    const outerRadius = radius + 6 + centerBias * 7;
    const color = paletteColor(palette, Math.floor(index / 12));
    const hue = 190 + (index / barCount) * 150;

    context.beginPath();
    context.strokeStyle = useOriginalColors ? `hsla(${hue}, 84%, 68%, 0.3)` : rgba(color, 0.3);
    context.lineWidth = 2.2;
    context.shadowColor = useOriginalColors ? `hsla(${hue}, 84%, 64%, 0.15)` : rgba(color, 0.15);
    context.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    context.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
    context.stroke();
  }

  context.beginPath();
  context.strokeStyle = "rgba(255, 255, 255, 0.18)";
  context.lineWidth = 1.2;
  context.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawIdleVisualizer(context: CanvasRenderingContext2D, width: number, height: number, mode: VisualizerMode, palette: VisualizerPalette, useOriginalColors: boolean) {
  if (mode === "wave") {
    drawIdleWave(context, width, height, palette, useOriginalColors);
  } else if (mode === "circle") {
    drawIdleCircle(context, width, height, palette, useOriginalColors);
  } else {
    drawIdleSpectrum(context, width, height, palette, useOriginalColors);
  }
}

function copyAnalysisFrame(source: number[], target: Uint8Array) {
  for (let index = 0; index < target.length; index += 1) {
    target[index] = source[Math.floor((index / target.length) * source.length)] ?? 0;
  }
}

function estimateRemotePlaybackTime(clock: RemotePlaybackClock | null) {
  if (!clock) return null;
  const elapsed = clock.isPlaying ? Math.max(0, performance.now() - clock.receivedAt) / 1000 : 0;
  return Math.max(0, clock.currentTime + elapsed);
}

function findFirstTimecodeAtOrAfter(frameTimecodes: readonly number[], currentTime: number) {
  // Remote analysis packets keep timecodes sorted, so this matches findIndex's first >= result.
  let lowerIndex = 0;
  let upperIndex = frameTimecodes.length;

  while (lowerIndex < upperIndex) {
    const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
    const timecode = frameTimecodes[middleIndex];
    if (timecode !== undefined && timecode >= currentTime) upperIndex = middleIndex;
    else lowerIndex = middleIndex + 1;
  }

  return lowerIndex < frameTimecodes.length ? lowerIndex : -1;
}

function copyRemoteAnalysisFrame(
  packet: RemoteAudioAnalysisPacket,
  time: number,
  target: Uint8Array,
  playbackTime: number | null,
) {
  const { frames } = packet;
  const frameTimecodes = packet.frameTimecodes ?? [];
  const frameCount = frames.length;
  if (frameCount === 0) {
    target.fill(0);
    return;
  }

  const currentTime = playbackTime ?? packet.currentTimeAtReceived + Math.max(0, time - packet.receivedAt) / 1000;
  let firstFrameIndex = 0;
  let secondFrameIndex = 0;
  let blend = 0;

  if (frameTimecodes.length === frameCount) {
    let upperIndex = findFirstTimecodeAtOrAfter(frameTimecodes, currentTime);
    if (upperIndex < 0) upperIndex = frameCount - 1;
    secondFrameIndex = upperIndex;
    firstFrameIndex = Math.max(0, upperIndex - 1);

    const firstTimecode = frameTimecodes[firstFrameIndex] ?? currentTime;
    const secondTimecode = frameTimecodes[secondFrameIndex] ?? firstTimecode;
    blend = secondTimecode > firstTimecode
      ? Math.max(0, Math.min(1, (currentTime - firstTimecode) / (secondTimecode - firstTimecode)))
      : 0;
  } else {
    const durationSeconds = Math.max(0.001, packet.duration / 1000);
    const elapsed = Math.max(0, currentTime - packet.startTime);
    const maxFrameProgress = Math.max(0, frameCount - 1.001);
    const frameProgress = Math.min(maxFrameProgress, (elapsed / durationSeconds) * frameCount);
    firstFrameIndex = Math.floor(frameProgress);
    secondFrameIndex = Math.min(frameCount - 1, firstFrameIndex + 1);
    blend = frameProgress - Math.floor(frameProgress);
  }

  const firstFrame = frames[firstFrameIndex] ?? [];
  const secondFrame = frames[secondFrameIndex] ?? firstFrame;
  const sourceLength = Math.max(firstFrame.length, secondFrame.length, 1);

  for (let index = 0; index < target.length; index += 1) {
    const sourceIndex = Math.floor((index / target.length) * sourceLength);
    const firstValue = firstFrame[sourceIndex] ?? 0;
    const secondValue = secondFrame[sourceIndex] ?? firstValue;
    target[index] = Math.round(firstValue + (secondValue - firstValue) * blend);
  }
}

function smoothFrequencyValues(source: Uint8Array, target: Uint8Array) {
  for (let index = 0; index < target.length; index += 1) {
    const nextValue = source[index] ?? 0;
    const currentValue = target[index] ?? 0;
    const smoothing = nextValue > currentValue ? 0.62 : 0.28;
    target[index] = Math.round(currentValue + (nextValue - currentValue) * smoothing);
  }
}

function expandFrequencyDynamics(source: Uint8Array, target: Uint8Array) {
  let peak = 0;
  let total = 0;

  for (let index = 0; index < source.length; index += 1) {
    const value = source[index] ?? 0;
    peak = Math.max(peak, value);
    total += value;
  }

  const average = total / Math.max(1, source.length);
  const floor = Math.min(42, Math.max(8, average * 0.62));
  const dynamicRange = Math.max(18, peak - floor);
  const energy = Math.min(1, average / 96);
  const targetPeak = 168 + energy * 62;

  for (let index = 0; index < source.length; index += 1) {
    const value = source[index] ?? 0;
    const normalized = Math.max(0, value - floor) / dynamicRange;
    const curved = Math.pow(Math.min(1, normalized), 0.68);
    const bandBias = 0.88 + (1 - index / Math.max(1, source.length - 1)) * 0.18;
    target[index] = Math.max(0, Math.min(255, Math.round(curved * targetPeak * bandBias)));
  }
}

function drawWave(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  surfPuchiImages: SurfPuchiImages,
  surfPuchiMotion: SurfPuchiMotionState,
  isChibiModeEnabled: boolean,
  palette: VisualizerPalette,
  useOriginalColors: boolean,
) {
  const centerY = height * 0.52;
  const surfPoints: Array<{ x: number; y: number }> = [];
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let layer = 0; layer < 2; layer += 1) {
    context.beginPath();
    const color = paletteColor(palette, layer);
    const hue = 188 + layer * 54 + Math.sin(time * 0.0007) * 18;
    context.strokeStyle = useOriginalColors ? `hsla(${hue}, 92%, ${62 + layer * 5}%, ${0.72 - layer * 0.14})` : rgba(color, 0.72 - layer * 0.14);
    context.lineWidth = 4.6 - layer * 1.2;
    context.shadowBlur = 0;

    for (let x = 0; x <= width; x += 20) {
      const valueIndex = Math.floor((x / width) * (values.length - 1));
      const value = values[valueIndex] ?? 0;
      const amplitude = (value / 255) * height * (0.22 + layer * 0.04);
      const y = centerY + Math.sin(x * 0.012 + time * (0.002 + layer * 0.0005)) * amplitude;
      if (layer === 0) surfPoints.push({ x, y });

      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }

    context.stroke();
  }

  if (isChibiModeEnabled) {
    drawWaveSurfer(context, surfPoints, width, height, time, surfPuchiImages, surfPuchiMotion);
  }
}

function drawSpectrum(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  peakValues: Float32Array,
  palette: VisualizerPalette,
  useOriginalColors: boolean,
  chibiImages?: ChibiSpectrumImages[],
  chibiMotion?: ChibiSpectrumMotionState,
) {
  const barCount = spectrumBarCount;
  const gap = 5;
  const barWidth = Math.max(4, (width * 0.82) / barCount - gap);
  const startX = (width - (barWidth + gap) * barCount) / 2;
  const isChibiSpectrum = Boolean(chibiImages?.length);
  const baseY = height * (isChibiSpectrum ? 0.56 : 0.72);
  const maxBarHeight = height * (isChibiSpectrum ? 0.38 : 0.48);
  const capHeight = Math.max(2, Math.min(4, height * 0.005));
  const capGap = Math.max(4, height * 0.01);
  const peakDrop = height * 0.0022;

  context.shadowBlur = 0;
  for (let index = 0; index < barCount; index += 1) {
    const valueIndex = Math.floor((index / barCount) * (values.length - 1));
    const value = values[valueIndex] ?? 0;
    const normalized = value / 255;
    const barHeight = normalized * maxBarHeight;
    const color = paletteColor(palette, Math.floor((index / barCount) * palette.length));
    const hue = (index / barCount) * 210 + 168 + Math.sin(time * 0.0008) * 32;
    const x = startX + index * (barWidth + gap);
    const previousPeak = peakValues[index] ?? 0;
    const nextPeak = Math.max(barHeight, Math.max(0, previousPeak - peakDrop));
    peakValues[index] = nextPeak;

    context.fillStyle = useOriginalColors
      ? `hsla(${hue}, 96%, ${58 + normalized * 18}%, ${0.52 + normalized * 0.42})`
      : rgba(mixVisualizerColors(color, [255, 255, 255], normalized * 0.22), 0.52 + normalized * 0.42);
    context.fillRect(x, baseY - barHeight, barWidth, barHeight);

    context.fillStyle = useOriginalColors
      ? `hsla(${hue}, 96%, 78%, ${0.54 + Math.min(1, nextPeak / Math.max(1, height * 0.48)) * 0.32})`
      : rgba(mixVisualizerColors(color, [255, 255, 255], 0.38), 0.54 + Math.min(1, nextPeak / Math.max(1, height * 0.48)) * 0.32);
    context.beginPath();
    context.roundRect(x, baseY - nextPeak - capGap, barWidth, capHeight, 999);
    context.fill();
  }

  if (chibiImages?.length) {
    drawChibiSpectrumCharacters(context, values, width, height, time, baseY, startX, barWidth + gap, chibiImages, chibiMotion);
  }
}

function getChibiSpectrumPose(
  bandStats: ChibiSpectrumBandStats,
  index: number,
  time: number,
  chibiMotion?: ChibiSpectrumMotionState,
): ChibiSpectrumPose {
  const { average, texture } = bandStats;
  const normalizedAverage = average;
  if (!chibiMotion) return normalizedAverage >= chibiSpectrumConfig.swingThreshold ? "swing" : "raised";

  updateChibiSpectrumFatigue(chibiMotion, index, time, normalizedAverage < chibiSpectrumConfig.swingThreshold);

  const previousAverage = chibiMotion.previousAverages[index] ?? 0;
  const rise = normalizedAverage - previousAverage;
  chibiMotion.previousAverages[index] = previousAverage + (normalizedAverage - previousAverage) * 0.38;
  const previousTexture = chibiMotion.previousTextures[index] ?? 0;
  const textureRise = texture - previousTexture;
  chibiMotion.previousTextures[index] = previousTexture + (texture - previousTexture) * 0.32;

  if (normalizedAverage < chibiSpectrumConfig.swingThreshold) {
    chibiMotion.impactUntil[index] = 0;
    return "raised";
  }

  if (time < (chibiMotion.impactUntil[index] ?? 0)) return "impact";

  const lastImpactAt = chibiMotion.lastImpactAt[index] ?? 0;
  if (
    time - lastImpactAt >= chibiSpectrumConfig.impactCooldownMs &&
    (rise >= chibiSpectrumConfig.impactRiseThreshold || textureRise >= chibiSpectrumConfig.textureRiseThreshold)
  ) {
    chibiMotion.impactUntil[index] = time + chibiSpectrumConfig.impactHoldMs;
    chibiMotion.lastImpactAt[index] = time;
    chibiMotion.fatigueScores[index] = Math.min(chibiSpectrumConfig.fatigueHp + 1, (chibiMotion.fatigueScores[index] ?? 0) + 1);
    return "impact";
  }

  return "swing";
}

function updateChibiSpectrumFatigue(
  chibiMotion: ChibiSpectrumMotionState,
  index: number,
  time: number,
  isResting: boolean,
) {
  const lastUpdateAt = chibiMotion.lastMotionUpdateAt[index] || time;
  const elapsedSeconds = Math.max(0, (time - lastUpdateAt) / 1000);
  const recovery = elapsedSeconds * (isResting ? chibiSpectrumConfig.restRecoveryPerSecond : chibiSpectrumConfig.fatigueRecoveryPerSecond);
  chibiMotion.fatigueScores[index] = Math.max(0, (chibiMotion.fatigueScores[index] ?? 0) - recovery);
  chibiMotion.lastMotionUpdateAt[index] = time;
}

function getChibiSpectrumDisplayPose(
  pose: ChibiSpectrumPose,
  index: number,
  time: number,
  chibiMotion?: ChibiSpectrumMotionState,
): ChibiSpectrumPose {
  if (!chibiMotion) return pose;

  const collapsedUntil = chibiMotion.collapsedUntil[index] ?? 0;
  if (time < collapsedUntil) return "collapsed";
  if ((chibiMotion.fatigueScores[index] ?? 0) >= chibiSpectrumConfig.fatigueHp) {
    chibiMotion.collapsedUntil[index] = time + chibiSpectrumConfig.collapsedDurationMs;
    chibiMotion.fatigueScores[index] = 0;
    chibiMotion.impactUntil[index] = 0;
    chibiMotion.lastMotionUpdateAt[index] = time;
    chibiMotion.previousAverages[index] = 0;
    chibiMotion.previousTextures[index] = 0;
    return "collapsed";
  }

  if (pose === "raised") {
    chibiMotion.lastRaisedAt[index] = time;
    chibiMotion.collapsedUntil[index] = 0;
    return pose;
  }

  return pose;
}

function getChibiSpectrumAnimatedPose(
  bandStats: ChibiSpectrumBandStats,
  index: number,
  time: number,
  chibiMotion?: ChibiSpectrumMotionState,
) {
  if (chibiMotion && time < (chibiMotion.collapsedUntil[index] ?? 0)) {
    chibiMotion.fatigueScores[index] = 0;
    chibiMotion.impactUntil[index] = 0;
    chibiMotion.lastMotionUpdateAt[index] = time;
    chibiMotion.previousAverages[index] = bandStats.average;
    chibiMotion.previousTextures[index] = bandStats.texture;
    return "collapsed";
  }

  return getChibiSpectrumDisplayPose(
    getChibiSpectrumPose(bandStats, index, time, chibiMotion),
    index,
    time,
    chibiMotion,
  );
}

function getChibiSpectrumPosePulse(pose: ChibiSpectrumPose, normalizedAverage: number, chibiMotion: ChibiSpectrumMotionState | undefined, index: number, time: number) {
  if (pose === "impact") {
    const remainingImpact = Math.max(0, (chibiMotion?.impactUntil[index] ?? time) - time);
    const impactWeight = Math.min(1, remainingImpact / Math.max(1, chibiSpectrumConfig.impactHoldMs));
    return 1.02 + impactWeight * 0.08;
  }
  if (pose === "collapsed") return 1.08;
  if (pose === "swing") return 1 + Math.min(0.025, normalizedAverage * 0.025);
  return 1;
}

type ChibiSpectrumBandStats = {
  average: number;
  peak: number;
  texture: number;
};

function getChibiSpectrumBandStats(values: Uint8Array, bandIndex: number, bandCount: number): ChibiSpectrumBandStats {
  const startIndex = Math.floor((bandIndex / bandCount) * values.length);
  const endIndex = Math.max(startIndex + 1, Math.floor(((bandIndex + 1) / bandCount) * values.length));
  let total = 0;
  let peak = 0;
  let squaredDistanceTotal = 0;

  for (let index = startIndex; index < endIndex; index += 1) {
    const value = (values[index] ?? 0) / 255;
    total += value;
    peak = Math.max(peak, value);
  }

  const sampleCount = Math.max(1, endIndex - startIndex);
  const average = total / sampleCount;
  for (let index = startIndex; index < endIndex; index += 1) {
    const value = (values[index] ?? 0) / 255;
    squaredDistanceTotal += (value - average) ** 2;
  }

  const variance = squaredDistanceTotal / sampleCount;
  return {
    average,
    peak,
    texture: peak * 0.68 + Math.sqrt(variance) * 0.32,
  };
}

function drawChibiSpectrumCharacters(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  spectrumBaseY: number,
  spectrumStartX: number,
  spectrumStep: number,
  chibiImages: ChibiSpectrumImages[],
  chibiMotion?: ChibiSpectrumMotionState,
) {
  const characterCount = chibiImages.length;
  const barsPerCharacter = spectrumBarCount / characterCount;
  const spriteSize = Math.max(70, Math.min(138, width * 0.115, height * 0.23));
  const spriteTop = Math.min(height - spriteSize - 12, spectrumBaseY - spriteSize * 0.08);

  context.save();
  context.globalCompositeOperation = "source-over";

  for (let index = 0; index < characterCount; index += 1) {
    const bandStats = getChibiSpectrumBandStats(values, index, characterCount);
    const pose = getChibiSpectrumAnimatedPose(bandStats, index, time, chibiMotion);
    const image = chibiImages[index]?.[pose] ?? null;
    const firstBarIndex = index * barsPerCharacter;
    const lastBarIndex = (index + 1) * barsPerCharacter - 1;
    const centerBarIndex = (firstBarIndex + lastBarIndex) / 2;
    const x = spectrumStartX + centerBarIndex * spectrumStep + spectrumStep / 2;
    const pulse = getChibiSpectrumPosePulse(pose, bandStats.average, chibiMotion, index, time);

    drawChibiSpectrumPose(context, image, x, spriteTop, spriteSize * pulse);
  }

  context.restore();
}

function drawChibiSpectrumPose(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  spriteSize: number,
) {
  if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;

  const spriteWidth = spriteSize;
  const spriteHeight = spriteSize * (image.naturalHeight / image.naturalWidth);
  context.save();
  context.globalAlpha = 0.98;
  context.shadowColor = "rgba(0, 0, 0, 0.3)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 6;
  context.drawImage(image, x - spriteWidth / 2, y, spriteWidth, spriteHeight);
  context.restore();
}

function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement | null, width: number, height: number) {
  if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;

  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;
  const drawWidth = imageRatio > canvasRatio ? height * imageRatio : width;
  const drawHeight = imageRatio > canvasRatio ? height : width / imageRatio;
  const drawX = (width - drawWidth) / 2;
  const drawY = (height - drawHeight) / 2;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  return true;
}

function drawOrchestraVisualizer(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  images: OrchestraVisualizerImages,
  motion: OrchestraVisualizerMotionState,
  palette: VisualizerPalette,
) {
  const average = values.reduce((total, value) => total + value, 0) / Math.max(1, values.length) / 255;
  const backgroundBlend = Math.min(1, Math.max(0, (average - 0.08) / 0.24));

  context.save();
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, width, height);

  if (!drawCoverImage(context, images.backgrounds.holding, width, height)) {
    const fallbackGradient = context.createLinearGradient(0, 0, 0, height);
    fallbackGradient.addColorStop(0, "#2b1410");
    fallbackGradient.addColorStop(0.55, "#7a3e16");
    fallbackGradient.addColorStop(1, "#160b09");
    context.fillStyle = fallbackGradient;
    context.fillRect(0, 0, width, height);
  }
  if (backgroundBlend > 0.01 && images.backgrounds.playing?.complete) {
    context.globalAlpha = backgroundBlend * 0.72;
    drawCoverImage(context, images.backgrounds.playing, width, height);
    context.globalAlpha = 1;
  }

  context.fillStyle = rgba(paletteColor(palette, 0), 0.08 + average * 0.18);
  context.beginPath();
  context.ellipse(width * 0.5, height * 0.76, width * 0.46, height * 0.16, 0, 0, Math.PI * 2);
  context.fill();

  const sortedCharacters = orchestraCharacterSources
    .map((source, index) => ({ source, index }))
    .sort((first, second) => first.source.floorY - second.source.floorY);

  sortedCharacters.forEach(({ source, index }) => {
    const bandStats = getChibiSpectrumBandStats(values, source.band, orchestraCharacterSources.length);
    const currentEnergy = motion.energyWeights[index] ?? 0;
    const nextEnergy = currentEnergy + (bandStats.texture - currentEnergy) * (bandStats.texture > currentEnergy ? 0.22 : 0.08);
    motion.energyWeights[index] = nextEnergy;

    const targetPlaying = Math.min(1, Math.max(0, (nextEnergy - 0.12) / 0.22));
    const currentPlaying = motion.playingWeights[index] ?? 0;
    const nextPlaying = currentPlaying + (targetPlaying - currentPlaying) * (targetPlaying > currentPlaying ? 0.24 : 0.1);
    motion.playingWeights[index] = nextPlaying;

    const x = width * source.floorX;
    const floorY = height * source.floorY;
    const spriteHeight = Math.max(122, Math.min(height * 0.35, width * 0.2)) * source.baseScale * (1 + nextEnergy * 0.08);
    const bob = Math.sin(time * (0.0024 + index * 0.00018) + index * 0.7) * height * 0.008 * nextPlaying;
    const sway = Math.sin(time * (0.0018 + index * 0.00013) + index) * 0.035 * nextPlaying;
    const alpha = 0.98;

    drawOrchestraCharacter(context, images.characters[index]?.holding ?? null, x, floorY + bob, spriteHeight, sway * 0.35, alpha * (1 - nextPlaying));
    drawOrchestraCharacter(context, images.characters[index]?.playing ?? null, x, floorY + bob - spriteHeight * 0.014 * nextPlaying, spriteHeight * (1 + nextPlaying * 0.035), sway, alpha * nextPlaying);
  });

  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < 18; index += 1) {
    const value = (values[Math.floor((index / 18) * values.length)] ?? 0) / 255;
    if (value < 0.08) continue;
    const x = width * (0.16 + (index / 17) * 0.68);
    const y = height * (0.24 + Math.sin(time * 0.0007 + index) * 0.08);
    context.fillStyle = rgba(paletteColor(palette, index), 0.12 + value * 0.24);
    context.beginPath();
    context.arc(x, y, 1.4 + value * 4.6, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawOrchestraCharacter(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  floorY: number,
  spriteHeight: number,
  rotation: number,
  alpha: number,
) {
  if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0 || alpha <= 0.01) return;

  const spriteWidth = spriteHeight * (image.naturalWidth / image.naturalHeight);
  context.save();
  context.translate(x, floorY);
  context.rotate(rotation);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = alpha;
  context.shadowColor = "rgba(0, 0, 0, 0.34)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 8;
  context.drawImage(image, -spriteWidth / 2, -spriteHeight, spriteWidth, spriteHeight);
  context.restore();
}

function drawWaveSurfer(
  context: CanvasRenderingContext2D,
  surfacePoints: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  time: number,
  surfPuchiImages: SurfPuchiImages,
  surfPuchiMotion: SurfPuchiMotionState,
) {
  if (surfacePoints.length < 3) return;

  const fixedX = Math.max(width * 0.22, Math.min(width * 0.34, 330));
  const pointGap = Math.max(1, surfacePoints[1]?.x ?? 20);
  const preciseIndex = Math.max(1, Math.min(surfacePoints.length - 2, fixedX / pointGap));
  const leftIndex = Math.max(0, Math.min(surfacePoints.length - 2, Math.floor(preciseIndex)));
  const rightIndex = leftIndex + 1;
  const blend = preciseIndex - leftIndex;
  const leftPoint = surfacePoints[leftIndex];
  const rightPoint = surfacePoints[rightIndex];
  const previousPoint = surfacePoints[Math.max(0, leftIndex - 1)];
  const nextPoint = surfacePoints[Math.min(surfacePoints.length - 1, rightIndex + 1)];
  if (!leftPoint || !rightPoint || !previousPoint || !nextPoint) return;

  const x = leftPoint.x + (rightPoint.x - leftPoint.x) * blend;
  const y = leftPoint.y + (rightPoint.y - leftPoint.y) * blend;
  const slopeY = nextPoint.y - previousPoint.y;
  const slopeX = Math.max(1, nextPoint.x - previousPoint.x);
  const standingThreshold = height * 0.012;
  const paddlingThreshold = height * 0.004;
  if (slopeY > standingThreshold) {
    surfPuchiMotion.targetPose = "standing";
  } else if (slopeY < paddlingThreshold) {
    surfPuchiMotion.targetPose = "paddling";
  }

  const spriteSize = Math.max(58, Math.min(118, width * 0.09, height * 0.145));
  const slopeRotation = Math.max(-0.18, Math.min(0.2, Math.atan2(slopeY, slopeX) * 0.42));
  const bob = Math.sin(time * 0.0042) * height * 0.006;
  const targetStandingWeight = surfPuchiMotion.targetPose === "standing" ? 1 : 0;
  surfPuchiMotion.standingWeight += (targetStandingWeight - surfPuchiMotion.standingWeight) * 0.12;

  drawWaveSurferPose(context, surfPuchiImages.paddling, x - spriteSize * 0.02, y + bob + spriteSize * 0.04, spriteSize, 0.68, slopeRotation, 1 - surfPuchiMotion.standingWeight);
  drawWaveSurferPose(context, surfPuchiImages.standing, x + spriteSize * 0.02, y + bob - spriteSize * 0.06, spriteSize, 0.78, slopeRotation, surfPuchiMotion.standingWeight);
}

function drawWaveSurferPose(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  spriteSize: number,
  footOffset: number,
  rotation: number,
  alpha: number,
) {
  if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0 || alpha <= 0.01) return;

  const spriteWidth = spriteSize;
  const spriteHeight = spriteSize * (image.naturalHeight / image.naturalWidth);
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = alpha * 0.96;
  context.shadowColor = "rgba(0, 0, 0, 0.32)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 8;
  context.drawImage(image, -spriteWidth / 2, -spriteHeight * footOffset, spriteWidth, spriteHeight);
  context.restore();
}

function drawCircle(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  useOriginalColors: boolean,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.18;
  const barCount = 72;

  context.save();
  context.translate(centerX, centerY);
  context.rotate(time * 0.00008);
  context.lineCap = "round";
  context.shadowBlur = 0;

  for (let index = 0; index < barCount; index += 1) {
    const valueIndex = Math.floor((index / barCount) * (values.length - 1));
    const value = values[valueIndex] ?? 0;
    const normalized = value / 255;
    const angle = (index / barCount) * Math.PI * 2;
    const innerRadius = radius + Math.sin(time * 0.0012 + index * 0.12) * 8;
    const outerRadius = innerRadius + normalized * Math.min(width, height) * 0.2;
    const color = paletteColor(palette, Math.floor((index / barCount) * palette.length));
    const hue = 320 + (index / barCount) * 220 + Math.sin(time * 0.0006) * 28;

    context.beginPath();
    context.strokeStyle = useOriginalColors ? `hsla(${hue}, 96%, 64%, 0.78)` : rgba(color, 0.78);
    context.lineWidth = 2.8;
    context.moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
    context.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
    context.stroke();
  }

  context.beginPath();
  context.strokeStyle = "rgba(255, 255, 255, 0.36)";
  context.lineWidth = 1.5;
  context.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function averageFrequencyBand(values: Uint8Array, start: number, end: number) {
  const first = Math.max(0, Math.floor(values.length * start));
  const last = Math.max(first + 1, Math.min(values.length, Math.ceil(values.length * end)));
  let total = 0;
  for (let index = first; index < last; index += 1) total += values[index] ?? 0;
  return total / Math.max(1, last - first) / 255;
}

function deterministicNoise(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function drawMountains(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
) {
  const motionTime = time * (reducedMotion ? 0.00006 : 0.00028);
  const layerCount = reducedMotion ? 3 : 5;
  context.save();
  context.globalCompositeOperation = "lighter";
  context.filter = reducedMotion ? "blur(10px)" : "blur(18px)";

  for (let layer = 0; layer < layerCount; layer += 1) {
    const color = paletteColor(palette, layer);
    const baseline = height * (0.32 + layer * 0.09);
    const gradient = context.createLinearGradient(0, height * 0.18, 0, height * 0.82);
    gradient.addColorStop(0, rgba(color, 0));
    gradient.addColorStop(0.45, rgba(color, 0.1 + layer * 0.018));
    gradient.addColorStop(1, rgba(color, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(0, height);
    for (let x = 0; x <= width + 18; x += 18) {
      const progress = x / Math.max(1, width);
      const value = (values[Math.floor(progress * (values.length - 1))] ?? 0) / 255;
      const wave = Math.sin(progress * Math.PI * (2.4 + layer * 0.42) + motionTime * (1 + layer * 0.14) + layer) * height * 0.07;
      const shimmer = Math.sin(progress * Math.PI * 9 - motionTime * 1.8 + layer * 0.7) * height * 0.025;
      context.lineTo(x, baseline + wave + shimmer - value * height * (0.16 + layer * 0.012));
    }
    context.lineTo(width, height);
    context.closePath();
    context.fill();
  }
  context.filter = "none";
  context.restore();
}

function drawStarfield(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
) {
  const centerX = width * 0.5;
  const centerY = height * 0.49;
  const bass = averageFrequencyBand(values, 0, 0.16);
  const mids = averageFrequencyBand(values, 0.16, 0.48);
  const treble = averageFrequencyBand(values, 0.48, 0.9);
  const angularEnergies = captureScatteredAngularEnergy(values);
  const activity = Math.min(1, Math.sqrt(angularEnergies.reduce((total, energy) => total + energy * energy, 0) / warpAngularSectorCount) * 1.28);
  const starCount = reducedMotion ? 72 : 240;
  const speed = reducedMotion ? 0.000012 : 0.00011 + bass * 0.00025 + mids * 0.00004;
  const diagonal = Math.hypot(width, height);
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";

  const centerGlow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(width, height) * 0.34);
  centerGlow.addColorStop(0, rgba(mixVisualizerColors(paletteColor(palette, 0), [255, 255, 255], 0.48), 0.13 + bass * 0.12));
  centerGlow.addColorStop(0.16, rgba(paletteColor(palette, 2), 0.055 + mids * 0.07));
  centerGlow.addColorStop(0.52, rgba(paletteColor(palette, 0), 0.018));
  centerGlow.addColorStop(1, rgba(paletteColor(palette, 0), 0));
  context.fillStyle = centerGlow;
  context.fillRect(0, 0, width, height);

  if (!reducedMotion) {
    context.save();
    context.translate(centerX, centerY);
    context.scale(1, 0.58);
    for (let ringIndex = 0; ringIndex < 2; ringIndex += 1) {
      const phase = (time * speed * 0.2 + ringIndex * 0.53) % 1;
      const radius = diagonal * (0.055 + phase * 0.48);
      context.strokeStyle = rgba(paletteColor(palette, ringIndex * 2), (1 - phase) * (0.035 + bass * 0.05));
      context.lineWidth = 0.6 + (1 - phase) * 1.4;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  for (let index = 0; index < starCount; index += 1) {
    const angle = deterministicNoise(index + 2) * Math.PI * 2 + (deterministicNoise(index + 47) - 0.5) * 0.018;
    const normalizedAngle = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
    const sector = Math.floor(normalizedAngle * warpAngularSectorCount) % warpAngularSectorCount;
    const distributedEnergy = angularEnergies[sector] ?? 0;
    const densityThreshold = Math.min(0.96, 0.045 + Math.pow(Math.min(1, distributedEnergy * 1.3 + activity * 0.2), 0.72) * 0.915);
    if (deterministicNoise(index + 107) > densityThreshold) continue;
    const velocity = 0.62 + deterministicNoise(index + 9) * 0.76;
    const depth = (deterministicNoise(index + 31) + time * speed * velocity) % 1;
    const trailDepth = reducedMotion ? 0.008 : 0.008 + Math.pow(depth, 2.2) * (0.065 + bass * 0.1 + distributedEnergy * 0.16);
    const tailDepth = Math.max(0, depth - trailDepth);
    const radial = Math.pow(depth, 1.82) * diagonal * 0.72;
    const tailRadial = Math.pow(tailDepth, 1.82) * diagonal * 0.72;
    const stretch = 0.72 + deterministicNoise(index + 71) * 0.68;
    const x = centerX + Math.cos(angle) * radial * stretch;
    const y = centerY + Math.sin(angle) * radial * 0.58;
    const tailX = centerX + Math.cos(angle) * tailRadial * stretch;
    const tailY = centerY + Math.sin(angle) * tailRadial * 0.58;
    const energy = Math.max(distributedEnergy, (values[index % values.length] ?? 0) / 255 * 0.4);
    const size = 0.3 + Math.pow(depth, 1.7) * 2.1 + energy * 1.6;
    const color = mixVisualizerColors(paletteColor(palette, index), [232, 247, 255], 0.42 + depth * 0.2);
    const alpha = 0.1 + depth * 0.42 + energy * 0.42;

    if (!reducedMotion && depth > 0.34 && index % 3 === 0) {
      context.strokeStyle = rgba(color, alpha * 0.15);
      context.lineWidth = size * 5.2;
      context.beginPath();
      context.moveTo(tailX, tailY);
      context.lineTo(x, y);
      context.stroke();
    }

    context.strokeStyle = rgba(color, alpha);
    context.lineWidth = size;
    context.beginPath();
    context.moveTo(tailX, tailY);
    context.lineTo(x, y);
    context.stroke();
  }

  const flareColor = mixVisualizerColors(paletteColor(palette, 0), [255, 255, 255], 0.62);
  context.strokeStyle = rgba(flareColor, 0.12 + bass * 0.16);
  context.lineWidth = 0.7 + treble * 1.4;
  context.beginPath();
  context.moveTo(centerX - width * (0.08 + bass * 0.06), centerY);
  context.lineTo(centerX + width * (0.08 + bass * 0.06), centerY);
  context.stroke();
  context.restore();
}

function captureAuroraFrame(values: Uint8Array) {
  const frame = new Float32Array(auroraBandCount);
  const bandEdges = [0.02, 0.09, 0.2, 0.38, 0.62, 0.9];
  for (let band = 0; band < auroraBandCount; band += 1) {
    frame[band] = averageFrequencyBand(values, bandEdges[band] ?? 0, bandEdges[band + 1] ?? 1);
  }
  return frame;
}

function updateAuroraTimeline(
  state: AuroraTimelineState,
  values: Uint8Array,
  time: number,
  shouldCapture: boolean,
  reducedMotion: boolean,
) {
  if (!shouldCapture && state.frames.length > 0) return;
  const captureInterval = reducedMotion ? auroraCaptureIntervalMs * 1.8 : auroraCaptureIntervalMs;
  if (state.frames.length > 0 && time - state.lastCapturedAt < captureInterval) return;

  const frame = captureAuroraFrame(values);
  if (state.frames.length === 0) {
    state.frames = Array.from({ length: auroraFrameCount }, () => frame.slice());
  } else {
    state.frames.push(frame);
    if (state.frames.length > auroraFrameCount) state.frames.shift();
  }
  state.lastCapturedAt = time;
}

function interpolateAuroraEnergy(frame: Float32Array, progress: number) {
  const position = Math.max(0, Math.min(1, progress)) * (frame.length - 1);
  const firstIndex = Math.floor(position);
  const secondIndex = Math.min(frame.length - 1, firstIndex + 1);
  const amount = position - firstIndex;
  return (frame[firstIndex] ?? 0) * (1 - amount) + (frame[secondIndex] ?? 0) * amount;
}

function auroraGradientColor(palette: VisualizerPalette, progress: number) {
  const position = Math.max(0, Math.min(1, progress)) * (palette.length - 1);
  const firstIndex = Math.floor(position);
  const secondIndex = Math.min(palette.length - 1, firstIndex + 1);
  return mixVisualizerColors(paletteColor(palette, firstIndex), paletteColor(palette, secondIndex), position - firstIndex);
}

function getAuroraVisualizerPalette(palette: VisualizerPalette, paletteMode: VisualizerPaletteMode): VisualizerPalette {
  if (paletteMode === "rainbow") return rainbowVisualizerPalette;
  return [paletteColor(palette, 4), paletteColor(palette, 0), paletteColor(palette, 2), paletteColor(palette, 1)];
}

function drawAurora(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
  timeline: AuroraTimelineState,
  shouldCapture: boolean,
  profile: AuroraVisualProfile,
) {
  const isRainbow = profile === "rainbow";
  const isMist = profile === "mist";
  updateAuroraTimeline(timeline, values, time, shouldCapture, reducedMotion);
  const frames = timeline.frames;
  if (frames.length === 0) return;

  const visibleFrameCount = reducedMotion ? 3 : 5;
  const visibleFrames = frames.slice(-visibleFrameCount);
  const motionTime = time * (reducedMotion ? 0.000025 : 0.00009);
  const filamentCount = reducedMotion ? 34 : 76;
  const startX = width * 0.025;
  const endX = width * 0.975;
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";

  visibleFrames.forEach((frame, historyIndex) => {
    const historyProgress = historyIndex / Math.max(1, visibleFrames.length - 1);
    const historyAlpha = isRainbow
      ? (0.025 + historyProgress * 0.105) * 1.2
      : (0.035 + historyProgress * 0.14) * 1.18 * (isMist ? 0.68 : 1);
    const historyOffset = (1 - historyProgress) * height * 0.048;
    const points = Array.from({ length: filamentCount + 1 }, (_, index) => {
      const progress = index / filamentCount;
      const energy = interpolateAuroraEnergy(frame, progress);
      const noise = deterministicNoise(index * 1.73 + historyIndex * 31.7);
      const ridgeWave = Math.sin(progress * Math.PI * 1.55 + motionTime * 0.72 + historyIndex * 0.16) * height * 0.052
        + Math.sin(progress * Math.PI * 4.2 - motionTime + historyIndex * 0.11) * height * 0.014;
      const ridgeY = height * 0.17 + historyOffset + ridgeWave;
      const length = height * (0.2 + energy * 0.32 + Math.pow(noise, 1.7) * 0.16)
        * (0.86 + Math.sin(progress * Math.PI * 2.4 - motionTime * 1.2) * 0.12);
      const x = startX + (endX - startX) * progress
        + Math.sin(progress * Math.PI * 3.1 + motionTime + historyIndex * 0.18) * width * 0.008
        + (deterministicNoise(index * 4.93 + historyIndex * 17.1) - 0.5) * width * 0.009;
      return { energy, progress, ridgeY, x, bottomY: Math.min(height * 0.75, ridgeY + length) };
    });

    const sheetGradient = context.createLinearGradient(startX, 0, endX, 0);
    for (let stop = 0; stop <= auroraBandCount; stop += 1) {
      const progress = stop / auroraBandCount;
      sheetGradient.addColorStop(progress, rgba(auroraGradientColor(palette, progress), historyAlpha));
    }
    context.filter = reducedMotion
      ? `blur(${isMist ? 11 : 8}px)`
      : `blur(${(isMist ? 10 : 6) + (1 - historyProgress) * (isMist ? 14 : 10)}px)`;
    context.fillStyle = sheetGradient;
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.ridgeY);
      else context.lineTo(point.x, point.ridgeY);
    });
    for (let index = points.length - 1; index >= 0; index -= 1) {
      const point = points[index];
      if (point) context.lineTo(point.x, point.bottomY);
    }
    context.closePath();
    context.fill();

    const detailedHistoryCount = reducedMotion ? 1 : 2;
    if (historyIndex >= visibleFrames.length - detailedHistoryCount) {
      points.forEach((point, index) => {
        if (index === points.length - 1) return;
        const fold = 0.24 + Math.pow((Math.sin(point.progress * Math.PI * 17 - motionTime * 1.4 + historyIndex) + 1) * 0.5, 2) * 0.76;
        const whiteMix = (point.energy * 0.12 + fold * 0.08) * (isMist ? 0.18 : 1);
        const color = mixVisualizerColors(auroraGradientColor(palette, point.progress), [255, 255, 255], whiteMix);
        const alpha = historyAlpha * (0.58 + point.energy * 1.65) * (0.48 + fold * 1.12) * (isMist ? 0.7 : 1);
        const strokeGradient = context.createLinearGradient(0, point.ridgeY, 0, point.bottomY);
        strokeGradient.addColorStop(0, rgba(color, alpha * 0.32));
        strokeGradient.addColorStop(0.12, rgba(color, alpha));
        strokeGradient.addColorStop(0.58, rgba(color, alpha * 0.72));
        strokeGradient.addColorStop(0.9, rgba(color, alpha * 0.18));
        strokeGradient.addColorStop(1, rgba(color, 0));
        const lowerSway = Math.sin(point.progress * Math.PI * 7.4 - motionTime * 1.8 + historyIndex * 0.3) * width * (0.008 + point.energy * 0.016);
        context.filter = reducedMotion
          ? `blur(${isMist ? 2.5 : 1.5}px)`
          : `blur(${(isMist ? 1.4 : 0.7) + (1 - historyProgress) * (isMist ? 4.5 : 3.5)}px)`;
        context.strokeStyle = strokeGradient;
        context.lineWidth = 0.38 + point.energy * 1.45 + fold * 0.9;
        context.beginPath();
        context.moveTo(point.x, point.ridgeY);
        context.bezierCurveTo(
          point.x + Math.sin(motionTime + index) * width * 0.004,
          point.ridgeY + (point.bottomY - point.ridgeY) * 0.32,
          point.x + lowerSway * 0.55,
          point.ridgeY + (point.bottomY - point.ridgeY) * 0.72,
          point.x + lowerSway,
          point.bottomY,
        );
        context.stroke();
      });
    }

    if (historyIndex === visibleFrames.length - 1) {
      const drawRidge = (alpha: number, blur: number, lineWidth: number) => {
        const ridgeGradient = context.createLinearGradient(startX, 0, endX, 0);
        for (let stop = 0; stop <= auroraBandCount; stop += 1) {
          const progress = stop / auroraBandCount;
          ridgeGradient.addColorStop(progress, rgba(auroraGradientColor(palette, progress), alpha));
        }
        context.filter = `blur(${blur}px)`;
        context.strokeStyle = ridgeGradient;
        context.lineWidth = lineWidth;
        context.beginPath();
        points.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.ridgeY);
          else context.lineTo(point.x, point.ridgeY);
        });
        context.stroke();
      };
      drawRidge(isMist ? 0.18 : 0.34, reducedMotion ? (isMist ? 5 : 3) : (isMist ? 10 : 7), Math.max(3, Math.min(width, height) * 0.008));
      drawRidge(isMist ? 0.34 : 0.68, reducedMotion ? (isMist ? 1.6 : 0.8) : (isMist ? 2.4 : 1.4), Math.max(0.9, Math.min(width, height) * 0.0018));
    }
  });

  context.restore();
}

function captureFrequencyHelixFrame(values: Uint8Array) {
  const frame = new Float32Array(frequencyHelixBandCount);
  const usableValueCount = Math.max(1, Math.floor(values.length * 0.72));

  for (let band = 0; band < frequencyHelixBandCount; band += 1) {
    const startProgress = band / frequencyHelixBandCount;
    const endProgress = (band + 1) / frequencyHelixBandCount;
    const start = Math.floor(Math.pow(startProgress, 1.75) * usableValueCount);
    const end = Math.max(start + 1, Math.floor(Math.pow(endProgress, 1.75) * usableValueCount));
    let total = 0;
    for (let index = start; index < Math.min(end, values.length); index += 1) total += values[index] ?? 0;
    frame[band] = total / Math.max(1, Math.min(end, values.length) - start) / 255;
  }

  return frame;
}

function updateFrequencyHelixTimeline(
  state: FrequencyHelixTimelineState,
  values: Uint8Array,
  time: number,
  shouldCapture: boolean,
  reducedMotion: boolean,
) {
  if (!shouldCapture && state.frames.length > 0) return;
  const captureInterval = reducedMotion ? frequencyHelixCaptureIntervalMs * 1.8 : frequencyHelixCaptureIntervalMs;
  if (state.frames.length > 0 && time - state.lastCapturedAt < captureInterval) return;

  const frame = captureFrequencyHelixFrame(values);
  if (state.frames.length === 0) {
    state.frames = Array.from({ length: frequencyHelixFrameCount }, () => frame.slice());
  } else {
    state.frames.push(frame);
    if (state.frames.length > frequencyHelixFrameCount) state.frames.shift();
  }
  state.lastCapturedAt = time;
}

function drawFrequencyHelix(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
  timeline: FrequencyHelixTimelineState,
  shouldCapture: boolean,
) {
  updateFrequencyHelixTimeline(timeline, values, time, shouldCapture, reducedMotion);
  const frames = timeline.frames;
  if (frames.length === 0) return;

  const rowCount = reducedMotion ? 22 : 38;
  const bandStep = reducedMotion ? 2 : 1;
  const centerX = width * 0.5;
  const top = height * 0.16;
  const bottom = height * 0.72;
  const amplitude = Math.min(width * 0.31, height * 0.34);
  const rotation = reducedMotion ? 0.35 : time * 0.00036;
  const turns = Math.PI * 4.5;
  const rows = Array.from({ length: rowCount }, (_, row) => {
    const progress = row / Math.max(1, rowCount - 1);
    const frameIndex = Math.round(progress * (frames.length - 1));
    const phase = progress * turns - rotation;
    const perspective = 0.55 + progress * 0.45;
    const strandOffset = Math.sin(phase) * amplitude * perspective;
    return {
      frame: frames[frameIndex] ?? frames[frames.length - 1]!,
      leftX: centerX + strandOffset,
      progress,
      rightX: centerX - strandOffset,
      y: top + progress * (bottom - top),
    };
  });

  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";

  rows.forEach((row, rowIndex) => {
    const ageAlpha = 0.18 + row.progress * 0.58;
    const direction = row.rightX >= row.leftX ? 1 : -1;
    const segmentWidth = Math.abs(row.rightX - row.leftX) / frequencyHelixBandCount;

    context.beginPath();
    context.moveTo(row.leftX, row.y);
    context.lineTo(row.rightX, row.y);
    context.strokeStyle = rgba(paletteColor(palette, rowIndex), 0.045 + ageAlpha * 0.08);
    context.lineWidth = 0.7 + row.progress * 0.7;
    context.stroke();

    for (let band = 0; band < frequencyHelixBandCount; band += bandStep) {
      const energy = row.frame[band] ?? 0;
      const nextBand = Math.min(frequencyHelixBandCount, band + bandStep);
      const x1 = row.leftX + direction * segmentWidth * band;
      const x2 = row.leftX + direction * segmentWidth * nextBand;
      const color = mixVisualizerColors(paletteColor(palette, band), [255, 255, 255], energy * 0.22);
      context.beginPath();
      context.moveTo(x1, row.y);
      context.lineTo(x2, row.y);
      context.strokeStyle = rgba(color, (0.08 + energy * 0.82) * ageAlpha);
      context.lineWidth = 0.8 + energy * 3.1 * (0.65 + row.progress * 0.35);
      context.stroke();
    }
  });

  const drawStrand = (side: "left" | "right", colorIndex: number) => {
    context.beginPath();
    rows.forEach((row, index) => {
      const x = side === "left" ? row.leftX : row.rightX;
      if (index === 0) context.moveTo(x, row.y);
      else context.lineTo(x, row.y);
    });
    const gradient = context.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, rgba(paletteColor(palette, colorIndex), 0.16));
    gradient.addColorStop(0.55, rgba(paletteColor(palette, colorIndex), 0.62));
    gradient.addColorStop(1, rgba(paletteColor(palette, colorIndex), 0.86));
    context.strokeStyle = gradient;
    context.lineWidth = Math.max(1.4, Math.min(width, height) * 0.004);
    context.shadowColor = rgba(paletteColor(palette, colorIndex), 0.58);
    context.shadowBlur = reducedMotion ? 4 : 10;
    context.stroke();
  };

  drawStrand("left", 0);
  drawStrand("right", Math.max(1, Math.floor(palette.length / 2)));
  context.shadowBlur = 0;
  context.restore();
}

function drawWarpHole(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
) {
  const bass = averageFrequencyBand(values, 0, 0.09);
  const mid = averageFrequencyBand(values, 0.09, 0.38);
  const high = averageFrequencyBand(values, 0.38, 0.76);
  const activity = bass * 0.48 + mid * 0.34 + high * 0.18;
  const centerX = width * 0.5;
  const centerY = height * 0.44;
  const outerRadius = Math.max(42, Math.min(width * 0.38, height * 0.48));
  const innerRadius = outerRadius * (0.1 + bass * 0.035);
  const rotation = time * (reducedMotion ? 0.000035 : 0.00014);
  const verticalScale = 0.58;

  context.save();
  context.translate(centerX, centerY);
  context.scale(1, verticalScale);

  const shadow = context.createRadialGradient(0, 0, innerRadius * 0.22, 0, 0, outerRadius * 0.58);
  shadow.addColorStop(0, "rgba(0, 0, 0, 0.92)");
  shadow.addColorStop(0.35, "rgba(0, 0, 0, 0.76)");
  shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = shadow;
  context.beginPath();
  context.arc(0, 0, outerRadius * 0.72, 0, Math.PI * 2);
  context.fill();

  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  const armCount = reducedMotion ? 3 : 5;
  const pointCount = reducedMotion ? 30 : 52;
  for (let arm = 0; arm < armCount; arm += 1) {
    const color = paletteColor(palette, arm * 2);
    const armPhase = rotation + (arm / armCount) * Math.PI * 2;
    context.beginPath();
    for (let point = 0; point < pointCount; point += 1) {
      const progress = point / Math.max(1, pointCount - 1);
      const frequencyIndex = Math.min(values.length - 1, Math.floor(Math.pow(progress, 1.5) * values.length * 0.72));
      const energy = (values[frequencyIndex] ?? 0) / 255;
      const radius = innerRadius + Math.pow(progress, 0.72) * (outerRadius - innerRadius) * (0.92 + energy * 0.08);
      const angle = armPhase + progress * Math.PI * (2.55 + mid * 0.95) + Math.sin(progress * 15 + time * 0.0005) * energy * 0.06;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = rgba(color, 0.11 + activity * 0.28);
    context.lineWidth = 1.2 + activity * 2.2;
    context.shadowColor = rgba(color, 0.32 + activity * 0.32);
    context.shadowBlur = reducedMotion ? 5 : 11;
    context.stroke();
  }

  context.shadowBlur = 0;
  const streakCount = reducedMotion ? 14 : 28;
  for (let streak = 0; streak < streakCount; streak += 1) {
    const noise = deterministicNoise(streak * 2.37 + 11.4);
    const energy = (values[Math.min(values.length - 1, Math.floor(noise * values.length * 0.7))] ?? 0) / 255;
    const angle = rotation * (0.65 + noise * 0.55) + noise * Math.PI * 2 + streak * 2.399;
    const radius = innerRadius * 1.3 + Math.pow(deterministicNoise(streak * 4.11 + 2.8), 0.62) * (outerRadius - innerRadius * 1.3);
    const tail = 0.025 + energy * 0.1 + high * 0.035;
    const color = paletteColor(palette, streak);
    context.beginPath();
    context.arc(0, 0, radius, angle - tail, angle + tail * 0.25);
    context.strokeStyle = rgba(color, 0.1 + energy * 0.52);
    context.lineWidth = 0.55 + energy * 1.65;
    context.stroke();
  }

  const horizon = context.createRadialGradient(0, 0, innerRadius * 0.7, 0, 0, innerRadius * 2.4);
  horizon.addColorStop(0, "rgba(0, 0, 0, 0)");
  horizon.addColorStop(0.42, rgba(paletteColor(palette, 0), 0.08 + bass * 0.18));
  horizon.addColorStop(0.6, rgba(paletteColor(palette, Math.floor(palette.length / 2)), 0.22 + activity * 0.34));
  horizon.addColorStop(0.74, "rgba(0, 0, 0, 0)");
  context.fillStyle = horizon;
  context.beginPath();
  context.arc(0, 0, innerRadius * 2.55, 0, Math.PI * 2);
  context.fill();

  context.globalCompositeOperation = "source-over";
  context.fillStyle = "rgba(0, 0, 0, 0.9)";
  context.beginPath();
  context.arc(0, 0, innerRadius * 0.86, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawInk(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  palette: VisualizerPalette,
  reducedMotion: boolean,
) {
  const layerCount = reducedMotion ? 4 : 7;
  context.save();
  context.globalCompositeOperation = "source-over";
  context.filter = reducedMotion ? "blur(8px)" : "blur(14px)";

  for (let layer = 0; layer < layerCount; layer += 1) {
    const start = layer / layerCount;
    const energy = averageFrequencyBand(values, start, Math.min(1, start + 1 / layerCount));
    const phase = reducedMotion ? layer * 0.9 : time * (0.00012 + layer * 0.000014) + layer * 1.17;
    const x = width * (0.5 + Math.sin(phase) * (0.12 + layer * 0.018));
    const y = height * (0.5 + Math.cos(phase * 0.83) * (0.08 + layer * 0.014));
    const radius = Math.min(width, height) * (0.1 + layer * 0.025 + energy * 0.14);
    const color = paletteColor(palette, layer);
    const gradient = context.createRadialGradient(x, y, radius * 0.08, x, y, radius);
    gradient.addColorStop(0, rgba(color, 0.24 + energy * 0.24));
    gradient.addColorStop(0.58, rgba(color, 0.08 + energy * 0.14));
    gradient.addColorStop(1, rgba(color, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(x, y, radius * (1.3 + Math.sin(phase * 1.4) * 0.24), radius * (0.72 + Math.cos(phase) * 0.15), phase * 0.3, 0, Math.PI * 2);
    context.fill();
  }
  context.filter = "none";
  context.restore();
}

function drawVuMeters(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  palette: VisualizerPalette,
) {
  const meterCount = width < 700 ? 2 : 3;
  const panelWidth = Math.min(250, width * (meterCount === 2 ? 0.36 : 0.24));
  const panelHeight = Math.min(190, height * 0.3);
  const gap = Math.min(34, width * 0.035);
  const totalWidth = panelWidth * meterCount + gap * (meterCount - 1);
  const startX = (width - totalWidth) / 2;
  const top = height * 0.35;

  context.save();
  for (let meter = 0; meter < meterCount; meter += 1) {
    const bandStart = meter / meterCount;
    const energy = averageFrequencyBand(values, bandStart, (meter + 1) / meterCount);
    const x = startX + meter * (panelWidth + gap);
    const color = paletteColor(palette, meter);
    const panelGradient = context.createLinearGradient(0, top, 0, top + panelHeight);
    panelGradient.addColorStop(0, "rgba(255, 255, 255, 0.13)");
    panelGradient.addColorStop(1, rgba(color, 0.08));
    context.fillStyle = panelGradient;
    context.strokeStyle = "rgba(255, 255, 255, 0.24)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.roundRect(x, top, panelWidth, panelHeight, 18);
    context.fill();
    context.stroke();

    const pivotX = x + panelWidth / 2;
    const pivotY = top + panelHeight * 0.78;
    const arcRadius = panelWidth * 0.34;
    context.strokeStyle = rgba(color, 0.42);
    context.lineWidth = 5;
    context.beginPath();
    context.arc(pivotX, pivotY, arcRadius, Math.PI * 1.12, Math.PI * 1.88);
    context.stroke();

    for (let tick = 0; tick <= 10; tick += 1) {
      const angle = Math.PI * (1.12 + tick * 0.076);
      context.strokeStyle = tick > 7 ? "rgba(255, 104, 92, 0.72)" : "rgba(255, 255, 255, 0.42)";
      context.lineWidth = tick % 5 === 0 ? 2 : 1;
      context.beginPath();
      context.moveTo(pivotX + Math.cos(angle) * arcRadius * 0.86, pivotY + Math.sin(angle) * arcRadius * 0.86);
      context.lineTo(pivotX + Math.cos(angle) * arcRadius * 1.04, pivotY + Math.sin(angle) * arcRadius * 1.04);
      context.stroke();
    }

    const needleAngle = Math.PI * (1.12 + Math.min(1, energy) * 0.76);
    context.strokeStyle = rgba(mixVisualizerColors(color, [255, 255, 255], 0.38), 0.94);
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(pivotX, pivotY);
    context.lineTo(pivotX + Math.cos(needleAngle) * arcRadius * 0.94, pivotY + Math.sin(needleAngle) * arcRadius * 0.94);
    context.stroke();
    context.fillStyle = "rgba(245, 245, 248, 0.92)";
    context.beginPath();
    context.arc(pivotX, pivotY, 6, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawChibiCircle(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  chibiImages: ChibiCharacterImages[],
  chibiMotion: ChibiCircleMotionState,
  palette: VisualizerPalette,
) {
  const centerX = width / 2;
  const centerY = height * 0.5;
  const radius = Math.min(width, height) * 0.235;
  const characterCount = chibiCharacterSources.length;
  const spriteSize = Math.max(58, Math.min(116, Math.min(width, height) * 0.14));
  const items = Array.from({ length: characterCount }, (_, index) => {
    const angle = -Math.PI / 2 + (index / characterCount) * Math.PI * 2 + time * 0.00008;
    const valueIndex = Math.floor((index / characterCount) * (values.length - 1));
    const normalized = (values[valueIndex] ?? 0) / 255;
    const phase = index * 0.72;
    const beat = Math.max(0, Math.sin(time * 0.005 + phase)) * 0.1;
    const threshold = 0.29 + (index % 4) * 0.045;
    const targetWeight = normalized + beat > threshold ? 1 : 0;
    const currentWeight = chibiMotion.upWeights[index] ?? 0;
    const smoothing = targetWeight > currentWeight ? 0.22 : 0.1;
    const nextWeight = currentWeight + (targetWeight - currentWeight) * smoothing;
    chibiMotion.upWeights[index] = nextWeight;

    const pulse = normalized * Math.min(width, height) * 0.035;
    return {
      angle,
      imagePair: chibiImages[index],
      upWeight: nextWeight,
      x: centerX + Math.cos(angle) * (radius + pulse),
      y: centerY + Math.sin(angle) * (radius + pulse),
    };
  }).sort((first, second) => first.y - second.y);

  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = rgba(paletteColor(palette, 0), 0.22);
  context.lineWidth = 1.4;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  items.forEach(({ angle, imagePair, upWeight, x, y }) => {
    const radialX = Math.cos(angle);
    const radialY = Math.sin(angle);
    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle);
    const downOffset = spriteSize * 0.035;
    const upOffset = spriteSize * (0.075 + upWeight * 0.025);
    const tangentOffset = spriteSize * 0.012;
    const rotation = angle + Math.PI / 2;
    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = rgba(paletteColor(palette, Math.floor(((angle + Math.PI * 2.5) / (Math.PI * 2)) * palette.length)), 0.08 + upWeight * 0.13);
    context.beginPath();
    context.arc(x, y, spriteSize * (0.24 + upWeight * 0.08), 0, Math.PI * 2);
    context.fill();
    context.restore();
    drawChibiCirclePose(
      context,
      imagePair?.down ?? null,
      x + radialX * downOffset - tangentX * tangentOffset,
      y + radialY * downOffset - tangentY * tangentOffset,
      spriteSize,
      rotation,
      1 - upWeight,
    );
    drawChibiCirclePose(
      context,
      imagePair?.up ?? null,
      x + radialX * upOffset + tangentX * tangentOffset,
      y + radialY * upOffset + tangentY * tangentOffset,
      spriteSize,
      rotation,
      upWeight,
    );
  });
}

function drawChibiCirclePose(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  spriteSize: number,
  rotation: number,
  alpha: number,
) {
  if (!image?.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0 || alpha <= 0.01) return;

  const spriteWidth = spriteSize;
  const spriteHeight = spriteSize * (image.naturalHeight / image.naturalWidth);
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = Math.min(1, alpha) * 0.96;
  context.shadowColor = "rgba(0, 0, 0, 0.28)";
  context.shadowBlur = 14;
  context.shadowOffsetY = 7;
  context.drawImage(image, -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight);
  context.restore();
}

export function PlayerVisualizerOverlay({
  audioAnalysisPacketRef,
  audioRef,
  currentAlbum,
  currentLyrics,
  currentTrack,
  isPlaying,
  onClose,
  onNextTrack,
  onPreviousTrack,
  onQueueTrackPlay,
  onTogglePlayback,
  preferRemoteAudioAnalysis = false,
  remotePlaybackClockRef,
  queueTracks,
  t,
}: PlayerVisualizerOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const auroraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const auroraWebglVisualizerRef = useRef<AuroraWebGLVisualizer | null>(null);
  const starfieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const starfieldWebglVisualizerRef = useRef<WarpStarfieldWebGLVisualizer | null>(null);
  const helixCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const helixWebglVisualizerRef = useRef<FrequencyHelixWebGLVisualizer | null>(null);
  const warpHoleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const warpHoleWebglVisualizerRef = useRef<WarpHoleWebGLVisualizer | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const surfPuchiImagesRef = useRef<SurfPuchiImages>({ paddling: null, standing: null });
  const surfPuchiMotionRef = useRef<SurfPuchiMotionState>({ standingWeight: 0, targetPose: "paddling" });
  const chibiImagesRef = useRef<ChibiCharacterImages[]>(chibiCharacterSources.map(() => ({ down: null, up: null })));
  const chibiSpectrumImagesRef = useRef<ChibiSpectrumImages[]>(chibiSpectrumSources.map(() => ({ raised: null, swing: null, impact: null, collapsed: null })));
  const orchestraImagesRef = useRef<OrchestraVisualizerImages>({
    backgrounds: { holding: null, playing: null },
    characters: orchestraCharacterSources.map(() => ({ holding: null, playing: null })),
  });
  const chibiSpectrumMotionRef = useRef<ChibiSpectrumMotionState>({
    collapsedUntil: new Float64Array(chibiSpectrumSources.length),
    fatigueScores: new Float64Array(chibiSpectrumSources.length),
    impactUntil: new Float64Array(chibiSpectrumSources.length),
    lastImpactAt: new Float64Array(chibiSpectrumSources.length),
    lastMotionUpdateAt: new Float64Array(chibiSpectrumSources.length),
    lastRaisedAt: new Float64Array(chibiSpectrumSources.length),
    previousAverages: new Float64Array(chibiSpectrumSources.length),
    previousTextures: new Float64Array(chibiSpectrumSources.length),
  });
  const chibiCircleMotionRef = useRef<ChibiCircleMotionState>({ upWeights: new Float32Array(chibiCharacterSources.length) });
  const orchestraMotionRef = useRef<OrchestraVisualizerMotionState>({
    energyWeights: new Float32Array(orchestraCharacterSources.length),
    playingWeights: new Float32Array(orchestraCharacterSources.length),
  });
  const frequencyHelixTimelineRef = useRef<FrequencyHelixTimelineState>({ frames: [], lastCapturedAt: 0 });
  const auroraTimelineRef = useRef<AuroraTimelineState>({ frames: [], lastCapturedAt: 0 });
  const chibiSingleTapTimerRef = useRef<number | null>(null);
  const lastChibiTouchAtRef = useRef(0);
  const suppressNextChibiClickRef = useRef(false);
  const [hasAudioAnalysis, setHasAudioAnalysis] = useState(false);
  const [mode, setMode] = useState<VisualizerMode>(() => {
    const storedMode = window.localStorage.getItem(visualizerModeStorageKey);
    return isVisualizerMode(storedMode) ? storedMode : "spectrum";
  });
  const [paletteMode, setPaletteMode] = useState<VisualizerPaletteMode>(() => {
    const storedPaletteMode = window.localStorage.getItem(visualizerPaletteStorageKey);
    return isVisualizerPaletteMode(storedPaletteMode) ? storedPaletteMode : "theme";
  });
  const [visualizerPalette, setVisualizerPalette] = useState<VisualizerPalette>(() => getThemeVisualizerPalette());
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [isChibiModeEnabled, setIsChibiModeEnabled] = useState(() => window.localStorage.getItem(chibiModeStorageKey) === "true");
  const [isOrchestraModeEnabled, setIsOrchestraModeEnabled] = useState(false);
  const [surfPuchiGender] = useState<SurfPuchiGender>(() => (Math.random() < 0.5 ? "boy" : "girl"));
  const [characterImageVersion, setCharacterImageVersion] = useState(0);
  const albumTitle = currentAlbum ? localizeLibraryText(currentAlbum.title, t) : "";
  const trackTitle = currentTrack ? localizeLibraryText(currentTrack.title, t) : t("player.nothingSelected");
  const artist = currentTrack ? localizeLibraryText(currentTrack.artist, t) : t("player.pickPrompt");
  const artworkSrc = currentAlbum ? getArtworkSrc(currentAlbum) : "";
  const lyricLines = currentLyrics ? currentLyrics.replace(/\r\n/g, "\n").split("\n") : [];
  const isVisualizerLive = isPlaying && (hasAudioAnalysis || preferRemoteAudioAnalysis || Boolean(audioAnalysisPacketRef.current?.frames.length));
  // The live loop reads image refs directly; only an idle one-shot needs an image-load refresh.
  const idleCharacterImageVersion = isVisualizerLive ? 0 : characterImageVersion;
  const auroraVisualizerPalette = useMemo(
    () => getAuroraVisualizerPalette(visualizerPalette, paletteMode),
    [paletteMode, visualizerPalette],
  );
  const auroraVisualProfile = resolveAuroraVisualProfile(paletteMode);
  const overlayStyle = artworkSrc
    ? ({ "--visualizer-artwork": `url("${artworkSrc.replace(/"/g, '\\"')}")` } as CSSProperties)
    : undefined;
  const selectVisualizerMode = (nextMode: VisualizerMode) => {
    setIsOrchestraModeEnabled(false);
    setMode(nextMode);
  };
  const activateOrchestraMode = () => {
    if (chibiSingleTapTimerRef.current !== null) {
      window.clearTimeout(chibiSingleTapTimerRef.current);
      chibiSingleTapTimerRef.current = null;
    }
    setMode("spectrum");
    setIsOrchestraModeEnabled((value) => !value);
  };
  const handleChibiToggleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (suppressNextChibiClickRef.current || event.detail > 1) {
      suppressNextChibiClickRef.current = false;
      event.preventDefault();
      if (chibiSingleTapTimerRef.current !== null) {
        window.clearTimeout(chibiSingleTapTimerRef.current);
        chibiSingleTapTimerRef.current = null;
      }
      return;
    }
    if (chibiSingleTapTimerRef.current !== null) window.clearTimeout(chibiSingleTapTimerRef.current);
    chibiSingleTapTimerRef.current = window.setTimeout(() => {
      chibiSingleTapTimerRef.current = null;
      setIsOrchestraModeEnabled(false);
      setIsChibiModeEnabled((value) => !value);
    }, chibiToggleDoubleTapMs);
  };
  const handleChibiToggleDoubleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    activateOrchestraMode();
  };
  const handleChibiTogglePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "touch") return;
    const now = performance.now();
    if (now - lastChibiTouchAtRef.current <= chibiToggleDoubleTapMs) {
      suppressNextChibiClickRef.current = true;
      activateOrchestraMode();
      lastChibiTouchAtRef.current = 0;
      return;
    }
    lastChibiTouchAtRef.current = now;
  };

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    window.localStorage.setItem(chibiModeStorageKey, String(isChibiModeEnabled));
  }, [isChibiModeEnabled]);

  useEffect(() => () => {
    if (chibiSingleTapTimerRef.current !== null) window.clearTimeout(chibiSingleTapTimerRef.current);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(visualizerModeStorageKey, mode);
  }, [mode]);

  useEffect(() => {
    frequencyHelixTimelineRef.current = { frames: [], lastCapturedAt: 0 };
    helixWebglVisualizerRef.current?.reset();
    warpHoleWebglVisualizerRef.current?.reset();
    auroraTimelineRef.current = { frames: [], lastCapturedAt: 0 };
  }, [currentTrack?.id]);

  useEffect(() => {
    window.localStorage.setItem(visualizerPaletteStorageKey, paletteMode);
  }, [paletteMode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReducedMotion(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const updatePalette = async () => {
      if (paletteMode === "rainbow") {
        setVisualizerPalette(rainbowVisualizerPalette);
        return;
      }
      if (paletteMode === "original") {
        setVisualizerPalette(originalVisualizerPalette);
        return;
      }
      const themePalette = getThemeVisualizerPalette();
      if (paletteMode === "artwork") {
        const artworkPalette = await extractArtworkVisualizerPalette(artworkSrc);
        if (!cancelled) setVisualizerPalette(artworkPalette ?? themePalette);
        return;
      }
      setVisualizerPalette(themePalette);
    };
    void updatePalette();

    const observer = new MutationObserver(() => void updatePalette());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [artworkSrc, paletteMode]);

  useEffect(() => {
    let isCancelled = false;
    const nextImages: SurfPuchiImages = { paddling: null, standing: null };

    (Object.entries(surfPuchiSources[surfPuchiGender]) as Array<[SurfPuchiPose, string]>).forEach(([pose, src]) => {
      const image = new Image();
      image.onload = () => {
        if (isCancelled) return;
        nextImages[pose] = image;
        surfPuchiImagesRef.current = { ...nextImages };
        setCharacterImageVersion((version) => version + 1);
      };
      image.src = src;
    });

    return () => {
      isCancelled = true;
    };
  }, [surfPuchiGender]);

  useEffect(() => {
    let isCancelled = false;
    const nextImages = chibiCharacterSources.map(() => ({ down: null, up: null } satisfies ChibiCharacterImages));

    chibiCharacterSources.forEach((source, index) => {
      (Object.entries(source) as Array<[keyof ChibiCharacterImages, string]>).forEach(([pose, src]) => {
        const image = new Image();
        image.onload = () => {
          if (isCancelled) return;
          nextImages[index] = { ...nextImages[index], [pose]: image };
          chibiImagesRef.current = nextImages.map((item) => ({ ...item }));
          setCharacterImageVersion((version) => version + 1);
        };
        image.src = src;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== "aurora" || !auroraCanvasRef.current) {
      auroraWebglVisualizerRef.current?.dispose();
      auroraWebglVisualizerRef.current = null;
      return;
    }

    try {
      auroraWebglVisualizerRef.current = new AuroraWebGLVisualizer(auroraCanvasRef.current);
    } catch {
      auroraWebglVisualizerRef.current = null;
    }

    return () => {
      auroraWebglVisualizerRef.current?.dispose();
      auroraWebglVisualizerRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "starfield" || !starfieldCanvasRef.current) {
      starfieldWebglVisualizerRef.current?.dispose();
      starfieldWebglVisualizerRef.current = null;
      return;
    }

    try {
      starfieldWebglVisualizerRef.current = new WarpStarfieldWebGLVisualizer(starfieldCanvasRef.current);
    } catch {
      starfieldWebglVisualizerRef.current = null;
    }

    return () => {
      starfieldWebglVisualizerRef.current?.dispose();
      starfieldWebglVisualizerRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "tunnel" || !helixCanvasRef.current) {
      helixWebglVisualizerRef.current?.dispose();
      helixWebglVisualizerRef.current = null;
      return;
    }

    try {
      helixWebglVisualizerRef.current = new FrequencyHelixWebGLVisualizer(helixCanvasRef.current);
    } catch {
      helixWebglVisualizerRef.current = null;
    }

    return () => {
      helixWebglVisualizerRef.current?.dispose();
      helixWebglVisualizerRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "warp" || !warpHoleCanvasRef.current) {
      warpHoleWebglVisualizerRef.current?.dispose();
      warpHoleWebglVisualizerRef.current = null;
      return;
    }

    try {
      warpHoleWebglVisualizerRef.current = new WarpHoleWebGLVisualizer(warpHoleCanvasRef.current);
    } catch {
      warpHoleWebglVisualizerRef.current = null;
    }

    return () => {
      warpHoleWebglVisualizerRef.current?.dispose();
      warpHoleWebglVisualizerRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    let isCancelled = false;
    const nextImages = chibiSpectrumSources.map(() => ({ raised: null, swing: null, impact: null, collapsed: null } satisfies ChibiSpectrumImages));

    chibiSpectrumSources.forEach((source, index) => {
      (Object.entries(source) as Array<[ChibiSpectrumPose, string]>).forEach(([pose, src]) => {
        const image = new Image();
        image.onload = () => {
          if (isCancelled) return;
          nextImages[index] = { ...nextImages[index], [pose]: image };
          chibiSpectrumImagesRef.current = nextImages.map((item) => ({ ...item }));
          setCharacterImageVersion((version) => version + 1);
        };
        image.src = src;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const nextImages: OrchestraVisualizerImages = {
      backgrounds: { holding: null, playing: null },
      characters: orchestraCharacterSources.map(() => ({ holding: null, playing: null })),
    };

    (Object.entries({ holding: orchestraHoldingBackgroundSrc, playing: orchestraPlayingBackgroundSrc }) as Array<[OrchestraVisualizerPose, string]>).forEach(([pose, src]) => {
      const image = new Image();
      image.onload = () => {
        if (isCancelled) return;
        nextImages.backgrounds = { ...nextImages.backgrounds, [pose]: image };
        orchestraImagesRef.current = {
          backgrounds: { ...nextImages.backgrounds },
          characters: nextImages.characters.map((item) => ({ ...item })),
        };
        setCharacterImageVersion((version) => version + 1);
      };
      image.src = src;
    });

    orchestraCharacterSources.forEach((source, index) => {
      (Object.entries({ holding: source.holding, playing: source.playing }) as Array<[OrchestraVisualizerPose, string]>).forEach(([pose, src]) => {
        const image = new Image();
        image.onload = () => {
          if (isCancelled) return;
          nextImages.characters[index] = { ...nextImages.characters[index], [pose]: image };
          orchestraImagesRef.current = {
            backgrounds: { ...nextImages.backgrounds },
            characters: nextImages.characters.map((item) => ({ ...item })),
          };
          setCharacterImageVersion((version) => version + 1);
        };
        image.src = src;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    // Tauri and synchronized browser playback already receive analysis frames from
    // the local backend. Do not reroute the media element through Web Audio: a
    // suspended AudioContext in Windows WebView2 would otherwise silence playback.
    if (preferRemoteAudioAnalysis) {
      analyserRef.current = null;
      setHasAudioAnalysis(false);
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      analyserRef.current = null;
      setHasAudioAnalysis(false);
      return;
    }

    try {
      const node = getAudioVisualizerNode(audio);
      if (!node) {
        analyserRef.current = null;
        setHasAudioAnalysis(false);
        return;
      }
      analyserRef.current = node.analyser;
      setHasAudioAnalysis(true);
      if (isPlaying && node.context.state === "suspended") {
        void node.context.resume();
      }
    } catch {
      analyserRef.current = null;
      setHasAudioAnalysis(false);
    }
  }, [audioRef, currentTrack, isPlaying, preferRemoteAudioAnalysis]);

  useEffect(() => {
    const visualizerCanvas = canvasRef.current;
    if (!visualizerCanvas) return;

    const visualizerContext = visualizerCanvas.getContext("2d");
    if (!visualizerContext) return;
    const canvasElement: HTMLCanvasElement = visualizerCanvas;
    const drawingContext: CanvasRenderingContext2D = visualizerContext;

    let animationFrame = 0;
    let rect = canvasElement.getBoundingClientRect();
    const maxCanvasScale = preferRemoteAudioAnalysis ? remoteVisualizerCanvasMaxScale : visualizerCanvasMaxScale;
    let scale = Math.min(window.devicePixelRatio || 1, maxCanvasScale);
    const frequencyValues = new Uint8Array(256);
    const smoothedFrequencyValues = new Uint8Array(256);
    const visualFrequencyValues = new Uint8Array(256);
    const spectrumPeakValues = new Float32Array(48);
    const auroraWebglVisualizer = mode === "aurora" ? auroraWebglVisualizerRef.current : null;
    const starfieldWebglVisualizer = mode === "starfield" ? starfieldWebglVisualizerRef.current : null;
    const helixWebglVisualizer = mode === "tunnel" ? helixWebglVisualizerRef.current : null;
    const warpHoleWebglVisualizer = mode === "warp" ? warpHoleWebglVisualizerRef.current : null;
    const usesDedicatedWebglCanvas = Boolean(auroraWebglVisualizer || starfieldWebglVisualizer || helixWebglVisualizer || warpHoleWebglVisualizer);

    // Remove the previous 2D frame once, then leave the transparent base canvas untouched.
    if (usesDedicatedWebglCanvas) {
      drawingContext.save();
      drawingContext.setTransform(1, 0, 0, 1, 0, 0);
      drawingContext.clearRect(0, 0, canvasElement.width, canvasElement.height);
      drawingContext.restore();
    }

    const resizeObserver = new ResizeObserver(() => {
      rect = canvasElement.getBoundingClientRect();
      scale = Math.min(window.devicePixelRatio || 1, maxCanvasScale);
      if (usesDedicatedWebglCanvas) return;
      const width = Math.max(1, Math.floor(rect.width * scale));
      const height = Math.max(1, Math.floor(rect.height * scale));

      if (canvasElement.width !== width || canvasElement.height !== height) {
        canvasElement.width = width;
        canvasElement.height = height;
      }
    });

    resizeObserver.observe(canvasElement);

    function drawSelectedVisualizer(values: Uint8Array, time: number, isIdle: boolean) {
      if (auroraWebglVisualizer) {
        auroraWebglVisualizer.render(values, time, auroraVisualizerPalette, reducedMotion, !isIdle, auroraVisualProfile);
        return;
      }
      if (starfieldWebglVisualizer) {
        starfieldWebglVisualizer.render(values, time, visualizerPalette, reducedMotion, !isIdle);
        return;
      }
      if (helixWebglVisualizer) {
        helixWebglVisualizer.render(values, time, visualizerPalette, reducedMotion, !isIdle);
        return;
      }
      if (warpHoleWebglVisualizer) {
        warpHoleWebglVisualizer.render(values, time, visualizerPalette, reducedMotion, !isIdle);
        return;
      }

      drawingContext.globalCompositeOperation = "source-over";
      const useOriginalColors = paletteMode === "original";
      if (isOrchestraModeEnabled) {
        drawOrchestraVisualizer(drawingContext, values, rect.width, rect.height, time, orchestraImagesRef.current, orchestraMotionRef.current, visualizerPalette);
      } else if (mode === "wave") {
        if (isIdle && !isChibiModeEnabled) drawIdleVisualizer(drawingContext, rect.width, rect.height, mode, visualizerPalette, useOriginalColors);
        else drawWave(drawingContext, values, rect.width, rect.height, time, surfPuchiImagesRef.current, surfPuchiMotionRef.current, isChibiModeEnabled, visualizerPalette, useOriginalColors);
      } else if (mode === "spectrum") {
        if (isIdle && !isChibiModeEnabled) drawIdleVisualizer(drawingContext, rect.width, rect.height, mode, visualizerPalette, useOriginalColors);
        else {
          drawSpectrum(
            drawingContext,
            values,
            rect.width,
            rect.height,
            time,
            spectrumPeakValues,
            visualizerPalette,
            useOriginalColors,
            isChibiModeEnabled ? chibiSpectrumImagesRef.current : undefined,
            isChibiModeEnabled ? chibiSpectrumMotionRef.current : undefined,
          );
        }
      } else if (mode === "circle") {
        if (isChibiModeEnabled) drawChibiCircle(drawingContext, values, rect.width, rect.height, time, chibiImagesRef.current, chibiCircleMotionRef.current, visualizerPalette);
        else if (isIdle) drawIdleVisualizer(drawingContext, rect.width, rect.height, mode, visualizerPalette, useOriginalColors);
        else drawCircle(drawingContext, values, rect.width, rect.height, time, visualizerPalette, useOriginalColors);
      } else if (mode === "mountains") {
        drawMountains(drawingContext, values, rect.width, rect.height, time, visualizerPalette, reducedMotion);
      } else if (mode === "aurora") {
        drawAurora(drawingContext, values, rect.width, rect.height, time, auroraVisualizerPalette, reducedMotion, auroraTimelineRef.current, !isIdle, auroraVisualProfile);
      } else if (mode === "starfield") {
        drawStarfield(drawingContext, values, rect.width, rect.height, time, visualizerPalette, reducedMotion);
      } else if (mode === "tunnel") {
        drawFrequencyHelix(drawingContext, values, rect.width, rect.height, time, visualizerPalette, reducedMotion, frequencyHelixTimelineRef.current, !isIdle);
      } else if (mode === "warp") {
        drawWarpHole(drawingContext, values, rect.width, rect.height, time, visualizerPalette, reducedMotion);
      } else if (mode === "ink") {
        drawInk(drawingContext, values, rect.width, rect.height, time, visualizerPalette, reducedMotion);
      } else {
        drawVuMeters(drawingContext, values, rect.width, rect.height, visualizerPalette);
      }
      drawingContext.globalCompositeOperation = "source-over";
    }

    if (!isVisualizerLive) {
      if (!usesDedicatedWebglCanvas) {
        canvasElement.width = Math.max(1, Math.floor(rect.width * scale));
        canvasElement.height = Math.max(1, Math.floor(rect.height * scale));
        drawingContext.setTransform(scale, 0, 0, scale, 0, 0);
        drawingContext.clearRect(0, 0, rect.width, rect.height);
      }
      visualFrequencyValues.fill(0);
      drawSelectedVisualizer(visualFrequencyValues, performance.now(), true);
      return () => resizeObserver.disconnect();
    }

    function render(time: number) {
      if (!usesDedicatedWebglCanvas) {
        const width = Math.max(1, Math.floor(rect.width * scale));
        const height = Math.max(1, Math.floor(rect.height * scale));

        if (canvasElement.width !== width || canvasElement.height !== height) {
          canvasElement.width = width;
          canvasElement.height = height;
        }

        drawingContext.setTransform(scale, 0, 0, scale, 0, 0);
        drawingContext.clearRect(0, 0, rect.width, rect.height);
        drawingContext.globalCompositeOperation = "source-over";
      }

      const analyser = analyserRef.current;
      const currentAudioAnalysisPacket = audioAnalysisPacketRef.current;
      if (currentAudioAnalysisPacket?.frames.length) {
        copyRemoteAnalysisFrame(
          currentAudioAnalysisPacket,
          time,
          frequencyValues,
          estimateRemotePlaybackTime(remotePlaybackClockRef?.current ?? null),
        );
      } else if (analyser) {
        analyser.getByteFrequencyData(frequencyValues);
      } else if (currentAudioAnalysisPacket?.frames[0]?.length) {
        copyAnalysisFrame(currentAudioAnalysisPacket.frames[0], frequencyValues);
      } else {
        frequencyValues.fill(0);
      }

      smoothFrequencyValues(frequencyValues, smoothedFrequencyValues);
      expandFrequencyDynamics(smoothedFrequencyValues, visualFrequencyValues);
      const drawableFrequencyValues = visualFrequencyValues;

      drawSelectedVisualizer(drawableFrequencyValues, time, false);
      animationFrame = window.requestAnimationFrame(render);
    }

    animationFrame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [audioAnalysisPacketRef, auroraVisualProfile, auroraVisualizerPalette, idleCharacterImageVersion, isChibiModeEnabled, isOrchestraModeEnabled, isVisualizerLive, mode, paletteMode, preferRemoteAudioAnalysis, reducedMotion, remotePlaybackClockRef, visualizerPalette]);

  return (
    <section aria-label={t("player.visualizerLabel")} aria-modal="true" className="player-visualizer-overlay" role="dialog" style={overlayStyle}>
      <div className="visualizer-stage">
        <div className="visualizer-artwork-backdrop" aria-hidden="true" />
        <canvas className="visualizer-canvas" ref={canvasRef} aria-hidden="true" />
        <canvas className={mode === "aurora" ? "visualizer-canvas visualizer-aurora-canvas active" : "visualizer-canvas visualizer-aurora-canvas"} ref={auroraCanvasRef} aria-hidden="true" />
        <canvas className={mode === "starfield" ? "visualizer-canvas visualizer-starfield-canvas active" : "visualizer-canvas visualizer-starfield-canvas"} ref={starfieldCanvasRef} aria-hidden="true" />
        <canvas className={mode === "tunnel" ? "visualizer-canvas visualizer-helix-canvas active" : "visualizer-canvas visualizer-helix-canvas"} ref={helixCanvasRef} aria-hidden="true" />
        <canvas className={mode === "warp" ? "visualizer-canvas visualizer-warp-hole-canvas active" : "visualizer-canvas visualizer-warp-hole-canvas"} ref={warpHoleCanvasRef} aria-hidden="true" />
        <div className="visualizer-vignette" aria-hidden="true" />
        <Button aria-label={t("player.closeVisualizer")} className="visualizer-close-button icon-button" onClick={onClose} title={t("player.closeVisualizer")} type="button" variant="outline">
          <X />
        </Button>

        <div className="visualizer-content">
          <div className="visualizer-primary">
            <header className="visualizer-header">
              <div className="visualizer-now-playing" onMouseEnter={prepareMarquee}>
                <div className="visualizer-track-artwork" aria-hidden="true">
                  {artworkSrc ? <img alt="" src={artworkSrc} /> : null}
                </div>
                <div className="visualizer-track-copy">
                  <p className="eyebrow">{albumTitle || t("player.nowPlaying")}</p>
                  <h2 className="visualizer-track-title marquee-wrap">
                    <span className="marquee-text">{trackTitle}</span>
                  </h2>
                  <span>{artist}</span>
                </div>
              </div>
            </header>

            {lyricLines.length > 0 ? (
              <section className="visualizer-lyrics-panel" aria-label={t("player.lyrics")}>
                <div className="visualizer-lyrics-header">
                  <span>{t("player.lyrics")}</span>
                </div>
                <div className="visualizer-lyrics-textbox">
                  {lyricLines.map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="visualizer-queue-panel" aria-label={t("player.queue")}>
            <div className="visualizer-queue-header">
              <span>{t("player.queue")}</span>
              <strong>{t("player.queueCount", { count: queueTracks.length })}</strong>
            </div>
            <div className="visualizer-queue-list">
              {queueTracks.map((track, index) => {
                const isCurrentTrack = track.id === currentTrack?.id;
                return (
                  <div className={isCurrentTrack ? "visualizer-queue-row current" : "visualizer-queue-row"} key={track.id}>
                    <span className="visualizer-queue-index">{index + 1}</span>
                    <span className="visualizer-queue-copy">
                      <strong>{localizeLibraryText(track.title, t)}</strong>
                      <span>{localizeLibraryText(track.artist, t)}</span>
                    </span>
                    <Button
                      aria-label={t("player.play")}
                      className="visualizer-queue-play-button icon-button musical-ripple-button"
                      disabled={isCurrentTrack && isPlaying}
                      onClick={() => {
                        if (isCurrentTrack) onTogglePlayback();
                        else onQueueTrackPlay(track);
                      }}
                      title={t("player.play")}
                      type="button"
                      variant="outline"
                    >
                      <Play />
                    </Button>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>

      <div className="visualizer-controls" aria-label={t("player.label")}>
        <div className="visualizer-controls-dock">
          <div className="visualizer-settings" aria-label={t("player.visualizerSettings")}>
            <div className="visualizer-mode-cluster">
              <div className="visualizer-chibi-slot">
                {mode === "wave" || mode === "spectrum" || mode === "circle" ? (
                  <Button
                    aria-label={isOrchestraModeEnabled ? t("player.orchestraMode") : t("player.chibiMode")}
                    aria-pressed={isChibiModeEnabled || isOrchestraModeEnabled}
                    className={isChibiModeEnabled || isOrchestraModeEnabled ? "visualizer-chibi-toggle icon-button active" : "visualizer-chibi-toggle icon-button"}
                    onClick={handleChibiToggleClick}
                    onDoubleClick={handleChibiToggleDoubleClick}
                    onPointerUp={handleChibiTogglePointerUp}
                    title={isOrchestraModeEnabled ? t("player.orchestraMode") : t("player.chibiMode")}
                    type="button"
                    variant="outline"
                  >
                    <Sparkles aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              <div className="visualizer-mode-switch" aria-label={t("player.visualizerMode")} role="group">
                <Button aria-label={t("player.visualizerWave")} aria-pressed={mode === "wave" && !isOrchestraModeEnabled} className={mode === "wave" && !isOrchestraModeEnabled ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => selectVisualizerMode("wave")} title={t("player.visualizerWave")} type="button" variant="outline"><VisualizerModeIcon mode="wave" /></Button>
                <Button aria-label={t("player.visualizerSpectrum")} aria-pressed={mode === "spectrum" && !isOrchestraModeEnabled} className={mode === "spectrum" && !isOrchestraModeEnabled ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => selectVisualizerMode("spectrum")} title={t("player.visualizerSpectrum")} type="button" variant="outline"><VisualizerModeIcon mode="spectrum" /></Button>
                <Button aria-label={t("player.visualizerCircle")} aria-pressed={mode === "circle" && !isOrchestraModeEnabled} className={mode === "circle" && !isOrchestraModeEnabled ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => selectVisualizerMode("circle")} title={t("player.visualizerCircle")} type="button" variant="outline"><VisualizerModeIcon mode="circle" /></Button>
                <Button aria-label={t("player.visualizerMountains")} aria-pressed={mode === "mountains" && !isOrchestraModeEnabled} className={mode === "mountains" && !isOrchestraModeEnabled ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => selectVisualizerMode("mountains")} title={t("player.visualizerMountains")} type="button" variant="outline"><VisualizerModeIcon mode="mountains" /></Button>
                <Button aria-label={t("player.visualizerAurora")} aria-pressed={mode === "aurora" && !isOrchestraModeEnabled} className={mode === "aurora" && !isOrchestraModeEnabled ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => selectVisualizerMode("aurora")} title={t("player.visualizerAurora")} type="button" variant="outline"><VisualizerModeIcon mode="aurora" /></Button>
                <Button aria-label={t("player.visualizerStarfield")} aria-pressed={mode === "starfield" && !isOrchestraModeEnabled} className={mode === "starfield" && !isOrchestraModeEnabled ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => selectVisualizerMode("starfield")} title={t("player.visualizerStarfield")} type="button" variant="outline"><VisualizerModeIcon mode="starfield" /></Button>
                <Button aria-label={t("player.visualizerTunnel")} aria-pressed={mode === "tunnel" && !isOrchestraModeEnabled} className={mode === "tunnel" && !isOrchestraModeEnabled ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => selectVisualizerMode("tunnel")} title={t("player.visualizerTunnel")} type="button" variant="outline"><VisualizerModeIcon mode="tunnel" /></Button>
                <Button aria-label={t("player.visualizerInk")} aria-pressed={mode === "ink" && !isOrchestraModeEnabled} className={mode === "ink" && !isOrchestraModeEnabled ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => selectVisualizerMode("ink")} title={t("player.visualizerInk")} type="button" variant="outline"><VisualizerModeIcon mode="ink" /></Button>
                <Button aria-label={t("player.visualizerVu")} aria-pressed={mode === "vu" && !isOrchestraModeEnabled} className={mode === "vu" && !isOrchestraModeEnabled ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => selectVisualizerMode("vu")} title={t("player.visualizerVu")} type="button" variant="outline"><VisualizerModeIcon mode="vu" /></Button>
                <Button aria-label={t("player.visualizerWarp")} aria-pressed={mode === "warp" && !isOrchestraModeEnabled} className={mode === "warp" && !isOrchestraModeEnabled ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => selectVisualizerMode("warp")} title={t("player.visualizerWarp")} type="button" variant="outline"><VisualizerModeIcon mode="warp" /></Button>
              </div>
            </div>
            <ArrowRight aria-hidden="true" className="visualizer-settings-arrow" />
            <div className="visualizer-palette-switch" aria-label={t("player.visualizerPalette")} role="group">
              <Button aria-label={t("player.visualizerPaletteOriginal")} aria-pressed={paletteMode === "original"} className={paletteMode === "original" ? "visualizer-palette-button active" : "visualizer-palette-button"} onClick={() => setPaletteMode("original")} title={t("player.visualizerPaletteOriginal")} type="button" variant="outline"><span aria-hidden="true" className="visualizer-palette-swatch original" /></Button>
              <Button aria-label={t("player.visualizerPaletteTheme")} aria-pressed={paletteMode === "theme"} className={paletteMode === "theme" ? "visualizer-palette-button active" : "visualizer-palette-button"} onClick={() => setPaletteMode("theme")} title={t("player.visualizerPaletteTheme")} type="button" variant="outline"><span aria-hidden="true" className="visualizer-palette-swatch theme" /></Button>
              <Button aria-label={t("player.visualizerPaletteArtwork")} aria-pressed={paletteMode === "artwork"} className={paletteMode === "artwork" ? "visualizer-palette-button active" : "visualizer-palette-button"} onClick={() => setPaletteMode("artwork")} title={t("player.visualizerPaletteArtwork")} type="button" variant="outline"><ArtworkPaletteIcon /></Button>
              <Button aria-label={t("player.visualizerPaletteRainbow")} aria-pressed={paletteMode === "rainbow"} className={paletteMode === "rainbow" ? "visualizer-palette-button active" : "visualizer-palette-button"} onClick={() => setPaletteMode("rainbow")} title={t("player.visualizerPaletteRainbow")} type="button" variant="outline"><span aria-hidden="true" className="visualizer-palette-swatch rainbow" /></Button>
            </div>
          </div>
          <div className="visualizer-transport-controls">
            <Button aria-label={t("player.previous")} className="visualizer-control-button icon-button musical-ripple-button" disabled={!currentTrack} onClick={onPreviousTrack} title={t("player.previous")} type="button" variant="outline">
              <ChevronLeft />
            </Button>
            <Button
              aria-label={currentTrack ? (isPlaying ? t("player.pause") : t("player.play")) : t("player.idle")}
              className="visualizer-play-button icon-button musical-ripple-button"
              disabled={!currentTrack}
              onClick={onTogglePlayback}
              title={currentTrack ? (isPlaying ? t("player.pause") : t("player.play")) : t("player.idle")}
              type="button"
            >
              {isPlaying ? <Pause /> : <Play />}
            </Button>
            <Button aria-label={t("player.next")} className="visualizer-control-button icon-button musical-ripple-button" disabled={!currentTrack} onClick={onNextTrack} title={t("player.next")} type="button" variant="outline">
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PlayerVisualizerOverlay;
