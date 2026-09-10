import "dotenv/config";
import pg from "pg";
import { createMcpServer, createLogger, loadConfig } from "@mcp-starter/core";
import { createHttpServer, ReadinessRegistry } from "@mcp-starter/server";
import { registerPostgresTools } from "@mcp-starter/integrations/postgres";

const config = loadConfig({ ...process.env, POSTGRES_ENABLED: "true" });
const pool = new pg.Pool({ connectionString: config.POSTGRES_URL, max: 5 });
const toolkit = createMcpServer({
  name: config.MCP_SERVER_NAME,
  version: config.MCP_SERVER_VERSION,
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
const readiness = new ReadinessRegistry();
readiness.add("postgres", async () => {
  await pool.query("SELECT 1");
});
const server = createHttpServer({
  config,
  toolkit,
  readiness,
  logger: createLogger(config.LOG_LEVEL),
});
process.once("SIGTERM", () => void pool.end());
await server.start();
