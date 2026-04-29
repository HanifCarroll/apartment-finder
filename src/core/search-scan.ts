import { appendJsonl } from "../lib/jsonl";
import { DEFAULT_LISTING_CONCURRENCY, mapConcurrent } from "../lib/concurrency";
import { logger } from "../lib/logger";
import { findListingUrlsFromSearchUrl, type ListingSearchResult } from "../listing/search";
import type { LocationLabel } from "../types";
import {
  appendFailedListingScan,
  scanListing,
  type ListingScanOptions,
  type ListingScanResult,
} from "./listing-scan";

export type SearchScanOptions = ListingScanOptions & {
  maxListings: number;
  maxPages: number;
  includeAll: boolean;
  discoverOnly: boolean;
  listingConcurrency?: number;
  outPath?: string;
};

export type SearchScanRecord = {
  ok: true;
  type: "listing_search";
  created_at: string;
} & ListingSearchResult;

export type SearchScanItem = {
  listingUrl: string;
  printed: boolean;
  failed: boolean;
  result?: ListingScanResult;
  failure?: Awaited<ReturnType<typeof appendFailedListingScan>>;
};

export type SearchScanResult = {
  search: SearchScanRecord;
  items: SearchScanItem[];
  matchCount: number;
  printedCount: number;
  failedCount: number;
};

export async function scanSearchUrl(
  searchUrl: string,
  options: SearchScanOptions,
  onProgress?: (event: { index: number; total: number; listingUrl: string }) => void,
  onItem?: (item: SearchScanItem, index: number) => void,
): Promise<SearchScanResult> {
  const scanStartedAt = performance.now();
  const searchResult = await findListingUrlsFromSearchUrl(searchUrl, options.maxListings, options.maxPages);
  const search: SearchScanRecord = {
    ok: true,
    type: "listing_search",
    created_at: new Date().toISOString(),
    ...searchResult,
  };
  if (options.outPath) await appendJsonl(options.outPath, [search]);
  logger.info({
    event: "search_discovered",
    provider: search.provider,
    searchUrl,
    listings: search.listing_urls.length,
    pages: search.page_urls.length,
    maxListings: options.maxListings,
    maxPages: options.maxPages,
  });

  if (options.discoverOnly) {
    return {
      search,
      items: [],
      matchCount: 0,
      printedCount: 0,
      failedCount: 0,
    };
  }

  const listingConcurrency = Math.max(1, options.listingConcurrency ?? DEFAULT_LISTING_CONCURRENCY);
  const items = await mapConcurrent(search.listing_urls, listingConcurrency, async (listingUrl, index) => {
    const listingStartedAt = performance.now();
    onProgress?.({ index, total: search.listing_urls.length, listingUrl });
    logger.info({ event: "listing_scan_started", index, total: search.listing_urls.length, listingUrl });

    try {
      const result = await scanListing(listingUrl, options, options.outPath);
      const printed = shouldPrint(result.summary.decision, options.includeAll);
      const item: SearchScanItem = { listingUrl, printed, failed: false, result };
      logger.info({
        event: "listing_scan_finished",
        index,
        total: search.listing_urls.length,
        listingUrl,
        decision: result.summary.decision,
        confidence: result.summary.confidence,
        source: result.summary.decision_source,
        imageCount: result.extraction?.image_count,
        extractionSource: result.extraction?.extraction_source,
        durationMs: Math.round(performance.now() - listingStartedAt),
      });
      onItem?.(item, index);
      return item;
    } catch (error) {
      const failure = await appendFailedListingScan(listingUrl, error, options.outPath);
      const printed = options.includeAll;
      const item: SearchScanItem = { listingUrl, printed, failed: true, failure };
      logger.error({
        event: "listing_scan_failed",
        index,
        total: search.listing_urls.length,
        listingUrl,
        durationMs: Math.round(performance.now() - listingStartedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      onItem?.(item, index);
      return item;
    }
  });

  const matchCount = items.filter((item) => item.printed && item.result?.summary.decision === "IN_UNIT").length;
  const printedCount = items.filter((item) => item.printed).length;
  const failedCount = items.filter((item) => item.failed).length;

  logger.info({
    event: "search_scan_finished",
    provider: search.provider,
    searchUrl,
    listings: search.listing_urls.length,
    matches: matchCount,
    failed: failedCount,
    durationMs: Math.round(performance.now() - scanStartedAt),
  });

  return {
    search,
    items,
    matchCount,
    printedCount,
    failedCount,
  };
}

function shouldPrint(decision: LocationLabel | undefined, includeAll: boolean): boolean {
  return includeAll || decision === "IN_UNIT";
}
