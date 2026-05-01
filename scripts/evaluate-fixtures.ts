import OpenAI from "openai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_CACHE_DIR, DEFAULT_MODEL, DEFAULT_MODEL_CACHE, DEFAULT_MODEL_CALL_TIMEOUT_MS } from "../src/cli/args";
import { DEFAULT_CONCURRENCY, mapConcurrent } from "../src/lib/concurrency";
import { loadImageFromUrl } from "../src/lib/images";
import { classifyWithModel, modelRunOptionsFromArgs } from "../src/openai-classifier";
import type { LocationLabel, Verdict } from "../src/types";

type Fixture = {
  id: string;
  image_url: string;
  expected_location: LocationLabel;
  expected_contains_washing_machine: boolean;
  notes?: string;
};

type EvalArgs = {
  fixturesPath: string;
  models: string[];
  cacheDir: string;
  detail: "low" | "high" | "auto";
  outPath: string;
  summaryPath: string;
  concurrency: number;
  modelCallTimeoutMs: number;
  modelCachePath: string;
  useModelCache: boolean;
  refreshModelCache: boolean;
  shadowVerdictV2: boolean;
  limit?: number;
};

type EvalRecord = {
  ok: boolean;
  created_at: string;
  fixture_id: string;
  image_url: string;
  model: string;
  expected: {
    location_label: LocationLabel;
    contains_washing_machine: boolean;
  };
  predicted?: Verdict;
  correct?: {
    location_label: boolean;
    contains_washing_machine: boolean;
    exact: boolean;
  };
  usage?: unknown;
  latency_ms?: number;
  error?: string;
};

type EvalJob = {
  fixture: Fixture;
  fixtureIndex: number;
  model: string;
  modelIndex: number;
};

type MetricBucket = {
  total: number;
  exact_correct: number;
  location_correct: number;
  contains_correct: number;
  false_positive_washer: number;
  false_negative_washer: number;
};

function usage(): never {
  console.error(`Usage:
  bun run eval:fixtures [--models model-a,model-b] [--fixtures fixtures/images.jsonl]

Options:
  --fixtures <path>    Fixture JSONL path. Defaults to fixtures/images.jsonl.
  --models <list>      Comma-separated model IDs. Defaults to ${DEFAULT_MODEL}.
  --out <path>         Write per-image JSONL records. Defaults to results/eval-fixtures.jsonl.
  --summary <path>     Write summary JSON. Defaults to results/eval-fixtures-summary.json.
  --cache-dir <path>   Image cache dir. Defaults to ${DEFAULT_CACHE_DIR}.
  --model-cache <path> Model result cache path. Defaults to ${DEFAULT_MODEL_CACHE}.
  --refresh-model-cache Ignore cached model results and write fresh model results.
  --no-model-cache     Disable model result cache reads and writes.
  --no-shadow-v2       Disable shadow v2 verdict fields.
  --detail <level>     Image detail: low, high, or auto. Defaults to auto.
  --concurrency <n>    Number of concurrent model calls. Defaults to ${DEFAULT_CONCURRENCY}.
  --limit <n>          Evaluate only the first n fixtures.
`);
  process.exit(1);
}

function parseArgs(argv: string[]): EvalArgs {
  const args: EvalArgs = {
    fixturesPath: "fixtures/images.jsonl",
    models: [process.env.OPENAI_MODEL || DEFAULT_MODEL],
    cacheDir: DEFAULT_CACHE_DIR,
    detail: "auto",
    outPath: "results/eval-fixtures.jsonl",
    summaryPath: "results/eval-fixtures-summary.json",
    concurrency: DEFAULT_CONCURRENCY,
    modelCallTimeoutMs: DEFAULT_MODEL_CALL_TIMEOUT_MS,
    modelCachePath: DEFAULT_MODEL_CACHE,
    useModelCache: true,
    refreshModelCache: false,
    shadowVerdictV2: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--fixtures":
        if (!next) usage();
        args.fixturesPath = next;
        i += 1;
        break;
      case "--models":
        if (!next) usage();
        args.models = next.split(",").map((model) => model.trim()).filter(Boolean);
        i += 1;
        break;
      case "--out":
        if (!next) usage();
        args.outPath = next;
        i += 1;
        break;
      case "--summary":
        if (!next) usage();
        args.summaryPath = next;
        i += 1;
        break;
      case "--cache-dir":
        if (!next) usage();
        args.cacheDir = next;
        i += 1;
        break;
      case "--model-cache":
        if (!next) usage();
        args.modelCachePath = next;
        i += 1;
        break;
      case "--refresh-model-cache":
        args.refreshModelCache = true;
        break;
      case "--no-model-cache":
        args.useModelCache = false;
        break;
      case "--no-shadow-v2":
        args.shadowVerdictV2 = false;
        break;
      case "--detail":
        if (!next || !["low", "high", "auto"].includes(next)) usage();
        args.detail = next as EvalArgs["detail"];
        i += 1;
        break;
      case "--limit": {
        if (!next) usage();
        const limit = Number.parseInt(next, 10);
        if (!Number.isInteger(limit) || limit < 1) usage();
        args.limit = limit;
        i += 1;
        break;
      }
      case "--concurrency": {
        if (!next) usage();
        const concurrency = Number.parseInt(next, 10);
        if (!Number.isInteger(concurrency) || concurrency < 1) usage();
        args.concurrency = concurrency;
        i += 1;
        break;
      }
      default:
        usage();
    }
  }

  if (args.models.length === 0) usage();
  return args;
}

function parseJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function emptyBucket(): MetricBucket {
  return {
    total: 0,
    exact_correct: 0,
    location_correct: 0,
    contains_correct: 0,
    false_positive_washer: 0,
    false_negative_washer: 0,
  };
}

function addRecord(bucket: MetricBucket, record: EvalRecord) {
  bucket.total += 1;
  if (!record.correct) return;
  if (record.correct.exact) bucket.exact_correct += 1;
  if (record.correct.location_label) bucket.location_correct += 1;
  if (record.correct.contains_washing_machine) bucket.contains_correct += 1;
  if (
    record.expected.contains_washing_machine === false &&
    record.predicted?.contains_washing_machine === true
  ) {
    bucket.false_positive_washer += 1;
  }
  if (
    record.expected.contains_washing_machine === true &&
    record.predicted?.contains_washing_machine === false
  ) {
    bucket.false_negative_washer += 1;
  }
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function formatBucket(bucket: MetricBucket) {
  return {
    ...bucket,
    exact_accuracy: pct(bucket.exact_correct, bucket.total),
    location_accuracy: pct(bucket.location_correct, bucket.total),
    contains_accuracy: pct(bucket.contains_correct, bucket.total),
  };
}

function summarize(records: EvalRecord[], fixtures: Fixture[], models: string[]) {
  const byModel: Record<string, {
    overall: ReturnType<typeof formatBucket>;
    by_expected_location: Partial<Record<LocationLabel, ReturnType<typeof formatBucket>>>;
    by_expected_contains_washing_machine: Record<string, ReturnType<typeof formatBucket>>;
  }> = {};

  for (const model of models) {
    const modelRecords = records.filter((record) => record.model === model && record.ok);
    const overall = emptyBucket();
    const byLocation = new Map<LocationLabel, MetricBucket>();
    const byContains = new Map<string, MetricBucket>();

    for (const record of modelRecords) {
      addRecord(overall, record);

      const locationBucket = byLocation.get(record.expected.location_label) || emptyBucket();
      addRecord(locationBucket, record);
      byLocation.set(record.expected.location_label, locationBucket);

      const containsKey = String(record.expected.contains_washing_machine);
      const containsBucket = byContains.get(containsKey) || emptyBucket();
      addRecord(containsBucket, record);
      byContains.set(containsKey, containsBucket);
    }

    byModel[model] = {
      overall: formatBucket(overall),
      by_expected_location: Object.fromEntries(
        Array.from(byLocation.entries()).map(([location, bucket]) => [location, formatBucket(bucket)]),
      ),
      by_expected_contains_washing_machine: Object.fromEntries(
        Array.from(byContains.entries()).map(([contains, bucket]) => [contains, formatBucket(bucket)]),
      ),
    };
  }

  return {
    created_at: new Date().toISOString(),
    fixture_count: fixtures.length,
    models,
    records_ok: records.filter((record) => record.ok).length,
    records_failed: records.filter((record) => !record.ok).length,
    by_model: byModel,
  };
}

function printSummary(summary: ReturnType<typeof summarize>) {
  for (const [model, metrics] of Object.entries(summary.by_model)) {
    console.log(`\n${model}`);
    console.log(`  exact accuracy: ${metrics.overall.exact_correct}/${metrics.overall.total} (${metrics.overall.exact_accuracy})`);
    console.log(`  location accuracy: ${metrics.overall.location_correct}/${metrics.overall.total} (${metrics.overall.location_accuracy})`);
    console.log(`  washer presence accuracy: ${metrics.overall.contains_correct}/${metrics.overall.total} (${metrics.overall.contains_accuracy})`);
    console.log(`  washer false positives: ${metrics.overall.false_positive_washer}`);
    console.log(`  washer false negatives: ${metrics.overall.false_negative_washer}`);
    console.log("  by expected location:");
    for (const [location, bucket] of Object.entries(metrics.by_expected_location)) {
      console.log(`    ${location}: ${bucket.exact_correct}/${bucket.total} exact (${bucket.exact_accuracy})`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
  }

  const fixtures = parseJsonl<Fixture>(await readFile(args.fixturesPath, "utf8"))
    .slice(0, args.limit);
  const client = new OpenAI();
  const modelOptions = modelRunOptionsFromArgs(args);
  const imageCache = new Map<string, ReturnType<typeof loadImageFromUrl>>();
  const jobs = fixtures.flatMap((fixture, fixtureIndex) =>
    args.models.map((model, modelIndex): EvalJob => ({ fixture, fixtureIndex, model, modelIndex })),
  );

  const records = await mapConcurrent(jobs, args.concurrency, async (job): Promise<EvalRecord> => {
    try {
      let imagePromise = imageCache.get(job.fixture.image_url);
      if (!imagePromise) {
        imagePromise = loadImageFromUrl(job.fixture.image_url, args.cacheDir);
        imageCache.set(job.fixture.image_url, imagePromise);
      }
      const image = await imagePromise;
      const result = await classifyWithModel(client, job.model, image, args.detail, modelOptions);
      const locationCorrect = result.verdict.location_label === job.fixture.expected_location;
      const containsCorrect =
        result.verdict.contains_washing_machine === job.fixture.expected_contains_washing_machine;

      return {
        ok: true,
        created_at: new Date().toISOString(),
        fixture_id: job.fixture.id,
        image_url: job.fixture.image_url,
        model: job.model,
        expected: {
          location_label: job.fixture.expected_location,
          contains_washing_machine: job.fixture.expected_contains_washing_machine,
        },
        predicted: result.verdict,
        correct: {
          location_label: locationCorrect,
          contains_washing_machine: containsCorrect,
          exact: locationCorrect && containsCorrect,
        },
        usage: result.usage,
        latency_ms: result.latency_ms,
      };
    } catch (error) {
      return {
        ok: false,
        created_at: new Date().toISOString(),
        fixture_id: job.fixture.id,
        image_url: job.fixture.image_url,
        model: job.model,
        expected: {
          location_label: job.fixture.expected_location,
          contains_washing_machine: job.fixture.expected_contains_washing_machine,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const summary = summarize(records, fixtures, args.models);

  await mkdir(dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  await mkdir(dirname(args.summaryPath), { recursive: true });
  await writeFile(args.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  printSummary(summary);
  console.log(`\nWrote ${args.outPath}`);
  console.log(`Wrote ${args.summaryPath}`);
}

await main();
