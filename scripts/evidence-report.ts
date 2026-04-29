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
  type ListingExtractionRecord,
  type ListingSummaryRecord,
} from "../src/listing-output";
import type { Args } from "../src/types";

type ReportArgs = {
  listingUrl: string;
  outPath?: string;
  model: string;
  escalationModel: string;
  maxImages: number;
  concurrency: number;
  cacheDir: string;
  extractionCachePath: string;
  useExtractionCache: boolean;
  refreshExtraction: boolean;
  jsonOutput: boolean;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run report --listing-url <url>

Options:
  --listing-url <url>       Listing URL to inspect.
  --out <path>              Append full JSONL audit records.
  --model <model>           First-pass model. Defaults to ${DEFAULT_MODEL}.
  --escalation-model <id>   Second-pass model. Defaults to ${DEFAULT_ESCALATION_MODEL}.
  --max-images <n>          Maximum photos per listing. Defaults to ${DEFAULT_MAX_IMAGES}.
  --concurrency <n>         Concurrent model calls. Defaults to ${DEFAULT_CONCURRENCY}.
  --cache-dir <path>        Image cache directory. Defaults to ${DEFAULT_CACHE_DIR}.
  --extraction-cache <path> Listing extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --refresh-extraction      Ignore cached listing extraction and write a fresh one.
  --no-extraction-cache     Disable listing extraction reads and writes.
  --json                    Print report JSON instead of text.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): ReportArgs {
  const args: ReportArgs = {
    listingUrl: "",
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    escalationModel: process.env.OPENAI_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL,
    maxImages: DEFAULT_MAX_IMAGES,
    concurrency: DEFAULT_CONCURRENCY,
    cacheDir: DEFAULT_CACHE_DIR,
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    useExtractionCache: true,
    refreshExtraction: false,
    jsonOutput: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") usage(0);

    switch (arg) {
      case "--listing-url":
        if (!next) usage();
        args.listingUrl = next;
        i += 1;
        break;
      case "--out":
        if (!next) usage();
        args.outPath = next;
        i += 1;
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

  if (!args.listingUrl) usage();
  return args;
}

function toClassificationArgs(args: ReportArgs): Args {
  return {
    listingUrl: args.listingUrl,
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

function evidenceItems(summary: ListingSummaryRecord) {
  return (summary.evidence || []).slice(0, 5).map((item) => ({
    photo: item.listing_image_index,
    url: item.image_url,
    label: item.location_label,
    washer: item.contains_washing_machine,
    visibility: item.washing_machine_visibility,
    confidence: item.confidence,
    rationale: item.rationale,
  }));
}

function buildReport(summary: ListingSummaryRecord, extraction?: ListingExtractionRecord) {
  return {
    listing_url: summary.listing_url,
    provider: extraction?.provider,
    decision: summary.decision,
    confidence: summary.confidence,
    decision_source: summary.decision_source || "vision",
    vision_decision: summary.vision_decision,
    vision_confidence: summary.vision_confidence,
    gallery: {
      extracted: extraction?.image_count ?? summary.image_count,
      listed: extraction?.gallery_count,
      matches: extraction?.gallery_count_matches_extracted,
      source: extraction?.extraction_source,
    },
    metadata: {
      airbnb_laundry_amenity_label: summary.airbnb_laundry_amenity_label || extraction?.airbnb_laundry_amenity_label,
      airbnb_laundry_amenity_text: summary.airbnb_laundry_amenity_text || extraction?.airbnb_laundry_amenity_text,
      laundry_signals: extraction?.metadata_laundry_signals || summary.metadata_laundry_signals || [],
    },
    photo_evidence: evidenceItems(summary),
  };
}

function printTextReport(report: ReturnType<typeof buildReport>) {
  console.log(`${report.decision || "UNKNOWN"} ${report.confidence || "unknown"}`);
  console.log(`source: ${report.decision_source}`);
  if (report.vision_decision && report.decision_source !== "vision") {
    console.log(`vision: ${report.vision_decision} ${report.vision_confidence || ""}`.trim());
  }
  console.log(`provider: ${report.provider || "unknown"}`);
  console.log(`gallery: ${report.gallery.extracted ?? "?"}/${report.gallery.listed ?? "?"} photos ${report.gallery.source || ""}`.trim());

  const signals = report.metadata.laundry_signals || [];
  console.log("metadata:");
  if (report.metadata.airbnb_laundry_amenity_text) {
    console.log(`- airbnb_amenity: ${report.metadata.airbnb_laundry_amenity_text}`);
  }
  if (signals.length === 0 && !report.metadata.airbnb_laundry_amenity_text) {
    console.log("- none");
  }
  for (const signal of signals.slice(0, 6)) {
    console.log(`- ${signal.classification} ${signal.strength} (${signal.source}): ${signal.text}`);
  }

  console.log("photo evidence:");
  if (report.photo_evidence.length === 0) {
    console.log("- none");
  }
  for (const item of report.photo_evidence) {
    console.log(`- photo ${item.photo ?? "?"}: ${item.label || "UNKNOWN"} ${item.confidence ?? ""} ${item.url || ""}`.trim());
    if (item.rationale) console.log(`  ${item.rationale}`);
  }
}

const args = parseArgs(process.argv.slice(2));
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
}

const records = await runClassification(toClassificationArgs(args));
if (args.outPath) await appendJsonl(args.outPath, records);

const summary = findListingSummaryRecord(records);
if (!summary) throw new Error("No listing_summary record returned.");

const report = buildReport(summary, findListingExtractionRecord(records));
if (args.jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printTextReport(report);
}
