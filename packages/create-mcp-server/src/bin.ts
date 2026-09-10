#!/usr/bin/env node
import { cp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as prompts from "@clack/prompts";

const templateDirectory = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "minimal",
);

function parseArgs(args: string[]): {
  projectName?: string;
  skipInstall?: boolean;
} {
  const result: { projectName?: string; skipInstall?: boolean } = {};
  for (const arg of args) {
    if (arg === "--skip-install") result.skipInstall = true;
    else if (!result.projectName && !arg.startsWith("-"))
      result.projectName = arg;
  }
  return result;
}

function validName(name: string): boolean {
  return (
    /^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(name) &&
    !name.includes("..")
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  prompts.intro("Create MCP Server");
  const projectName =
    args.projectName ??
    (await prompts.text({
      message: "Project name",
      validate: (value) =>
        validName(value) ? undefined : "Use a valid package name.",
    }));
  if (prompts.isCancel(projectName) || !validName(projectName)) {
    prompts.cancel("Project creation cancelled.");
    process.exit(1);
  }
  const destination = path.resolve(process.cwd(), projectName);
  if (existsSync(destination)) {
    prompts.cancel(`Directory already exists: ${projectName}`);
    process.exit(1);
  }
  const docker = args.skipInstall
    ? true
    : await prompts.confirm({ message: "Add Docker?", initialValue: true });
  if (prompts.isCancel(docker)) process.exit(1);
  await mkdir(destination, { recursive: true });
  await cp(templateDirectory, destination, { recursive: true });
  if (!docker)
    await writeFile(path.join(destination, ".dockerignore"), "Dockerfile\n");
  const packageJsonPath = path.join(destination, "package.json");
  const packageJson = JSON.parse(
    await (await import("node:fs/promises")).readFile(packageJsonPath, "utf8"),
  ) as { name: string };
  packageJson.name = projectName;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  prompts.log.success("Project created");
  if (!args.skipInstall) {
    const install = spawnSync("npm", ["install"], {
      cwd: destination,
      stdio: "inherit",
    });
    if (install.status !== 0) {
      prompts.log.error(
        "npm install failed. Run it manually in the project directory.",
      );
      process.exit(install.status ?? 1);
    }
    prompts.log.success("Dependencies installed");
  }
  prompts.outro(`cd ${projectName}\nnpm run dev`);
}

await main().catch((error: unknown) => {
  prompts.cancel(
    error instanceof Error ? error.message : "Project creation failed",
  );
  process.exit(1);
});
