import { type CSSProperties, type MouseEvent, type PointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleDot, Pause, Play, RadioTower, Sparkles, Waves, X } from "lucide-react";
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
import { getArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";
import { prepareMarquee } from "@/lib/marqueeUtils";

type VisualizerMode = "wave" | "spectrum" | "circle";
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
const chibiToggleDoubleTapMs = 320;

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

function drawIdleSpectrum(context: CanvasRenderingContext2D, width: number, height: number) {
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
    const hue = 190 + (index / barCount) * 120;
    const gradient = context.createLinearGradient(0, baseY - barHeight, 0, baseY);

    gradient.addColorStop(0, `hsla(${hue}, 84%, 70%, 0.36)`);
    gradient.addColorStop(1, "hsla(330, 72%, 60%, 0.2)");
    context.beginPath();
    context.fillStyle = gradient;
    context.shadowColor = `hsla(${hue}, 84%, 64%, 0.16)`;
    context.roundRect(startX + index * (barWidth + gap), baseY - barHeight, barWidth, barHeight, 999);
    context.fill();
  }
  context.restore();
}

function drawIdleWave(context: CanvasRenderingContext2D, width: number, height: number) {
  const centerY = height * 0.58;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowBlur = 14;

  for (let layer = 0; layer < 2; layer += 1) {
    context.beginPath();
    context.strokeStyle = layer === 0 ? "rgba(99, 230, 255, 0.34)" : "rgba(255, 79, 216, 0.2)";
    context.lineWidth = layer === 0 ? 5 : 3;
    context.shadowColor = layer === 0 ? "rgba(99, 230, 255, 0.2)" : "rgba(255, 79, 216, 0.16)";

    for (let x = width * 0.26; x <= width * 0.74; x += 16) {
      const y = centerY + Math.sin((x / width) * Math.PI * 4 + layer * 0.8) * height * 0.018;
      if (x === width * 0.26) context.moveTo(x, y);
      else context.lineTo(x, y);
    }

    context.stroke();
  }

  context.restore();
}

function drawIdleCircle(context: CanvasRenderingContext2D, width: number, height: number) {
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
    const hue = 190 + (index / barCount) * 150;

    context.beginPath();
    context.strokeStyle = `hsla(${hue}, 84%, 68%, 0.3)`;
    context.lineWidth = 2.2;
    context.shadowColor = `hsla(${hue}, 84%, 64%, 0.15)`;
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

function drawIdleVisualizer(context: CanvasRenderingContext2D, width: number, height: number, mode: VisualizerMode) {
  if (mode === "wave") {
    drawIdleWave(context, width, height);
  } else if (mode === "circle") {
    drawIdleCircle(context, width, height);
  } else {
    drawIdleSpectrum(context, width, height);
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
    let upperIndex = frameTimecodes.findIndex((timecode) => timecode >= currentTime);
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
) {
  const centerY = height * 0.52;
  const surfPoints: Array<{ x: number; y: number }> = [];
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let layer = 0; layer < 2; layer += 1) {
    context.beginPath();
    const hue = 188 + layer * 54 + Math.sin(time * 0.0007) * 18;
    context.strokeStyle = `hsla(${hue}, 92%, ${62 + layer * 5}%, ${0.72 - layer * 0.14})`;
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
    const hue = (index / barCount) * 210 + 168 + Math.sin(time * 0.0008) * 32;
    const x = startX + index * (barWidth + gap);
    const previousPeak = peakValues[index] ?? 0;
    const nextPeak = Math.max(barHeight, Math.max(0, previousPeak - peakDrop));
    peakValues[index] = nextPeak;

    context.fillStyle = `hsla(${hue}, 96%, ${58 + normalized * 18}%, ${0.52 + normalized * 0.42})`;
    context.fillRect(x, baseY - barHeight, barWidth, barHeight);

    context.fillStyle = `hsla(${hue}, 96%, 78%, ${0.54 + Math.min(1, nextPeak / Math.max(1, height * 0.48)) * 0.32})`;
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

  context.fillStyle = `rgba(255, 226, 147, ${0.08 + average * 0.18})`;
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
    context.fillStyle = `rgba(255, 230, 142, ${0.12 + value * 0.24})`;
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
    const hue = 320 + (index / barCount) * 220 + Math.sin(time * 0.0006) * 28;

    context.beginPath();
    context.strokeStyle = `hsla(${hue}, 96%, 64%, 0.78)`;
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

function drawChibiCircle(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  chibiImages: ChibiCharacterImages[],
  chibiMotion: ChibiCircleMotionState,
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
  context.strokeStyle = "rgba(255, 255, 255, 0.18)";
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
  const chibiSingleTapTimerRef = useRef<number | null>(null);
  const lastChibiTouchAtRef = useRef(0);
  const suppressNextChibiClickRef = useRef(false);
  const [hasAudioAnalysis, setHasAudioAnalysis] = useState(false);
  const [mode, setMode] = useState<VisualizerMode>("spectrum");
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
  const overlayStyle = artworkSrc
    ? ({ "--visualizer-artwork": `url("${artworkSrc.replace(/"/g, '\\"')}")` } as CSSProperties)
    : undefined;
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

    if (chibiSingleTapTimerRef.current !== null) {
      window.clearTimeout(chibiSingleTapTimerRef.current);
    }
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
    if (chibiSingleTapTimerRef.current !== null) {
      window.clearTimeout(chibiSingleTapTimerRef.current);
    }
  }, []);

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
  }, [audioRef, currentTrack, isPlaying]);

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

    const resizeObserver = new ResizeObserver(() => {
      rect = canvasElement.getBoundingClientRect();
      scale = Math.min(window.devicePixelRatio || 1, maxCanvasScale);
      const width = Math.max(1, Math.floor(rect.width * scale));
      const height = Math.max(1, Math.floor(rect.height * scale));

      if (canvasElement.width !== width || canvasElement.height !== height) {
        canvasElement.width = width;
        canvasElement.height = height;
      }
    });

    resizeObserver.observe(canvasElement);

    if (!isVisualizerLive) {
      canvasElement.width = Math.max(1, Math.floor(rect.width * scale));
      canvasElement.height = Math.max(1, Math.floor(rect.height * scale));
      drawingContext.setTransform(scale, 0, 0, scale, 0, 0);
      drawingContext.clearRect(0, 0, rect.width, rect.height);
      if (isOrchestraModeEnabled) {
        visualFrequencyValues.fill(0);
        drawOrchestraVisualizer(drawingContext, visualFrequencyValues, rect.width, rect.height, performance.now(), orchestraImagesRef.current, orchestraMotionRef.current);
      } else if (isChibiModeEnabled && mode === "wave") {
        visualFrequencyValues.fill(0);
        drawWave(drawingContext, visualFrequencyValues, rect.width, rect.height, performance.now(), surfPuchiImagesRef.current, surfPuchiMotionRef.current, true);
      } else if (isChibiModeEnabled && mode === "circle") {
        visualFrequencyValues.fill(0);
        drawChibiCircle(drawingContext, visualFrequencyValues, rect.width, rect.height, performance.now(), chibiImagesRef.current, chibiCircleMotionRef.current);
      } else if (isChibiModeEnabled && mode === "spectrum") {
        visualFrequencyValues.fill(0);
        drawSpectrum(drawingContext, visualFrequencyValues, rect.width, rect.height, performance.now(), spectrumPeakValues, chibiSpectrumImagesRef.current, chibiSpectrumMotionRef.current);
      } else {
        drawIdleVisualizer(drawingContext, rect.width, rect.height, mode);
      }
      return () => resizeObserver.disconnect();
    }

    function render(time: number) {
      const width = Math.max(1, Math.floor(rect.width * scale));
      const height = Math.max(1, Math.floor(rect.height * scale));

      if (canvasElement.width !== width || canvasElement.height !== height) {
        canvasElement.width = width;
        canvasElement.height = height;
      }

      drawingContext.setTransform(scale, 0, 0, scale, 0, 0);
      drawingContext.clearRect(0, 0, rect.width, rect.height);
      drawingContext.globalCompositeOperation = preferRemoteAudioAnalysis ? "source-over" : "lighter";

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

      if (mode === "wave") {
        drawWave(drawingContext, drawableFrequencyValues, rect.width, rect.height, time, surfPuchiImagesRef.current, surfPuchiMotionRef.current, isChibiModeEnabled);
      } else if (mode === "circle") {
        if (isChibiModeEnabled) {
          drawChibiCircle(drawingContext, drawableFrequencyValues, rect.width, rect.height, time, chibiImagesRef.current, chibiCircleMotionRef.current);
        } else {
          drawCircle(drawingContext, drawableFrequencyValues, rect.width, rect.height, time);
        }
      } else if (isOrchestraModeEnabled) {
        drawOrchestraVisualizer(drawingContext, drawableFrequencyValues, rect.width, rect.height, time, orchestraImagesRef.current, orchestraMotionRef.current);
      } else {
        drawSpectrum(
          drawingContext,
          drawableFrequencyValues,
          rect.width,
          rect.height,
          time,
          spectrumPeakValues,
          isChibiModeEnabled ? chibiSpectrumImagesRef.current : undefined,
          isChibiModeEnabled ? chibiSpectrumMotionRef.current : undefined,
        );
      }

      drawingContext.globalCompositeOperation = "source-over";
      animationFrame = window.requestAnimationFrame(render);
    }

    animationFrame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [audioAnalysisPacketRef, characterImageVersion, isChibiModeEnabled, isOrchestraModeEnabled, isVisualizerLive, mode, preferRemoteAudioAnalysis, remotePlaybackClockRef]);

  return (
    <section aria-label={t("player.visualizerLabel")} aria-modal="true" className="player-visualizer-overlay" role="dialog" style={overlayStyle}>
      <div className="visualizer-artwork-backdrop" aria-hidden="true" />
      <canvas className="visualizer-canvas" ref={canvasRef} aria-hidden="true" />
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

      <div className="visualizer-controls" aria-label={t("player.label")}>
        <div className="visualizer-controls-dock">
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
          <div className="visualizer-mode-switch" aria-label={t("player.visualizerMode")} role="group">
            <Button className={mode === "wave" ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => { setIsOrchestraModeEnabled(false); setMode("wave"); }} type="button" variant="outline">
              <Waves />
              {t("player.visualizerWave")}
            </Button>
            <Button className={mode === "spectrum" ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => { setIsOrchestraModeEnabled(false); setMode("spectrum"); }} type="button" variant="outline">
              <RadioTower />
              {t("player.visualizerSpectrum")}
            </Button>
            <Button className={mode === "circle" ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => { setIsOrchestraModeEnabled(false); setMode("circle"); }} type="button" variant="outline">
              <CircleDot />
              {t("player.visualizerCircle")}
            </Button>
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
