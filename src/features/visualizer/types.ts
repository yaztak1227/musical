import type { CSSProperties } from "react";
import type { AuroraVisualProfile } from "@/lib/visualizerAnalysis";

export type VisualizerMode =
  | "wave"
  | "spectrum"
  | "circle"
  | "mountains"
  | "aurora"
  | "starfield"
  | "tunnel"
  | "ink"
  | "vu"
  | "warp";

export type VisualizerPaletteMode = "theme" | "artwork" | "rainbow" | "original";
export type VisualizerColor = readonly [number, number, number];
export type VisualizerPalette = readonly VisualizerColor[];
export type VisualizerCanvasKind = "base" | "aurora" | "starfield" | "helix" | "warp";
export type VisualizerModeIcon =
  | "wave"
  | "spectrum"
  | "circle"
  | "mountains"
  | "aurora"
  | "starfield"
  | "tunnel"
  | "ink"
  | "vu"
  | "warp";

/**
 * CSS values produced by the palette strategy and consumed by visualizer.css.
 * Keeping the contract typed prevents a new palette from silently omitting a
 * visual surface variable.
 */
export type VisualizerCssSettings = CSSProperties & {
  "--visualizer-artwork"?: string;
  "--visualizer-color-0"?: string;
  "--visualizer-color-1"?: string;
  "--visualizer-color-2"?: string;
  "--visualizer-color-3"?: string;
  "--visualizer-color-4"?: string;
  "--visualizer-mode-columns"?: string;
  "--visualizer-palette-columns"?: string;
};

export type ResolvedVisualizerPalette = {
  colors: VisualizerPalette;
  profile: AuroraVisualProfile;
  legacyOriginalHueCycle: boolean;
  css: VisualizerCssSettings;
};

export type VisualizerWebglRenderInput = {
  values: Uint8Array;
  time: number;
  palette: VisualizerPalette;
  reducedMotion: boolean;
  isLive: boolean;
  profile: AuroraVisualProfile;
};

export type VisualizerCanvasRenderInput = {
  context: CanvasRenderingContext2D;
  values: Uint8Array;
  width: number;
  height: number;
  time: number;
  isIdle: boolean;
  palette: VisualizerPalette;
  auroraPalette: VisualizerPalette;
  paletteMode: VisualizerPaletteMode;
  reducedMotion: boolean;
  profile: AuroraVisualProfile;
  isLive: boolean;
  legacyOriginalHueCycle: boolean;
};

export type VisualizerModeRuntimeOptions = {
  isChibiModeEnabled?: boolean;
  isOrchestraModeEnabled?: boolean;
  onAssetsChanged?: () => void;
  surfPuchiGender?: "boy" | "girl";
};

export type VisualizerModeRuntime = {
  render: (input: VisualizerCanvasRenderInput) => void;
  reset?: () => void;
  dispose?: () => void;
};

export type VisualizerCanvasRenderer = (input: VisualizerCanvasRenderInput) => void;

export type VisualizerWebglAdapter = {
  render: (input: VisualizerWebglRenderInput) => void;
  dispose: () => void;
  reset?: () => void;
};

export type VisualizerWebglPaletteRole = "mode" | "aurora";

type VisualizerModeDefinitionBase = {
  id: VisualizerMode;
  labelKey:
    | "player.visualizerWave"
    | "player.visualizerSpectrum"
    | "player.visualizerCircle"
    | "player.visualizerMountains"
    | "player.visualizerAurora"
    | "player.visualizerStarfield"
    | "player.visualizerTunnel"
    | "player.visualizerInk"
    | "player.visualizerVu"
    | "player.visualizerWarp";
  icon: VisualizerModeIcon;
  supportsChibi: boolean;
  createRuntime: (options?: VisualizerModeRuntimeOptions) => VisualizerModeRuntime;
  /** Binds a mode-owned runtime to the common frame input. */
  createCanvasRenderer?: (runtime: VisualizerModeRuntime) => VisualizerCanvasRenderer;
};

export type VisualizerCanvas2DModeDefinition = VisualizerModeDefinitionBase & {
  renderer: "canvas2d";
  canvas: "base";
};

export type VisualizerWebglModeDefinition = VisualizerModeDefinitionBase & {
  renderer: "webgl";
  canvas: Exclude<VisualizerCanvasKind, "base">;
  canvasClassName: string;
  /** Selects the resolved palette channel used by the WebGL adapter. */
  webglPaletteRole: VisualizerWebglPaletteRole;
  load: (canvas: HTMLCanvasElement) => Promise<VisualizerWebglAdapter>;
  /** Keeps the base surface visible while the dedicated WebGL surface promotes. */
  createFallbackRenderer?: (runtime: VisualizerModeRuntime) => VisualizerCanvasRenderer;
};

export type VisualizerModeDefinition = VisualizerCanvas2DModeDefinition | VisualizerWebglModeDefinition;

export type VisualizerPaletteDefinition = {
  id: VisualizerPaletteMode;
  labelKey:
    | "player.visualizerPaletteOriginal"
    | "player.visualizerPaletteTheme"
    | "player.visualizerPaletteArtwork"
    | "player.visualizerPaletteRainbow";
  icon: "original" | "theme" | "artwork" | "rainbow";
};
