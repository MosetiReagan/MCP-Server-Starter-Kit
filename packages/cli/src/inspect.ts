import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function inspect(url: string, apiKey?: string): Promise<number> {
  const client = new Client({ name: "mcp-server-inspector", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: apiKey
      ? { headers: { authorization: `Bearer ${apiKey}` } }
      : {},
  });
  try {
    await client.connect(transport);
    const [tools, resources, prompts] = await Promise.all([
      client.listTools(),
      client.listResources(),
      client.listPrompts(),
    ]);
    console.log("MCP Server");
    console.log("────────────────────");
    console.log(`Endpoint: ${url}\n`);
    console.log("Tools:");
    for (const tool of tools.tools) console.log(`  ${tool.name}`);
    console.log("\nResources:");
    for (const resource of resources.resources)
      console.log(`  ${resource.uri}`);
    console.log("\nPrompts:");
    for (const prompt of prompts.prompts) console.log(`  ${prompt.name}`);
    await client.close();
    return 0;
  } catch (error) {
    console.error(
      `Unable to inspect MCP server: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    await client.close().catch(() => undefined);
    return 1;
  }
}
