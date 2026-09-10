import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@mcp-starter/core";
import { registerPostgresTools } from "@mcp-starter/integrations/postgres";
import pg from "pg";
import { describe, expect, it } from "vitest";

const postgresUrl = process.env.POSTGRES_TEST_URL;

describe.skipIf(!postgresUrl)("PostgreSQL integration", () => {
  it("searches seeded users through the real PostgreSQL driver", async () => {
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
      const result = await client.callTool({
        name: "search_users",
        arguments: { query: "Ada", limit: 10 },
      });
      expect(result.content).toEqual([
        {
          type: "text",
          text: JSON.stringify([
            { id: "1", name: "Ada Lovelace", email: "ada@example.com" },
          ]),
        },
      ]);
    } finally {
      await client.close();
      await pool.end();
    }
  });
});
