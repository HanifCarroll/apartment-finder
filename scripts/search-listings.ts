#!/usr/bin/env bun
import { Command } from "commander";
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
  buildSearchUrl,
  formatListingScanResult,
  listingScanHeader,
  parseNeighborhoodList,
  scanSearchUrl,
  scanListing,
  supportedNeighborhoods,
  type SearchScanRecord,
} from "../src/core";
import type { SearchProvider } from "../src/providers/search";

type SearchArgs = CommonScanCliOptions & {
  searchUrl: string;
  builtSearchWarnings: string[];
  builtSearchIgnored: string[];
  maxListings: number;
  maxPages: number;
  includeAll: boolean;
  discoverOnly: boolean;
  format: "cards" | "table" | "json";
};

function parseArgs(argv: string[]): SearchArgs {
  const program = new Command()
    .name("bun run find")
    .description("Find apartments with likely in-unit washers from a provider search/results URL.")
    .argument("[url]", "Provider search/results URL.")
    .option("--search-url <url>", "Provider search/results URL. Kept for script compatibility.")
    .option("--provider <provider>", "Build a search URL for: zonaprop, argenprop, or airbnb.")
    .option("--neighborhood <name>", `Neighborhood to search. Repeat or comma-separate. Supported: ${supportedNeighborhoods().join(", ")}.`, collectOption, [])
    .option("--neighborhoods <names>", "Comma-separated alias for --neighborhood.")
    .option("--min-price <usd>", "Minimum monthly price in USD.")
    .option("--max-price <usd>", "Maximum monthly price in USD.")
    .option("--price <usd>", "Alias for --max-price.")
    .option("--ambientes <n>", "Number of ambientes for Zonaprop/Argenprop.")
    .option("--min-ambientes <n>", "Minimum ambientes for Zonaprop/Argenprop.")
    .option("--max-ambientes <n>", "Maximum ambientes for Zonaprop/Argenprop.")
    .option("--dormitorios <n>", "Number of dormitorios for Zonaprop/Argenprop.")
    .option("--min-dormitorios <n>", "Minimum dormitorios for Zonaprop/Argenprop.")
    .option("--max-dormitorios <n>", "Maximum dormitorios for Zonaprop/Argenprop.")
    .option("--check-in <date>", "Airbnb check-in date, YYYY-MM-DD.")
    .option("--check-out <date>", "Airbnb check-out date, YYYY-MM-DD.")
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
    provider?: SearchProvider;
    neighborhood?: string[];
    neighborhoods?: string;
    minPrice?: string;
    maxPrice?: string;
    price?: string;
    ambientes?: string;
    minAmbientes?: string;
    maxAmbientes?: string;
    dormitorios?: string;
    minDormitorios?: string;
    maxDormitorios?: string;
    checkIn?: string;
    checkOut?: string;
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

  const explicitSearchUrl = options.searchUrl || positionalUrl || "";
  const builtSearch = explicitSearchUrl
    ? undefined
    : buildUrlFromFilterOptions(options);

  const defaults = defaultCommonScanOptions();
  const args: SearchArgs = {
    ...defaultCommonScanOptions(),
    searchUrl: explicitSearchUrl || builtSearch?.url || "",
    builtSearchWarnings: builtSearch?.warnings || [],
    builtSearchIgnored: builtSearch?.ignored || [],
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
  if (explicitSearchUrl && hasFilterOptions(options)) {
    throw new Error("Pass either a search URL or filter options, not both.");
  }
  return args;
}

function parsePositiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function buildUrlFromFilterOptions(options: {
  provider?: SearchProvider;
  neighborhood?: string[];
  neighborhoods?: string;
  minPrice?: string;
  maxPrice?: string;
  price?: string;
  ambientes?: string;
  minAmbientes?: string;
  maxAmbientes?: string;
  dormitorios?: string;
  minDormitorios?: string;
  maxDormitorios?: string;
  checkIn?: string;
  checkOut?: string;
}) {
  if (!hasFilterOptions(options)) return undefined;
  if (!options.provider || !["zonaprop", "argenprop", "airbnb"].includes(options.provider)) {
    throw new Error("--provider must be one of: zonaprop, argenprop, airbnb.");
  }
  const neighborhoods = parseNeighborhoodList([
    ...(options.neighborhood || []),
    options.neighborhoods || "",
  ]);
  return buildSearchUrl({
    provider: options.provider,
    neighborhoods,
    minPriceUsd: parseOptionalPositiveInt(options.minPrice, "--min-price"),
    maxPriceUsd: parseOptionalPositiveInt(options.maxPrice || options.price, "--max-price"),
    ambientes: parseOptionalPositiveInt(options.ambientes, "--ambientes"),
    minAmbientes: parseOptionalPositiveInt(options.minAmbientes, "--min-ambientes"),
    maxAmbientes: parseOptionalPositiveInt(options.maxAmbientes, "--max-ambientes"),
    dormitorios: parseOptionalPositiveInt(options.dormitorios, "--dormitorios"),
    minDormitorios: parseOptionalPositiveInt(options.minDormitorios, "--min-dormitorios"),
    maxDormitorios: parseOptionalPositiveInt(options.maxDormitorios, "--max-dormitorios"),
    checkIn: options.checkIn,
    checkOut: options.checkOut,
  });
}

function hasFilterOptions(options: {
  provider?: string;
  neighborhood?: string[];
  neighborhoods?: string;
  minPrice?: string;
  maxPrice?: string;
  price?: string;
  ambientes?: string;
  minAmbientes?: string;
  maxAmbientes?: string;
  dormitorios?: string;
  minDormitorios?: string;
  maxDormitorios?: string;
  checkIn?: string;
  checkOut?: string;
}): boolean {
  return Boolean(
    options.provider
      || options.neighborhood?.length
      || options.neighborhoods
      || options.minPrice
      || options.maxPrice
      || options.price
      || options.ambientes
      || options.minAmbientes
      || options.maxAmbientes
      || options.dormitorios
      || options.minDormitorios
      || options.maxDormitorios
      || options.checkIn
      || options.checkOut,
  );
}

function parseOptionalPositiveInt(value: string | undefined, name: string): number | undefined {
  if (!value) return undefined;
  return parsePositiveInt(value, name);
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
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

function printDiscovery(searchRecord: SearchScanRecord, args: SearchArgs): void {
  if (args.format === "json") {
    console.log(JSON.stringify(searchRecord, null, 2));
    return;
  }

  console.log(`Discovered ${searchRecord.listing_count} listings from ${searchRecord.provider}`);
  console.log(`Search URL: ${searchRecord.search_url}`);
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

const result = await scanSearchUrl(
  args.searchUrl,
  args,
  ({ index, total, listingUrl }) => {
    console.error(`Scanning ${index + 1}/${total}: ${listingUrl}`);
  },
);

for (const warning of result.search.warnings) {
  console.error(`warning: ${warning}`);
}
for (const warning of args.builtSearchWarnings) {
  console.error(`warning: ${warning}`);
}
for (const ignored of args.builtSearchIgnored) {
  console.error(`warning: ${ignored} is ignored for ${result.search.provider} generated search URLs.`);
}

if (args.discoverOnly) {
  printDiscovery(result.search, args);
  process.exit(0);
}

if (args.format === "table") {
  console.log(listingScanHeader());
}

let printedIndex = 0;
for (const item of result.items) {
  if (!item.printed) continue;
  printedIndex += 1;
  const summary = item.result?.summary || item.failure;
  const extraction = item.result?.extraction;
  if (!summary) continue;
  if (args.format === "cards") {
    console.log(formatCard(printedIndex, summary, extraction));
    console.log("");
  } else {
    console.log(formatListingScanResult(summary, extraction, args.jsonOutput));
  }
}

console.error(`Done: ${result.matchCount} IN_UNIT match(es), ${result.failedCount} failed, ${result.search.listing_urls.length} scanned.`);
