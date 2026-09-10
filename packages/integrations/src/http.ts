import { request } from "undici";
import type { ZodRawShape, ZodType } from "zod";
import { z } from "zod";
import type { Toolkit } from "@mcp-starter/core";
import { ExternalApiError } from "@mcp-starter/core";

export interface HttpIntegrationOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpOperation<Schema extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  method: HttpMethod;
  path: string;
  allowPathOverride?: boolean;
  allowedPathPrefixes?: readonly string[];
  inputSchema?: Schema;
  responseSchema?: ZodType;
}

function safePath(path: string): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("..")
  ) {
    throw new Error("Unsafe upstream path");
  }
  return path;
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  safePath(prefix);
  return (
    path === prefix ||
    path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  );
}

export function createHttpIntegration(options: HttpIntegrationOptions) {
  const baseUrl = new URL(options.baseUrl);
  return {
    async request<ResponseType>(
      method: HttpMethod,
      path: string,
      body?: unknown,
    ): Promise<ResponseType> {
      const url = new URL(path.replace(/^\//, ""), baseUrl);
      let lastError: unknown;
      for (let attempt = 0; attempt <= (options.retries ?? 0); attempt += 1) {
        try {
          const response = await request(url, {
            method,
            headers: {
              ...options.headers,
              ...(body === undefined
                ? {}
                : { "content-type": "application/json" }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            bodyTimeout: options.timeoutMs ?? 10_000,
            headersTimeout: options.timeoutMs ?? 10_000,
          });
          if (response.statusCode >= 500)
            throw new ExternalApiError(
              `Upstream returned ${String(response.statusCode)}`,
            );
          const text = await response.body.text();
          const parsed: unknown = text ? (JSON.parse(text) as unknown) : null;
          if (response.statusCode >= 400)
            throw new ExternalApiError(
              `Upstream returned ${String(response.statusCode)}`,
            );
          return parsed as ResponseType;
        } catch (error) {
          lastError = error;
          if (
            error instanceof ExternalApiError &&
            attempt === (options.retries ?? 0)
          )
            throw error;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new ExternalApiError("External API request failed");
    },
    mapToTools(toolkit: Toolkit, operations: readonly HttpOperation[]) {
      for (const operation of operations) {
        if (operation.allowedPathPrefixes && !operation.allowPathOverride) {
          throw new Error(
            `allowedPathPrefixes requires allowPathOverride for ${operation.name}`,
          );
        }
        toolkit.tool(
          operation.name,
          {
            description: operation.description,
            annotations: {
              readOnlyHint: operation.method === "GET",
              destructiveHint: operation.method !== "GET",
              idempotentHint:
                operation.method === "GET" ||
                operation.method === "PUT" ||
                operation.method === "DELETE",
            },
            inputSchema: operation.inputSchema ?? {
              ...(operation.allowPathOverride
                ? { path: z.string().optional() }
                : {}),
              query: z.record(z.string(), z.string()).optional(),
              body: z.unknown().optional(),
            },
          },
          async (input) => {
            const path = operation.allowPathOverride
              ? ((input.path as string | undefined) ?? operation.path)
              : operation.path;
            if (
              operation.allowPathOverride &&
              operation.allowedPathPrefixes &&
              !operation.allowedPathPrefixes.some((prefix) =>
                pathMatchesPrefix(path, prefix),
              )
            ) {
              throw new Error("Path not allowed");
            }
            const query = new URLSearchParams(
              input.query as Record<string, string> | undefined,
            );
            const suffix = query.size ? `?${query.toString()}` : "";
            const result = await this.request(
              operation.method,
              `${safePath(path)}${suffix}`,
              input.body,
            );
            const validated = operation.responseSchema?.parse(result) ?? result;
            return {
              content: [{ type: "text", text: JSON.stringify(validated) }],
            };
          },
        );
      }
    },
  };
}
