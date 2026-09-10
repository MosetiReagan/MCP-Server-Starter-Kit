import pino from "pino";
import { multistream } from "pino";
import type { LoggingLevel } from "@modelcontextprotocol/sdk/types.js";
import type { Toolkit } from "./server.js";

const sensitiveKeys = /authorization|api[-_]?key|password|token|secret/i;

export function createLogger(level: string, name = "mcp-server") {
  return pino({
    level,
    name,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.token",
        "*.password",
        "*.secret",
      ],
      censor: "[redacted]",
    },
  });
}

function pinoLevelToMcp(level: number): LoggingLevel {
  if (level <= 20) return "debug";
  if (level <= 30) return "info";
  if (level <= 40) return "warning";
  if (level <= 50) return "error";
  return "critical";
}

function isLogEntry(value: unknown): value is { level: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "level" in value &&
    typeof value.level === "number"
  );
}

export function createMcpLogger(
  toolkit: Toolkit,
  level: string,
  name = "mcp-server",
) {
  const mcpStream = {
    write(line: string) {
      const entry = JSON.parse(line) as unknown;
      if (isLogEntry(entry)) toolkit.log(pinoLevelToMcp(entry.level), entry);
    },
  };
  return pino(
    {
      level,
      name,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "*.token",
          "*.password",
          "*.secret",
        ],
        censor: "[redacted]",
      },
    },
    multistream([{ stream: process.stdout }, { stream: mcpStream }]),
  );
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKeys.test(key) ? "[redacted]" : redact(item, depth + 1),
    ]),
  );
}
