import { z } from "zod";

const schema = z.object({
  MCP_TRANSPORT: z.enum(["http", "stdio"]).default("http"),
  MCP_HOST: z.string().default("127.0.0.1"),
  MCP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MCP_ENDPOINT: z.string().default("/mcp"),
  MCP_AUTH_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  MCP_API_KEY: z.string().min(16).optional(),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://127.0.0.1:3000"),
  REQUEST_BODY_LIMIT: z.coerce.number().default(1048576),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(): Config {
  const parsed = schema.parse(process.env);
  if (parsed.MCP_AUTH_ENABLED && !parsed.MCP_API_KEY) {
    throw new Error("MCP_API_KEY is required when MCP_AUTH_ENABLED=true.");
  }
  return parsed;
}
