import { readFile } from "node:fs/promises";
import { DEFAULT_CACHE_DIR, DEFAULT_ESCALATION_MODEL, DEFAULT_EXTRACTION_CACHE, DEFAULT_MAX_IMAGES, DEFAULT_MODEL, DEFAULT_MODEL_CACHE, DEFAULT_MODEL_CALL_TIMEOUT_MS } from "../src/cli/args";
import { DEFAULT_CONCURRENCY, DEFAULT_LISTING_CONCURRENCY } from "../src/lib/concurrency";
import { mapConcurrent } from "../src/lib/concurrency";
import OpenAI from "openai";
import { loadImageFromPath, loadImageFromUrl } from "../src/lib/images";
import { classifyWithModel, modelRunOptionsFromArgs } from "../src/openai-classifier";
import {
  aggregateByPolicy,
  DEFAULT_LISTING_POLICY,
  isStrongEvidence,
  listingConfidence,
  type ClassificationRecordLike,
  type ListingAggregate,
} from "../src/listing/aggregation";
import { runClassification } from "../src/classifier-runner";
import { appendJsonl, writeJsonl } from "../src/lib/jsonl";
import {
  DEFAULT_ESCALATION_POLICY,
  DEFAULT_MAX_ESCALATION_IMAGES,
  selectEscalationIndexes,
} from "../src/listing/escalation";
import type { Args, ImagePayload, ListingExtraction, LocationLabel } from "../src/types";

type ListingFixture = {
  id: string;
  listing_url: string;
  expected_listing_location: LocationLabel;
};

type RunArgs = {
  fixturesPath: string;
  outPath: string;
  extractionResultsPath?: string;
  fixtureImagesPath?: string;
  model: string;
  escalationModel: string;
  maxImages: number;
  maxEscalationImages: number;
  modelCallTimeoutMs: number;
  concurrency: number;
  listingConcurrency: number;
  modelCachePath: string;
  extractionCachePath: string;
  useExtractionCache: boolean;
  useModelCache: boolean;
  refreshExtraction: boolean;
  refreshModelCache: boolean;
  shadowVerdictV2: boolean;
  append: boolean;
  runId: string;
};

class UsageExit extends Error {
  constructor(public readonly exitCode: number) {
    super("usage");
  }
}

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run summary:listings [--fixtures fixtures/listings.jsonl] [--out results/listing-summary-run.jsonl]

Options:
  --fixtures <path>          Listing fixture JSONL path. Defaults to fixtures/listings.jsonl.
  --out <path>               Write summary-run JSONL records. Defaults to results/listing-summary-run.jsonl.
  --extractions <path>       Optional prior result JSONL containing listing_photo_extraction records.
  --fixture-images <path>    Optional local fixture image manifest from fixtures:download-images.
  --model <model>            First-pass model. Defaults to ${DEFAULT_MODEL}.
  --escalation-model <model> Second-pass model. Defaults to ${DEFAULT_ESCALATION_MODEL}.
  --max-images <n>           Maximum photos per listing. Defaults to ${DEFAULT_MAX_IMAGES}.
  --max-escalation-images <n> Maximum photos to escalate per listing. Defaults to ${DEFAULT_MAX_ESCALATION_IMAGES}.
  --concurrency <n>          Concurrent model calls inside each listing. Defaults to ${DEFAULT_CONCURRENCY}.
  --listing-concurrency <n>  Concurrent fixture listings. Defaults to ${DEFAULT_LISTING_CONCURRENCY}.
  --extraction-cache <path>  Listing photo extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --model-cache <path>       Model result cache path. Defaults to ${DEFAULT_MODEL_CACHE}.
  --refresh-extraction       Ignore cached listing extraction and write a fresh one.
  --refresh-model-cache      Ignore cached model results and write fresh ones.
  --no-extraction-cache      Disable listing extraction reads and writes.
  --no-model-cache           Disable model result cache reads and writes.
  --append                   Append to --out instead of overwriting it.
  --run-id <id>              Run identifier stored on summary records. Defaults to a timestamped id.
`);
  throw new UsageExit(exitCode);
}

function parseArgs(argv: string[]): RunArgs {
  const args: RunArgs = {
    fixturesPath: "fixtures/listings.jsonl",
    outPath: "results/listing-summary-run.jsonl",
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    escalationModel: process.env.OPENAI_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL,
    maxImages: DEFAULT_MAX_IMAGES,
    maxEscalationImages: DEFAULT_MAX_ESCALATION_IMAGES,
    modelCallTimeoutMs: DEFAULT_MODEL_CALL_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    listingConcurrency: DEFAULT_LISTING_CONCURRENCY,
    modelCachePath: DEFAULT_MODEL_CACHE,
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    useExtractionCache: true,
    useModelCache: true,
    refreshExtraction: false,
    refreshModelCache: false,
    shadowVerdictV2: true,
    append: false,
    runId: `summary-${new Date().toISOString().replace(/[:.]/g, "-")}`,
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
      case "--fixture-images":
        if (!next) usage();
        args.fixtureImagesPath = next;
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
      case "--max-escalation-images": {
        if (!next) usage();
        const maxEscalationImages = Number.parseInt(next, 10);
        if (!Number.isInteger(maxEscalationImages) || maxEscalationImages < 0) usage();
        args.maxEscalationImages = maxEscalationImages;
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
      case "--listing-concurrency": {
        if (!next) usage();
        const listingConcurrency = Number.parseInt(next, 10);
        if (!Number.isInteger(listingConcurrency) || listingConcurrency < 1) usage();
        args.listingConcurrency = listingConcurrency;
        i += 1;
        break;
      }
      case "--extraction-cache":
        if (!next) usage();
        args.extractionCachePath = next;
        i += 1;
        break;
      case "--model-cache":
        if (!next) usage();
        args.modelCachePath = next;
        i += 1;
        break;
      case "--refresh-extraction":
        args.refreshExtraction = true;
        break;
      case "--refresh-model-cache":
        args.refreshModelCache = true;
        break;
      case "--no-extraction-cache":
        args.useExtractionCache = false;
        break;
      case "--no-model-cache":
        args.useModelCache = false;
        break;
      case "--append":
        args.append = true;
        break;
      case "--run-id":
        if (!next) usage();
        args.runId = next;
        i += 1;
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
  ok?: boolean;
  created_at?: string;
  listing_url?: string;
  image_urls?: string[];
  image_count?: number;
  gallery_count?: number | null;
  gallery_count_matches_extracted?: boolean | null;
  source?: string;
} & Partial<ListingExtraction>;

type FixtureImageRecord = {
  type?: string;
  ok?: boolean;
  fixture_id?: string;
  listing_url?: string;
  listing_image_index?: number;
  image_url?: string;
  local_path?: string;
};

type FixtureExtractionRecord = {
  type?: string;
  ok?: boolean;
  fixture_id?: string;
} & ExtractionRecord;

function isFixtureImageRecord(record: FixtureImageRecord | FixtureExtractionRecord): record is FixtureImageRecord {
  const maybeImage = record as FixtureImageRecord;
  return record.type === "fixture_listing_image" &&
    record.ok !== false &&
    Boolean(maybeImage.local_path) &&
    (Boolean(record.fixture_id) || Boolean(record.listing_url));
}

async function readExtractionCache(path?: string): Promise<Map<string, ExtractionRecord>> {
  const cache = new Map<string, ExtractionRecord>();
  if (!path) return cache;
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return cache;
    }
    throw error;
  }
  const records = parseJsonl<ExtractionRecord>(text);
  for (const record of records) {
    if (
      (
        record.type === "listing_photo_extraction" ||
        record.type === "listing_photo_extraction_cache" ||
        record.type === "fixture_listing_extraction"
      ) &&
      record.listing_url &&
      record.image_urls?.length
    ) {
      cache.set(normalizeListingUrl(record.listing_url), record);
    }
  }
  return cache;
}

async function readFixtureImageManifest(path?: string): Promise<{
  byId: Map<string, FixtureImageRecord[]>;
  byUrl: Map<string, FixtureImageRecord[]>;
  extractionsById: Map<string, FixtureExtractionRecord>;
  extractionsByUrl: Map<string, FixtureExtractionRecord>;
}> {
  const byId = new Map<string, FixtureImageRecord[]>();
  const byUrl = new Map<string, FixtureImageRecord[]>();
  const extractionsById = new Map<string, FixtureExtractionRecord>();
  const extractionsByUrl = new Map<string, FixtureExtractionRecord>();
  if (!path) return { byId, byUrl, extractionsById, extractionsByUrl };

  const allRecords = parseJsonl<FixtureImageRecord | FixtureExtractionRecord>(await readFile(path, "utf8"));
  for (const record of allRecords) {
    if (record.type !== "fixture_listing_extraction" || record.ok === false || !record.listing_url) continue;
    const extractionRecord = record as FixtureExtractionRecord;
    if (extractionRecord.fixture_id) {
      extractionsById.set(extractionRecord.fixture_id, extractionRecord);
    }
    extractionsByUrl.set(normalizeListingUrl(extractionRecord.listing_url!), extractionRecord);
  }

  const records = allRecords
    .filter(isFixtureImageRecord)
    .sort((a, b) => (a.listing_image_index ?? 0) - (b.listing_image_index ?? 0));

  for (const record of records) {
    if (record.fixture_id) {
      const existing = byId.get(record.fixture_id) || [];
      existing.push(record);
      byId.set(record.fixture_id, existing);
    }
    if (record.listing_url) {
      const key = normalizeListingUrl(record.listing_url);
      const existing = byUrl.get(key) || [];
      existing.push(record);
      byUrl.set(key, existing);
    }
  }

  return { byId, byUrl, extractionsById, extractionsByUrl };
}

function detectProvider(listingUrl: string): ListingExtraction["provider"] {
  const host = new URL(listingUrl).hostname;
  if (host.includes("zonaprop.com")) return "zonaprop";
  if (host.includes("argenprop.com")) return "argenprop";
  if (host.includes("airbnb.com")) return "airbnb";
  return undefined;
}

function buildSyntheticExtraction(
  listing: ListingFixture,
  imageUrls: string[],
  source: string,
  metadata?: ExtractionRecord,
): ExtractionRecord {
  return {
    ...metadata,
    ok: true,
    type: "listing_photo_extraction",
    created_at: new Date().toISOString(),
    listing_url: listing.listing_url,
    provider: metadata?.provider || detectProvider(listing.listing_url),
    page_url: metadata?.page_url || listing.listing_url,
    image_urls: imageUrls,
    image_count: imageUrls.length,
    gallery_count: metadata?.gallery_count ?? null,
    gallery_count_matches_extracted: metadata?.gallery_count_matches_extracted ?? null,
    clicked_gallery: metadata?.clicked_gallery ?? false,
    gallery_text: metadata?.gallery_text ?? "",
    extraction_source: "cache",
    source,
  };
}

function airbnbAmenityDecision(extraction: {
  provider?: string;
  airbnb_laundry_amenity_label?: string;
}): "IN_UNIT" | "SHARED_BUILDING" | null {
  if (extraction.provider !== "airbnb") return null;
  if (extraction.airbnb_laundry_amenity_label === "WASHER_IN_UNIT") return "IN_UNIT";
  if (extraction.airbnb_laundry_amenity_label === "WASHER_IN_BUILDING") return "SHARED_BUILDING";
  return null;
}

function listingWasherText(extraction: ExtractionRecord): string {
  const amenityText = (extraction.listing_amenities || [])
    .flatMap((group) => [group.group, ...group.items])
    .join(" ");
  return [
    extraction.listing_title,
    extraction.listing_description,
    extraction.listing_price_text,
    extraction.listing_expenses_text,
    extraction.listing_features?.join(" "),
    amenityText,
  ].filter(Boolean).join(" ");
}

function hasNonAirbnbWasherText(extraction: ExtractionRecord): boolean {
  if (extraction.provider === "airbnb") return false;
  const text = listingWasherText(extraction).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /\b(lavarropas?|lavasecarropas?|lavadero|lavanderia|laundry|washer|washing machine)\b/.test(text);
}

function textGuidedVisionDecision(aggregate: ListingAggregate, enabled: boolean): {
  decision: ListingAggregate["predictedLocation"];
  confidence: ReturnType<typeof listingConfidence>;
  source: "vision" | "text_guided_vision";
} {
  const confidence = listingConfidence(aggregate);
  if (!enabled) return { decision: aggregate.predictedLocation, confidence, source: "vision" };

  const strongInUnit = aggregate.evidence.filter((item) => isStrongEvidence(item, "IN_UNIT"));
  if (strongInUnit.length === 0) return { decision: aggregate.predictedLocation, confidence, source: "vision" };

  return {
    decision: "IN_UNIT",
    confidence: strongInUnit.some((item) => item.confidence >= 0.95) ? "high" : "medium",
    source: "text_guided_vision",
  };
}

function textGuidedModelOptions(args: RunArgs, enabled: boolean) {
  return {
    ...modelRunOptionsFromArgs(args),
    ...(enabled
      ? {
        promptContextKey: "non-airbnb-washer-text-v1",
        promptContext: "The listing text mentions a washer/lavarropas. The text is not a classification signal; inspect the photo carefully and classify only visible washer evidence.",
      }
      : {}),
  };
}

function listingSummaryRecord(
  listing: ListingFixture,
  extraction: ExtractionRecord,
  args: RunArgs,
  values: {
    decision: string;
    confidence: string;
    decisionSource: string;
    visionDecision?: string;
    visionConfidence?: string;
    textGuidedFullGallery?: boolean;
    classifiedImageCount?: number;
    classificationErrorCount?: number;
    incomplete?: boolean;
    escalatedImageIndexes?: number[];
    evidence?: ClassificationRecordLike[];
    source: string;
  },
) {
  return {
    ok: true,
    type: "listing_summary",
    created_at: new Date().toISOString(),
    listing_url: listing.listing_url,
    decision: values.decision,
    confidence: values.confidence,
    decision_source: values.decisionSource,
    vision_decision: values.visionDecision,
    vision_confidence: values.visionConfidence,
    text_guided_full_gallery: values.textGuidedFullGallery || undefined,
    classified_image_count: values.classifiedImageCount,
    classification_error_count: values.classificationErrorCount,
    incomplete: values.incomplete || undefined,
    airbnb_laundry_amenity_label: extraction.airbnb_laundry_amenity_label,
    airbnb_laundry_amenity_text: extraction.airbnb_laundry_amenity_text,
    metadata_laundry_signals: extraction.metadata_laundry_signals,
    policy: DEFAULT_LISTING_POLICY,
    run_id: args.runId,
    escalation_policy: DEFAULT_ESCALATION_POLICY,
    max_escalation_images: args.maxEscalationImages,
    first_pass_model: args.model,
    escalation_model: args.escalationModel,
    escalated_image_indexes: values.escalatedImageIndexes || [],
    image_count: extraction.image_urls?.length ?? 0,
    evidence: (values.evidence || []).slice(0, 8),
    source: values.source,
  };
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

async function loadFixtureImage(record: FixtureImageRecord): Promise<ImagePayload> {
  if (!record.local_path) throw new Error("fixture image local_path missing");
  const image = await loadImageFromPath(record.local_path);
  return {
    ...image,
    source: record.image_url || image.source,
    cachedPath: record.local_path,
  };
}

async function runSummaryFromFixtureImages(
  listing: ListingFixture,
  fixtureImages: FixtureImageRecord[],
  metadataExtraction: ExtractionRecord | undefined,
  args: RunArgs,
): Promise<unknown[]> {
  const images = fixtureImages.slice(0, args.maxImages);
  const client = new OpenAI();
  const imageUrls = images.map((image) => image.image_url || image.local_path || "");
  const extraction = buildSyntheticExtraction(listing, imageUrls, "fixture_images", metadataExtraction);
  const records: unknown[] = [extraction];

  const amenityDecision = airbnbAmenityDecision(extraction);
  if (amenityDecision) {
    records.push(listingSummaryRecord(listing, extraction, args, {
      decision: amenityDecision,
      confidence: "high",
      decisionSource: "airbnb_amenity",
      escalatedImageIndexes: [],
      evidence: [],
      source: "fixture_images",
    }));
    return records;
  }
  const textGuidedFullGallery = hasNonAirbnbWasherText(extraction);
  const modelOptions = textGuidedModelOptions(args, textGuidedFullGallery);

  const firstPassRecords = await mapConcurrent(images, args.concurrency, async (fixtureImage, index): Promise<unknown> => {
    try {
      const image = await loadFixtureImage(fixtureImage);
      const result = await classifyWithModel(client, args.model, image, "auto", modelOptions);
      return imageRecord(image, result, {
        listing_url: listing.listing_url,
        listing_image_index: fixtureImage.listing_image_index ?? index,
      });
    } catch (error) {
      return {
        ok: false,
        created_at: new Date().toISOString(),
        listing_url: listing.listing_url,
        listing_image_index: fixtureImage.listing_image_index ?? index,
        model: args.model,
        image: { source: fixtureImage.image_url || fixtureImage.local_path },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  records.push(...firstPassRecords);

  const firstPassClassifications = firstPassRecords.filter((record): record is ClassificationRecordLike =>
    Boolean(record && typeof record === "object" && "verdict" in record),
  );
  const firstPassAggregate = aggregateByPolicy(DEFAULT_LISTING_POLICY, firstPassClassifications);
  const escalationIndexes = selectEscalationIndexes(firstPassClassifications, firstPassAggregate, {
    maxImages: args.maxEscalationImages,
    broadGate: process.env.APARTMENT_FINDER_ESCALATION_GATE === "broad",
  });
  const fixtureImageByListingIndex = new Map<number, { fixtureImage: FixtureImageRecord; fallbackIndex: number }>();
  images.forEach((fixtureImage, index) => {
    fixtureImageByListingIndex.set(fixtureImage.listing_image_index ?? index, { fixtureImage, fallbackIndex: index });
  });

  const escalationRecords = await mapConcurrent(escalationIndexes, args.concurrency, async (recordIndex): Promise<unknown> => {
    const match = fixtureImageByListingIndex.get(recordIndex);
    if (!match) {
      return {
        ok: false,
        created_at: new Date().toISOString(),
        listing_url: listing.listing_url,
        listing_image_index: recordIndex,
        pass: "escalation",
        model: args.escalationModel,
        error: "fixture image missing for escalation index",
      };
    }
    const { fixtureImage, fallbackIndex } = match;
    try {
      const image = await loadFixtureImage(fixtureImage);
      const result = await classifyWithModel(client, args.escalationModel, image, "auto", modelOptions);
      return imageRecord(image, result, {
        listing_url: listing.listing_url,
        listing_image_index: fixtureImage.listing_image_index ?? fallbackIndex,
        pass: "escalation",
        escalated_from_model: args.model,
      });
    } catch (error) {
      return {
        ok: false,
        created_at: new Date().toISOString(),
        listing_url: listing.listing_url,
        listing_image_index: fixtureImage.listing_image_index ?? fallbackIndex,
        pass: "escalation",
        model: args.escalationModel,
        image: { source: fixtureImage.image_url || fixtureImage.local_path },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  records.push(...escalationRecords);

  const finalRecords = [...firstPassClassifications, ...escalationRecords.filter((record): record is ClassificationRecordLike =>
    Boolean(record && typeof record === "object" && "verdict" in record),
  )];
  const finalAggregate = aggregateByPolicy(DEFAULT_LISTING_POLICY, finalRecords);
  const finalConfidence = listingConfidence(finalAggregate);
  const classifiedImageCount = new Set(finalRecords.map((record) => record.listing_image_index).filter((index) => index !== undefined)).size;
  const classificationErrorCount = records.filter((record) =>
    Boolean(record && typeof record === "object" && "error" in record && (record as { listing_image_index?: number }).listing_image_index !== undefined)
  ).length;
  const incomplete = classificationErrorCount > 0 || classifiedImageCount < images.length;
  const guidedDecision = textGuidedVisionDecision(finalAggregate, textGuidedFullGallery);
  const outputDecision = incomplete && finalAggregate.evidence.length === 0
    ? { decision: finalAggregate.predictedLocation, confidence: "low" as const, source: "vision_incomplete" as const }
    : guidedDecision;
  records.push(listingSummaryRecord(listing, extraction, args, {
    decision: outputDecision.decision,
    confidence: outputDecision.confidence,
    decisionSource: outputDecision.source,
    visionDecision: finalAggregate.predictedLocation,
    visionConfidence: finalConfidence,
    textGuidedFullGallery,
    classifiedImageCount,
    classificationErrorCount,
    incomplete,
    escalatedImageIndexes: escalationIndexes,
    evidence: finalAggregate.evidence.slice(0, 8),
    source: "fixture_images",
  }));

  return records;
}

async function runSummaryFromExtraction(
  listing: ListingFixture,
  extraction: ExtractionRecord,
  args: RunArgs,
): Promise<unknown[]> {
  const imageUrls = (extraction.image_urls || []).slice(0, args.maxImages);
  const client = new OpenAI();
  const syntheticExtraction = buildSyntheticExtraction(listing, imageUrls, "cached_extraction", extraction);
  const records: unknown[] = [syntheticExtraction];

  const amenityDecision = airbnbAmenityDecision(syntheticExtraction);
  if (amenityDecision) {
    records.push(listingSummaryRecord(listing, syntheticExtraction, args, {
      decision: amenityDecision,
      confidence: "high",
      decisionSource: "airbnb_amenity",
      escalatedImageIndexes: [],
      evidence: [],
      source: "cached_extraction",
    }));
    return records;
  }
  const textGuidedFullGallery = hasNonAirbnbWasherText(syntheticExtraction);
  const modelOptions = textGuidedModelOptions(args, textGuidedFullGallery);

  const firstPassRecords = await mapConcurrent(imageUrls, args.concurrency, async (imageUrl, index): Promise<unknown> => {
    try {
      const image = await loadImageFromUrl(imageUrl, DEFAULT_CACHE_DIR);
      const result = await classifyWithModel(client, args.model, image, "auto", modelOptions);
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
  const escalationIndexes = selectEscalationIndexes(firstPassClassifications, firstPassAggregate, {
    maxImages: args.maxEscalationImages,
    broadGate: process.env.APARTMENT_FINDER_ESCALATION_GATE === "broad",
  });

  const escalationRecords = await mapConcurrent(escalationIndexes, args.concurrency, async (index): Promise<unknown> => {
    const imageUrl = imageUrls[index];
    try {
      const image = await loadImageFromUrl(imageUrl, DEFAULT_CACHE_DIR);
      const result = await classifyWithModel(client, args.escalationModel, image, "auto", modelOptions);
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
  const finalConfidence = listingConfidence(finalAggregate);
  const classifiedImageCount = new Set(finalRecords.map((record) => record.listing_image_index).filter((index) => index !== undefined)).size;
  const classificationErrorCount = records.filter((record) =>
    Boolean(record && typeof record === "object" && "error" in record && (record as { listing_image_index?: number }).listing_image_index !== undefined)
  ).length;
  const incomplete = classificationErrorCount > 0 || classifiedImageCount < imageUrls.length;
  const guidedDecision = textGuidedVisionDecision(finalAggregate, textGuidedFullGallery);
  const outputDecision = incomplete && finalAggregate.evidence.length === 0
    ? { decision: finalAggregate.predictedLocation, confidence: "low" as const, source: "vision_incomplete" as const }
    : guidedDecision;
  records.push(listingSummaryRecord(listing, syntheticExtraction, args, {
    decision: outputDecision.decision,
    confidence: outputDecision.confidence,
    decisionSource: outputDecision.source,
    visionDecision: finalAggregate.predictedLocation,
    visionConfidence: finalConfidence,
    textGuidedFullGallery,
    classifiedImageCount,
    classificationErrorCount,
    incomplete,
    escalatedImageIndexes: escalationIndexes,
    evidence: finalAggregate.evidence.slice(0, 8),
    source: "cached_extraction",
  }));

  return records;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
  }

  const listings = parseJsonl<ListingFixture>(await readFile(args.fixturesPath, "utf8"));
  const extractionResultsCache = await readExtractionCache(args.extractionResultsPath);
  const defaultExtractionCache = args.useExtractionCache
    ? await readExtractionCache(args.extractionCachePath)
    : new Map<string, ExtractionRecord>();
  const fixtureImages = await readFixtureImageManifest(args.fixtureImagesPath);

  const listingRecords = await mapConcurrent(listings, args.listingConcurrency, async (listing) => {
    console.log(`Summarizing ${listing.id} (${listing.expected_listing_location})`);
    const cacheKey = normalizeListingUrl(listing.listing_url);
    const cachedExtraction =
      fixtureImages.extractionsById.get(listing.id) ||
      fixtureImages.extractionsByUrl.get(cacheKey) ||
      extractionResultsCache.get(cacheKey) ||
      defaultExtractionCache.get(cacheKey);
    const fixtureImageRecords =
      fixtureImages.byId.get(listing.id) ||
      fixtureImages.byUrl.get(cacheKey);
    const classificationArgs: Args = {
      listingUrl: listing.listing_url,
      models: [args.model],
      cacheDir: DEFAULT_CACHE_DIR,
      modelCachePath: args.modelCachePath,
      extractionCachePath: args.extractionCachePath,
      useExtractionCache: args.useExtractionCache,
      useModelCache: args.useModelCache,
      refreshExtraction: args.refreshExtraction,
      refreshModelCache: args.refreshModelCache,
      shadowVerdictV2: args.shadowVerdictV2,
      detail: "auto",
      maxImages: args.maxImages,
      maxEscalationImages: args.maxEscalationImages,
      modelCallTimeoutMs: args.modelCallTimeoutMs,
      concurrency: args.concurrency,
      listingSummary: true,
      escalationModel: args.escalationModel,
      classifyAll: true,
      stagedClassification: false,
      extractOnly: false,
      jsonOutput: true,
      runId: args.runId,
    };

    return await (fixtureImageRecords?.length
      ? runSummaryFromFixtureImages(listing, fixtureImageRecords, cachedExtraction, args)
      : cachedExtraction
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
  });

  const flatRecords = listingRecords.flat();
  if (args.append) {
    await appendJsonl(args.outPath, flatRecords);
  } else {
    await writeJsonl(args.outPath, flatRecords);
  }

  console.log(`${args.append ? "Appended" : "Wrote"} ${args.outPath}`);
  console.log(`run_id: ${args.runId}`);
  console.log(`escalation_policy: ${DEFAULT_ESCALATION_POLICY}`);
  console.log(`max_escalation_images: ${args.maxEscalationImages}`);
}

try {
  await main();
} catch (error) {
  if (error instanceof UsageExit) {
    process.exitCode = error.exitCode;
  } else {
    throw error;
  }
}
