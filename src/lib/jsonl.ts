import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function appendJsonl(path: string, records: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
  await appendFile(path, records.map((record) => `${JSON.stringify(record)}\n`).join(""));
}

export async function writeJsonl(path: string, records: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
  await writeFile(path, records.map((record) => `${JSON.stringify(record)}\n`).join(""));
}
