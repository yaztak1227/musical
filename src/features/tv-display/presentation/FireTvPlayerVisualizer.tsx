import { useEffect, useRef } from "react";
import type { TvAudioAnalysisFrame } from "../domain/tvDisplayMessage";

type FireTvPlayerVisualizerProps = {
  frames: TvAudioAnalysisFrame[];
  isPlaying: boolean;
  playbackTimeSeconds: number;
  trackId: string | null;
};

const targetFrameIntervalMs = 1000 / 30;
const maxCanvasWidth = 1280;
const maxCanvasHeight = 720;
const renderedBarCount = 32;

export function FireTvPlayerVisualizer({
  frames,
  isPlaying,
  playbackTimeSeconds,
  trackId,
}: FireTvPlayerVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const framesRef = useRef<TvAudioAnalysisFrame[]>(frames);
  const playbackClockRef = useRef({
    playbackTimeSeconds,
    receivedAt: performance.now(),
  });

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    playbackClockRef.current = {
      playbackTimeSeconds,
      receivedAt: performance.now(),
    };
  }, [playbackTimeSeconds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;
    let lastDrawAt = 0;
    let isDisposed = false;
    const visibleBars = new Float32Array(renderedBarCount);

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const scale = Math.min(maxCanvasWidth / rect.width, maxCanvasHeight / rect.height, window.devicePixelRatio || 1, 1);
      const nextWidth = Math.max(1, Math.floor(rect.width * scale));
      const nextHeight = Math.max(1, Math.floor(rect.height * scale));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    resizeCanvas();

    const draw = (now: number) => {
      if (isDisposed) return;
      animationFrame = window.requestAnimationFrame(draw);
      if (now - lastDrawAt < targetFrameIntervalMs) return;
      lastDrawAt = now;
      resizeCanvas();

      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);

      const sourceFrame = findFrameForPlaybackTime(framesRef.current, getPlaybackTime(playbackClockRef.current, isPlaying, now));
      if (sourceFrame) {
        copyFrameToBars(sourceFrame, visibleBars);
      } else {
        decayBars(visibleBars, isPlaying ? 0.9 : 0.82);
      }

      drawBars(context, visibleBars, width, height);
    };

    if (isPlaying || frames.length > 0) {
      animationFrame = window.requestAnimationFrame(draw);
    } else {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [frames.length, isPlaying, trackId]);

  return <canvas ref={canvasRef} className="tv-player-visualizer" aria-hidden="true" />;
}

function getPlaybackTime(
  clock: { playbackTimeSeconds: number; receivedAt: number },
  isPlaying: boolean,
  now: number,
) {
  if (!isPlaying) return clock.playbackTimeSeconds;
  return clock.playbackTimeSeconds + (now - clock.receivedAt) / 1000;
}

function findFrameForPlaybackTime(frames: TvAudioAnalysisFrame[], playbackTimeSeconds: number) {
  if (frames.length === 0) return null;
  const targetMs = playbackTimeSeconds * 1000;
  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const frame = frames[mid];
    if (frame.timeMs < targetMs) low = mid + 1;
    else high = mid - 1;
  }

  const nextFrame = frames[low] ?? null;
  const previousFrame = frames[low - 1] ?? null;
  const nearestFrame =
    previousFrame && nextFrame
      ? Math.abs(previousFrame.timeMs - targetMs) <= Math.abs(nextFrame.timeMs - targetMs)
        ? previousFrame
        : nextFrame
      : previousFrame ?? nextFrame;

  if (!nearestFrame || Math.abs(nearestFrame.timeMs - targetMs) > 900) return null;
  return nearestFrame;
}

function copyFrameToBars(frame: TvAudioAnalysisFrame, bars: Float32Array) {
  const values = frame.bands;
  if (values.length === 0) {
    decayBars(bars, 0.84);
    return;
  }

  for (let index = 0; index < bars.length; index += 1) {
    const sourceIndex = Math.min(values.length - 1, Math.floor((index / bars.length) * values.length));
    const normalized = clamp01(values[sourceIndex]);
    bars[index] = bars[index] * 0.62 + normalized * 0.38;
  }
}

function decayBars(bars: Float32Array, amount: number) {
  for (let index = 0; index < bars.length; index += 1) {
    bars[index] *= amount;
  }
}

function drawBars(context: CanvasRenderingContext2D, bars: Float32Array, width: number, height: number) {
  const gap = Math.max(3, width * 0.006);
  const usableWidth = width * 0.92;
  const barWidth = Math.max(4, (usableWidth - gap * (bars.length - 1)) / bars.length);
  const startX = (width - usableWidth) / 2;
  const baseY = height * 0.82;

  context.save();
  context.globalCompositeOperation = "source-over";
  context.shadowBlur = 18;

  for (let index = 0; index < bars.length; index += 1) {
    const value = bars[index];
    const centerBias = 1 - Math.abs(index / Math.max(1, bars.length - 1) - 0.5) * 0.5;
    const barHeight = Math.max(height * 0.035, value * height * 0.44 * centerBias);
    const x = startX + index * (barWidth + gap);
    const y = baseY - barHeight;
    const hue = 188 + (index / bars.length) * 96;
    const gradient = context.createLinearGradient(0, y, 0, baseY);

    gradient.addColorStop(0, `hsla(${hue}, 86%, 74%, 0.92)`);
    gradient.addColorStop(1, "hsla(332, 78%, 64%, 0.34)");
    context.fillStyle = gradient;
    context.shadowColor = `hsla(${hue}, 88%, 62%, 0.24)`;
    addRoundedRectPath(context, x, y, barWidth, barHeight, Math.min(999, barWidth / 2));
    context.fill();
  }

  context.restore();
}

function addRoundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
    return;
  }

  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
