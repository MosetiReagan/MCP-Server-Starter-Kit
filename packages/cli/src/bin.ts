#!/usr/bin/env node
import "dotenv/config";
import { loadConfig } from "@mcp-starter/core";
import { run } from "./run.js";
import { doctor } from "./doctor.js";
import { inspect, parseInspectArguments } from "./inspect.js";

const command = process.argv[2] as string | undefined;
const args = process.argv.slice(3);

async function main(): Promise<number> {
  switch (command) {
    case undefined:
    case "help":
      console.log(
        "Usage: mcp-server <create|dev|build|start|doctor|validate|inspect> [options]",
      );
      return 0;
    case "dev":
      return run("npm", ["run", "dev"]);
    case "build":
      return run("npm", ["run", "build"]);
    case "start":
      return run("npm", ["run", "start"]);
    case "doctor":
      return doctor();
    case "validate":
      try {
        loadConfig();
        console.log("Configuration valid.");
        return 0;
      } catch (error) {
        console.error(
          error instanceof Error
            ? error.message
            : "Configuration validation failed.",
        );
        return 1;
      }
    case "inspect": {
      const config = loadConfig();
      const parsedArguments = parseInspectArguments(args);
      const url =
        parsedArguments.url ??
        `http://127.0.0.1:${String(config.MCP_PORT)}${config.MCP_ENDPOINT}`;
      return inspect(url, parsedArguments.apiKey ?? config.MCP_API_KEY);
    }
    default:
      console.error(`Unknown command: ${command}`);
      return 1;
  }
}

process.exit(await main());
