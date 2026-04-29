import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { appendJsonl } from "./lib/jsonl";
import type { ListingExtraction } from "./types";

export type CachedListingExtraction = ListingExtraction & {
  type?: "listing_photo_extraction_cache";
  normalized_listing_url?: string;
  cached_at?: string;
};

export function normalizeListingUrl(url: string): string {
  const parsed = new URL(url);
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

function parseJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export async function readCachedListingExtraction(
  cachePath: string,
  listingUrl: string,
): Promise<CachedListingExtraction | null> {
  const normalized = normalizeListingUrl(listingUrl);
  let text = "";

  try {
    text = await readFile(cachePath, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }

  let latest: CachedListingExtraction | null = null;
  for (const record of parseJsonl<CachedListingExtraction>(text)) {
    if (!record.listing_url || !record.image_urls?.length) continue;
    const recordUrl = record.normalized_listing_url || normalizeListingUrl(record.listing_url);
    if (recordUrl === normalized) latest = record;
  }

  if (!latest) return null;
  const { type: _type, normalized_listing_url: _normalizedListingUrl, ...extraction } = latest;
  return extraction;
}

export async function writeCachedListingExtraction(
  cachePath: string,
  extraction: ListingExtraction,
): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true }).catch(() => undefined);
  await appendJsonl(cachePath, [{
    type: "listing_photo_extraction_cache",
    cached_at: new Date().toISOString(),
    normalized_listing_url: normalizeListingUrl(extraction.listing_url),
    ...extraction,
  } satisfies CachedListingExtraction]);
}
