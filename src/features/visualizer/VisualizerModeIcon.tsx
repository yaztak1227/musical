import type { VisualizerModeIcon as VisualizerModeIconName } from "./types";

export function VisualizerModeIcon({ mode }: { mode: VisualizerModeIconName }) {
  const sharedProps = {
    "aria-hidden": true,
    className: "visualizer-mode-glyph",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
    viewBox: "0 0 24 24",
  };

  if (mode === "wave") {
    return <svg {...sharedProps}><path d="M3 8.5c2.2-2.7 4.3-2.7 6.4 0s4.3 2.7 6.4 0 3.9-2.5 5.2-.8" /><path d="M3 15.5c2.2-2.7 4.3-2.7 6.4 0s4.3 2.7 6.4 0 3.9-2.5 5.2-.8" opacity=".7" /></svg>;
  }
  if (mode === "spectrum") {
    return <svg {...sharedProps}><path d="M4 18v-5M8 18V9m4 9V5m4 13v-7m4 7v-3" /><path d="M3 20h18" opacity=".55" /></svg>;
  }
  if (mode === "circle") {
    return <svg {...sharedProps}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2" /><path d="M12 2.5v3M21.5 12h-3M12 21.5v-3M2.5 12h3M5.3 5.3l2.1 2.1M18.7 5.3l-2.1 2.1M18.7 18.7l-2.1-2.1M5.3 18.7l2.1-2.1" opacity=".72" /></svg>;
  }
  if (mode === "mountains") {
    return <svg {...sharedProps}><path d="M2.5 19 8.2 8.5l3.1 5 2.8-4.2L21.5 19Z" /><path d="m6.5 11.7 1.7 1.7 1.5-1.5M12.6 11.5l1.5 1.6 1.7-1.8" opacity=".7" /></svg>;
  }
  if (mode === "aurora") {
    return <svg {...sharedProps}><path d="M3 6.5c3.2-2.6 5.8 1.8 9-.3s5.7 1.3 9-.6" /><path d="M5.2 6.2c-1.4 4.3 1.6 7.6-.7 12.1M10.1 6.8c-1.7 3.7 1.9 7.7-.5 12M15.1 6.2c-1.4 4.4 1.8 7.9-.3 12.3M19.4 6.1c-1.1 3.8 1.2 7.2-.8 11.2" opacity=".82" /></svg>;
  }
  if (mode === "starfield") {
    return <svg {...sharedProps}><circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" /><path d="m10 10-6.5-5M14 10l5-6.5M14 14l6.5 5M10 14l-5 6.5M8.6 12H2.5M15.4 12h6.1M12 8.6V2.5M12 15.4v6.1" /><path d="m6.7 7.2-2.3-.8m12.9 10.4 2.4.8M17 7l1.5-2.1" opacity=".58" /></svg>;
  }
  if (mode === "tunnel") {
    return <svg {...sharedProps}><path d="M7 3c7 3.1 7 14.9 0 18M17 3c-7 3.1-7 14.9 0 18" /><path d="M8.4 6h7.2M7.1 10h9.8M7.1 14h9.8M8.4 18h7.2" opacity=".7" /></svg>;
  }
  if (mode === "warp") {
    return <svg {...sharedProps}><ellipse cx="12" cy="12" rx="8.8" ry="4.9" /><ellipse cx="12" cy="12" rx="4.4" ry="2.3" opacity=".78" /><path d="M3.6 9.2c2.6-4.1 7.3-6.1 11.8-4.3M20.4 14.8c-2.5 4.1-7.2 6-11.7 4.3M7 14.6c1.7 1.7 4.6 2.1 6.9.9M17 9.4c-1.8-1.7-4.6-2.1-6.9-.9" opacity=".72" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /></svg>;
  }
  if (mode === "ink") {
    return <svg {...sharedProps}><ellipse cx="7.1" cy="10.1" rx="3.6" ry="3.1" /><ellipse cx="16.3" cy="9.1" rx="3.3" ry="3.7" /><ellipse cx="12.4" cy="17" rx="3.8" ry="2.7" /><path d="M10.5 9.8c1.1-.8 1.7-.9 2.6-.5M9.2 12.5c.5 1.1 1.1 1.7 2 2.2M14.4 13c-.1 1-.4 1.6-.9 2" opacity=".62" /></svg>;
  }
  return <svg {...sharedProps}><path d="M3 17a6 6 0 0 1 12 0M13 17a4 4 0 0 1 8 0" /><path d="m9 15 2.7-3.4M17 16l1.7-2.2" /><path d="M3 20h18" opacity=".55" /></svg>;
}
export function ArtworkPaletteIcon() {
  return (
    <svg aria-hidden="true" className="visualizer-palette-artwork-icon" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="13" rx="2.5" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m5.5 14 4-4 3.1 3 2.5-2.2 3.4 3.2" />
      <circle className="artwork-color-dot cyan" cx="7" cy="20" r="2" />
      <circle className="artwork-color-dot violet" cx="12" cy="20" r="2" />
      <circle className="artwork-color-dot rose" cx="17" cy="20" r="2" />
    </svg>
  );
}
