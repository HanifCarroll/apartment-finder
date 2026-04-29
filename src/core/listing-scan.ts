import { runClassification } from "../classifier-runner";
import { appendJsonl } from "../lib/jsonl";
import {
  findListingExtractionRecord,
  findListingSummaryRecord,
  formatListingScanLine,
  type ListingExtractionRecord,
  type ListingSummaryRecord,
} from "../listing/output";
import type { Args } from "../types";

export type ListingScanOptions = {
  model: string;
  escalationModel: string;
  maxImages: number;
  concurrency: number;
  cacheDir: string;
  extractionCachePath: string;
  useExtractionCache: boolean;
  refreshExtraction: boolean;
};

export type ListingScanResult = {
  records: unknown[];
  summary: ListingSummaryRecord;
  extraction?: ListingExtractionRecord;
};

export function toListingSummaryArgs(listingUrl: string, options: ListingScanOptions): Args {
  return {
    listingUrl,
    models: [options.model],
    cacheDir: options.cacheDir,
    extractionCachePath: options.extractionCachePath,
    useExtractionCache: options.useExtractionCache,
    refreshExtraction: options.refreshExtraction,
    detail: "auto",
    maxImages: options.maxImages,
    concurrency: options.concurrency,
    listingSummary: true,
    escalationModel: options.escalationModel,
    classifyAll: true,
    extractOnly: false,
    jsonOutput: true,
  };
}

export async function scanListing(
  listingUrl: string,
  options: ListingScanOptions,
  outPath?: string,
): Promise<ListingScanResult> {
  const records = await runClassification(toListingSummaryArgs(listingUrl, options));
  if (outPath) await appendJsonl(outPath, records);

  const summary = findListingSummaryRecord(records);
  if (!summary) throw new Error("No listing_summary record returned.");

  return {
    records,
    summary,
    extraction: findListingExtractionRecord(records),
  };
}

export async function appendFailedListingScan(
  listingUrl: string,
  error: unknown,
  outPath?: string,
): Promise<ListingSummaryRecord> {
  const failed: ListingSummaryRecord = {
    ok: false,
    type: "listing_summary",
    created_at: new Date().toISOString(),
    listing_url: listingUrl,
    error: error instanceof Error ? error.message : String(error),
  };
  if (outPath) await appendJsonl(outPath, [failed]);
  return failed;
}

export function listingScanHeader(): string {
  return ["decision", "confidence", "source", "amenity", "gallery", "evidence", "best_url", "listing_url"].join("\t");
}

export function formatListingScanResult(
  summary: ListingSummaryRecord,
  extraction: ListingExtractionRecord | undefined,
  jsonOutput: boolean,
): string {
  return jsonOutput
    ? JSON.stringify({ ...summary, extraction })
    : formatListingScanLine(summary, extraction);
}
