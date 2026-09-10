import { spawn } from "node:child_process";

export function run(command: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}
