import "dotenv/config";
import { loadConfig, createMcpServer, createLogger } from "@mcp-starter/core";
import { ReadinessRegistry } from "./readiness.js";
import { createHttpServer } from "./http.js";
import { startStdio } from "./stdio.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.MCP_SERVER_NAME);
const toolkit = createMcpServer({
  name: config.MCP_SERVER_NAME,
  version: config.MCP_SERVER_VERSION,
});
const readiness = new ReadinessRegistry();

toolkit.tool(
  "health",
  { description: "Check whether this MCP server is healthy" },
  async () => ({
    content: [{ type: "text", text: JSON.stringify({ status: "ok" }) }],
  }),
);

if (config.MCP_TRANSPORT === "stdio") {
  await startStdio(toolkit);
} else {
  const server = createHttpServer({ config, toolkit, readiness, logger });
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await server.start();
}
