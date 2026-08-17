import type { VisualizerMode, VisualizerModeRuntime } from "./types";

export type VisualizerRuntimeVariant = "default" | "chibi" | "orchestra";

/**
 * Returns the lifetime identity for a mode runtime. Chibi and orchestra are
 * separate Spectrum runtimes so their motion/assets never leak into the
 * normal renderer; unsupported modes intentionally collapse to `default`.
 */
export function getVisualizerRuntimeVariant(
  mode: VisualizerMode,
  supportsChibi: boolean,
  isChibiModeEnabled: boolean,
  isOrchestraModeEnabled: boolean,
): VisualizerRuntimeVariant {
  if (mode === "spectrum" && isOrchestraModeEnabled) return "orchestra";
  if (supportsChibi && isChibiModeEnabled) return "chibi";
  return "default";
}

export function getVisualizerRuntimeKey(
  mode: VisualizerMode,
  supportsChibi: boolean,
  isChibiModeEnabled: boolean,
  isOrchestraModeEnabled: boolean,
) {
  return `${mode}:${getVisualizerRuntimeVariant(mode, supportsChibi, isChibiModeEnabled, isOrchestraModeEnabled)}`;
}

export type VisualizerRuntimeCache = {
  get: (key: string, create: () => VisualizerModeRuntime) => VisualizerModeRuntime;
  resetAll: () => void;
  disposeAll: () => void;
};

/**
 * Keeps mode/variant state alive for the overlay lifetime. `disposeAll` clears
 * the map, making repeated unmount cleanup safe and exactly-once per runtime.
 */
export function createVisualizerRuntimeCache(): VisualizerRuntimeCache {
  const runtimes = new Map<string, VisualizerModeRuntime>();

  return {
    get(key, create) {
      const existing = runtimes.get(key);
      if (existing) return existing;
      const runtime = create();
      runtimes.set(key, runtime);
      return runtime;
    },
    resetAll() {
      runtimes.forEach((runtime) => runtime.reset?.());
    },
    disposeAll() {
      const cachedRuntimes = [...runtimes.values()];
      runtimes.clear();
      cachedRuntimes.forEach((runtime) => runtime.dispose?.());
    },
  };
}
