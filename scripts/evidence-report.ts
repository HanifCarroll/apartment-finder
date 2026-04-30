#!/usr/bin/env bun
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_ESCALATION_MODEL,
  DEFAULT_EXTRACTION_CACHE,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MODEL,
  DEFAULT_MODEL_CACHE,
} from "../src/cli/args";
import { DEFAULT_CONCURRENCY } from "../src/lib/concurrency";
import {
  defaultCommonScanOptions,
  parseCommonScanOption,
  type CommonScanCliOptions,
} from "../src/cli/options";
import {
  type ListingExtractionRecord,
  type ListingSummaryRecord,
} from "../src/listing/output";
import { scanListing } from "../src/core";

type ReportArgs = CommonScanCliOptions & {
  listingUrl: string;
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
  --model-cache <path>      Model result cache path. Defaults to ${DEFAULT_MODEL_CACHE}.
  --refresh-model-cache     Ignore cached model results and write fresh model results.
  --no-model-cache          Disable model result cache reads and writes.
  --extraction-cache <path> Listing extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --refresh-extraction      Ignore cached listing extraction and write a fresh one.
  --no-extraction-cache     Disable listing extraction reads and writes.
  --json                    Print report JSON instead of text.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): ReportArgs {
  const args: ReportArgs = {
    ...defaultCommonScanOptions(),
    listingUrl: "",
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
      case "--listing-url":
        if (!next) usage();
        args.listingUrl = next;
        i += 1;
        break;
      default:
        usage();
    }
  }

  if (!args.listingUrl) usage();
  return args;
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

const { summary, extraction } = await scanListing(args.listingUrl, args, args.outPath);
const report = buildReport(summary, extraction);
if (args.jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printTextReport(report);
}
