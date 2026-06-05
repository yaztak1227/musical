import { isTauriRuntime, localApiRequest } from "./backend";

const mcpSettingsApiPath = "/api/mcp-settings";

export type McpSettingsInfo = {
  enabled: boolean;
  url: string;
};

export async function getMcpSettings() {
  if (!isTauriRuntime) return null;
  return localApiRequest<McpSettingsInfo>(mcpSettingsApiPath);
}

export async function setMcpEnabled(enabled: boolean) {
  return localApiRequest<McpSettingsInfo>(mcpSettingsApiPath, {
    body: JSON.stringify({ enabled }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}
