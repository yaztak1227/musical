import { isTauriRuntime, localApiRequest } from "./backend";
import {
  getStoredMcpEnabled,
  storeMcpEnabled,
} from "../features/preferences/infrastructure/localStoragePreferencesRepository";

const mcpSettingsApiPath = "/api/mcp-settings";

export type McpSettingsInfo = {
  enabled: boolean;
  url: string;
};

export async function getMcpSettings() {
  if (!isTauriRuntime) {
    return {
      enabled: getStoredMcpEnabled(),
      url: "/mcp",
    } satisfies McpSettingsInfo;
  }
  return localApiRequest<McpSettingsInfo>(mcpSettingsApiPath);
}

export async function setMcpEnabled(enabled: boolean) {
  const settings = await localApiRequest<McpSettingsInfo>(mcpSettingsApiPath, {
    body: JSON.stringify({ enabled }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!isTauriRuntime) storeMcpEnabled(settings.enabled);
  return settings;
}
