import { z } from "zod";
import { ConfigurationError } from "./errors.js";

const boolean = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(["true", "false"]))
  .transform((value) => value === "true");

const port = z.coerce.number().int().min(1).max(65535);

const schema = z.object({
  MCP_TRANSPORT: z.enum(["http", "stdio"]).default("http"),
  MCP_HOST: z.string().min(1).default("127.0.0.1"),
  MCP_PORT: port.default(3000),
  MCP_ENDPOINT: z
    .string()
    .regex(/^\/[\w/-]*$/)
    .default("/mcp"),
  MCP_AUTH_ENABLED: boolean.default(false),
  MCP_API_KEY: z.string().min(16).optional(),
  MCP_SERVER_NAME: z.string().min(1).default("my-mcp-server"),
  MCP_SERVER_VERSION: z
    .string()
    .regex(/^\d+\.\d+\.\d+/)
    .default("0.1.0"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://127.0.0.1:3000"),
  REQUEST_BODY_LIMIT: z.coerce.number().int().min(1024).default(1048576),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  MAX_SESSIONS: z.coerce.number().int().min(1).default(100),
  MAX_SESSIONS_PER_IP: z.coerce.number().int().min(1).default(10),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  POSTGRES_ENABLED: boolean.default(false),
  POSTGRES_URL: z.url().optional(),
  MYSQL_ENABLED: boolean.default(false),
  MYSQL_URL: z.url().optional(),
  REDIS_ENABLED: boolean.default(false),
  REDIS_URL: z.url().optional(),
  REDIS_KEY_PREFIX: z
    .string()
    .regex(/^[\w:-]+$/)
    .optional(),
});

export type ServerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigurationError(
      `Configuration error:\n\n${details}\n\nSee .env.example for required values.`,
    );
  }
  const config = result.data;
  if (config.MCP_AUTH_ENABLED && !config.MCP_API_KEY) {
    throw new ConfigurationError(
      "Configuration error:\n\nMCP_API_KEY is required when MCP_AUTH_ENABLED=true.",
    );
  }
  if (config.POSTGRES_ENABLED && !config.POSTGRES_URL) {
    throw new ConfigurationError(
      "Configuration error:\n\nPOSTGRES_URL is required when POSTGRES_ENABLED=true.",
    );
  }
  if (config.MYSQL_ENABLED && !config.MYSQL_URL) {
    throw new ConfigurationError(
      "Configuration error:\n\nMYSQL_URL is required when MYSQL_ENABLED=true.",
    );
  }
  if (config.REDIS_ENABLED && !config.REDIS_URL) {
    throw new ConfigurationError(
      "Configuration error:\n\nREDIS_URL is required when REDIS_ENABLED=true.",
    );
  }
  return config;
}
