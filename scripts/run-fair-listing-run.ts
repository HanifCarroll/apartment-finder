import { readFile } from "node:fs/promises";
import { DEFAULT_CACHE_DIR, DEFAULT_EXTRACTION_CACHE } from "../src/args";
import { DEFAULT_CONCURRENCY } from "../src/concurrency";
import { appendJsonl } from "../src/jsonl";
import { runClassification } from "../src/classifier-runner";
import type { Args, LocationLabel } from "../src/types";

type ListingFixture = {
  id: string;
  listing_url: string;
  expected_listing_location: LocationLabel;
  notes?: string;
};

type FairRunArgs = {
  fixturesPath: string;
  outPath: string;
  models: string[];
  maxImages: number;
  concurrency: number;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run fair:listings [--fixtures fixtures/listings.jsonl] [--out results/listing-label-run-fair.jsonl]

Options:
  --fixtures <path>    Listing fixture JSONL path. Defaults to fixtures/listings.jsonl.
  --out <path>         Append classification JSONL records. Defaults to results/listing-label-run-fair.jsonl.
  --models <list>      Comma-separated model IDs. Defaults to gpt-5.4-mini,gpt-5.4-nano.
  --max-images <n>     Maximum photos per listing. Defaults to 35.
  --concurrency <n>    Concurrent model calls inside each listing. Defaults to ${DEFAULT_CONCURRENCY}.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): FairRunArgs {
  const args: FairRunArgs = {
    fixturesPath: "fixtures/listings.jsonl",
    outPath: "results/listing-label-run-fair.jsonl",
    models: ["gpt-5.4-mini", "gpt-5.4-nano"],
    maxImages: 35,
    concurrency: DEFAULT_CONCURRENCY,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      usage(0);
    }

    switch (arg) {
      case "--fixtures":
        if (!next) usage();
        args.fixturesPath = next;
        i += 1;
        break;
      case "--out":
        if (!next) usage();
        args.outPath = next;
        i += 1;
        break;
      case "--models":
        if (!next) usage();
        args.models = next.split(",").map((model) => model.trim()).filter(Boolean);
        i += 1;
        break;
      case "--max-images": {
        if (!next) usage();
        const maxImages = Number.parseInt(next, 10);
        if (!Number.isInteger(maxImages) || maxImages < 1) usage();
        args.maxImages = maxImages;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
  }

  const listings = parseJsonl<ListingFixture>(await readFile(args.fixturesPath, "utf8"));

  for (const listing of listings) {
    console.log(`Classifying ${listing.id} (${listing.expected_listing_location})`);
    const classificationArgs: Args = {
      listingUrl: listing.listing_url,
      models: args.models,
      cacheDir: DEFAULT_CACHE_DIR,
      extractionCachePath: DEFAULT_EXTRACTION_CACHE,
      useExtractionCache: true,
      refreshExtraction: false,
      detail: "auto",
      maxImages: args.maxImages,
      concurrency: args.concurrency,
      listingSummary: false,
      escalationModel: "gpt-5.4",
      classifyAll: true,
      extractOnly: false,
      jsonOutput: true,
    };

    const records = await runClassification(classificationArgs).catch((error) => [{
      ok: false,
      type: "listing_run_failed",
      created_at: new Date().toISOString(),
      listing_id: listing.id,
      listing_url: listing.listing_url,
      expected_listing_location: listing.expected_listing_location,
      error: error instanceof Error ? error.message : String(error),
    }]);
    await appendJsonl(args.outPath, records);
  }

  console.log(`Wrote ${args.outPath}`);
}

await main();
