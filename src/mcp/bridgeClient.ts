export type BridgeClientOptions = {
  baseUrl: string;
  token: string;
};

export class BridgeClient {
  readonly baseUrl: string;
  readonly token: string;

  constructor(options: BridgeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  async callTool(name: string, argumentsValue: unknown) {
    return this.request(`/api/_mcp/tools/${encodeURIComponent(name)}`, {
      body: JSON.stringify({ arguments: argumentsValue ?? {} }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        "X-Musical-MCP-Token": this.token,
      },
    });
    const text = await response.text();
    const value = text.length > 0 ? JSON.parse(text) : null;
    if (!response.ok) {
      const message =
        typeof value === "string"
          ? value
          : value && typeof value === "object" && "error" in value
            ? String((value as { error: unknown }).error)
            : `Musical bridge request failed with HTTP ${response.status}`;
      throw new Error(message);
    }
    return value;
  }
}
