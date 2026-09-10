import { describe, expect, it } from "vitest";
import { loadConfig } from "@mcp-starter/core";

describe("configuration", () => {
  it("applies secure development defaults", () => {
    const config = loadConfig({});
    expect(config.MCP_TRANSPORT).toBe("http");
    expect(config.MCP_AUTH_ENABLED).toBe(false);
    expect(config.CORS_ORIGINS).toContain("http://localhost:3000");
  });

  it("requires PostgreSQL URL when enabled", () => {
    expect(() => loadConfig({ POSTGRES_ENABLED: "true" })).toThrow(
      /POSTGRES_URL is required/,
    );
  });

  it("requires API key when authentication is enabled", () => {
    expect(() => loadConfig({ MCP_AUTH_ENABLED: "true" })).toThrow(
      /MCP_API_KEY is required/,
    );
  });
});
