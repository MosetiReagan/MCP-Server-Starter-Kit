import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import { loadConfig } from "@mcp-starter/core";

function check(label: string, ok: boolean, detail = ""): boolean {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `: ${detail}` : ""}`);
  return ok;
}

function portAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen({ host, port });
  });
}

export async function doctor(): Promise<number> {
  console.log("MCP Server Doctor\n");
  let ok = check("Node.js", process.versions.node >= "20.0.0", process.version);
  try {
    const config = loadConfig();
    ok = check("Configuration valid", true) && ok;
    ok = check("MCP transport configured", true, config.MCP_TRANSPORT) && ok;
    if (config.MCP_TRANSPORT === "http") {
      const available = await portAvailable(config.MCP_HOST, config.MCP_PORT);
      ok = check(`Port ${String(config.MCP_PORT)} available`, available) && ok;
    }
    if (config.POSTGRES_ENABLED) {
      try {
        const pg = await import("pg");
        const pool = new pg.Pool({
          connectionString: config.POSTGRES_URL,
          max: 1,
        });
        await pool.query("SELECT 1");
        await pool.end();
        ok = check("PostgreSQL reachable", true) && ok;
      } catch (error) {
        ok =
          check(
            "PostgreSQL reachable",
            false,
            error instanceof Error ? error.message : "failed",
          ) && ok;
      }
    }
    if (config.MYSQL_ENABLED) {
      try {
        const mysql = await import("mysql2/promise");
        const pool = mysql.createPool({
          uri: config.MYSQL_URL,
          connectionLimit: 1,
        });
        await pool.query("SELECT 1");
        await pool.end();
        ok = check("MySQL reachable", true) && ok;
      } catch (error) {
        ok =
          check(
            "MySQL reachable",
            false,
            error instanceof Error ? error.message : "failed",
          ) && ok;
      }
    }
    if (config.REDIS_ENABLED) {
      try {
        const { Redis } = await import("ioredis");
        const url = config.REDIS_URL;
        if (!url) throw new Error("REDIS_URL is missing");
        const redis = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        });
        await redis.connect();
        await redis.ping();
        await redis.quit();
        ok = check("Redis reachable", true) && ok;
      } catch (error) {
        ok =
          check(
            "Redis reachable",
            false,
            error instanceof Error ? error.message : "failed",
          ) && ok;
      }
    }
  } catch (error) {
    ok =
      check(
        "Configuration valid",
        false,
        error instanceof Error ? error.message : "failed",
      ) && ok;
  }
  const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
  if (docker.status === 0)
    check("Docker available", true, docker.stdout.trim());
  console.log(
    ok
      ? "\nEverything looks good."
      : "\nProblems detected. Fix the failures above.",
  );
  return ok ? 0 : 1;
}
