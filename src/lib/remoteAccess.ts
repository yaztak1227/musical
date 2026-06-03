import { toDataURL } from "qrcode";
import { isTauriRuntime, localApiRequest } from "./backend";

const publicDevTunnelApiPath = "/api/public-dev-tunnel";
const localDevAccessApiPath = "/api/local-dev-access";

export type PublicDevTunnelInfo = {
  enabled: boolean;
  isStarting: boolean;
  url: string | null;
};

export type LocalDevAccessInfo = {
  available: boolean;
  enabled: boolean;
  host: string | null;
  port: number;
  url: string | null;
};

export type RemoteAccessMode = "off" | "lan" | "open";

export async function renderRemoteAccessQrCode(url: string | null) {
  if (!url) return null;

  return toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 128,
  });
}

export async function getPublicDevTunnelInfo() {
  const response = await fetch(publicDevTunnelApiPath);
  if (!response.ok) return null;

  const tunnelInfo = (await response.json()) as unknown;
  return isPublicDevTunnelInfo(tunnelInfo) ? tunnelInfo : null;
}

export async function getLocalDevAccessInfo() {
  if (isTauriRuntime) {
    return localApiRequest<LocalDevAccessInfo>(localDevAccessApiPath);
  }

  const response = await fetch(localDevAccessApiPath);
  if (!response.ok) return null;

  const accessInfo = (await response.json()) as unknown;
  return isLocalDevAccessInfo(accessInfo) ? accessInfo : null;
}

export async function setPublicDevTunnel(enabled: boolean) {
  const response = await fetch(publicDevTunnelApiPath, {
    body: JSON.stringify({ enabled }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const tunnelInfo = (await response.json()) as unknown;

  if (!response.ok || !isPublicDevTunnelInfo(tunnelInfo)) {
    throw new Error(getRemoteAccessErrorMessage(tunnelInfo, "Unknown error"));
  }

  return tunnelInfo;
}

export async function setLocalDevAccess(enabled: boolean) {
  if (isTauriRuntime) {
    const accessInfo = await localApiRequest<LocalDevAccessInfo>(localDevAccessApiPath, {
      body: JSON.stringify({ enabled }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!isLocalDevAccessInfo(accessInfo) || (enabled && (!accessInfo.available || !accessInfo.url))) {
      throw new Error("No LAN address is available");
    }

    return accessInfo;
  }

  const response = await fetch(localDevAccessApiPath, {
    body: JSON.stringify({ enabled }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const accessInfo = (await response.json()) as unknown;

  if (!response.ok || !isLocalDevAccessInfo(accessInfo) || (enabled && (!accessInfo.available || !accessInfo.url))) {
    throw new Error(getRemoteAccessErrorMessage(accessInfo, "No LAN address is available"));
  }

  return accessInfo;
}

function isPublicDevTunnelInfo(value: unknown): value is PublicDevTunnelInfo {
  const url = (value as Partial<PublicDevTunnelInfo> | null)?.url;
  return (
    typeof value === "object" &&
    value !== null &&
    "enabled" in value &&
    "isStarting" in value &&
    "url" in value &&
    typeof (value as PublicDevTunnelInfo).enabled === "boolean" &&
    typeof (value as PublicDevTunnelInfo).isStarting === "boolean" &&
    (url === null || (typeof url === "string" && url.startsWith("https://")))
  );
}

function isLocalDevAccessInfo(value: unknown): value is LocalDevAccessInfo {
  if (typeof value !== "object" || value === null) return false;

  const info = value as Partial<LocalDevAccessInfo>;
  return (
    typeof info.available === "boolean" &&
    typeof info.enabled === "boolean" &&
    (info.host === null || typeof info.host === "string") &&
    typeof info.port === "number" &&
    Number.isFinite(info.port) &&
    (info.url === null || typeof info.url === "string")
  );
}

function getRemoteAccessErrorMessage(value: unknown, fallback: string) {
  return typeof value === "object" && value && "error" in value ? String((value as { error: unknown }).error) : fallback;
}
