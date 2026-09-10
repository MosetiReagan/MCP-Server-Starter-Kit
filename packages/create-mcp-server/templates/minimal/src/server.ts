import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Config } from "./config.js";

export function createToolkit(): McpServer {
  const server = new McpServer({ name: "my-mcp-server", version: "0.1.0" });
  server.registerTool(
    "hello",
    {
      description: "Say hello",
      inputSchema: { name: z.string().min(1).max(100) },
    },
    async ({ name }) => ({
      content: [{ type: "text", text: `Hello, ${name}!` }],
    }),
  );
  server.registerTool(
    "calculate",
    {
      description: "Calculate two numbers",
      inputSchema: {
        expression: z.enum(["add", "subtract", "multiply"]),
        a: z.number(),
        b: z.number(),
      },
    },
    async ({ expression, a, b }) => {
      const result =
        expression === "add"
          ? a + b
          : expression === "subtract"
            ? a - b
            : a * b;
      return { content: [{ type: "text", text: String(result) }] };
    },
  );
  server.registerResource(
    "getting-started",
    "docs://getting-started",
    {
      description: "Getting started with this MCP server",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [
        {
          uri: "docs://getting-started",
          text: "# Getting started\n\nAdd tools in src/server.ts.",
        },
      ],
    }),
  );
  server.registerPrompt(
    "summarize",
    {
      description: "Create a concise summary prompt",
      argsSchema: { topic: z.string().min(1) },
    },
    async ({ topic }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Summarize ${topic} clearly and accurately.`,
          },
        },
      ],
    }),
  );
  return server;
}

export async function startHttp(config: Config, toolkit: McpServer) {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const app = Fastify({
    bodyLimit: config.REQUEST_BODY_LIMIT,
    requestTimeout: config.REQUEST_TIMEOUT_MS,
    genReqId: () => randomUUID(),
  });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(",").map((value) => value.trim()),
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    if (
      config.MCP_AUTH_ENABLED &&
      request.url.startsWith(config.MCP_ENDPOINT)
    ) {
      const token = request.headers.authorization?.startsWith("Bearer ")
        ? request.headers.authorization.slice(7)
        : undefined;
      const apiKey = config.MCP_API_KEY ?? "";
      const tokenLength = token?.length ?? -1;
      if (
        tokenLength < 16 ||
        tokenLength !== apiKey.length ||
        !timingSafeEqual(Buffer.from(token ?? ""), Buffer.from(apiKey))
      )
        return await reply
          .code(401)
          .header("www-authenticate", "Bearer")
          .send({ error: "unauthorized" });
    }
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async () => ({ status: "ready", dependencies: {} }));
  app.route({
    method: ["GET", "POST", "DELETE"],
    url: config.MCP_ENDPOINT,
    handler: async (request, reply) => {
      reply.hijack();
      const sessionId =
        typeof request.headers["mcp-session-id"] === "string"
          ? request.headers["mcp-session-id"]
          : undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport && !sessionId && isInitializeRequest(request.body)) {
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (initializedSessionId) => {
            transports.set(initializedSessionId, newTransport);
          },
        });
        transport = newTransport;
        const created = newTransport;
        created.onclose = () => {
          const id = created.sessionId;
          if (id) transports.delete(id);
        };
        await toolkit.connect(transport);
        await transport.handleRequest(request.raw, reply.raw, request.body);
        return;
      }
      if (!transport) {
        reply.raw.writeHead(400, { "content-type": "application/json" });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Missing session ID" },
            id: null,
          }),
        );
        return;
      }
      await transport.handleRequest(request.raw, reply.raw, request.body);
    },
  });
  await app.listen({ host: config.MCP_HOST, port: config.MCP_PORT });
  console.log(
    `MCP server listening on http://${config.MCP_HOST}:${String(config.MCP_PORT)}${config.MCP_ENDPOINT}`,
  );
  const shutdown = async () => {
    await Promise.all(
      [...transports.values()].map((transport) => transport.close()),
    );
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}
