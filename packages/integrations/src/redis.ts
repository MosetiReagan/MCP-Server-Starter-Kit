import { z } from "zod";
import type { Toolkit } from "@mcp-starter/core";

export interface RedisOptions {
  client: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
    del(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
  };
  prefix: string;
}

export function registerRedisTools(
  toolkit: Toolkit,
  config: RedisOptions,
): void {
  const key = (value: string): string => {
    if (value.includes("*") || value.includes(".."))
      throw new Error("Unsafe Redis key");
    return `${config.prefix}:${value}`;
  };
  toolkit.tool(
    "cache_get",
    {
      description: "Get a namespaced cache value",
      inputSchema: { key: z.string().min(1).max(200) },
    },
    async ({ key: name }) => {
      const value = await config.client.get(key(name));
      return {
        content: [{ type: "text", text: JSON.stringify({ key: name, value }) }],
      };
    },
  );
  toolkit.tool(
    "cache_set",
    {
      description: "Set a namespaced cache value",
      inputSchema: {
        key: z.string().min(1).max(200),
        value: z.string().max(1_000_000),
        ttlSeconds: z.number().int().min(1).max(86_400),
      },
    },
    async ({ key: name, value, ttlSeconds }) => {
      await config.client.set(key(name), value, "EX", ttlSeconds);
      return {
        content: [
          { type: "text", text: JSON.stringify({ key: name, stored: true }) },
        ],
      };
    },
  );
  toolkit.tool(
    "cache_delete",
    {
      description: "Delete a namespaced cache value",
      inputSchema: { key: z.string().min(1).max(200) },
    },
    async ({ key: name }) => {
      const deleted = await config.client.del(key(name));
      return {
        content: [
          { type: "text", text: JSON.stringify({ key: name, deleted }) },
        ],
      };
    },
  );
  toolkit.tool(
    "cache_list_keys",
    {
      description: "List keys in the configured namespace",
      inputSchema: { limit: z.number().int().min(1).max(100).default(20) },
    },
    async ({ limit }) => {
      const keys = (await config.client.keys(`${config.prefix}:*`)).map(
        (stored) => stored.slice(`${config.prefix}:`.length),
      );
      return {
        content: [{ type: "text", text: JSON.stringify(keys.slice(0, limit)) }],
      };
    },
  );
}
