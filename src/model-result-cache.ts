import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { appendJsonl } from "./lib/jsonl";
import type { ShadowVerdictV2, Verdict } from "./types";

export const CLASSIFICATION_PROMPT_VERSION = "washing-machine-location-v3";
export const CLASSIFICATION_SCHEMA_VERSION = "washing_machine_location_verdict_v1";

export type CachedModelResult = {
  type: "model_result_cache";
  cached_at: string;
  cache_key: string;
  model: string;
  detail: string;
  image_sha256: string;
  prompt_version: string;
  schema_version: string;
  verdict: Verdict;
  shadow_verdict_v2?: ShadowVerdictV2;
  usage?: unknown;
  latency_ms: number;
};

export type ModelCacheInput = {
  model: string;
  detail: string;
  imageSha256: string;
  promptVersion?: string;
  schemaVersion?: string;
};

export function modelResultCacheKey(input: ModelCacheInput): string {
  return createHash("sha256")
    .update([
      input.model,
      input.detail,
      input.imageSha256,
      input.promptVersion || CLASSIFICATION_PROMPT_VERSION,
      input.schemaVersion || CLASSIFICATION_SCHEMA_VERSION,
    ].join("\0"))
    .digest("hex");
}

function parseJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

const cacheByPath = new Map<string, Map<string, CachedModelResult>>();

async function readCacheFile(cachePath: string): Promise<Map<string, CachedModelResult>> {
  const existing = cacheByPath.get(cachePath);
  if (existing) return existing;

  const recordsByKey = new Map<string, CachedModelResult>();
  let text = "";
  try {
    text = await readFile(cachePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      cacheByPath.set(cachePath, recordsByKey);
      return recordsByKey;
    }
    throw error;
  }

  for (const record of parseJsonl<CachedModelResult>(text)) {
    if (record.type === "model_result_cache" && record.cache_key) recordsByKey.set(record.cache_key, record);
  }
  cacheByPath.set(cachePath, recordsByKey);
  return recordsByKey;
}

export async function readCachedModelResult(
  cachePath: string,
  input: ModelCacheInput,
): Promise<CachedModelResult | null> {
  const cacheKey = modelResultCacheKey(input);
  const recordsByKey = await readCacheFile(cachePath);
  return recordsByKey.get(cacheKey) || null;
}

export async function writeCachedModelResult(
  cachePath: string,
  input: ModelCacheInput,
  result: Omit<CachedModelResult, "type" | "cached_at" | "cache_key" | "model" | "detail" | "image_sha256" | "prompt_version" | "schema_version">,
): Promise<void> {
  const record: CachedModelResult = {
    type: "model_result_cache",
    cached_at: new Date().toISOString(),
    cache_key: modelResultCacheKey(input),
    model: input.model,
    detail: input.detail,
    image_sha256: input.imageSha256,
    prompt_version: input.promptVersion || CLASSIFICATION_PROMPT_VERSION,
    schema_version: input.schemaVersion || CLASSIFICATION_SCHEMA_VERSION,
    ...result,
  };
  await mkdir(dirname(cachePath), { recursive: true }).catch(() => undefined);
  await appendJsonl(cachePath, [record]);
  const recordsByKey = cacheByPath.get(cachePath);
  recordsByKey?.set(record.cache_key, record);
}
