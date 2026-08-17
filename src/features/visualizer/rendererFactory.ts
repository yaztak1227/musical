import { getVisualizerModeDefinition } from "./registry";
import type { AuroraVisualProfile } from "@/lib/visualizerAnalysis";
import type {
  VisualizerCanvasRenderInput,
  VisualizerCanvasRenderer,
  VisualizerMode,
  VisualizerModeRuntime,
  VisualizerPalette,
  VisualizerPaletteMode,
  VisualizerWebglAdapter,
  VisualizerWebglRenderInput,
} from "./types";

export type { VisualizerCanvasRenderInput, VisualizerCanvasRenderer } from "./types";
/** @deprecated Kept as a source-compatible bridge for external add-ins. */
export type VisualizerCanvasRendererMap = Partial<Record<VisualizerMode, VisualizerCanvasRenderer>>;

export type VisualizerRendererFactoryOptions = {
  mode: VisualizerMode;
  palette: VisualizerPalette;
  auroraPalette: VisualizerPalette;
  paletteMode: VisualizerPaletteMode;
  reducedMotion: boolean;
  profile: AuroraVisualProfile;
  legacyOriginalHueCycle: boolean;
  webglAdapter: VisualizerWebglAdapter | null;
  runtime?: VisualizerModeRuntime | null;
  /** @deprecated Definitions now own their renderer; used only by older callers/tests. */
  canvasRenderers?: VisualizerCanvasRendererMap;
  context: CanvasRenderingContext2D;
  width: () => number;
  height: () => number;
};

export type VisualizerRenderer = {
  usesDedicatedCanvas: boolean;
  render: (values: Uint8Array, time: number, isIdle: boolean) => void;
};

function createCanvasInput(
  options: VisualizerRendererFactoryOptions,
  values: Uint8Array,
  time: number,
  isIdle: boolean,
): VisualizerCanvasRenderInput {
  return {
    context: options.context,
    values,
    width: options.width(),
    height: options.height(),
    time,
    isIdle,
    palette: options.palette,
    auroraPalette: options.auroraPalette,
    paletteMode: options.paletteMode,
    reducedMotion: options.reducedMotion,
    profile: options.profile,
    isLive: !isIdle,
    legacyOriginalHueCycle: options.legacyOriginalHueCycle,
  };
}

/**
 * Selects the mode-owned renderer and promotes it to WebGL when its lazy
 * adapter is ready. The same mode runtime paints the 2D fallback while the
 * adapter is pending or rejected, so a failed optional add-in stays visible.
 */
export function createVisualizerRenderer(options: VisualizerRendererFactoryOptions): VisualizerRenderer {
  const definition = getVisualizerModeDefinition(options.mode);
  const runtimeRenderer = options.runtime && definition.createCanvasRenderer
    ? definition.createCanvasRenderer(options.runtime)
    : options.runtime?.render;
  const compatibilityRenderer = options.canvasRenderers?.[options.mode];

  if (definition.renderer === "webgl" && options.webglAdapter) {
    return {
      usesDedicatedCanvas: true,
      render: (values, time, isIdle) => {
        const input: VisualizerWebglRenderInput = {
          values,
          time,
          palette: definition.webglPaletteRole === "aurora" ? options.auroraPalette : options.palette,
          reducedMotion: options.reducedMotion,
          isLive: !isIdle,
          profile: options.profile,
        };
        options.webglAdapter?.render(input);
      },
    };
  }

  const canvasRenderer = definition.renderer === "webgl"
    ? (options.runtime && definition.createFallbackRenderer
      ? definition.createFallbackRenderer(options.runtime)
      : runtimeRenderer ?? compatibilityRenderer)
    : runtimeRenderer ?? compatibilityRenderer;

  if (!canvasRenderer) {
    return { usesDedicatedCanvas: false, render: () => undefined };
  }

  return {
    usesDedicatedCanvas: false,
    render: (values, time, isIdle) => {
      canvasRenderer(createCanvasInput(options, values, time, isIdle));
    },
  };
}
