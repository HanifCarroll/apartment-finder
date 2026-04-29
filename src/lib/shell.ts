import { spawnSync } from "node:child_process";

export function runCommand(command: string, args: string[], timeoutMs: number): string {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 20,
  });

  if (result.error) throw result.error;

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}:\n${result.stderr || result.stdout}`,
    );
  }

  return result.stdout.trim();
}
