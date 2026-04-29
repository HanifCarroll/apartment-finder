#!/usr/bin/env bun
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_ESCALATION_MODEL,
  DEFAULT_EXTRACTION_CACHE,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MODEL,
} from "../src/args";
import { DEFAULT_CONCURRENCY } from "../src/concurrency";
import { runClassification } from "../src/classifier-runner";
import { appendJsonl } from "../src/jsonl";
import {
  findListingExtractionRecord,
  findListingSummaryRecord,
  formatListingScanLine,
} from "../src/listing-output";
import { findListingUrlsFromSearchUrl } from "../src/listing-search";
import type { Args, LocationLabel } from "../src/types";

type SearchArgs = {
  searchUrl: string;
  outPath?: string;
  model: string;
  escalationModel: string;
  maxListings: number;
  maxPages: number;
  maxImages: number;
  concurrency: number;
  cacheDir: string;
  extractionCachePath: string;
  useExtractionCache: boolean;
  refreshExtraction: boolean;
  jsonOutput: boolean;
  includeAll: boolean;
  discoverOnly: boolean;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run search --search-url <url>

By default, this prints only listings classified as IN_UNIT.

Options:
  --search-url <url>        Provider search/results URL.
  --out <path>              Append full JSONL audit records.
  --max-listings <n>        Maximum listing URLs to inspect. Defaults to 20.
  --max-pages <n>           Maximum search result pages to visit. Defaults to 5.
  --all                     Print every classified listing, not just IN_UNIT matches.
  --discover-only           Only extract listing URLs; no model calls.
  --model <model>           First-pass model. Defaults to ${DEFAULT_MODEL}.
  --escalation-model <id>   Second-pass model. Defaults to ${DEFAULT_ESCALATION_MODEL}.
  --max-images <n>          Maximum photos per listing. Defaults to ${DEFAULT_MAX_IMAGES}.
  --concurrency <n>         Concurrent model calls inside each listing. Defaults to ${DEFAULT_CONCURRENCY}.
  --cache-dir <path>        Image cache directory. Defaults to ${DEFAULT_CACHE_DIR}.
  --extraction-cache <path> Listing extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --refresh-extraction      Ignore cached listing extraction and write fresh listing extractions.
  --no-extraction-cache     Disable listing extraction reads and writes.
  --json                    Print JSON lines instead of tab-separated text.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): SearchArgs {
  const args: SearchArgs = {
    searchUrl: "",
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    escalationModel: process.env.OPENAI_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL,
    maxListings: 20,
    maxPages: 5,
    maxImages: DEFAULT_MAX_IMAGES,
    concurrency: DEFAULT_CONCURRENCY,
    cacheDir: DEFAULT_CACHE_DIR,
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    useExtractionCache: true,
    refreshExtraction: false,
    jsonOutput: false,
    includeAll: false,
    discoverOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") usage(0);

    switch (arg) {
      case "--search-url":
        if (!next) usage();
        args.searchUrl = next;
        i += 1;
        break;
      case "--out":
        if (!next) usage();
        args.outPath = next;
        i += 1;
        break;
      case "--max-listings": {
        if (!next) usage();
        const maxListings = Number.parseInt(next, 10);
        if (!Number.isInteger(maxListings) || maxListings < 1) usage();
        args.maxListings = maxListings;
        i += 1;
        break;
      }
      case "--max-pages": {
        if (!next) usage();
        const maxPages = Number.parseInt(next, 10);
        if (!Number.isInteger(maxPages) || maxPages < 1) usage();
        args.maxPages = maxPages;
        i += 1;
        break;
      }
      case "--all":
        args.includeAll = true;
        break;
      case "--discover-only":
        args.discoverOnly = true;
        break;
      case "--model":
        if (!next) usage();
        args.model = next;
        i += 1;
        break;
      case "--escalation-model":
        if (!next) usage();
        args.escalationModel = next;
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
      case "--cache-dir":
        if (!next) usage();
        args.cacheDir = next;
        i += 1;
        break;
      case "--extraction-cache":
        if (!next) usage();
        args.extractionCachePath = next;
        i += 1;
        break;
      case "--refresh-extraction":
        args.refreshExtraction = true;
        break;
      case "--no-extraction-cache":
        args.useExtractionCache = false;
        break;
      case "--json":
        args.jsonOutput = true;
        break;
      default:
        usage();
    }
  }

  if (!args.searchUrl) usage();
  return args;
}

function toClassificationArgs(listingUrl: string, args: SearchArgs): Args {
  return {
    listingUrl,
    models: [args.model],
    cacheDir: args.cacheDir,
    extractionCachePath: args.extractionCachePath,
    useExtractionCache: args.useExtractionCache,
    refreshExtraction: args.refreshExtraction,
    detail: "auto",
    maxImages: args.maxImages,
    concurrency: args.concurrency,
    listingSummary: true,
    escalationModel: args.escalationModel,
    classifyAll: true,
    extractOnly: false,
    jsonOutput: true,
  };
}

function shouldPrint(decision: LocationLabel | undefined, args: SearchArgs): boolean {
  return args.includeAll || decision === "IN_UNIT";
}

const args = parseArgs(process.argv.slice(2));
if (!args.discoverOnly && !process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
}

const searchResult = await findListingUrlsFromSearchUrl(args.searchUrl, args.maxListings, args.maxPages);
const searchRecord = {
  ok: true,
  type: "listing_search",
  created_at: new Date().toISOString(),
  ...searchResult,
};
if (args.outPath) await appendJsonl(args.outPath, [searchRecord]);

for (const warning of searchResult.warnings) {
  console.error(`warning: ${warning}`);
}

if (args.discoverOnly) {
  console.log(JSON.stringify(searchRecord, null, 2));
  process.exit(0);
}

if (!args.jsonOutput) {
  console.log(["decision", "confidence", "source", "amenity", "gallery", "evidence", "best_url", "listing_url"].join("\t"));
}

let matchCount = 0;
for (let index = 0; index < searchResult.listing_urls.length; index += 1) {
  const listingUrl = searchResult.listing_urls[index];
  console.error(`Scanning ${index + 1}/${searchResult.listing_urls.length}: ${listingUrl}`);

  try {
    const records = await runClassification(toClassificationArgs(listingUrl, args));
    if (args.outPath) await appendJsonl(args.outPath, records);

    const summary = findListingSummaryRecord(records);
    if (!summary) throw new Error("No listing_summary record returned.");
    const extraction = findListingExtractionRecord(records);
    if (shouldPrint(summary.decision, args)) {
      matchCount += summary.decision === "IN_UNIT" ? 1 : 0;
      console.log(args.jsonOutput
        ? JSON.stringify({ ...summary, extraction })
        : formatListingScanLine(summary, extraction));
    }
  } catch (error) {
    const failed = {
      ok: false,
      type: "listing_summary",
      created_at: new Date().toISOString(),
      listing_url: listingUrl,
      error: error instanceof Error ? error.message : String(error),
    };
    if (args.outPath) await appendJsonl(args.outPath, [failed]);
    if (args.includeAll) {
      console.log(args.jsonOutput ? JSON.stringify(failed) : formatListingScanLine(failed));
    }
  }
}

console.error(`Found ${matchCount} IN_UNIT match(es) from ${searchResult.listing_urls.length} listing(s).`);
