import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ReadResourceResult,
  GetPromptResult,
  CallToolResult,
  ServerNotification,
  ServerRequest,
  ToolAnnotations,
  LoggingLevel,
} from "@modelcontextprotocol/sdk/types.js";
import {
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { z, type ZodRawShape } from "zod";

export interface McpServerOptions {
  name: string;
  version: string;
}

export interface ToolDefinition<Args extends ZodRawShape> {
  description?: string;
  inputSchema?: Args;
  annotations?: ToolAnnotations;
}

export interface ResourceOptions {
  description?: string;
  mimeType?: string;
  subscribable?: boolean;
}

type ToolHandler<Args extends ZodRawShape> = (
  args: zInfer<Args>,
  extra: ToolHandlerExtra,
) => Promise<CallToolResult> | CallToolResult;

type ToolHandlerExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

type zInfer<Args extends ZodRawShape> = z.output<z.ZodObject<Args>>;

export class Toolkit {
  readonly mcp: McpServer;
  readonly toolNames = new Set<string>();
  readonly resourceNames = new Set<string>();
  readonly promptNames = new Set<string>();
  readonly loggers: Record<LoggingLevel, (data: unknown) => void>;
  private readonly subscribableResources = new Set<string>();
  private readonly subscriptions = new Map<string, Set<string>>();

  constructor(options: McpServerOptions) {
    this.mcp = new McpServer(
      { name: options.name, version: options.version },
      { capabilities: { logging: {}, resources: { subscribe: true } } },
    );
    this.loggers = {
      debug: (data) => {
        this.log("debug", data);
      },
      info: (data) => {
        this.log("info", data);
      },
      notice: (data) => {
        this.log("notice", data);
      },
      warning: (data) => {
        this.log("warning", data);
      },
      error: (data) => {
        this.log("error", data);
      },
      critical: (data) => {
        this.log("critical", data);
      },
      alert: (data) => {
        this.log("alert", data);
      },
      emergency: (data) => {
        this.log("emergency", data);
      },
    };
    this.registerSubscriptionHandlers();
  }

  tool<Args extends ZodRawShape>(
    name: string,
    definition: ToolDefinition<Args>,
    handler: ToolHandler<Args>,
  ): void {
    if (this.toolNames.has(name))
      throw new Error(`Tool already registered: ${name}`);
    this.toolNames.add(name);
    this.mcp.registerTool(
      name,
      {
        description: definition.description,
        inputSchema: definition.inputSchema,
        annotations: definition.annotations,
      },
      handler as never,
    );
  }

  resource(
    name: string,
    uri: string,
    metadata: ResourceOptions,
    read: () => Promise<ReadResourceResult> | ReadResourceResult,
  ): void {
    this.resourceNames.add(name);
    if (metadata.subscribable) this.subscribableResources.add(uri);
    this.mcp.registerResource(name, uri, metadata, read);
  }

  resourceTemplate(
    name: string,
    template: string,
    metadata: { description?: string; mimeType?: string },
    read: (
      variables: Record<string, string | string[]>,
    ) => Promise<ReadResourceResult> | ReadResourceResult,
  ): void {
    this.resourceNames.add(name);
    this.mcp.registerResource(
      name,
      new ResourceTemplate(template, { list: undefined }),
      metadata,
      (_uri, variables) => read(variables),
    );
  }

  prompt<Args extends ZodRawShape>(
    name: string,
    description: string,
    argsSchema: Args,
    handler: (args: zInfer<Args>) => Promise<GetPromptResult> | GetPromptResult,
  ): void {
    this.promptNames.add(name);
    this.mcp.registerPrompt(
      name,
      { description, argsSchema },
      handler as never,
    );
  }

  notifyResourceChanged(uri: string): void {
    if (!this.subscribableResources.has(uri)) return;
    if (this.subscriptions.get(uri)?.size === 0) return;
    void this.mcp.server.sendResourceUpdated({ uri }).catch(() => undefined);
  }

  private registerSubscriptionHandlers(): void {
    this.mcp.server.setRequestHandler(
      SubscribeRequestSchema,
      ({ params }, extra) => {
        if (!this.subscribableResources.has(params.uri)) {
          throw new Error(`Resource is not subscribable: ${params.uri}`);
        }
        const sessionId = extra.sessionId ?? "default";
        const sessions = this.subscriptions.get(params.uri) ?? new Set<string>();
        sessions.add(sessionId);
        this.subscriptions.set(params.uri, sessions);
        return {};
      },
    );
    this.mcp.server.setRequestHandler(
      UnsubscribeRequestSchema,
      ({ params }, extra) => {
        const sessionId = extra.sessionId ?? "default";
        this.subscriptions.get(params.uri)?.delete(sessionId);
        return {};
      },
    );
  }

  log(level: LoggingLevel, data: unknown): void {
    void this.mcp
      .sendLoggingMessage({ level, data: data ?? null })
      .catch(() => undefined);
  }
}

export function createMcpServer(options: McpServerOptions): Toolkit {
  return new Toolkit(options);
}
