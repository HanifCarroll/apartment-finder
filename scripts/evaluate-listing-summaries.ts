import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LocationLabel } from "../src/types";

type ListingFixture = {
  id: string;
  listing_url: string;
  expected_listing_location: LocationLabel;
};

type SummaryRecord = {
  ok?: boolean;
  type?: string;
  listing_url?: string;
  decision?: LocationLabel;
  confidence?: string;
  policy?: string;
  first_pass_model?: string;
  escalation_model?: string;
  image_count?: number;
  escalated_image_indexes?: number[];
  evidence?: unknown[];
  error?: string;
};

type EvalRecord = {
  ok: boolean;
  listing_id: string;
  listing_url: string;
  expected_location: LocationLabel;
  predicted_location: LocationLabel;
  exact: boolean;
  confidence?: string;
  policy?: string;
  first_pass_model?: string;
  escalation_model?: string;
  image_count?: number;
  escalated_image_count?: number;
  evidence_count?: number;
  error?: string;
};

type Args = {
  listingsPath: string;
  resultsPath: string;
  outPath: string;
  summaryPath: string;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run eval:listing-summaries --results results/listing-summary-run.jsonl

Options:
  --listings <path> Listing fixture JSONL path. Defaults to fixtures/listings.jsonl.
  --results <path>  Listing summary run JSONL path.
  --out <path>      Write per-listing JSONL. Defaults to results/eval-listing-summaries.jsonl.
  --summary <path>  Write summary JSON. Defaults to results/eval-listing-summaries-summary.json.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    listingsPath: "fixtures/listings.jsonl",
    resultsPath: "",
    outPath: "results/eval-listing-summaries.jsonl",
    summaryPath: "results/eval-listing-summaries-summary.json",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") usage(0);

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
      default:
        usage();
    }
  }

  if (!args.resultsPath) usage();
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

function addToBucket(bucket: ReturnType<typeof emptyBucket>, record: EvalRecord) {
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

function summarize(records: EvalRecord[]) {
  const okRecords = records.filter((record) => record.ok);
  const overall = emptyBucket();
  const byExpected = new Map<LocationLabel, ReturnType<typeof emptyBucket>>();
  let escalatedListings = 0;
  let escalatedImages = 0;

  for (const record of okRecords) {
    addToBucket(overall, record);
    const bucket = byExpected.get(record.expected_location) || emptyBucket();
    addToBucket(bucket, record);
    byExpected.set(record.expected_location, bucket);

    if ((record.escalated_image_count || 0) > 0) escalatedListings += 1;
    escalatedImages += record.escalated_image_count || 0;
  }

  const formatBucket = (bucket: ReturnType<typeof emptyBucket>) => ({
    ...bucket,
    accuracy: pct(bucket.correct, bucket.total),
  });

  return {
    created_at: new Date().toISOString(),
    listing_count: records.length,
    records_ok: okRecords.length,
    records_failed: records.filter((record) => !record.ok).length,
    escalated_listings: escalatedListings,
    escalated_images: escalatedImages,
    overall: formatBucket(overall),
    by_expected_location: Object.fromEntries(
      Array.from(byExpected.entries()).map(([location, bucket]) => [location, formatBucket(bucket)]),
    ),
  };
}

function printSummary(summary: ReturnType<typeof summarize>) {
  console.log(`listing accuracy: ${summary.overall.correct}/${summary.overall.total} (${summary.overall.accuracy})`);
  console.log(`false IN_UNIT: ${summary.overall.false_in_unit}`);
  console.log(`false SHARED_BUILDING: ${summary.overall.false_shared}`);
  console.log(`missed IN_UNIT: ${summary.overall.missed_in_unit}`);
  console.log(`missed SHARED_BUILDING: ${summary.overall.missed_shared}`);
  console.log(`escalated listings: ${summary.escalated_listings}`);
  console.log(`escalated images: ${summary.escalated_images}`);
  console.log("by expected listing location:");
  for (const [location, bucket] of Object.entries(summary.by_expected_location)) {
    console.log(`  ${location}: ${bucket.correct}/${bucket.total} (${bucket.accuracy})`);
  }
}

const args = parseArgs(process.argv.slice(2));
const listings = parseJsonl<ListingFixture>(await readFile(args.listingsPath, "utf8"));
const summaryRecords = parseJsonl<SummaryRecord>(await readFile(args.resultsPath, "utf8"));
const summariesByUrl = new Map<string, SummaryRecord>();

for (const record of summaryRecords) {
  if (record.type === "listing_summary" && record.listing_url) {
    summariesByUrl.set(normalizeListingUrl(record.listing_url), record);
  }
}

const evalRecords = listings.map((listing): EvalRecord => {
  const summaryRecord = summariesByUrl.get(normalizeListingUrl(listing.listing_url));
  if (!summaryRecord?.decision) {
    return {
      ok: false,
      listing_id: listing.id,
      listing_url: listing.listing_url,
      expected_location: listing.expected_listing_location,
      predicted_location: "UNKNOWN",
      exact: false,
      error: "No listing_summary record found.",
    };
  }

  return {
    ok: true,
    listing_id: listing.id,
    listing_url: listing.listing_url,
    expected_location: listing.expected_listing_location,
    predicted_location: summaryRecord.decision,
    exact: summaryRecord.decision === listing.expected_listing_location,
    confidence: summaryRecord.confidence,
    policy: summaryRecord.policy,
    first_pass_model: summaryRecord.first_pass_model,
    escalation_model: summaryRecord.escalation_model,
    image_count: summaryRecord.image_count,
    escalated_image_count: summaryRecord.escalated_image_indexes?.length || 0,
    evidence_count: summaryRecord.evidence?.length || 0,
  };
});

const summary = summarize(evalRecords);

await mkdir(dirname(args.outPath), { recursive: true });
await writeFile(args.outPath, `${evalRecords.map((record) => JSON.stringify(record)).join("\n")}\n`);
await mkdir(dirname(args.summaryPath), { recursive: true });
await writeFile(args.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

printSummary(summary);
console.log(`\nWrote ${args.outPath}`);
console.log(`Wrote ${args.summaryPath}`);
