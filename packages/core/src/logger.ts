import pino from "pino";

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
