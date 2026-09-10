import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createToolkit, startHttp } from "./server.js";

const config = loadConfig();
const toolkit = createToolkit();
if (config.MCP_TRANSPORT === "stdio") {
  await toolkit.connect(new StdioServerTransport());
} else {
  await startHttp(config, toolkit);
}
