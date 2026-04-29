#!/usr/bin/env bun
import { appendJsonl } from "../src/jsonl";
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_ESCALATION_MODEL,
  DEFAULT_EXTRACTION_CACHE,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MODEL,
} from "../src/args";
import { DEFAULT_CONCURRENCY } from "../src/concurrency";
import {
  defaultCommonScanOptions,
  parseCommonScanOption,
  type CommonScanCliOptions,
} from "../src/cli-options";
import {
  appendFailedListingScan,
  formatListingScanResult,
  listingScanHeader,
  scanListing,
} from "../src/listing-scan-runner";
import { findListingUrlsFromSearchUrl } from "../src/listing-search";
import type { LocationLabel } from "../src/types";

type SearchArgs = CommonScanCliOptions & {
  searchUrl: string;
  maxListings: number;
  maxPages: number;
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
    ...defaultCommonScanOptions(),
    searchUrl: "",
    maxListings: 20,
    maxPages: 5,
    includeAll: false,
    discoverOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") usage(0);

    const commonIndex = parseCommonScanOption(args, argv, i);
    if (commonIndex !== null) {
      i = commonIndex;
      continue;
    }

    switch (arg) {
      case "--search-url":
        if (!next) usage();
        args.searchUrl = next;
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
      default:
        usage();
    }
  }

  if (!args.searchUrl) usage();
  return args;
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
  console.log(listingScanHeader());
}

let matchCount = 0;
for (let index = 0; index < searchResult.listing_urls.length; index += 1) {
  const listingUrl = searchResult.listing_urls[index];
  console.error(`Scanning ${index + 1}/${searchResult.listing_urls.length}: ${listingUrl}`);

  try {
    const { summary, extraction } = await scanListing(listingUrl, args, args.outPath);
    if (shouldPrint(summary.decision, args)) {
      matchCount += summary.decision === "IN_UNIT" ? 1 : 0;
      console.log(formatListingScanResult(summary, extraction, args.jsonOutput));
    }
  } catch (error) {
    const failed = await appendFailedListingScan(listingUrl, error, args.outPath);
    if (args.includeAll) console.log(formatListingScanResult(failed, undefined, args.jsonOutput));
  }
}

console.error(`Found ${matchCount} IN_UNIT match(es) from ${searchResult.listing_urls.length} listing(s).`);
