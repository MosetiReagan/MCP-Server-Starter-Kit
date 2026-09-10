import Fastify from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMcpServer, ExternalApiError, redact } from "@mcp-starter/core";
import {
  registerMysqlTools,
  registerPostgresTools,
  registerRedisTools,
} from "@mcp-starter/integrations";
import { createHttpIntegration } from "@mcp-starter/integrations/http";

describe("integrations", () => {
  async function connect(toolkit: ReturnType<typeof createMcpServer>) {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "integration-client", version: "0.1.0" });
    await Promise.all([
      client.connect(clientTransport),
      toolkit.mcp.connect(serverTransport),
    ]);
    return client;
  }

  it("executes parameterized PostgreSQL search queries", async () => {
    const toolkit = createMcpServer({ name: "postgres", version: "0.1.0" });
    const calls: { sql: string; values: unknown[] }[] = [];
    registerPostgresTools(toolkit, {
      pool: {
        query: async (sql: string, values: unknown[]) => {
          calls.push({ sql, values });
          return { rows: [{ id: "1", name: "Ada" }] };
        },
      },
      tables: [
        {
          name: "users",
          primaryKey: "id",
          columns: ["id", "name"],
          searchColumns: ["name"],
        },
      ],
    } as never);
    const client = await connect(toolkit);
    const result = await client.callTool({
      name: "search_users",
      arguments: { query: "Ada", limit: 10 },
    });
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify([{ id: "1", name: "Ada" }]) },
    ]);
    expect(calls[0]?.sql).toContain("ILIKE $1");
    expect(calls[0]?.values).toEqual(["%Ada%", "10"]);
    await client.close();
  });

  it("paginates PostgreSQL rows with opaque cursors", async () => {
    const toolkit = createMcpServer({
      name: "postgres-pagination",
      version: "0.1.0",
    });
    const calls: { sql: string; values: unknown[] }[] = [];
    registerPostgresTools(toolkit, {
      pool: {
        query: async (sql: string, values: unknown[]) => {
          calls.push({ sql, values });
          return {
            rows:
              values.length === 1
                ? [
                    { id: "1", name: "Ada" },
                    { id: "2", name: "Grace" },
                  ]
                : [{ id: "3", name: "Alan" }],
          };
        },
      },
      tables: [
        {
          name: "users",
          primaryKey: "id",
          columns: ["id", "name"],
        },
      ],
    } as never);
    const client = await connect(toolkit);
    const firstPage = await client.callTool({
      name: "list_users",
      arguments: { limit: 2 },
    });
    expect(firstPage.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({
          rows: [
            { id: "1", name: "Ada" },
            { id: "2", name: "Grace" },
          ],
          nextCursor: Buffer.from(JSON.stringify("2")).toString("base64url"),
        }),
      },
    ]);
    const secondPage = await client.callTool({
      name: "list_users",
      arguments: {
        limit: 2,
        cursor: Buffer.from(JSON.stringify("2")).toString("base64url"),
      },
    });
    expect(secondPage.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({
          rows: [{ id: "3", name: "Alan" }],
          nextCursor: null,
        }),
      },
    ]);
    expect(calls[1]?.sql).toContain('WHERE "id" > $2');
    expect(calls[1]?.values).toEqual([2, "2"]);
    await client.close();
  });

  it("executes MySQL queries with bound parameters", async () => {
    const toolkit = createMcpServer({ name: "mysql", version: "0.1.0" });
    const calls: { sql: string; values: unknown[] }[] = [];
    registerMysqlTools(toolkit, {
      pool: {
        query: async (sql: string, values: unknown[]) => {
          calls.push({ sql, values });
          return [[{ id: "1", name: "Ada" }], []];
        },
      },
      tables: [
        {
          name: "users",
          primaryKey: "id",
          columns: ["id", "name"],
          searchColumns: ["name"],
        },
      ],
    } as never);
    const client = await connect(toolkit);
    const result = await client.callTool({
      name: "search_users",
      arguments: { query: "Ada", limit: 10 },
    });
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify([{ id: "1", name: "Ada" }]) },
    ]);
    expect(calls[0]?.sql).toContain("LIKE ?");
    expect(calls[0]?.values).toEqual(["%Ada%", "10"]);
    await client.close();
  });

  it("executes Redis operations inside a namespace", async () => {
    const toolkit = createMcpServer({ name: "redis", version: "0.1.0" });
    const keys: string[] = [];
    registerRedisTools(toolkit, {
      prefix: "my-server",
      client: {
        get: async (key) => {
          keys.push(`get:${key}`);
          return "value";
        },
        set: async (key) => {
          keys.push(`set:${key}`);
          return "OK";
        },
        del: async (key) => {
          keys.push(`del:${key}`);
          return 1;
        },
        keys: async () => ["my-server:a"],
      },
    });
    const client = await connect(toolkit);
    const result = await client.callTool({
      name: "cache_get",
      arguments: { key: "user:1" },
    });
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ key: "user:1", value: "value" }) },
    ]);
    expect(keys).toEqual(["get:my-server:user:1"]);
    await client.close();
  });

  it("lists Redis keys incrementally with SCAN", async () => {
    const toolkit = createMcpServer({ name: "redis-scan", version: "0.1.0" });
    const scans: { cursor: number; match: string; count: number }[] = [];
    registerRedisTools(toolkit, {
      prefix: "my-server",
      client: {
        get: async () => null,
        set: async () => "OK",
        del: async () => 0,
        scan: async (cursor: number, match: string, count: number) => {
          scans.push({ cursor, match, count });
          return [
            cursor === 0 ? "1" : "0",
            cursor === 0 ? ["my-server:a"] : ["my-server:b"],
          ];
        },
      },
    });
    const client = await connect(toolkit);
    const result = await client.callTool({
      name: "cache_list_keys",
      arguments: { limit: 2 },
    });
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify(["a", "b"]) },
    ]);
    expect(scans).toEqual([
      { cursor: 0, match: "my-server:*", count: 2 },
      { cursor: 1, match: "my-server:*", count: 2 },
    ]);
    await client.close();
  });

  it("maps and validates REST operations as MCP tools", async () => {
    const app = Fastify();
    app.get("/users", async () => ({ users: [{ id: 1 }] }));
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const api = createHttpIntegration({
      baseUrl: `http://127.0.0.1:${String(port)}`,
      retries: 1,
    });
    const toolkit = createMcpServer({ name: "api", version: "0.1.0" });
    api.mapToTools(toolkit, [
      {
        name: "list_users",
        description: "List users",
        method: "GET",
        path: "/users",
        responseSchema: z.object({
          users: z.array(z.object({ id: z.number() })),
        }),
      },
    ]);
    const client = await connect(toolkit);
    const result = await client.callTool({ name: "list_users", arguments: {} });
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ users: [{ id: 1 }] }) },
    ]);
    await client.close();
    await app.close();
  });

  it("ignores REST path overrides unless explicitly enabled", async () => {
    const app = Fastify();
    app.get("/users", async () => ({ users: [{ id: 1 }] }));
    app.get("/admin", async () => ({ secret: true }));
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const api = createHttpIntegration({
      baseUrl: `http://127.0.0.1:${String(port)}`,
    });
    const toolkit = createMcpServer({ name: "api-path", version: "0.1.0" });
    api.mapToTools(toolkit, [
      {
        name: "list_users",
        description: "List users",
        method: "GET",
        path: "/users",
        responseSchema: z.object({
          users: z.array(z.object({ id: z.number() })),
        }),
      },
    ]);
    const client = await connect(toolkit);
    const result = await client.callTool({
      name: "list_users",
      arguments: { path: "/admin" },
    });
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ users: [{ id: 1 }] }) },
    ]);
    await client.close();
    await app.close();
  });

  it("enforces allowed REST path prefixes", async () => {
    const app = Fastify();
    app.get("/public/users", async () => ({ users: [{ id: 1 }] }));
    app.get("/private/users", async () => ({ secret: true }));
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const api = createHttpIntegration({
      baseUrl: `http://127.0.0.1:${String(port)}`,
    });
    const toolkit = createMcpServer({
      name: "api-prefixes",
      version: "0.1.0",
    });
    api.mapToTools(toolkit, [
      {
        name: "list_users",
        description: "List users",
        method: "GET",
        path: "/public/users",
        allowPathOverride: true,
        allowedPathPrefixes: ["/public"],
        responseSchema: z.object({
          users: z.array(z.object({ id: z.number() })),
        }),
      },
    ]);
    const client = await connect(toolkit);
    const denied = await client.callTool({
      name: "list_users",
      arguments: { path: "/private/users" },
    });
    expect(denied.isError).toBe(true);

    const allowed = await client.callTool({
      name: "list_users",
      arguments: { path: "/public/users" },
    });
    expect(allowed.content).toEqual([
      { type: "text", text: JSON.stringify({ users: [{ id: 1 }] }) },
    ]);
    await client.close();
    await app.close();
  });

  it("does not retry non-retryable upstream client errors", async () => {
    const app = Fastify();
    let requests = 0;
    app.get("/bad-request", async (_request, reply) => {
      requests += 1;
      return await reply.code(400).send({ error: "bad_request" });
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const api = createHttpIntegration({
      baseUrl: `http://127.0.0.1:${String(port)}`,
      retries: 2,
    });
    await expect(api.request("GET", "/bad-request")).rejects.toBeInstanceOf(
      ExternalApiError,
    );
    expect(requests).toBe(1);
    await app.close();
  });

  it("retries retryable upstream server errors", async () => {
    const app = Fastify();
    let requests = 0;
    app.get("/server-error", async (_request, reply) => {
      requests += 1;
      return await reply.code(500).send({ error: "server_error" });
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const api = createHttpIntegration({
      baseUrl: `http://127.0.0.1:${String(port)}`,
      retries: 1,
    });
    await expect(api.request("GET", "/server-error")).rejects.toBeInstanceOf(
      ExternalApiError,
    );
    expect(requests).toBe(2);
    await app.close();
  });

  it("redacts sensitive values in logs", () => {
    expect(
      redact({ authorization: "secret", nested: { apiKey: "secret" } }),
    ).toEqual({
      authorization: "[redacted]",
      nested: { apiKey: "[redacted]" },
    });
  });
});
