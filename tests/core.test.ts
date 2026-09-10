import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { createMcpServer } from "@mcp-starter/core";

describe("MCP core", () => {
  it("registers and executes a validated tool", async () => {
    const toolkit = createMcpServer({ name: "test-server", version: "1.0.0" });
    toolkit.tool(
      "calculate",
      {
        description: "Calculate safely",
        inputSchema: { a: z.number(), b: z.number() },
      },
      async ({ a, b }) => ({
        content: [{ type: "text", text: String(a + b) }],
      }),
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      toolkit.mcp.connect(serverTransport),
    ]);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("calculate");
    const result = await client.callTool({
      name: "calculate",
      arguments: { a: 2, b: 4 },
    });
    expect(result.content).toEqual([{ type: "text", text: "6" }]);
    await client.close();
  });

  it("registers resources and prompts", async () => {
    const toolkit = createMcpServer({
      name: "resource-server",
      version: "1.0.0",
    });
    toolkit.resource(
      "docs",
      "docs://getting-started",
      { description: "Docs" },
      async () => ({
        contents: [{ uri: "docs://getting-started", text: "hello" }],
      }),
    );
    toolkit.prompt(
      "summarize",
      "Summarize a topic",
      { topic: z.string() },
      async ({ topic }) => ({
        messages: [
          {
            role: "user",
            content: { type: "text", text: `Summarize ${topic}` },
          },
        ],
      }),
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "resource-client", version: "1.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      toolkit.mcp.connect(serverTransport),
    ]);
    expect((await client.listResources()).resources).toHaveLength(1);
    expect((await client.listPrompts()).prompts).toHaveLength(1);
    await client.close();
  });
});
