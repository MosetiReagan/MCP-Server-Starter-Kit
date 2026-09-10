import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  type LoggingMessageNotification,
  LoggingMessageNotificationSchema,
  ResourceUpdatedNotification,
  ResourceUpdatedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createMcpLogger, createMcpServer } from "@mcp-starter/core";

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

  it("passes progress metadata through tool handlers", async () => {
    const toolkit = createMcpServer({
      name: "progress-server",
      version: "1.0.0",
    });
    toolkit.tool(
      "count",
      { description: "Count with progress", inputSchema: {} },
      async (_args, extra) => {
        const progressToken = extra._meta?.progressToken;
        if (progressToken !== undefined) {
          await extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: 1, total: 1 },
          });
        }
        return { content: [{ type: "text", text: "done" }] };
      },
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "progress-client", version: "1.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      toolkit.mcp.connect(serverTransport),
    ]);
    const progress: number[] = [];
    const result = await client.callTool(
      { name: "count", arguments: {} },
      undefined,
      {
        onprogress: (notification) => {
          progress.push(notification.progress);
        },
      },
    );
    expect(result.content).toEqual([{ type: "text", text: "done" }]);
    expect(progress).toEqual([1]);
    await client.close();
  });

  it("returns structured tool output", async () => {
    const toolkit = createMcpServer({
      name: "structured-server",
      version: "1.0.0",
    });
    toolkit.tool(
      "status",
      {
        description: "Get status",
        inputSchema: {},
        outputSchema: { result: z.string() },
      },
      async () => ({
        content: [{ type: "text", text: "ok" }],
        structuredContent: { result: "ok" },
      }),
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "structured-client", version: "1.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      toolkit.mcp.connect(serverTransport),
    ]);
    const result = await client.callTool({ name: "status", arguments: {} });
    expect(result.structuredContent).toEqual({ result: "ok" });
    await client.close();
  });

  it("supports opt-in resource subscriptions", async () => {
    const uri = "docs://getting-started";
    const toolkit = createMcpServer({
      name: "subscription-server",
      version: "1.0.0",
    });
    toolkit.resource(
      "docs",
      uri,
      { description: "Docs", subscribable: true },
      async () => ({ contents: [{ uri, text: "hello" }] }),
    );
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "subscriber", version: "1.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      toolkit.mcp.connect(serverTransport),
    ]);
    const notifications: ResourceUpdatedNotification[] = [];
    client.setNotificationHandler(
      ResourceUpdatedNotificationSchema,
      (notification) => {
        notifications.push(notification);
      },
    );
    toolkit.notifyResourceChanged(uri);
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifications).toHaveLength(0);
    await client.subscribeResource({ uri });
    toolkit.notifyResourceChanged(uri);
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifications).toHaveLength(1);
    await client.unsubscribeResource({ uri });
    toolkit.notifyResourceChanged(uri);
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifications).toHaveLength(1);
    await client.close();
  });

  it("bridges Pino logs to MCP notifications", async () => {
    const toolkit = createMcpServer({
      name: "logging-server",
      version: "1.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "logging-client", version: "1.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      toolkit.mcp.connect(serverTransport),
    ]);
    const notifications: LoggingMessageNotification[] = [];
    client.setNotificationHandler(
      LoggingMessageNotificationSchema,
      (notification) => {
        notifications.push(notification);
      },
    );
    const logger = createMcpLogger(toolkit, "info", "logging-test");
    logger.info("hello from Pino");
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.method).toBe("notifications/message");
    expect(notifications[0]?.params.level).toBe("info");
    expect((notifications[0]?.params.data as { msg?: unknown }).msg).toBe(
      "hello from Pino",
    );
    await client.close();
  });
});
