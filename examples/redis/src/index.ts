import "dotenv/config";
import { Redis } from "ioredis";
import { createMcpServer, createLogger, loadConfig } from "@mcp-starter/core";
import { createHttpServer, ReadinessRegistry } from "@mcp-starter/server";
import { registerRedisTools } from "@mcp-starter/integrations/redis";

const config = loadConfig({ ...process.env, REDIS_ENABLED: "true" });
const redisUrl = config.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required.");
const redis = new Redis(redisUrl);
const toolkit = createMcpServer({
  name: config.MCP_SERVER_NAME,
  version: config.MCP_SERVER_VERSION,
});
registerRedisTools(toolkit, {
  client: redis,
  prefix: config.REDIS_KEY_PREFIX ?? "mcp-cache",
});
const readiness = new ReadinessRegistry();
readiness.add("redis", async () => {
  await redis.ping();
});
await createHttpServer({
  config,
  toolkit,
  readiness,
  logger: createLogger(config.LOG_LEVEL),
}).start();
