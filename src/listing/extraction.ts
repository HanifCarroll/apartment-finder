import { extractAirbnbListingImageUrls } from "../providers/airbnb";
import { extractArgenpropListingImageUrls } from "../providers/argenprop";
import {
  readCachedListingExtraction,
  writeCachedListingExtraction,
} from "../extraction-cache";
import { logger } from "../lib/logger";
import type { Args, ListingExtraction } from "../types";
import { extractListingImageUrlsWithPlaywriter } from "../providers/zonaprop";
import { scoreListingExtraction } from "./extraction-quality";

const MAX_EXTRACTION_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectProvider(listingUrl: string): "zonaprop" | "argenprop" | "airbnb" {
  const host = new URL(listingUrl).hostname;
  if (host.includes("zonaprop.com")) return "zonaprop";
  if (host.includes("argenprop.com")) return "argenprop";
  if (host.includes("airbnb.com")) return "airbnb";
  throw new Error(`Unsupported listing provider: ${host}`);
}

async function extractLiveListingImageUrls(
  listingUrl: string,
  maxImages: number,
): Promise<ListingExtraction> {
  const provider = detectProvider(listingUrl);

  if (provider === "argenprop") {
    return extractArgenpropListingImageUrls(listingUrl, maxImages);
  }

  if (provider === "airbnb") {
    return extractAirbnbListingImageUrls(listingUrl, maxImages);
  }

  return {
    provider,
    ...await extractListingImageUrlsWithPlaywriter(listingUrl, maxImages),
  };
}

function withExtractionMetadata(
  extraction: ListingExtraction,
  metadata: Pick<ListingExtraction, "extraction_source" | "extraction_attempts" | "extraction_error">,
): ListingExtraction {
  const withMetadata = {
    ...extraction,
    ...metadata,
  };
  return {
    ...withMetadata,
    extraction_quality: scoreListingExtraction(withMetadata),
  };
}

function limitExtractionImages(extraction: ListingExtraction, maxImages: number): ListingExtraction {
  const imageUrls = extraction.image_urls.slice(0, maxImages);
  return {
    ...extraction,
    image_urls: imageUrls,
    gallery_count_matches_extracted:
      extraction.gallery_count === null ? null : extraction.gallery_count === imageUrls.length,
  };
}

function isUsableCachedExtraction(extraction: ListingExtraction): boolean {
  return extraction.image_urls.length > 0 &&
    Boolean(extraction.listing_title?.trim() || extraction.listing_description?.trim() || extraction.listing_price_text?.trim());
}

export async function extractListingImageUrls(
  listingUrl: string,
  args: Pick<
    Args,
    "maxImages" | "useExtractionCache" | "refreshExtraction" | "extractionCachePath"
  >,
): Promise<ListingExtraction> {
  const provider = detectProvider(listingUrl);
  const cached = args.useExtractionCache
    ? await readCachedListingExtraction(args.extractionCachePath, listingUrl)
    : null;

  if (cached && !args.refreshExtraction && isUsableCachedExtraction(cached)) {
    const startedAt = performance.now();
    const extraction = withExtractionMetadata(limitExtractionImages(cached, args.maxImages), {
      extraction_source: "cache",
      extraction_attempts: 0,
    });
    logger.info({
      event: "listing_extraction_cache_hit",
      provider,
      listingUrl,
      imageCount: extraction.image_urls.length,
      galleryCount: extraction.gallery_count,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return extraction;
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt += 1) {
    const attemptStartedAt = performance.now();
    logger.info({
      event: "listing_extraction_live_started",
      provider,
      listingUrl,
      attempt,
      maxImages: args.maxImages,
      hadCache: Boolean(cached),
    });
    try {
      const extraction = withExtractionMetadata(
        await extractLiveListingImageUrls(listingUrl, args.maxImages),
        {
          extraction_source: "live",
          extraction_attempts: attempt,
        },
      );
      if (args.useExtractionCache && extraction.image_urls.length > 0) {
        await writeCachedListingExtraction(args.extractionCachePath, extraction);
      }
      logger.info({
        event: "listing_extraction_live_finished",
        provider,
        listingUrl,
        attempt,
        imageCount: extraction.image_urls.length,
        galleryCount: extraction.gallery_count,
        durationMs: Math.round(performance.now() - attemptStartedAt),
      });
      return extraction;
    } catch (error) {
      lastError = error;
      logger.warn({
        event: "listing_extraction_live_failed",
        provider,
        listingUrl,
        attempt,
        durationMs: Math.round(performance.now() - attemptStartedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < MAX_EXTRACTION_ATTEMPTS) await delay(750 * attempt);
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  if (cached) {
    const extraction = withExtractionMetadata(limitExtractionImages(cached, args.maxImages), {
      extraction_source: "cache_after_live_failure",
      extraction_attempts: MAX_EXTRACTION_ATTEMPTS,
      extraction_error: errorMessage,
    });
    logger.warn({
      event: "listing_extraction_cache_after_live_failure",
      provider,
      listingUrl,
      attempts: MAX_EXTRACTION_ATTEMPTS,
      imageCount: extraction.image_urls.length,
      galleryCount: extraction.gallery_count,
      error: errorMessage,
    });
    return extraction;
  }

  throw new Error(`Listing extraction failed after ${MAX_EXTRACTION_ATTEMPTS} attempts: ${errorMessage}`);
}
