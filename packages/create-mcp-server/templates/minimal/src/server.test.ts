import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createToolkit } from "./server.js";

describe("MCP server", () => {
  it("exposes the example tool and resource", async () => {
    const server = createToolkit();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.1.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "hello",
      "calculate",
    ]);
    expect(
      (await client.listResources()).resources.map((resource) => resource.name),
    ).toEqual(["getting-started"]);
    await client.close();
  });
});
