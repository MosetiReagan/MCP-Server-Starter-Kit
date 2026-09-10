import "dotenv/config";
import { z } from "zod";
import { createMcpServer, createLogger, loadConfig } from "@mcp-starter/core";
import { createHttpServer, ReadinessRegistry } from "@mcp-starter/server";
import { createHttpIntegration } from "@mcp-starter/integrations/http";

const config = loadConfig();
const toolkit = createMcpServer({
  name: config.MCP_SERVER_NAME,
  version: config.MCP_SERVER_VERSION,
});
const api = createHttpIntegration({
  baseUrl: process.env.API_URL ?? "https://jsonplaceholder.typicode.com",
  retries: 1,
  timeoutMs: 8000,
});
api.mapToTools(toolkit, [
  {
    name: "list_posts",
    description: "List posts from the configured REST API",
    method: "GET",
    path: "/posts",
    inputSchema: { path: z.string().optional() },
    responseSchema: z.array(z.object({ id: z.number(), title: z.string() })),
  },
]);
await createHttpServer({
  config,
  toolkit,
  readiness: new ReadinessRegistry(),
  logger: createLogger(config.LOG_LEVEL),
}).start();
