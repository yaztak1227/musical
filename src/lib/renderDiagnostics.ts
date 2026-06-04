export function isRenderDiagnosticsEnabled() {
  try {
    return window.localStorage.getItem("musical.renderDiagnostics") === "true";
  } catch {
    return false;
  }
}

export function getHeapUsageMb() {
  const performanceWithMemory = performance as Performance & {
    memory?: { usedJSHeapSize: number };
  };

  return performanceWithMemory.memory
    ? Math.round(performanceWithMemory.memory.usedJSHeapSize / 1024 / 1024)
    : null;
}

export function logRenderDiagnostic(label: string, payload: Record<string, unknown>) {
  if (!isRenderDiagnosticsEnabled()) return;

  const message = `[render-diagnostics] ${label} ${JSON.stringify(payload)}`;
  const windowWithDiagnostics = window as Window & { __renderDiagnostics?: string[] };
  windowWithDiagnostics.__renderDiagnostics = [...(windowWithDiagnostics.__renderDiagnostics ?? []), message].slice(-300);
  document.documentElement.dataset.renderDiagnostics = JSON.stringify(windowWithDiagnostics.__renderDiagnostics);
  console.debug(message);
}

export function releaseAudioSource(audio: HTMLAudioElement) {
  audio.pause();

  try {
    audio.currentTime = 0;
  } catch {
    // Reset can fail when the media pipeline is already detached.
  }

  audio.removeAttribute("src");
  audio.load();
}
