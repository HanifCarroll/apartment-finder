import { readFile } from "node:fs/promises";
import { DEFAULT_CACHE_DIR, DEFAULT_ESCALATION_MODEL, DEFAULT_EXTRACTION_CACHE, DEFAULT_MODEL } from "../src/args";
import { DEFAULT_CONCURRENCY } from "../src/concurrency";
import { mapConcurrent } from "../src/concurrency";
import OpenAI from "openai";
import { loadImageFromUrl } from "../src/images";
import { classifyWithModel } from "../src/openai-classifier";
import { aggregateByPolicy, DEFAULT_LISTING_POLICY, isStrongEvidence, listingConfidence, type ClassificationRecordLike } from "../src/listing-aggregation";
import { runClassification } from "../src/classifier-runner";
import { appendJsonl } from "../src/jsonl";
import type { Args, ImagePayload, LocationLabel, Verdict } from "../src/types";

type ListingFixture = {
  id: string;
  listing_url: string;
  expected_listing_location: LocationLabel;
};

type RunArgs = {
  fixturesPath: string;
  outPath: string;
  extractionResultsPath?: string;
  model: string;
  escalationModel: string;
  maxImages: number;
  concurrency: number;
  extractionCachePath: string;
  useExtractionCache: boolean;
  refreshExtraction: boolean;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run summary:listings [--fixtures fixtures/listings.jsonl] [--out results/listing-summary-run.jsonl]

Options:
  --fixtures <path>          Listing fixture JSONL path. Defaults to fixtures/listings.jsonl.
  --out <path>               Append summary-run JSONL records. Defaults to results/listing-summary-run.jsonl.
  --extractions <path>       Optional prior result JSONL containing listing_photo_extraction records.
  --model <model>            First-pass model. Defaults to ${DEFAULT_MODEL}.
  --escalation-model <model> Second-pass model. Defaults to ${DEFAULT_ESCALATION_MODEL}.
  --max-images <n>           Maximum photos per listing. Defaults to 35.
  --concurrency <n>          Concurrent model calls inside each listing. Defaults to ${DEFAULT_CONCURRENCY}.
  --extraction-cache <path>  Listing photo extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --refresh-extraction       Ignore cached listing extraction and write a fresh one.
  --no-extraction-cache      Disable listing extraction reads and writes.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): RunArgs {
  const args: RunArgs = {
    fixturesPath: "fixtures/listings.jsonl",
    outPath: "results/listing-summary-run.jsonl",
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    escalationModel: process.env.OPENAI_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL,
    maxImages: 35,
    concurrency: DEFAULT_CONCURRENCY,
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    useExtractionCache: true,
    refreshExtraction: false,
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
      case "--out":
        if (!next) usage();
        args.outPath = next;
        i += 1;
        break;
      case "--extractions":
        if (!next) usage();
        args.extractionResultsPath = next;
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

type ExtractionRecord = {
  type?: string;
  listing_url?: string;
  image_urls?: string[];
  image_count?: number;
  gallery_count?: number | null;
  gallery_count_matches_extracted?: boolean | null;
};

async function readExtractionCache(path?: string): Promise<Map<string, ExtractionRecord>> {
  const cache = new Map<string, ExtractionRecord>();
  if (!path) return cache;
  const records = parseJsonl<ExtractionRecord>(await readFile(path, "utf8"));
  for (const record of records) {
    if (record.type === "listing_photo_extraction" && record.listing_url && record.image_urls?.length) {
      cache.set(normalizeListingUrl(record.listing_url), record);
    }
  }
  return cache;
}

function imageRecord(
  image: ImagePayload,
  result: Awaited<ReturnType<typeof classifyWithModel>>,
  extra: Record<string, unknown>,
) {
  return {
    ok: true,
    created_at: new Date().toISOString(),
    ...extra,
    image: {
      source: image.source,
      cached_path: image.cachedPath,
      content_type: image.contentType,
      bytes: image.bytes,
    },
    ...result,
  };
}

function isEscalationCandidate(record: ClassificationRecordLike, firstPassAggregateLocation: string): boolean {
  const verdict = record.verdict as Verdict | undefined;
  if (!record.ok || !verdict) return false;

  if (firstPassAggregateLocation === "UNKNOWN") return true;
  if (verdict.location_label === "CONFLICTING") return true;
  if (verdict.contains_washing_machine && verdict.location_label === "UNKNOWN") return true;
  if (verdict.location_label === "IN_UNIT" && verdict.confidence < 0.95) return true;
  if (verdict.location_label === "IN_UNIT" && verdict.washing_machine_visibility !== "clear") return true;
  if (verdict.location_label === "SHARED_BUILDING" && !isStrongEvidence({
    location_label: verdict.location_label,
    contains_washing_machine: verdict.contains_washing_machine,
    washing_machine_visibility: verdict.washing_machine_visibility,
    confidence: verdict.confidence,
    rationale: verdict.rationale,
  }, "SHARED_BUILDING")) return true;

  return false;
}

async function runSummaryFromExtraction(
  listing: ListingFixture,
  extraction: ExtractionRecord,
  args: RunArgs,
): Promise<unknown[]> {
  const imageUrls = (extraction.image_urls || []).slice(0, args.maxImages);
  const client = new OpenAI();
  const records: unknown[] = [{
    ok: true,
    type: "listing_photo_extraction",
    created_at: new Date().toISOString(),
    listing_url: listing.listing_url,
    image_urls: imageUrls,
    image_count: imageUrls.length,
    gallery_count: extraction.gallery_count ?? null,
    gallery_count_matches_extracted: extraction.gallery_count_matches_extracted ?? null,
    source: "cached_extraction",
  }];

  const firstPassRecords = await mapConcurrent(imageUrls, args.concurrency, async (imageUrl, index): Promise<unknown> => {
    try {
      const image = await loadImageFromUrl(imageUrl, DEFAULT_CACHE_DIR);
      const result = await classifyWithModel(client, args.model, image, "auto");
      return imageRecord(image, result, {
        listing_url: listing.listing_url,
        listing_image_index: index,
      });
    } catch (error) {
      return {
        ok: false,
        created_at: new Date().toISOString(),
        listing_url: listing.listing_url,
        listing_image_index: index,
        model: args.model,
        image: { source: imageUrl },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  records.push(...firstPassRecords);

  const firstPassClassifications = firstPassRecords.filter((record): record is ClassificationRecordLike =>
    Boolean(record && typeof record === "object" && "verdict" in record),
  );
  const firstPassAggregate = aggregateByPolicy(DEFAULT_LISTING_POLICY, firstPassClassifications);
  const firstPassByIndex = new Map<number, ClassificationRecordLike>();
  for (const record of firstPassClassifications) {
    if (typeof record.listing_image_index === "number") firstPassByIndex.set(record.listing_image_index, record);
  }

  const escalationIndexes = imageUrls
    .map((_, index) => index)
    .filter((index) => {
      const record = firstPassByIndex.get(index);
      return record
        ? isEscalationCandidate(record, firstPassAggregate.predictedLocation)
        : firstPassAggregate.predictedLocation === "UNKNOWN";
    });

  const escalationRecords = await mapConcurrent(escalationIndexes, args.concurrency, async (index): Promise<unknown> => {
    const imageUrl = imageUrls[index];
    try {
      const image = await loadImageFromUrl(imageUrl, DEFAULT_CACHE_DIR);
      const result = await classifyWithModel(client, args.escalationModel, image, "auto");
      return imageRecord(image, result, {
        listing_url: listing.listing_url,
        listing_image_index: index,
        pass: "escalation",
        escalated_from_model: args.model,
      });
    } catch (error) {
      return {
        ok: false,
        created_at: new Date().toISOString(),
        listing_url: listing.listing_url,
        listing_image_index: index,
        pass: "escalation",
        model: args.escalationModel,
        image: { source: imageUrl },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  records.push(...escalationRecords);

  const finalRecords = [...firstPassClassifications, ...escalationRecords.filter((record): record is ClassificationRecordLike =>
    Boolean(record && typeof record === "object" && "verdict" in record),
  )];
  const finalAggregate = aggregateByPolicy(DEFAULT_LISTING_POLICY, finalRecords);
  records.push({
    ok: true,
    type: "listing_summary",
    created_at: new Date().toISOString(),
    listing_url: listing.listing_url,
    decision: finalAggregate.predictedLocation,
    confidence: listingConfidence(finalAggregate),
    policy: DEFAULT_LISTING_POLICY,
    first_pass_model: args.model,
    escalation_model: args.escalationModel,
    escalated_image_indexes: escalationIndexes,
    image_count: imageUrls.length,
    evidence: finalAggregate.evidence.slice(0, 8),
    source: "cached_extraction",
  });

  return records;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
  }

  const listings = parseJsonl<ListingFixture>(await readFile(args.fixturesPath, "utf8"));
  const extractionCache = await readExtractionCache(args.extractionResultsPath);

  for (const listing of listings) {
    console.log(`Summarizing ${listing.id} (${listing.expected_listing_location})`);
    const cachedExtraction = extractionCache.get(normalizeListingUrl(listing.listing_url));
    const classificationArgs: Args = {
      listingUrl: listing.listing_url,
      models: [args.model],
      cacheDir: DEFAULT_CACHE_DIR,
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

    const records = await (cachedExtraction
      ? runSummaryFromExtraction(listing, cachedExtraction, args)
      : runClassification(classificationArgs)
    ).catch((error) => [{
      ok: false,
      type: "listing_summary_run_failed",
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
