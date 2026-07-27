import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TFunction } from "@/types/app";

type PlayerVisualizerLoadingOverlayProps = {
  onClose: () => void;
  t: TFunction;
};

export function PlayerVisualizerLoadingOverlay({
  onClose,
  t,
}: PlayerVisualizerLoadingOverlayProps) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <section
      aria-busy="true"
      aria-label={t("player.visualizerLabel")}
      aria-modal="true"
      className="player-visualizer-overlay visualizer-loading-overlay"
      role="dialog"
    >
      <Button
        aria-label={t("player.closeVisualizer")}
        autoFocus
        className="visualizer-close-button icon-button"
        onClick={onClose}
        title={t("player.closeVisualizer")}
        type="button"
        variant="outline"
      >
        <X aria-hidden="true" />
      </Button>
      <div
        aria-live="polite"
        className="visualizer-loading-status"
        role="status"
      >
        <span aria-hidden="true" className="visualizer-loading-bars">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>{t("player.visualizerLoading")}</span>
      </div>
    </section>
  );
}
