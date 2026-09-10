import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ReadResourceResult,
  GetPromptResult,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";

export interface McpServerOptions {
  name: string;
  version: string;
}

export interface ToolDefinition<Args extends ZodRawShape> {
  description?: string;
  inputSchema?: Args;
}

type ToolHandler<Args extends ZodRawShape> = (
  args: zInfer<Args>,
) => Promise<CallToolResult> | CallToolResult;

type zInfer<Args extends ZodRawShape> = z.output<z.ZodObject<Args>>;

export class Toolkit {
  readonly mcp: McpServer;
  readonly toolNames = new Set<string>();
  readonly resourceNames = new Set<string>();
  readonly promptNames = new Set<string>();

  constructor(options: McpServerOptions) {
    this.mcp = new McpServer({ name: options.name, version: options.version });
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
      },
      handler as never,
    );
  }

  resource(
    name: string,
    uri: string,
    metadata: { description?: string; mimeType?: string },
    read: () => Promise<ReadResourceResult> | ReadResourceResult,
  ): void {
    this.resourceNames.add(name);
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
}

export function createMcpServer(options: McpServerOptions): Toolkit {
  return new Toolkit(options);
}
