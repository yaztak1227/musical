import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleDot, Pause, Play, RadioTower, Waves, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Album, Track } from "@/types/audio";
import type { TFunction } from "@/types/app";
import { getAudioVisualizerNode } from "@/lib/audioAnalysis";
import { getArtworkSrc, localizeLibraryText } from "@/lib/libraryUtils";

type VisualizerMode = "wave" | "spectrum" | "circle";

type RemoteAudioAnalysisPacket = {
  currentTimeAtReceived: number;
  duration: number;
  frameTimecodes: number[];
  frames: number[][];
  receivedAt: number;
  startTime: number;
};

type PlayerVisualizerOverlayProps = {
  audioAnalysisPacketRef: RefObject<RemoteAudioAnalysisPacket | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  currentAlbum: Album | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  onClose: () => void;
  onNextTrack: () => void;
  onPreviousTrack: () => void;
  onQueueTrackPlay: (track: Track) => void;
  onTogglePlayback: () => void;
  preferRemoteAudioAnalysis?: boolean;
  queueTracks: Track[];
  t: TFunction;
};

const visualizerCanvasMaxScale = 1.35;
const remoteVisualizerCanvasMaxScale = 1;
const remoteAnalysisDisplayLagSeconds = 0.28;

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

function copyRemoteAnalysisFrame(packet: RemoteAudioAnalysisPacket, time: number, target: Uint8Array) {
  const { frames } = packet;
  const frameTimecodes = packet.frameTimecodes ?? [];
  const frameCount = frames.length;
  if (frameCount === 0) {
    target.fill(0);
    return;
  }

  const currentTime =
    packet.currentTimeAtReceived + Math.max(0, time - packet.receivedAt) / 1000 - remoteAnalysisDisplayLagSeconds;
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
) {
  const centerY = height * 0.52;
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

      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }

    context.stroke();
  }
}

function drawSpectrum(
  context: CanvasRenderingContext2D,
  values: Uint8Array,
  width: number,
  height: number,
  time: number,
  peakValues: Float32Array,
) {
  const barCount = 48;
  const gap = 5;
  const barWidth = Math.max(4, (width * 0.82) / barCount - gap);
  const startX = (width - (barWidth + gap) * barCount) / 2;
  const baseY = height * 0.72;
  const capHeight = Math.max(2, Math.min(4, height * 0.005));
  const capGap = Math.max(4, height * 0.01);
  const peakDrop = height * 0.0022;

  context.shadowBlur = 0;
  for (let index = 0; index < barCount; index += 1) {
    const valueIndex = Math.floor((index / barCount) * (values.length - 1));
    const value = values[valueIndex] ?? 0;
    const normalized = value / 255;
    const barHeight = normalized * height * 0.48;
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

export function PlayerVisualizerOverlay({
  audioAnalysisPacketRef,
  audioRef,
  currentAlbum,
  currentTrack,
  isPlaying,
  onClose,
  onNextTrack,
  onPreviousTrack,
  onQueueTrackPlay,
  onTogglePlayback,
  preferRemoteAudioAnalysis = false,
  queueTracks,
  t,
}: PlayerVisualizerOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [hasAudioAnalysis, setHasAudioAnalysis] = useState(false);
  const [mode, setMode] = useState<VisualizerMode>("spectrum");
  const albumTitle = currentAlbum ? localizeLibraryText(currentAlbum.title, t) : "";
  const trackTitle = currentTrack ? localizeLibraryText(currentTrack.title, t) : t("player.nothingSelected");
  const artist = currentTrack ? localizeLibraryText(currentTrack.artist, t) : t("player.pickPrompt");
  const artworkSrc = currentAlbum ? getArtworkSrc(currentAlbum) : "";
  const isVisualizerLive = isPlaying && (hasAudioAnalysis || preferRemoteAudioAnalysis || Boolean(audioAnalysisPacketRef.current?.frames.length));
  const overlayStyle = artworkSrc
    ? ({ "--visualizer-artwork": `url("${artworkSrc.replace(/"/g, '\\"')}")` } as CSSProperties)
    : undefined;
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
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
      drawIdleVisualizer(drawingContext, rect.width, rect.height, mode);
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
        copyRemoteAnalysisFrame(currentAudioAnalysisPacket, time, frequencyValues);
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
        drawWave(drawingContext, drawableFrequencyValues, rect.width, rect.height, time);
      } else if (mode === "circle") {
        drawCircle(drawingContext, drawableFrequencyValues, rect.width, rect.height, time);
      } else {
        drawSpectrum(drawingContext, drawableFrequencyValues, rect.width, rect.height, time, spectrumPeakValues);
      }

      drawingContext.globalCompositeOperation = "source-over";
      animationFrame = window.requestAnimationFrame(render);
    }

    animationFrame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [audioAnalysisPacketRef, isVisualizerLive, mode, preferRemoteAudioAnalysis]);

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
            <div>
              <p className="eyebrow">{albumTitle || t("player.nowPlaying")}</p>
              <h2>{trackTitle}</h2>
              <span>{artist}</span>
            </div>
          </header>
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
          <div className="visualizer-mode-switch" aria-label={t("player.visualizerMode")} role="group">
            <Button className={mode === "wave" ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => setMode("wave")} type="button" variant="outline">
              <Waves />
              {t("player.visualizerWave")}
            </Button>
            <Button className={mode === "spectrum" ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => setMode("spectrum")} type="button" variant="outline">
              <RadioTower />
              {t("player.visualizerSpectrum")}
            </Button>
            <Button className={mode === "circle" ? "visualizer-mode-button active" : "visualizer-mode-button"} onClick={() => setMode("circle")} type="button" variant="outline">
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
