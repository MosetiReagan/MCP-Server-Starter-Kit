import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export function parseInspectArguments(args: readonly string[]): {
  url?: string;
  apiKey?: string;
} {
  let url: string | undefined;
  let apiKey: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--api-key") {
      const value = args.at(index + 1);
      if (!value) throw new Error("--api-key requires a value");
      apiKey = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--api-key=")) {
      apiKey = arg.slice("--api-key=".length);
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown inspect option: ${arg}`);
    if (url) throw new Error("Only one inspect URL may be provided");
    url = arg;
  }
  return { url, apiKey };
}

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
