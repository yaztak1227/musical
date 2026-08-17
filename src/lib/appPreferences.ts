import { isTauriRuntime, localApiRequest } from "./backend";
import type { RemoteAccessMode } from "./remoteAccess";
import {
  getStoredRemoteAccessMode,
  getStoredRemoteAccessGlobalIp,
  getStoredSidebarCollapsed,
  storeRemoteAccessGlobalIp,
  storeRemoteAccessMode,
  storeSidebarCollapsed,
} from "../features/preferences/infrastructure/localStoragePreferencesRepository";

const appPreferencesApiPath = "/api/app-preferences";
const globalIpApiUrl = "https://api.ipify.org?format=json";

export type AppPreferences = {
  remoteAccessMode: RemoteAccessMode;
  sidebarCollapsed: boolean;
};

export async function getAppPreferences(): Promise<AppPreferences> {
  if (isTauriRuntime) {
    return localApiRequest<AppPreferences>(appPreferencesApiPath);
  }

  const savedRemoteAccessMode = getStoredRemoteAccessMode();
  const savedGlobalIp = getStoredRemoteAccessGlobalIp();
  const currentGlobalIp = savedRemoteAccessMode === "off" ? null : await fetchGlobalIpv4().catch(() => null);
  return {
    remoteAccessMode:
      savedGlobalIp && savedGlobalIp === currentGlobalIp ? savedRemoteAccessMode : "off",
    sidebarCollapsed: getStoredSidebarCollapsed(),
  };
}

export async function updateAppPreferences(preferences: Partial<AppPreferences>) {
  if (isTauriRuntime) {
    return localApiRequest<AppPreferences>(appPreferencesApiPath, {
      body: JSON.stringify(preferences),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  if (preferences.remoteAccessMode !== undefined) {
    const globalIp = preferences.remoteAccessMode === "off" ? null : await fetchGlobalIpv4();
    storeRemoteAccessMode(preferences.remoteAccessMode);
    storeRemoteAccessGlobalIp(globalIp);
    if (preferences.sidebarCollapsed !== undefined) {
      storeSidebarCollapsed(preferences.sidebarCollapsed);
    }
    return {
      remoteAccessMode: preferences.remoteAccessMode,
      sidebarCollapsed: getStoredSidebarCollapsed(),
    } satisfies AppPreferences;
  }
  if (preferences.sidebarCollapsed !== undefined) {
    storeSidebarCollapsed(preferences.sidebarCollapsed);
  }
  return getAppPreferences();
}

async function fetchGlobalIpv4() {
  const response = await fetch(globalIpApiUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Global IP lookup failed with HTTP ${response.status}`);
  const value = (await response.json()) as { ip?: unknown };
  if (typeof value.ip !== "string" || !isIpv4Address(value.ip)) {
    throw new Error("Global IP lookup returned an invalid IPv4 address");
  }
  return value.ip;
}

function isIpv4Address(value: string) {
  const octets = value.split(".");
  return octets.length === 4 && octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const number = Number(octet);
    return number >= 0 && number <= 255 && String(number) === octet;
  });
}
