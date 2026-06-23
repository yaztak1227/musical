import type { EntityId } from "../../types/audio";

export function areEntityIdArraysEqual(first: EntityId[] | null, second: EntityId[] | null) {
  if (first === second) return true;
  if (!first || !second || first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
}

export function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

export function getHeapTotalUsageMb() {
  const performanceWithMemory = performance as Performance & {
    memory?: { totalJSHeapSize: number };
  };

  return performanceWithMemory.memory
    ? Math.round(performanceWithMemory.memory.totalJSHeapSize / 1024 / 1024)
    : null;
}

