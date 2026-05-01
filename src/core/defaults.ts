import { DEFAULT_CONCURRENCY, DEFAULT_LISTING_CONCURRENCY } from "../lib/concurrency";
import { DEFAULT_MAX_ESCALATION_IMAGES } from "../listing/escalation";
import type { ListingScanOptions } from "./listing-scan";
import type { SearchScanOptions } from "./search-scan";

export const DEFAULT_MODEL = "gpt-5.4-mini";
export const DEFAULT_ESCALATION_MODEL = "gpt-5.4";
export const DEFAULT_CACHE_DIR = ".apartment-laundry-cache";
export const DEFAULT_EXTRACTION_CACHE = `${DEFAULT_CACHE_DIR}/extractions.jsonl`;
export const DEFAULT_MODEL_CACHE = `${DEFAULT_CACHE_DIR}/model-results.jsonl`;
export const DEFAULT_MAX_IMAGES = 60;
export const DEFAULT_STAGED_CLASSIFICATION = true;
export const DEFAULT_MODEL_CALL_TIMEOUT_MS = 45_000;

export function defaultListingScanOptions(
  overrides: Partial<ListingScanOptions> = {},
): ListingScanOptions {
  return {
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    escalationModel: process.env.OPENAI_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL,
    maxImages: DEFAULT_MAX_IMAGES,
    maxEscalationImages: DEFAULT_MAX_ESCALATION_IMAGES,
    modelCallTimeoutMs: Number.parseInt(process.env.OPENAI_MODEL_CALL_TIMEOUT_MS || "", 10) || DEFAULT_MODEL_CALL_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    cacheDir: DEFAULT_CACHE_DIR,
    modelCachePath: DEFAULT_MODEL_CACHE,
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    useExtractionCache: true,
    useModelCache: true,
    refreshExtraction: false,
    refreshModelCache: false,
    shadowVerdictV2: true,
    stagedClassification: DEFAULT_STAGED_CLASSIFICATION,
    ...overrides,
  };
}

export function defaultSearchScanOptions(
  overrides: Partial<SearchScanOptions> & Pick<SearchScanOptions, "maxListings" | "maxPages">,
): SearchScanOptions {
  return {
    ...defaultListingScanOptions(overrides),
    maxListings: overrides.maxListings,
    maxPages: overrides.maxPages,
    includeAll: overrides.includeAll ?? false,
    discoverOnly: overrides.discoverOnly ?? false,
    listingConcurrency: overrides.listingConcurrency ?? DEFAULT_LISTING_CONCURRENCY,
    outPath: overrides.outPath,
  };
}
