import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@mcp-starter/core";
import { registerPostgresTools } from "@mcp-starter/integrations/postgres";
import pg from "pg";
import { describe, expect, it } from "vitest";

const postgresUrl = process.env.POSTGRES_TEST_URL;

describe.skipIf(!postgresUrl)("PostgreSQL database smoke test", () => {
  it("lists and searches seeded users through the real PostgreSQL driver", async () => {
    const pool = new pg.Pool({ connectionString: postgresUrl, max: 1 });
    const seed = readFileSync(
      new URL("../docker/init/001-users.sql", import.meta.url),
      "utf8",
    );
    const toolkit = createMcpServer({
      name: "postgres-integration",
      version: "0.1.0",
    });
    registerPostgresTools(toolkit, {
      pool,
      tables: [
        {
          name: "users",
          primaryKey: "id",
          columns: ["id", "name", "email"],
          searchColumns: ["name", "email"],
        },
      ],
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({
      name: "postgres-integration-client",
      version: "0.1.0",
    });

    try {
      await pool.query(seed);
      await Promise.all([
        client.connect(clientTransport),
        toolkit.mcp.connect(serverTransport),
      ]);
      const listFirstPage = await client.callTool({
        name: "list_users",
        arguments: { limit: 1 },
      });
      const firstPage = parseToolResult(listFirstPage) as {
        rows: unknown[];
        nextCursor: string | null;
      };
      expect(firstPage.rows).toEqual([
        { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
      ]);
      expect(typeof firstPage.nextCursor).toBe("string");
      const nextCursor = firstPage.nextCursor;
      if (nextCursor === null) throw new Error("Expected list cursor");
      const listSecondPage = await client.callTool({
        name: "list_users",
        arguments: { limit: 1, cursor: nextCursor },
      });
      expect(parseToolResult(listSecondPage)).toEqual({
        rows: [{ id: "2", name: "Grace Hopper", email: "grace@example.com" }],
        nextCursor: null,
      });

      const result = await client.callTool({
        name: "search_users",
        arguments: { query: "Ada", limit: 10 },
      });
      expect(parseToolResult(result)).toEqual([
        { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
      ]);
    } finally {
      await client.close();
      await pool.end();
    }
  });
});

function parseToolResult(result: { content: unknown }): unknown {
  const content = result.content;
  if (!Array.isArray(content) || !isTextContent(content[0])) {
    throw new Error("Unexpected tool result");
  }
  return JSON.parse(content[0].text) as unknown;
}

function isTextContent(
  value: unknown,
): value is { type: "text"; text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "text" &&
    "text" in value &&
    typeof value.text === "string"
  );
}
