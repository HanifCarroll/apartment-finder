import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { LocationLabel, Verdict } from "../src/types";
import {
  aggregateByPolicy,
  aggregateTwoModelAgreement,
  type ListingEvidence,
} from "../src/listing-aggregation";

type ListingFixture = {
  id: string;
  listing_url: string;
  expected_listing_location: LocationLabel;
  notes?: string;
};

type ClassificationRecord = {
  ok?: boolean;
  type?: string;
  listing_url?: string;
  listing_image_index?: number;
  image?: { source?: string };
  model?: string;
  verdict?: Verdict;
  error?: string;
};

type ListingEvalRecord = {
  ok: boolean;
  listing_id: string;
  listing_url: string;
  model: string;
  aggregation_policy: string;
  expected_location: LocationLabel;
  predicted_location: LocationLabel;
  exact: boolean;
  evidence: ListingEvidence[];
  image_count: number;
  error?: string;
};

type Args = {
  listingsPath: string;
  resultsPath?: string;
  outPath: string;
  summaryPath: string;
  policies: string[];
};

const DEFAULT_POLICIES = [
  "any-in-unit",
  "high-confidence-in-unit",
  "shared-overrides-in-unit",
  "two-model-agreement",
];

function usage(): never {
  console.error(`Usage:
  bun run eval:listings [--results results/listing-label-run-2026-04-28.jsonl]

Options:
  --listings <path>  Listing label JSONL path. Defaults to fixtures/listings.jsonl.
  --results <path>   Classification JSONL path. Defaults to all results/listing-label-run*.jsonl files.
  --out <path>       Write per-listing JSONL. Defaults to results/eval-listings.jsonl.
  --summary <path>   Write summary JSON. Defaults to results/eval-listings-summary.json.
  --policies <list>  Comma-separated aggregation policies. Defaults to ${DEFAULT_POLICIES.join(",")}.
`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    listingsPath: "fixtures/listings.jsonl",
    outPath: "results/eval-listings.jsonl",
    summaryPath: "results/eval-listings-summary.json",
    policies: DEFAULT_POLICIES,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--listings":
        if (!next) usage();
        args.listingsPath = next;
        i += 1;
        break;
      case "--results":
        if (!next) usage();
        args.resultsPath = next;
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
      case "--policies":
        if (!next) usage();
        args.policies = next.split(",").map((policy) => policy.trim()).filter(Boolean);
        i += 1;
        break;
      default:
        usage();
    }
  }

  return args;
}

function parseJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function normalizeListingUrl(url: string): string {
  const parsed = new URL(url);
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

async function readResultRecords(resultsPath?: string): Promise<ClassificationRecord[]> {
  const paths = resultsPath
    ? [resultsPath]
    : (await readdir("results"))
        .filter((name) => /^listing-label-run.*\.jsonl$/.test(name))
        .map((name) => `results/${name}`)
        .sort();

  const records: ClassificationRecord[] = [];
  for (const path of paths) {
    records.push(...parseJsonl<ClassificationRecord>(await readFile(path, "utf8")));
  }
  return records;
}

function emptyBucket() {
  return {
    total: 0,
    correct: 0,
    false_in_unit: 0,
    false_shared: 0,
    missed_in_unit: 0,
    missed_shared: 0,
  };
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function summarize(evalRecords: ListingEvalRecord[]) {
  const byPolicyModel: Record<string, unknown> = {};
  const groups = Array.from(
    new Set(evalRecords.map((record) => `${record.aggregation_policy}\t${record.model}`)),
  ).sort();

  for (const group of groups) {
    const [policy, model] = group.split("\t");
    const modelRecords = evalRecords.filter((record) =>
      record.model === model &&
      record.aggregation_policy === policy &&
      record.ok
    );
    const overall = emptyBucket();
    const byExpected = new Map<LocationLabel, ReturnType<typeof emptyBucket>>();

    for (const record of modelRecords) {
      const buckets = [overall, byExpected.get(record.expected_location) || emptyBucket()];
      for (const bucket of buckets) {
        bucket.total += 1;
        if (record.exact) bucket.correct += 1;
        if (record.expected_location !== "IN_UNIT" && record.predicted_location === "IN_UNIT") {
          bucket.false_in_unit += 1;
        }
        if (record.expected_location !== "SHARED_BUILDING" && record.predicted_location === "SHARED_BUILDING") {
          bucket.false_shared += 1;
        }
        if (record.expected_location === "IN_UNIT" && record.predicted_location !== "IN_UNIT") {
          bucket.missed_in_unit += 1;
        }
        if (record.expected_location === "SHARED_BUILDING" && record.predicted_location !== "SHARED_BUILDING") {
          bucket.missed_shared += 1;
        }
      }
      byExpected.set(record.expected_location, buckets[1]);
    }

    const formatBucket = (bucket: ReturnType<typeof emptyBucket>) => ({
      ...bucket,
      accuracy: pct(bucket.correct, bucket.total),
    });

    byPolicyModel[`${policy}:${model}`] = {
      policy,
      model,
      overall: formatBucket(overall),
      by_expected_location: Object.fromEntries(
        Array.from(byExpected.entries()).map(([location, bucket]) => [location, formatBucket(bucket)]),
      ),
    };
  }

  return {
    created_at: new Date().toISOString(),
    listing_count: new Set(evalRecords.map((record) => record.listing_id)).size,
    by_policy_model: byPolicyModel,
  };
}

function printSummary(summary: ReturnType<typeof summarize>) {
  for (const [key, metrics] of Object.entries(summary.by_policy_model)) {
    const typed = metrics as {
      policy: string;
      model: string;
      overall: {
        total: number;
        correct: number;
        accuracy: number;
        false_in_unit: number;
        false_shared: number;
        missed_in_unit: number;
        missed_shared: number;
      };
      by_expected_location: Record<string, { total: number; correct: number; accuracy: number }>;
    };
    console.log(`\n${key}`);
    console.log(`  listing accuracy: ${typed.overall.correct}/${typed.overall.total} (${typed.overall.accuracy})`);
    console.log(`  false IN_UNIT: ${typed.overall.false_in_unit}`);
    console.log(`  false SHARED_BUILDING: ${typed.overall.false_shared}`);
    console.log(`  missed IN_UNIT: ${typed.overall.missed_in_unit}`);
    console.log(`  missed SHARED_BUILDING: ${typed.overall.missed_shared}`);
    console.log("  by expected listing location:");
    for (const [location, bucket] of Object.entries(typed.by_expected_location)) {
      console.log(`    ${location}: ${bucket.correct}/${bucket.total} (${bucket.accuracy})`);
    }
  }
}

const args = parseArgs(process.argv.slice(2));
const listings = parseJsonl<ListingFixture>(await readFile(args.listingsPath, "utf8"));
const resultRecords = await readResultRecords(args.resultsPath);
const models = Array.from(
  new Set(resultRecords.map((record) => record.model).filter((model): model is string => Boolean(model))),
).sort();

const recordsByListingModel = new Map<string, ClassificationRecord[]>();
for (const record of resultRecords) {
  if (!record.listing_url || !record.model || !record.verdict) continue;
  const key = `${normalizeListingUrl(record.listing_url)}\t${record.model}`;
  const records = recordsByListingModel.get(key) || [];
  records.push(record);
  recordsByListingModel.set(key, records);
}

const evalRecords = listings.flatMap((listing): ListingEvalRecord[] => {
  const normalizedListingUrl = normalizeListingUrl(listing.listing_url);
  const perModelRecords = models.flatMap((model) =>
    recordsByListingModel.get(`${normalizedListingUrl}\t${model}`) || [],
  );

  const perModelEvalRecords = models.flatMap((model) => {
    const records = recordsByListingModel.get(`${normalizedListingUrl}\t${model}`) || [];
    if (records.length === 0) {
      return {
        ok: false,
        listing_id: listing.id,
        listing_url: listing.listing_url,
        model,
        aggregation_policy: "any-in-unit",
        expected_location: listing.expected_listing_location,
        predicted_location: "UNKNOWN",
        exact: false,
        evidence: [],
        image_count: 0,
        error: "No classification records found for listing/model.",
      };
    }

    return args.policies
      .filter((policy) => policy !== "two-model-agreement")
      .map((policy): ListingEvalRecord => {
        const aggregate = aggregateByPolicy(policy, records);
        return {
          ok: true,
          listing_id: listing.id,
          listing_url: listing.listing_url,
          model,
          aggregation_policy: policy,
          expected_location: listing.expected_listing_location,
          predicted_location: aggregate.predictedLocation,
          exact: aggregate.predictedLocation === listing.expected_listing_location,
          evidence: aggregate.evidence,
          image_count: new Set(records.map((record) => record.image?.source).filter(Boolean)).size,
        };
      });
  });

  const consensusEvalRecords = args.policies.includes("two-model-agreement")
    ? [((): ListingEvalRecord => {
      const aggregate = aggregateTwoModelAgreement(perModelRecords);
      return {
      ok: true,
      listing_id: listing.id,
      listing_url: listing.listing_url,
      model: models.join("+"),
      aggregation_policy: "two-model-agreement",
      expected_location: listing.expected_listing_location,
      predicted_location: aggregate.predictedLocation,
      exact: aggregate.predictedLocation === listing.expected_listing_location,
      evidence: aggregate.evidence,
      image_count: new Set(perModelRecords.map((record) => record.image?.source).filter(Boolean)).size,
      };
    })()]
    : [];

  return [...perModelEvalRecords, ...consensusEvalRecords];
});

const summary = summarize(evalRecords);
await mkdir(dirname(args.outPath), { recursive: true });
await writeFile(args.outPath, `${evalRecords.map((record) => JSON.stringify(record)).join("\n")}\n`);
await mkdir(dirname(args.summaryPath), { recursive: true });
await writeFile(args.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

printSummary(summary);
console.log(`\nWrote ${args.outPath}`);
console.log(`Wrote ${args.summaryPath}`);
