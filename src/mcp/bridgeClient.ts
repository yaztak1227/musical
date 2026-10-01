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

    if (!response.ok) {
      const fallback = `Musical bridge request failed with HTTP ${response.status}`;
      const body = text.trim();
      if (!body) {
        throw new Error(fallback);
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("text/plain")) {
        throw new Error(body);
      }

      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        // Be defensive when a bridge omits or mislabels its content type.
        throw new Error(body);
      }

      const message =
        typeof value === "string"
          ? value
          : value && typeof value === "object" && "error" in value
            ? String((value as { error: unknown }).error)
            : fallback;
      throw new Error(message);
    }

    if (!text.trim()) {
      throw new Error("Musical bridge returned an empty successful response");
    }
    // A successful bridge response is always expected to be JSON. Let malformed
    // JSON surface as a useful parse error instead of silently accepting text.
    return JSON.parse(text);
  }
}
