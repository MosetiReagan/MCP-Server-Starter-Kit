import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Toolkit } from "@mcp-starter/core";

export async function startStdio(toolkit: Toolkit): Promise<void> {
  const transport = new StdioServerTransport();
  await toolkit.mcp.connect(transport);
}
