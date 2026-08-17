import { auroraDefinition } from "./modes/aurora/definition";
import { circleDefinition } from "./modes/circle/definition";
import { inkDefinition } from "./modes/ink/definition";
import { mountainsDefinition } from "./modes/mountains/definition";
import { spectrumDefinition } from "./modes/spectrum/definition";
import { starfieldDefinition } from "./modes/starfield/definition";
import { tunnelDefinition } from "./modes/tunnel/definition";
import { vuDefinition } from "./modes/vu/definition";
import { warpDefinition } from "./modes/warp/definition";
import { waveDefinition } from "./modes/wave/definition";
import type {
  VisualizerCanvasKind,
  VisualizerMode,
  VisualizerModeDefinition,
  VisualizerModeIcon,
  VisualizerPaletteDefinition,
  VisualizerPaletteMode,
  VisualizerWebglModeDefinition,
} from "./types";

/**
 * The only mode list. Every add-in owns its renderer, runtime and optional
 * WebGL promotion entry in a mode directory; UI and lifecycle derive from it.
 */
export const visualizerModeDefinitions = [
  waveDefinition,
  spectrumDefinition,
  circleDefinition,
  mountainsDefinition,
  auroraDefinition,
  starfieldDefinition,
  tunnelDefinition,
  inkDefinition,
  vuDefinition,
  warpDefinition,
] as const satisfies readonly VisualizerModeDefinition[];

export const visualizerModes = visualizerModeDefinitions.map(({ id }) => id) as readonly VisualizerMode[];

export const visualizerPaletteDefinitions: readonly VisualizerPaletteDefinition[] = [
  { id: "original", labelKey: "player.visualizerPaletteOriginal", icon: "original" },
  { id: "theme", labelKey: "player.visualizerPaletteTheme", icon: "theme" },
  { id: "artwork", labelKey: "player.visualizerPaletteArtwork", icon: "artwork" },
  { id: "rainbow", labelKey: "player.visualizerPaletteRainbow", icon: "rainbow" },
];
export const visualizerPaletteModes = visualizerPaletteDefinitions.map(({ id }) => id) as readonly VisualizerPaletteMode[];

const modeDefinitionById = new Map<VisualizerMode, VisualizerModeDefinition>(visualizerModeDefinitions.map((definition) => [definition.id, definition]));
const paletteDefinitionById = new Map<VisualizerPaletteMode, VisualizerPaletteDefinition>(visualizerPaletteDefinitions.map((definition) => [definition.id, definition]));

export function getVisualizerModeDefinition(mode: VisualizerMode): VisualizerModeDefinition {
  return modeDefinitionById.get(mode) ?? spectrumDefinition;
}

export function getVisualizerPaletteDefinition(mode: VisualizerPaletteMode): VisualizerPaletteDefinition {
  return paletteDefinitionById.get(mode) ?? visualizerPaletteDefinitions[1];
}

export function isVisualizerMode(value: string | null): value is VisualizerMode {
  return visualizerModes.some((mode) => mode === value);
}

export function isVisualizerPaletteMode(value: string | null): value is VisualizerPaletteMode {
  return visualizerPaletteModes.some((mode) => mode === value);
}

export function isVisualizerWebglDefinition(definition: VisualizerModeDefinition): definition is VisualizerWebglModeDefinition {
  return definition.renderer === "webgl";
}

const webglModeDefinitions = visualizerModeDefinitions.filter(isVisualizerWebglDefinition) as readonly VisualizerWebglModeDefinition[];

export const visualizerCanvasDefinitions = webglModeDefinitions
  .map(({ canvas: kind, canvasClassName: className }) => ({ kind, className })) as readonly {
    kind: Exclude<VisualizerCanvasKind, "base">;
    className: string;
  }[];

export function getVisualizerCanvasKind(mode: VisualizerMode): VisualizerCanvasKind {
  return getVisualizerModeDefinition(mode).canvas;
}

export function getModeIcon(mode: VisualizerMode): VisualizerModeIcon {
  return getVisualizerModeDefinition(mode).icon;
}
