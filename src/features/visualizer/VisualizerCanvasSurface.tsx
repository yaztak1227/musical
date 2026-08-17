import type { RefObject } from "react";
import { visualizerCanvasDefinitions, getVisualizerCanvasKind, getVisualizerModeDefinition } from "./registry";
import type { VisualizerMode } from "./types";

export type VisualizerCanvasRefs = {
  base: RefObject<HTMLCanvasElement | null>;
  aurora: RefObject<HTMLCanvasElement | null>;
  starfield: RefObject<HTMLCanvasElement | null>;
  helix: RefObject<HTMLCanvasElement | null>;
  warp: RefObject<HTMLCanvasElement | null>;
};

type VisualizerCanvasSurfaceProps = {
  mode: VisualizerMode;
  activeDedicatedCanvas: boolean;
  refs: VisualizerCanvasRefs;
};

export function VisualizerCanvasSurface({ mode, activeDedicatedCanvas, refs }: VisualizerCanvasSurfaceProps) {
  const selectedCanvas = getVisualizerCanvasKind(mode);
  // Keep the dedicated surface in the compositing stack as soon as a WebGL
  // mode is selected. Its transparent loading/failure state still reveals the
  // base Canvas2D fallback underneath, while the active hook remains stable
  // for callers and existing layout contracts.
  const showDedicatedSurface = getVisualizerModeDefinition(mode).renderer === "webgl";
  return (
    <>
      <canvas className="visualizer-canvas" ref={refs.base} aria-hidden="true" />
      {visualizerCanvasDefinitions.map(({ kind, className }) => (
        <canvas
          aria-hidden="true"
          className={selectedCanvas === kind && (showDedicatedSurface || activeDedicatedCanvas) ? `visualizer-canvas ${className} active` : `visualizer-canvas ${className}`}
          key={kind}
          ref={refs[kind]}
        />
      ))}
    </>
  );
}
