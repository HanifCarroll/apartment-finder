#!/usr/bin/env bun
import { Command } from "commander";
import { appendJsonl } from "../src/lib/jsonl";
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_ESCALATION_MODEL,
  DEFAULT_EXTRACTION_CACHE,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MODEL,
} from "../src/cli/args";
import { DEFAULT_CONCURRENCY } from "../src/lib/concurrency";
import {
  defaultCommonScanOptions,
  type CommonScanCliOptions,
} from "../src/cli/options";
import {
  appendFailedListingScan,
  formatListingScanResult,
  listingScanHeader,
  scanListing,
} from "../src/listing/scan-runner";
import { findListingUrlsFromSearchUrl } from "../src/listing/search";
import type { ListingSearchResult } from "../src/listing/search";
import type { LocationLabel } from "../src/types";

type SearchArgs = CommonScanCliOptions & {
  searchUrl: string;
  maxListings: number;
  maxPages: number;
  includeAll: boolean;
  discoverOnly: boolean;
  format: "cards" | "table" | "json";
};

type SearchRecord = {
  ok: true;
  type: "listing_search";
  created_at: string;
} & ListingSearchResult;

function parseArgs(argv: string[]): SearchArgs {
  const program = new Command()
    .name("bun run find")
    .description("Find apartments with likely in-unit washers from a provider search/results URL.")
    .argument("[url]", "Provider search/results URL.")
    .option("--search-url <url>", "Provider search/results URL. Kept for script compatibility.")
    .option("--out <path>", "Append full JSONL audit records.")
    .option("--max-listings <n>", "Maximum listing URLs to inspect.", "20")
    .option("--max-pages <n>", "Maximum search result pages to visit.", "5")
    .option("--all", "Print every classified listing, not just IN_UNIT matches.")
    .option("--discover-only", "Only extract listing URLs; no model calls.")
    .option("--model <model>", `First-pass model. Defaults to ${DEFAULT_MODEL}.`)
    .option("--escalation-model <id>", `Second-pass model. Defaults to ${DEFAULT_ESCALATION_MODEL}.`)
    .option("--max-images <n>", `Maximum photos per listing. Defaults to ${DEFAULT_MAX_IMAGES}.`)
    .option("--concurrency <n>", `Concurrent model calls inside each listing. Defaults to ${DEFAULT_CONCURRENCY}.`)
    .option("--cache-dir <path>", `Image cache directory. Defaults to ${DEFAULT_CACHE_DIR}.`)
    .option("--extraction-cache <path>", `Listing extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.`)
    .option("--refresh-extraction", "Ignore cached listing extraction and write fresh listing extractions.")
    .option("--no-extraction-cache", "Disable listing extraction reads and writes.")
    .option("--format <format>", "Output format: cards, table, or json.", "cards")
    .option("--json", "Shortcut for --format json.")
    .parse(argv, { from: "user" });

  const options = program.opts<{
    searchUrl?: string;
    out?: string;
    maxListings: string;
    maxPages: string;
    all?: boolean;
    discoverOnly?: boolean;
    model?: string;
    escalationModel?: string;
    maxImages?: string;
    concurrency?: string;
    cacheDir?: string;
    extractionCache?: string;
    refreshExtraction?: boolean;
    noExtractionCache?: boolean;
    format: string;
    json?: boolean;
  }>();
  const positionalUrl = program.args[0];
  const format = options.json ? "json" : options.format;
  if (format !== "cards" && format !== "table" && format !== "json") {
    throw new Error("--format must be one of: cards, table, json.");
  }

  const maxListings = Number.parseInt(options.maxListings, 10);
  if (!Number.isInteger(maxListings) || maxListings < 1) throw new Error("--max-listings must be a positive integer.");

  const maxPages = Number.parseInt(options.maxPages, 10);
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error("--max-pages must be a positive integer.");

  const defaults = defaultCommonScanOptions();
  const args: SearchArgs = {
    ...defaultCommonScanOptions(),
    searchUrl: options.searchUrl || positionalUrl || "",
    outPath: options.out,
    model: options.model || defaults.model,
    escalationModel: options.escalationModel || defaults.escalationModel,
    maxImages: options.maxImages ? parsePositiveInt(options.maxImages, "--max-images") : defaults.maxImages,
    concurrency: options.concurrency ? parsePositiveInt(options.concurrency, "--concurrency") : defaults.concurrency,
    cacheDir: options.cacheDir || defaults.cacheDir,
    extractionCachePath: options.extractionCache || defaults.extractionCachePath,
    useExtractionCache: !options.noExtractionCache,
    refreshExtraction: Boolean(options.refreshExtraction),
    jsonOutput: format === "json",
    maxListings,
    maxPages,
    includeAll: Boolean(options.all),
    discoverOnly: Boolean(options.discoverOnly),
    format,
  };

  if (!args.searchUrl) program.help({ error: true });
  return args;
}

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function shouldPrint(decision: LocationLabel | undefined, args: SearchArgs): boolean {
  return args.includeAll || decision === "IN_UNIT";
}

function photoEvidence(summary: { evidence?: Array<{ listing_image_index?: number; confidence?: number; contains_washing_machine?: boolean }> }): string {
  const refs = (summary.evidence || [])
    .filter((item) => item.contains_washing_machine)
    .slice(0, 3)
    .map((item) => `photo ${item.listing_image_index ?? "?"}${typeof item.confidence === "number" ? ` ${item.confidence.toFixed(2)}` : ""}`);
  return refs.length ? refs.join(", ") : "none";
}

function bestUrl(summary: { evidence?: Array<{ image_url?: string }> }): string {
  return summary.evidence?.find((item) => item.image_url)?.image_url || "";
}

function printDiscovery(searchRecord: SearchRecord, args: SearchArgs): void {
  if (args.format === "json") {
    console.log(JSON.stringify(searchRecord, null, 2));
    return;
  }

  console.log(`Discovered ${searchRecord.listing_count} listings from ${searchRecord.provider}`);
  console.log(`Visited ${searchRecord.page_urls.length} result page(s)`);
  for (const url of searchRecord.listing_urls) console.log(`- ${url}`);
}

function formatCard(
  index: number,
  summary: Awaited<ReturnType<typeof scanListing>>["summary"],
  extraction: Awaited<ReturnType<typeof scanListing>>["extraction"],
): string {
  const amenity = summary.airbnb_laundry_amenity_text || extraction?.airbnb_laundry_amenity_text;
  const gallery = extraction
    ? `${extraction.image_count ?? summary.image_count ?? "?"}/${extraction.gallery_count ?? "?"}`
    : `${summary.image_count ?? "?"}/?`;
  const url = bestUrl(summary);

  return [
    `${index}. ${summary.decision || "UNKNOWN"} ${summary.confidence || "unknown"} - ${summary.listing_url || ""}`,
    `   source: ${summary.decision_source || "vision"}${amenity ? ` (${amenity})` : ""}`,
    `   gallery: ${gallery} photos${extraction?.extraction_source ? ` ${extraction.extraction_source}` : ""}`,
    `   evidence: ${photoEvidence(summary)}`,
    url ? `   best photo: ${url}` : undefined,
  ].filter(Boolean).join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (!args.discoverOnly && !process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
}

const searchResult = await findListingUrlsFromSearchUrl(args.searchUrl, args.maxListings, args.maxPages);
const searchRecord: SearchRecord = {
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
  printDiscovery(searchRecord, args);
  process.exit(0);
}

if (args.format === "table") {
  console.log(listingScanHeader());
}

let matchCount = 0;
let printedCount = 0;
let failedCount = 0;
for (let index = 0; index < searchResult.listing_urls.length; index += 1) {
  const listingUrl = searchResult.listing_urls[index];
  console.error(`Scanning ${index + 1}/${searchResult.listing_urls.length}: ${listingUrl}`);

  try {
    const { summary, extraction } = await scanListing(listingUrl, args, args.outPath);
    if (shouldPrint(summary.decision, args)) {
      matchCount += summary.decision === "IN_UNIT" ? 1 : 0;
      printedCount += 1;
      if (args.format === "cards") {
        console.log(formatCard(printedCount, summary, extraction));
        console.log("");
      } else {
        console.log(formatListingScanResult(summary, extraction, args.jsonOutput));
      }
    }
  } catch (error) {
    failedCount += 1;
    const failed = await appendFailedListingScan(listingUrl, error, args.outPath);
    if (args.includeAll) {
      printedCount += 1;
      if (args.format === "cards") {
        console.log(formatCard(printedCount, failed, undefined));
        console.log("");
      } else {
        console.log(formatListingScanResult(failed, undefined, args.jsonOutput));
      }
    }
  }
}

console.error(`Done: ${matchCount} IN_UNIT match(es), ${failedCount} failed, ${searchResult.listing_urls.length} scanned.`);
