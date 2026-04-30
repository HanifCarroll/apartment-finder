#!/usr/bin/env bun
import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type { LocationLabel } from "../src/types";

type ListingFixture = {
  id: string;
  listing_url: string;
  expected_listing_location: LocationLabel;
};

type AnyRecord = {
  type?: string;
  ok?: boolean;
  listing_url?: string;
  listing_image_index?: number;
  model?: string;
  pass?: string;
  decision?: LocationLabel;
  confidence?: string;
  escalated_image_indexes?: number[];
  max_escalation_images?: number;
  evidence?: unknown[];
  image?: { source?: string };
  verdict?: {
    contains_washing_machine?: boolean;
    location_label?: LocationLabel;
    confidence?: number;
    washing_machine_visibility?: string;
    rationale?: string;
  };
  shadow_verdict_v2?: unknown;
  error?: string;
};

type Args = {
  fixturesPath: string;
  resultsPath: string;
  outPath?: string;
  json: boolean;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run analyze:failures --results results/listing-summary-run.jsonl

Options:
  --fixtures <path>  Listing fixtures. Defaults to fixtures/listings.jsonl.
  --results <path>   Listing summary run JSONL.
  --out <path>       Optional JSON report output.
  --json             Print JSON instead of text.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    fixturesPath: "fixtures/listings.jsonl",
    resultsPath: "",
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") usage(0);
    switch (arg) {
      case "--fixtures":
        if (!next) usage();
        args.fixturesPath = next;
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
      case "--json":
        args.json = true;
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

const args = parseArgs(process.argv.slice(2));
const fixtures = parseJsonl<ListingFixture>(await readFile(args.fixturesPath, "utf8"));
const records = parseJsonl<AnyRecord>(await readFile(args.resultsPath, "utf8"));
const recordsByUrl = new Map<string, AnyRecord[]>();
for (const record of records) {
  if (!record.listing_url) continue;
  const key = normalizeListingUrl(record.listing_url);
  recordsByUrl.set(key, [...(recordsByUrl.get(key) || []), record]);
}

const report = fixtures.map((fixture) => {
  const listingRecords = recordsByUrl.get(normalizeListingUrl(fixture.listing_url)) || [];
  const summary = listingRecords.find((record) => record.type === "listing_summary");
  const imageRecords = listingRecords.filter((record) => record.verdict);
  const predicted = summary?.decision || "UNKNOWN";
  return {
    id: fixture.id,
    listing_url: fixture.listing_url,
    expected: fixture.expected_listing_location,
    predicted,
    exact: predicted === fixture.expected_listing_location,
    confidence: summary?.confidence,
    max_escalation_images: summary?.max_escalation_images,
    escalated_image_indexes: summary?.escalated_image_indexes || [],
    evidence: summary?.evidence || [],
    image_verdicts: imageRecords.map((record) => ({
      photo: record.listing_image_index,
      model: record.model,
      pass: record.pass || "first_pass",
      image_url: record.image?.source,
      location: record.verdict?.location_label,
      washer: record.verdict?.contains_washing_machine,
      visibility: record.verdict?.washing_machine_visibility,
      confidence: record.verdict?.confidence,
      rationale: record.verdict?.rationale,
      shadow_verdict_v2: record.shadow_verdict_v2,
    })),
    errors: listingRecords.filter((record) => record.ok === false).map((record) => record.error).filter(Boolean),
  };
}).filter((item) => !item.exact || item.errors.length > 0);

if (args.outPath) {
  await mkdir(dirname(args.outPath), { recursive: true }).catch(() => undefined);
  await writeFile(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
}

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.length === 0) {
  console.log("No misses found.");
} else {
  for (const item of report) {
    console.log(`\n${item.id}: expected ${item.expected}, predicted ${item.predicted} ${item.confidence || ""}`.trim());
    console.log(item.listing_url);
    console.log(`escalated: ${item.escalated_image_indexes.join(", ") || "none"} / cap ${item.max_escalation_images ?? "?"}`);
    for (const verdict of item.image_verdicts.filter((verdict) => verdict.washer || verdict.pass === "escalation").slice(0, 12)) {
      console.log(`- photo ${verdict.photo ?? "?"} ${verdict.pass} ${verdict.model}: ${verdict.location} ${verdict.confidence ?? ""} ${verdict.visibility || ""}`.trim());
      if (verdict.rationale) console.log(`  ${verdict.rationale}`);
    }
    for (const error of item.errors) console.log(`error: ${error}`);
  }
}
