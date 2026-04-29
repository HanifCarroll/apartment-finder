import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_ESCALATION_MODEL,
  DEFAULT_EXTRACTION_CACHE,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MODEL,
} from "@/cli/args";
import { DEFAULT_CONCURRENCY } from "@/lib/concurrency";

const SearchRequestSchema = z.object({
  mode: z.enum(["url", "filters"]),
  searchUrl: z.string().trim().optional(),
  provider: z.enum(["zonaprop", "argenprop", "airbnb"]).optional(),
  neighborhoods: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
  maxPriceUsd: z.coerce.number().int().positive().optional(),
  ambientes: z.coerce.number().int().positive().optional(),
  dormitorios: z.coerce.number().int().positive().optional(),
  checkIn: z.string().trim().optional(),
  checkOut: z.string().trim().optional(),
  discoverOnly: z.boolean().default(true),
  includeAll: z.boolean().default(false),
  maxListings: z.coerce.number().int().positive().max(100).default(20),
  maxPages: z.coerce.number().int().positive().max(10).default(3),
  maxImages: z.coerce.number().int().positive().max(120).default(DEFAULT_MAX_IMAGES),
  model: z.string().trim().default(DEFAULT_MODEL),
  escalationModel: z.string().trim().default(DEFAULT_ESCALATION_MODEL),
});

type SearchRequest = z.infer<typeof SearchRequestSchema>;

export type SearchUiItem = {
  listingUrl: string;
  failed: boolean;
  printed: boolean;
  decision?: string;
  confidence?: string;
  source?: string;
  amenity?: string;
  imageCount?: number;
  galleryCount?: number | null;
  gallerySource?: string;
  evidence: Array<{
    photo?: number;
    label?: string;
    confidence?: number;
    imageUrl?: string;
    washer?: boolean;
  }>;
  error?: string;
};

export type SearchUiResult = {
  provider: string;
  searchUrl: string;
  pageUrls: string[];
  listingUrls: string[];
  listingCount: number;
  warnings: string[];
  ignored: string[];
  discoverOnly: boolean;
  matchCount: number;
  failedCount: number;
  items: SearchUiItem[];
};

export const runSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SearchRequestSchema.parse(input))
  .handler(async ({ data }): Promise<SearchUiResult> => {
    const { buildSearchUrl, parseNeighborhoodList, scanSearchUrl } = await import("@/core");

    let searchUrl = data.searchUrl?.trim() || "";
    const warnings: string[] = [];
    const ignored: string[] = [];

    if (data.mode === "filters") {
      if (!data.provider) throw new Error("Choose a provider.");
      const built = buildSearchUrl({
        provider: data.provider,
        neighborhoods: Array.isArray(data.neighborhoods)
          ? data.neighborhoods
          : parseNeighborhoodList([data.neighborhoods || ""]),
        maxPriceUsd: data.maxPriceUsd,
        ambientes: data.ambientes,
        dormitorios: data.dormitorios,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
      });
      searchUrl = built.url;
      warnings.push(...built.warnings);
      ignored.push(...built.ignored);
    }

    if (!searchUrl) throw new Error("Enter a search URL or filter set.");
    if (!data.discoverOnly && !process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for full scans.");
    }

    const result = await scanSearchUrl(searchUrl, {
      model: data.model,
      escalationModel: data.escalationModel,
      maxImages: data.maxImages,
      concurrency: DEFAULT_CONCURRENCY,
      cacheDir: DEFAULT_CACHE_DIR,
      extractionCachePath: DEFAULT_EXTRACTION_CACHE,
      useExtractionCache: true,
      refreshExtraction: false,
      maxListings: data.maxListings,
      maxPages: data.maxPages,
      includeAll: data.includeAll,
      discoverOnly: data.discoverOnly,
    });

    return {
      provider: result.search.provider,
      searchUrl: result.search.search_url,
      pageUrls: result.search.page_urls,
      listingUrls: result.search.listing_urls,
      listingCount: result.search.listing_count,
      warnings: [...result.search.warnings, ...warnings],
      ignored,
      discoverOnly: data.discoverOnly,
      matchCount: result.matchCount,
      failedCount: result.failedCount,
      items: result.items.map(toUiItem),
    };
  });

function toUiItem(item: Awaited<ReturnType<typeof import("@/core").scanSearchUrl>>["items"][number]): SearchUiItem {
  const summary = item.result?.summary || item.failure;
  const extraction = item.result?.extraction;
  return {
    listingUrl: item.listingUrl,
    failed: item.failed,
    printed: item.printed,
    decision: summary?.decision,
    confidence: summary?.confidence,
    source: summary?.decision_source,
    amenity: summary?.airbnb_laundry_amenity_text || extraction?.airbnb_laundry_amenity_text,
    imageCount: summary?.image_count ?? extraction?.image_count,
    galleryCount: extraction?.gallery_count,
    gallerySource: extraction?.extraction_source,
    evidence: (summary?.evidence || []).slice(0, 4).map((evidence) => ({
      photo: evidence.listing_image_index,
      label: evidence.location_label,
      confidence: evidence.confidence,
      imageUrl: evidence.image_url,
      washer: evidence.contains_washing_machine,
    })),
    error: summary?.error,
  };
}
