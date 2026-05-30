import { useEffect } from "react";

type MediaKeyHandlers = {
  onTogglePlayback: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  onVolumeStep: (delta: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleSidebar: () => void;
  onJumpToAlbumLetter: (letter: string) => void;
};

export function useGlobalMediaKeys(handlers: MediaKeyHandlers) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || shouldIgnoreShortcut(event)) return;

      const key = event.key.toLowerCase();
      const action = getMediaKeyAction(key, event);
      if (!action) return;

      event.preventDefault();

      if (action.startsWith("jump-album:")) {
        handlers.onJumpToAlbumLetter(action.slice("jump-album:".length));
        return;
      }

      switch (action) {
        case "toggle-playback":
          handlers.onTogglePlayback();
          break;
        case "previous-track":
          handlers.onPreviousTrack();
          break;
        case "next-track":
          handlers.onNextTrack();
          break;
        case "volume-up":
          handlers.onVolumeStep(0.05);
          break;
        case "volume-down":
          handlers.onVolumeStep(-0.05);
          break;
        case "toggle-mute":
          handlers.onToggleMute();
          break;
        case "toggle-shuffle":
          handlers.onToggleShuffle();
          break;
        case "cycle-repeat":
          handlers.onCycleRepeat();
          break;
        case "toggle-sidebar":
          handlers.onToggleSidebar();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}

function getMediaKeyAction(key: string, event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey) return null;

  if (event.altKey) {
    switch (key) {
      case "m":
        return "toggle-mute";
      case "s":
        return "toggle-shuffle";
      case "r":
        return "cycle-repeat";
      case "l":
        return "toggle-sidebar";
      default:
        return null;
    }
  }

  if (/^[a-z]$/.test(key)) {
    return `jump-album:${key}`;
  }

  switch (key) {
    case " ":
    case "spacebar":
      return "toggle-playback";
    case "arrowleft":
      return "previous-track";
    case "arrowright":
      return "next-track";
    case "arrowup":
      return "volume-up";
    case "arrowdown":
      return "volume-down";
    default:
      return null;
  }
}

function shouldIgnoreShortcut(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const editableSelector = "input, textarea, select, [role='textbox'], [data-keyboard-scope='text']";
  return Boolean(target.closest(editableSelector));
}
