import { type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TFunction } from "@/types/app";
import { visualizerModeDefinitions, visualizerPaletteDefinitions } from "./registry";
import type { VisualizerMode, VisualizerPaletteMode } from "./types";
import { ArtworkPaletteIcon, VisualizerModeIcon } from "./VisualizerModeIcon";

type VisualizerSettingsControlsProps = {
  mode: VisualizerMode;
  paletteMode: VisualizerPaletteMode;
  isOrchestraModeEnabled: boolean;
  onSelectMode: (mode: VisualizerMode) => void;
  onSelectPalette: (mode: VisualizerPaletteMode) => void;
  chibiControl: ReactNode;
  t: TFunction;
};

export function VisualizerSettingsControls({
  mode,
  paletteMode,
  isOrchestraModeEnabled,
  onSelectMode,
  onSelectPalette,
  chibiControl,
  t,
}: VisualizerSettingsControlsProps) {
  return (
    <>
      <div className="visualizer-mode-cluster">
        {chibiControl}
        <div className="visualizer-mode-switch" aria-label={t("player.visualizerMode")} role="group">
          {visualizerModeDefinitions.map((definition) => {
            const isActive = mode === definition.id && !isOrchestraModeEnabled;
            return (
              <Button
                aria-label={t(definition.labelKey)}
                aria-pressed={isActive}
                className={isActive ? "visualizer-mode-button active" : "visualizer-mode-button"}
                key={definition.id}
                onClick={() => onSelectMode(definition.id)}
                title={t(definition.labelKey)}
                type="button"
                variant="outline"
              >
                <VisualizerModeIcon mode={definition.icon} />
              </Button>
            );
          })}
        </div>
      </div>
      <ArrowRight aria-hidden="true" className="visualizer-settings-arrow" />
      <div className="visualizer-palette-switch" aria-label={t("player.visualizerPalette")} role="group">
        {visualizerPaletteDefinitions.map((definition) => {
          const isActive = paletteMode === definition.id;
          return (
            <Button
              aria-label={t(definition.labelKey)}
              aria-pressed={isActive}
              className={isActive ? "visualizer-palette-button active" : "visualizer-palette-button"}
              key={definition.id}
              onClick={() => onSelectPalette(definition.id)}
              title={t(definition.labelKey)}
              type="button"
              variant="outline"
            >
              {definition.icon === "artwork" ? <ArtworkPaletteIcon /> : <span aria-hidden="true" className={`visualizer-palette-swatch ${definition.icon}`} />}
            </Button>
          );
        })}
      </div>
    </>
  );
}
