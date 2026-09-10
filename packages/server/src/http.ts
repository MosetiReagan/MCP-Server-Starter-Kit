import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Toolkit } from "@mcp-starter/core";
import type { ServerConfig } from "@mcp-starter/core";
import type { ReadinessRegistry } from "./readiness.js";

export interface HttpServerOptions {
  config: ServerConfig;
  toolkit: Toolkit;
  readiness: ReadinessRegistry;
  logger: {
    info: (value: object | string) => void;
    error: (value: object | string) => void;
  };
}

const JSONRPC_ERROR_CODES = {
  400: -32600,
  401: -32001,
  404: -32600,
  405: -32600,
  408: -32003,
  413: -32600,
  429: -32003,
  500: -32603,
  503: -32603,
} as const;

function sendJsonRpcError(
  reply: FastifyReply,
  httpStatus: number,
  code: number,
  message: string,
) {
  return reply
    .code(httpStatus)
    .header("content-type", "application/json")
    .send({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    });
}

export function createHttpServer(options: HttpServerOptions) {
  const { config, toolkit, readiness, logger } = options;
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const origins = config.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const app = Fastify({
    logger: false,
    bodyLimit: config.REQUEST_BODY_LIMIT,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    requestTimeout: config.REQUEST_TIMEOUT_MS,
  });

  void app.register(cors, {
    origin: origins.length === 1 ? origins[0] : origins,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    credentials: false,
    maxAge: 600,
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-request-id", request.id);
    if (
      config.MCP_AUTH_ENABLED &&
      request.url.startsWith(config.MCP_ENDPOINT)
    ) {
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice(7)
        : undefined;
      const apiKey = config.MCP_API_KEY ?? "";
      const tokenLength = token?.length ?? -1;
      if (
        tokenLength < 16 ||
        tokenLength !== apiKey.length ||
        !timingSafeEqual(Buffer.from(token ?? ""), Buffer.from(apiKey))
      ) {
        reply.hijack();
        reply.raw.writeHead(401, {
          "www-authenticate": "Bearer",
          "content-type": "application/json",
        });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Unauthorized" },
            id: null,
          }),
        );
        return;
      }
    }
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => {
    const result = await readiness.check();
    if (result.status === "unavailable")
      return await reply.code(503).send(result);
    return result;
  });

  const handleMcp = async (
    request: Parameters<Parameters<typeof app.route>[0]["handler"]>[0],
    reply: Parameters<Parameters<typeof app.route>[0]["handler"]>[1],
  ) => {
    reply.hijack();
    const sessionId = Array.isArray(request.headers["mcp-session-id"])
      ? request.headers["mcp-session-id"][0]
      : request.headers["mcp-session-id"];
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
      transport.onclose = () => {
        const id = created.sessionId;
        if (id) transports.delete(id);
      };
      await toolkit.mcp.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
      return;
    }
    if (!transport) {
      reply.raw.writeHead(400, { "content-type": "application/json" });
      reply.raw.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Missing or invalid session ID" },
          id: null,
        }),
      );
      return;
    }
    await transport.handleRequest(request.raw, reply.raw, request.body);
  };

  app.route({
    method: ["GET", "POST", "DELETE"],
    url: config.MCP_ENDPOINT,
    handler: handleMcp,
  });

  app.setErrorHandler(async (error: unknown, request, reply) => {
    const message =
      error instanceof Error ? error.message : "internal_server_error";
    const statusCode = (error as { statusCode?: number }).statusCode;
    const responseStatus = statusCode ?? 500;
    logger.error({
      requestId: request.id,
      error: message,
      statusCode: responseStatus,
      url: request.url,
    });
    if (request.url.startsWith(config.MCP_ENDPOINT)) {
      const rpcCode =
        (JSONRPC_ERROR_CODES as Record<number, number | undefined>)[
          responseStatus
        ] ?? -32603;
      const safeMessage = responseStatus < 500 ? message : "internal_error";
      return await sendJsonRpcError(
        reply,
        responseStatus < 500 ? responseStatus : 400,
        rpcCode,
        safeMessage,
      );
    }
    return await reply.code(responseStatus).send({
      error: responseStatus < 500 ? message : "internal_server_error",
    });
  });

  return Object.assign(app, {
    start: async () => {
      await app.listen({ host: config.MCP_HOST, port: config.MCP_PORT });
      logger.info({
        transport: "Streamable HTTP",
        address: `http://${config.MCP_HOST}:${String(config.MCP_PORT)}`,
        endpoint: config.MCP_ENDPOINT,
        tools: toolkit.toolNames.size,
        resources: toolkit.resourceNames.size,
        prompts: toolkit.promptNames.size,
      });
    },
    stop: async () => {
      await Promise.all(
        [...transports.values()].map((transport) => transport.close()),
      );
      transports.clear();
      await app.close();
    },
  });
}
