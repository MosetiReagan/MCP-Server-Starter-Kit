import "dotenv/config";
import pg from "pg";
import { Redis } from "ioredis";
import { z } from "zod";
import { createMcpServer, createLogger, loadConfig } from "@mcp-starter/core";
import { createHttpServer, ReadinessRegistry } from "@mcp-starter/server";
import { createHttpIntegration } from "@mcp-starter/integrations/http";
import { registerPostgresTools } from "@mcp-starter/integrations/postgres";
import { registerRedisTools } from "@mcp-starter/integrations/redis";

const config = loadConfig({
  ...process.env,
  POSTGRES_ENABLED: "true",
  REDIS_ENABLED: "true",
});
const pool = new pg.Pool({ connectionString: config.POSTGRES_URL, max: 5 });
const redisUrl = config.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required.");
const redis = new Redis(redisUrl);
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
registerRedisTools(toolkit, {
  client: redis,
  prefix: config.REDIS_KEY_PREFIX ?? "mcp-cache",
});
const api = createHttpIntegration({
  baseUrl: process.env.API_URL ?? "https://jsonplaceholder.typicode.com",
  headers: process.env.API_TOKEN
    ? { authorization: `Bearer ${process.env.API_TOKEN}` }
    : {},
  retries: 1,
});
api.mapToTools(toolkit, [
  {
    name: "list_posts",
    description: "List posts from the configured API",
    method: "GET",
    path: "/posts",
    responseSchema: z.array(z.object({ id: z.number(), title: z.string() })),
  },
]);
const readiness = new ReadinessRegistry();
readiness.add("postgres", async () => {
  await pool.query("SELECT 1");
});
readiness.add("redis", async () => {
  await redis.ping();
});
const server = createHttpServer({
  config,
  toolkit,
  readiness,
  logger: createLogger(config.LOG_LEVEL),
});
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await server.stop();
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
await server.start();
