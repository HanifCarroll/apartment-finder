import { appendJsonl } from "../lib/jsonl";
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
): Promise<SearchScanResult> {
  const searchResult = await findListingUrlsFromSearchUrl(searchUrl, options.maxListings, options.maxPages);
  const search: SearchScanRecord = {
    ok: true,
    type: "listing_search",
    created_at: new Date().toISOString(),
    ...searchResult,
  };
  if (options.outPath) await appendJsonl(options.outPath, [search]);

  if (options.discoverOnly) {
    return {
      search,
      items: [],
      matchCount: 0,
      printedCount: 0,
      failedCount: 0,
    };
  }

  const items: SearchScanItem[] = [];
  let matchCount = 0;
  let printedCount = 0;
  let failedCount = 0;

  for (let index = 0; index < search.listing_urls.length; index += 1) {
    const listingUrl = search.listing_urls[index];
    onProgress?.({ index, total: search.listing_urls.length, listingUrl });

    try {
      const result = await scanListing(listingUrl, options, options.outPath);
      const printed = shouldPrint(result.summary.decision, options.includeAll);
      if (printed) {
        matchCount += result.summary.decision === "IN_UNIT" ? 1 : 0;
        printedCount += 1;
      }
      items.push({ listingUrl, printed, failed: false, result });
    } catch (error) {
      failedCount += 1;
      const failure = await appendFailedListingScan(listingUrl, error, options.outPath);
      const printed = options.includeAll;
      if (printed) printedCount += 1;
      items.push({ listingUrl, printed, failed: true, failure });
    }
  }

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
