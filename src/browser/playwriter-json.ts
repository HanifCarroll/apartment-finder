import { runCommand } from "../lib/shell";

export function parsePlaywriterJson<T>(stdout: string, startMarker: string, endMarker: string): T {
  const cleaned = stdout.replace(/^\[log\]\s?/gm, "");
  const pattern = new RegExp(`${startMarker}\\n([\\s\\S]*?)\\n${endMarker}`);
  const match = cleaned.match(pattern);
  if (!match) {
    throw new Error(`Could not find Playwriter JSON payload in output:\n${stdout.slice(-4000)}`);
  }

  return JSON.parse(match[1]) as T;
}

export function createPlaywriterSession(): string {
  const sessionOutput = runCommand("bunx", ["playwriter@latest", "session", "new"], 30_000);
  const sessionId = sessionOutput.match(/Session\s+(\d+)\s+created/)?.[1];
  if (!sessionId) {
    throw new Error(`Could not create Playwriter session:\n${sessionOutput}`);
  }
  return sessionId;
}

export function runPlaywriterScript(sessionId: string, script: string, timeoutMs: number): string {
  return runCommand(
    "bunx",
    [
      "playwriter@latest",
      "-s",
      sessionId,
      "--timeout",
      String(timeoutMs - 10_000),
      "-e",
      script,
    ],
    timeoutMs,
  );
}
