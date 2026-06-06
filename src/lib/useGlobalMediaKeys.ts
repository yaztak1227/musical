import { useEffect } from "react";

type MediaKeyHandlers = {
  onPlayPlayback: () => void;
  onPausePlayback: () => void;
  onTogglePlayback: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  onSeekPlayback: (time: number) => void;
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
      if (event.defaultPrevented || shouldIgnoreTextShortcut(event)) return;

      const key = event.key.toLowerCase();
      const action = getMediaKeyAction(key, event);
      if (!action) return;
      if (shouldLetFocusedControlHandleShortcut(event, action)) return;

      event.preventDefault();

      if (action.startsWith("jump-album:")) {
        handlers.onJumpToAlbumLetter(action.slice("jump-album:".length));
        return;
      }

      switch (action) {
        case "play":
          handlers.onPlayPlayback();
          break;
        case "pause":
        case "stop":
          handlers.onPausePlayback();
          break;
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

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    setMediaSessionActionHandler("play", handlers.onPlayPlayback);
    setMediaSessionActionHandler("pause", handlers.onPausePlayback);
    setMediaSessionActionHandler("stop", handlers.onPausePlayback);
    setMediaSessionActionHandler("previoustrack", handlers.onPreviousTrack);
    setMediaSessionActionHandler("nexttrack", handlers.onNextTrack);
    setMediaSessionActionHandler("seekto", (details) => {
      if (typeof details.seekTime === "number" && Number.isFinite(details.seekTime)) {
        handlers.onSeekPlayback(details.seekTime);
      }
    });

    return () => {
      setMediaSessionActionHandler("play", null);
      setMediaSessionActionHandler("pause", null);
      setMediaSessionActionHandler("stop", null);
      setMediaSessionActionHandler("previoustrack", null);
      setMediaSessionActionHandler("nexttrack", null);
      setMediaSessionActionHandler("seekto", null);
    };
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
    case "mediaplay":
      return "play";
    case "mediapause":
      return "pause";
    case "mediastop":
      return "stop";
    case "mediaplaypause":
    case " ":
    case "spacebar":
      return "toggle-playback";
    case "mediaprevioustrack":
    case "arrowleft":
      return "previous-track";
    case "medianexttrack":
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

function setMediaSessionActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Some WebViews expose mediaSession but do not support every action.
  }
}

function shouldIgnoreTextShortcut(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const editableSelector = "input, textarea, select, [role='textbox'], [data-keyboard-scope='text']";
  return Boolean(target.closest(editableSelector));
}

function shouldLetFocusedControlHandleShortcut(event: KeyboardEvent, action: string) {
  if (action.startsWith("jump-album:")) return false;
  if (event.altKey) return false;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;

  const interactiveSelector = [
    "a[href]",
    "button",
    "summary",
    "[role='button']",
    "[role='checkbox']",
    "[role='combobox']",
    "[role='link']",
    "[role='menuitem']",
    "[role='option']",
    "[role='radio']",
    "[role='row']",
    "[role='slider']",
    "[role='switch']",
    "[role='tab']",
    "[tabindex]:not([tabindex='-1'])",
  ].join(", ");

  return Boolean(target.closest(interactiveSelector));
}
