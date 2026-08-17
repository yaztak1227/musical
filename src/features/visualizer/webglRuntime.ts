import type { VisualizerWebglAdapter, VisualizerWebglModeDefinition } from "./types";

export type VisualizerWebglRuntime = {
  activate: (definition: VisualizerWebglModeDefinition | null, canvas: HTMLCanvasElement | null) => Promise<VisualizerWebglAdapter | null>;
  current: () => VisualizerWebglAdapter | null;
  dispose: () => void;
  reset: () => void;
};

/**
 * Owns the asynchronous WebGL promotion lifecycle independently of React.
 * The pure controller is intentionally injectable/testable: callers can use a
 * fake definition loader to assert fallback, rejection, stale load and exact
 * disposal behavior without constructing a real WebGL context.
 */
export function createVisualizerWebglRuntime(
  onAdapterChange: (adapter: VisualizerWebglAdapter | null) => void = () => undefined,
): VisualizerWebglRuntime {
  let generation = 0;
  let currentAdapter: VisualizerWebglAdapter | null = null;
  const disposedAdapters = new WeakSet<VisualizerWebglAdapter>();

  const disposeAdapter = (adapter: VisualizerWebglAdapter | null) => {
    if (!adapter || disposedAdapters.has(adapter)) return;
    disposedAdapters.add(adapter);
    adapter.dispose();
  };

  const replaceCurrent = (adapter: VisualizerWebglAdapter | null) => {
    if (currentAdapter === adapter) return;
    disposeAdapter(currentAdapter);
    currentAdapter = adapter;
    onAdapterChange(adapter);
  };

  return {
    async activate(definition, canvas) {
      const activation = ++generation;
      replaceCurrent(null);
      if (!definition || !canvas) return null;

      try {
        const adapter = await definition.load(canvas);
        if (activation !== generation || !canvas.isConnected) {
          disposeAdapter(adapter);
          return null;
        }
        replaceCurrent(adapter);
        return adapter;
      } catch {
        if (activation === generation) replaceCurrent(null);
        return null;
      }
    },
    current: () => currentAdapter,
    dispose() {
      generation += 1;
      replaceCurrent(null);
    },
    reset() {
      currentAdapter?.reset?.();
    },
  };
}
