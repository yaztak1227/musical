import type { QueuedRemotePlayerCommand } from "@/lib/backend";
import type { RepeatMode } from "@/types/app";
import type { EntityId } from "@/types/audio";
import { isRepeatMode } from "@/features/playback/domain/playbackPreferences";

export function getCommandNumber(command: QueuedRemotePlayerCommand, key: string) {
  const value = command.payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getCommandEntityId(command: QueuedRemotePlayerCommand, key: string): EntityId | null {
  const value = command.payload?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

export function getCommandBoolean(command: QueuedRemotePlayerCommand, key: string) {
  const value = command.payload?.[key];
  return typeof value === "boolean" ? value : null;
}

export function getCommandRepeatMode(command: QueuedRemotePlayerCommand): RepeatMode | null {
  const value = command.payload?.repeatMode;
  return isRepeatMode(value) ? value : null;
}

export function getCommandEntityIdArray(command: QueuedRemotePlayerCommand, key: string) {
  const value = command.payload?.[key];
  if (!Array.isArray(value)) return null;

  const ids = value.filter(
    (item): item is EntityId =>
      (typeof item === "number" && Number.isFinite(item)) || (typeof item === "string" && item.trim().length > 0),
  );
  return ids.length === value.length ? ids : null;
}
