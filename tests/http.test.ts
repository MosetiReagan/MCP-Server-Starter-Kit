import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { createMcpServer, type ServerConfig } from "@mcp-starter/core";
import { createHttpServer, ReadinessRegistry } from "@mcp-starter/server";

const config: ServerConfig = {
  MCP_TRANSPORT: "http",
  MCP_HOST: "127.0.0.1",
  MCP_PORT: 0,
  MCP_ENDPOINT: "/mcp",
  MCP_AUTH_ENABLED: true,
  MCP_API_KEY: "test-api-key-123456",
  MCP_SERVER_NAME: "test",
  MCP_SERVER_VERSION: "0.1.0",
  CORS_ORIGINS: "http://localhost:5173",
  REQUEST_BODY_LIMIT: 1024,
  REQUEST_TIMEOUT_MS: 5000,
  LOG_LEVEL: "fatal",
  POSTGRES_ENABLED: false,
  MYSQL_ENABLED: false,
  REDIS_ENABLED: false,
};

const servers: ReturnType<typeof createHttpServer>[] = [];

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

afterAll(async () => {
  await Promise.all(servers.map((server) => server.stop()));
});

function createTestServer(authEnabled: boolean, ready: boolean) {
  const readiness = new ReadinessRegistry();
  readiness.add("postgres", async () => {
    if (!ready) throw new Error("unavailable");
  });
  const server = createHttpServer({
    config: { ...config, MCP_AUTH_ENABLED: authEnabled },
    toolkit: createMcpServer({ name: "test", version: "0.1.0" }),
    readiness,
    logger: { info: () => undefined, error: () => undefined },
  });
  servers.push(server);
  return server;
}

describe("HTTP server", () => {
  it("returns health and readiness statuses", async () => {
    const server = createTestServer(false, false);
    const health = await server.inject("/health");
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });
    const ready = await server.inject("/ready");
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({
      status: "unavailable",
      dependencies: { postgres: "unavailable" },
    });
  });

  it("rejects MCP requests without a valid bearer token", async () => {
    const server = createTestServer(true, true);
    const unauthorized = await server.inject("/mcp");
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    const response = await server.inject({
      method: "POST",
      url: "/mcp",
      headers: { authorization: "Bearer test-api-key-123456" },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns JSON-RPC errors for malformed MCP requests", async () => {
    const server = createTestServer(false, true);
    const response = await server.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      payload: "{",
    });
    expect(response.statusCode).toBe(400);
    const body = parseJson(response.body);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32600 },
      id: null,
    });
  });

  it("enforces separate MCP session HTTP contracts", async () => {
    const server = createTestServer(false, true);
    const getRequest = await server.inject({ method: "GET", url: "/mcp" });
    expect(getRequest.statusCode).toBe(400);
    expect(getRequest.json()).toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32600 },
    });

    const deleteRequest = await server.inject({
      method: "DELETE",
      url: "/mcp",
    });
    expect(deleteRequest.statusCode).toBe(404);
    expect(deleteRequest.json()).toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32600 },
    });
  });

  it("configures CORS without a wildcard default", async () => {
    const server = createTestServer(false, true);
    const response = await server.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET",
      },
    });
    expect(response.statusCode).toBeLessThan(400);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("executes a tool over Streamable HTTP", async () => {
    const toolkit = createMcpServer({ name: "http-e2e", version: "0.1.0" });
    toolkit.tool(
      "calculate",
      { inputSchema: { a: z.number(), b: z.number() } },
      async ({ a, b }) => ({
        content: [{ type: "text", text: String(a + b) }],
      }),
    );
    const e2e = createHttpServer({
      config: { ...config, MCP_AUTH_ENABLED: false },
      toolkit,
      readiness: new ReadinessRegistry(),
      logger: { info: () => undefined, error: () => undefined },
    });
    servers.push(e2e);
    await e2e.start();
    const address = e2e.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const client = new Client({ name: "http-test-client", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${String(port)}/mcp`),
    );
    await client.connect(transport);
    const result = await client.callTool({
      name: "calculate",
      arguments: { a: 20, b: 22 },
    });
    expect(result.content).toEqual([{ type: "text", text: "42" }]);
    await client.close();
  });
});
