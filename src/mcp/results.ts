import { homedir } from "node:os";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const HOME_REPLACEMENT = "[home]";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSeparator(value: string | undefined) {
  return value === "/" || value === "\\";
}

function replaceSeparator(value: string, separator: string, replacement: string) {
  return value.split(separator).join(replacement);
}

function pathVariants(homePath: string) {
  const normalized = homePath.replace(/[\\/]+$/, "");
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([
    normalized,
    replaceSeparator(normalized, "\\", "/"),
    replaceSeparator(normalized, "/", "\\"),
  ]);
  const drivePath = /^[A-Za-z]:[\\/]/.test(normalized);
  if (drivePath) {
    const slashVariant = replaceSeparator(normalized, "\\", "/");
    const backslashVariant = replaceSeparator(normalized, "/", "\\");
    for (const prefix of ["\\\\?\\", "//?/", "\\\\?/", "//?\\"]) {
      variants.add(`${prefix}${slashVariant}`);
      variants.add(`${prefix}${backslashVariant}`);
    }
  }

  const uncPath = /^(?:\\\\|\/\/)/.test(normalized);
  if (uncPath) {
    const uncTail = normalized.replace(/^[\\/]+/, "");
    variants.add(`\\\\?\\UNC\\${replaceSeparator(uncTail, "/", "\\")}`);
    variants.add(`//?/UNC/${replaceSeparator(uncTail, "\\", "/")}`);
  }

  return [...variants].sort((left, right) => right.length - left.length);
}

function urlContext(message: string, index: number) {
  const match = message
    .slice(0, index)
    .match(/([A-Za-z][A-Za-z0-9+.-]*):\/\/[^\s"'<>]*$/u);
  return match ? { scheme: match[1].toLowerCase() } : undefined;
}

function isFileUrlPathStart(message: string, index: number) {
  return /(?:^|[^A-Za-z0-9+.-])file:\/\/[^/\\\s"'<>]*$/iu.test(message.slice(0, index));
}

function hasPathBoundary(message: string, index: number, match: string) {
  const previous = message[index - 1];
  const next = message[index + match.length];
  const url = urlContext(message, index);
  const fileUrlPathStart = url?.scheme === "file" && isFileUrlPathStart(message, index);

  if (url && url.scheme !== "file") {
    return false;
  }

  if (
    previous &&
    (/[A-Za-z0-9_.-]/u.test(previous) || isSeparator(previous)) &&
    !(url?.scheme === "file" && (isSeparator(previous) || fileUrlPathStart))
  ) {
    return false;
  }
  // Do not mistake the /Users part of a different Windows drive path for the
  // current home directory when the POSIX separator variant is in use.
  if (isSeparator(match[0]) && previous === ":" && /^[A-Za-z]$/u.test(message[index - 2] ?? "")) {
    return false;
  }
  if (next && /[A-Za-z0-9_.-]/u.test(next)) {
    return false;
  }
  return true;
}

/** Replace the current user's home directory in an error message. */
export function redactHomePath(message: string, homePath = homedir()) {
  const variants = pathVariants(homePath);
  if (variants.length === 0) {
    return message;
  }

  const windowsPath = /^(?:[A-Za-z]:[\\/]|\\\\|\/\/)/.test(homePath);
  const pattern = new RegExp(variants.map(escapeRegExp).join("|"), windowsPath ? "giu" : "gu");
  return message.replace(pattern, (match, offset: number) => {
    if (!hasPathBoundary(message, offset, match)) {
      return match;
    }
    const url = urlContext(message, offset);
    return url?.scheme === "file" && isSeparator(match[0]) ? `/${HOME_REPLACEMENT}` : HOME_REPLACEMENT;
  });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function successToolResult(value: unknown): CallToolResult {
  if (!isJsonObject(value)) {
    throw new Error("MCP tool success result must be a JSON object");
  }

  return {
    content: [],
    structuredContent: value,
    isError: false,
  };
}

export function errorToolResult(message: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: redactHomePath(message),
      },
    ],
    isError: true,
  };
}
