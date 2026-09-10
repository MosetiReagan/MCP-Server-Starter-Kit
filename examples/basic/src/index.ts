import "dotenv/config";
import { z } from "zod";
import { createMcpServer, createLogger, loadConfig } from "@mcp-starter/core";
import {
  createHttpServer,
  ReadinessRegistry,
  startStdio,
} from "@mcp-starter/server";

const config = loadConfig();
const toolkit = createMcpServer({
  name: config.MCP_SERVER_NAME,
  version: config.MCP_SERVER_VERSION,
});
toolkit.tool(
  "hello",
  {
    description: "Say hello",
    inputSchema: { name: z.string().min(1).max(100) },
  },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}!` }],
  }),
);
toolkit.tool(
  "calculate",
  {
    description: "Calculate two numbers",
    inputSchema: { a: z.number(), b: z.number() },
  },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }],
  }),
);
if (config.MCP_TRANSPORT === "stdio") await startStdio(toolkit);
else
  await createHttpServer({
    config,
    toolkit,
    readiness: new ReadinessRegistry(),
    logger: createLogger(config.LOG_LEVEL),
  }).start();
