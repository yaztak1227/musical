import { type MouseEvent, type PointerEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Album, EntityId, Track } from "@/types/audio";
import type { TFunction } from "@/types/app";
import { getAudioVisualizerNode } from "@/lib/audioAnalysis";
import { getArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";
import { prepareMarquee } from "@/lib/marqueeUtils";
import { extractArtworkVisualizerPalette, getAuroraVisualizerPalette, getThemeVisualizerPalette, originalVisualizerPalette, rainbowVisualizerPalette, resolveVisualizerPalette } from "@/features/visualizer/palette";
import { createVisualizerRenderer } from "@/features/visualizer/rendererFactory";
import { getVisualizerModeDefinition, isVisualizerMode, isVisualizerPaletteMode, isVisualizerWebglDefinition } from "@/features/visualizer/registry";
import { createVisualizerRuntimeCache, getVisualizerRuntimeKey, getVisualizerRuntimeVariant, type VisualizerRuntimeCache } from "@/features/visualizer/runtimeCache";
import { VisualizerCanvasSurface, type VisualizerCanvasRefs } from "@/features/visualizer/VisualizerCanvasSurface";
import { VisualizerSettingsControls } from "@/features/visualizer/VisualizerSettingsControls";
import { createVisualizerWebglRuntime, type VisualizerWebglRuntime } from "@/features/visualizer/webglRuntime";
import type { VisualizerCssSettings, VisualizerMode, VisualizerModeRuntime, VisualizerPalette, VisualizerPaletteMode, VisualizerWebglAdapter } from "@/features/visualizer/types";

// Kept as a compatibility export for the existing visualizer E2E contract.
export { extractArtworkVisualizerPalette, getThemeVisualizerPalette } from "@/features/visualizer/palette";
export { drawMountains } from "@/features/visualizer/modes/mountains/definition";

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
const chibiModeStorageKey = "musical.visualizerChibiMode";
const visualizerModeStorageKey = "musical.visualizerMode";
const visualizerPaletteStorageKey = "musical.visualizerPalette";
const chibiToggleDoubleTapMs = 320;

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
  const starfieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const helixCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const warpHoleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglVisualizerRef = useRef<VisualizerWebglAdapter | null>(null);
  const webglRuntimeRef = useRef<VisualizerWebglRuntime | null>(null);
  const canvasRefs: VisualizerCanvasRefs = {
    base: canvasRef,
    aurora: auroraCanvasRef,
    starfield: starfieldCanvasRef,
    helix: helixCanvasRef,
    warp: warpHoleCanvasRef,
  };
  const analyserRef = useRef<AnalyserNode | null>(null);
  const modeRuntimeRef = useRef<VisualizerModeRuntime | null>(null);
  const runtimeCacheRef = useRef<VisualizerRuntimeCache | null>(null);
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
  const [surfPuchiGender] = useState<"boy" | "girl">(() => (Math.random() < 0.5 ? "boy" : "girl"));
  const [characterImageVersion, setCharacterImageVersion] = useState(0);
  const [webglVisualizerVersion, setWebglVisualizerVersion] = useState(0);
  const [modeRuntimeVersion, setModeRuntimeVersion] = useState(0);
  if (!runtimeCacheRef.current) runtimeCacheRef.current = createVisualizerRuntimeCache();
  if (!webglRuntimeRef.current) {
    webglRuntimeRef.current = createVisualizerWebglRuntime((adapter) => {
      webglVisualizerRef.current = adapter;
      setWebglVisualizerVersion((version) => version + 1);
    });
  }
  const albumTitle = currentAlbum ? localizeLibraryText(currentAlbum.title, t) : "";
  const trackTitle = currentTrack ? localizeLibraryText(currentTrack.title, t) : t("player.nothingSelected");
  const artist = currentTrack ? localizeLibraryText(currentTrack.artist, t) : t("player.pickPrompt");
  const artworkSrc = currentAlbum ? getArtworkSrc(currentAlbum) : "";
  const lyricLines = currentLyrics ? currentLyrics.replace(/\r\n/g, "\n").split("\n") : [];
  const isVisualizerLive = isPlaying && (hasAudioAnalysis || preferRemoteAudioAnalysis || Boolean(audioAnalysisPacketRef.current?.frames.length));
  // The live loop reads image refs directly; only an idle one-shot needs an image-load refresh.
  const idleCharacterImageVersion = isVisualizerLive ? 0 : characterImageVersion;
  const resolvedPalette = useMemo(
    () => resolveVisualizerPalette(paletteMode, visualizerPalette, artworkSrc),
    [artworkSrc, paletteMode, visualizerPalette],
  );
  const auroraVisualizerPalette = useMemo(
    () => getAuroraVisualizerPalette(resolvedPalette.colors, paletteMode),
    [paletteMode, resolvedPalette.colors],
  );
  const auroraVisualProfile = resolvedPalette.profile;
  const overlayStyle: VisualizerCssSettings = resolvedPalette.css;
  const selectedModeDefinition = getVisualizerModeDefinition(mode);
  const runtimeKey = getVisualizerRuntimeKey(
    mode,
    selectedModeDefinition.supportsChibi,
    isChibiModeEnabled,
    isOrchestraModeEnabled,
  );
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
    runtimeCacheRef.current?.resetAll();
    webglRuntimeRef.current?.reset();
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
    const runtimeVariant = getVisualizerRuntimeVariant(
      mode,
      selectedModeDefinition.supportsChibi,
      isChibiModeEnabled,
      isOrchestraModeEnabled,
    );
    modeRuntimeRef.current = runtimeCacheRef.current?.get(runtimeKey, () => selectedModeDefinition.createRuntime({
      isChibiModeEnabled: runtimeVariant === "chibi",
      isOrchestraModeEnabled: runtimeVariant === "orchestra",
      onAssetsChanged: () => setCharacterImageVersion((version) => version + 1),
      surfPuchiGender,
    })) ?? null;
    setModeRuntimeVersion((version) => version + 1);
  }, [runtimeKey]);

  useEffect(() => () => {
    runtimeCacheRef.current?.disposeAll();
    modeRuntimeRef.current = null;
  }, []);

  useEffect(() => {
    const definition = getVisualizerModeDefinition(mode);
    const webglDefinition = isVisualizerWebglDefinition(definition) ? definition : null;
    const canvas = webglDefinition ? canvasRefs[webglDefinition.canvas].current : null;
    void webglRuntimeRef.current?.activate(webglDefinition, canvas);

    return () => {
      webglRuntimeRef.current?.dispose();
    };
  }, [mode]);

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
    const visualizerRenderer = createVisualizerRenderer({
      mode,
      palette: resolvedPalette.colors,
      auroraPalette: auroraVisualizerPalette,
      paletteMode,
      reducedMotion,
      profile: auroraVisualProfile,
      legacyOriginalHueCycle: resolvedPalette.legacyOriginalHueCycle,
      webglAdapter: webglVisualizerRef.current,
      runtime: modeRuntimeRef.current,
      context: drawingContext,
      width: () => rect.width,
      height: () => rect.height,
    });
    const usesDedicatedWebglCanvas = visualizerRenderer.usesDedicatedCanvas;

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
      drawingContext.globalCompositeOperation = "source-over";
      visualizerRenderer.render(values, time, isIdle);
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
  }, [audioAnalysisPacketRef, auroraVisualProfile, auroraVisualizerPalette, idleCharacterImageVersion, isChibiModeEnabled, isOrchestraModeEnabled, isVisualizerLive, mode, modeRuntimeVersion, paletteMode, preferRemoteAudioAnalysis, reducedMotion, remotePlaybackClockRef, resolvedPalette.colors, resolvedPalette.legacyOriginalHueCycle, webglVisualizerVersion]);

  return (
    <section aria-label={t("player.visualizerLabel")} aria-modal="true" className="player-visualizer-overlay" role="dialog" style={overlayStyle}>
      <div className="visualizer-stage">
        <div className="visualizer-artwork-backdrop" aria-hidden="true" />
        <VisualizerCanvasSurface activeDedicatedCanvas={Boolean(webglVisualizerRef.current)} mode={mode} refs={canvasRefs} />
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
            <VisualizerSettingsControls
              mode={mode}
              paletteMode={paletteMode}
              isOrchestraModeEnabled={isOrchestraModeEnabled}
              onSelectMode={selectVisualizerMode}
              onSelectPalette={setPaletteMode}
              chibiControl={(
                <div className="visualizer-chibi-slot">
                  {getVisualizerModeDefinition(mode).supportsChibi ? (
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
              )}
              t={t}
            />
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
