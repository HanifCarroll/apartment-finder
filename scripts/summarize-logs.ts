#!/usr/bin/env bun
import { readFile } from "node:fs/promises";

type LogRecord = {
  time?: string | number;
  event?: string;
  phase?: string;
  provider?: string;
  model?: string;
  listingUrl?: string;
  durationMs?: number;
  latencyMs?: number;
  totalTokens?: number;
};

type Args = {
  logPath: string;
  json: boolean;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run logs:summary [--log logs/app.log] [--json]
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Args {
  const args = { logPath: "logs/app.log", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--log") {
      if (!next) usage();
      args.logPath = next;
      i += 1;
    } else if (arg === "--json") {
      args.json = true;
    } else {
      usage();
    }
  }
  return args;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function bucketStats(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    total_ms: Math.round(total),
    avg_ms: values.length ? Math.round(total / values.length) : 0,
    p50_ms: Math.round(percentile(values, 0.5)),
    p95_ms: Math.round(percentile(values, 0.95)),
  };
}

function envPositiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function observedMinutes(records: LogRecord[]): number {
  const times = records
    .map((record) => typeof record.time === "number" ? record.time : Date.parse(String(record.time || "")))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (times.length < 2) return 0;
  return Math.max(0, (times[times.length - 1] - times[0]) / 60_000);
}

function concurrencyRecommendation(modelLatencies: Map<string, number[]>) {
  const callsPerMinute = envPositiveInteger("OPENAI_MODEL_CALLS_PER_MINUTE", 240);
  const p95s = Array.from(modelLatencies.values())
    .flat()
    .filter((value) => Number.isFinite(value) && value > 0);
  const p95Ms = Math.max(1000, percentile(p95s, 0.95));
  const recommended = Math.max(1, Math.floor((callsPerMinute * p95Ms) / 60_000));
  return {
    calls_per_minute_limit: callsPerMinute,
    p95_latency_ms: Math.round(p95Ms),
    suggested_openai_model_concurrency: recommended,
    suggested_env: `OPENAI_MODEL_CONCURRENCY=${recommended}`,
  };
}

const args = parseArgs(process.argv.slice(2));
const text = await readFile(args.logPath, "utf8");
const records = text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .flatMap((line) => {
    try {
      return [JSON.parse(line) as LogRecord];
    } catch {
      return [];
    }
  });

const phaseDurations = new Map<string, number[]>();
const modelLatencies = new Map<string, number[]>();
const eventCounts = new Map<string, number>();
let modelCalls = 0;
let modelCacheHits = 0;
let totalTokens = 0;

for (const record of records) {
  if (record.event) eventCounts.set(record.event, (eventCounts.get(record.event) || 0) + 1);
  if (record.phase && typeof record.durationMs === "number") {
    const key = [record.provider, record.phase].filter(Boolean).join(":") || record.phase;
    phaseDurations.set(key, [...(phaseDurations.get(key) || []), record.durationMs]);
  }
  if (record.event === "model_call_finished" && record.model && typeof record.latencyMs === "number") {
    modelCalls += 1;
    modelLatencies.set(record.model, [...(modelLatencies.get(record.model) || []), record.latencyMs]);
    totalTokens += record.totalTokens || 0;
  }
  if (record.event === "model_result_cache_hit") modelCacheHits += 1;
}

const summary = {
  log_path: args.logPath,
  records: records.length,
  model_calls: modelCalls,
  model_cache_hits: modelCacheHits,
  model_cache_hit_rate: modelCalls + modelCacheHits > 0
    ? Number((modelCacheHits / (modelCalls + modelCacheHits)).toFixed(4))
    : 0,
  total_tokens: totalTokens,
  observed_minutes: Number(observedMinutes(records).toFixed(2)),
  observed_live_model_rpm: observedMinutes(records) > 0
    ? Number((modelCalls / observedMinutes(records)).toFixed(2))
    : null,
  event_counts: Object.fromEntries(Array.from(eventCounts.entries()).sort(([a], [b]) => a.localeCompare(b))),
  phases: Object.fromEntries(Array.from(phaseDurations.entries()).map(([phase, values]) => [phase, bucketStats(values)])),
  models: Object.fromEntries(Array.from(modelLatencies.entries()).map(([model, values]) => [model, bucketStats(values)])),
  concurrency_recommendation: concurrencyRecommendation(modelLatencies),
};

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`records: ${summary.records}`);
  console.log(`model calls: ${summary.model_calls}`);
  console.log(`model cache hits: ${summary.model_cache_hits} (${summary.model_cache_hit_rate})`);
  console.log(`total tokens: ${summary.total_tokens}`);
  console.log(`observed live model RPM: ${summary.observed_live_model_rpm ?? "n/a"}`);
  console.log(`suggested concurrency: ${summary.concurrency_recommendation.suggested_env}`);
  console.log("\nphases:");
  for (const [phase, stats] of Object.entries(summary.phases)) {
    console.log(`- ${phase}: ${stats.count} runs, avg ${stats.avg_ms}ms, p95 ${stats.p95_ms}ms, total ${stats.total_ms}ms`);
  }
  console.log("\nmodels:");
  for (const [model, stats] of Object.entries(summary.models)) {
    console.log(`- ${model}: ${stats.count} calls, avg ${stats.avg_ms}ms, p95 ${stats.p95_ms}ms`);
  }
}
