import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  DEFAULT_ESCALATION_MODEL,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MODEL_CALL_TIMEOUT_MS,
  DEFAULT_MODEL,
} from "@/cli/args";
import { DEFAULT_MAX_ESCALATION_IMAGES } from "@/listing/escalation";
import { deriveListingDetails } from "@/listing/details";
import { appendListingFeedback } from "@/feedback";
import { defaultSearchScanOptions, isInUnitWasherMatch } from "@/core";
import { formatInUnitReason } from "@/listing/output";

const SearchRequestSchema = z.object({
  mode: z.enum(["url", "filters"]),
  searchUrl: z.string().trim().optional(),
  provider: z.enum(["zonaprop", "argenprop", "airbnb"]).optional(),
  neighborhoods: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
  minPriceUsd: z.coerce.number().int().positive().optional(),
  maxPriceUsd: z.coerce.number().int().positive().optional(),
  ambientes: z.coerce.number().int().positive().optional(),
  minAmbientes: z.coerce.number().int().positive().optional(),
  maxAmbientes: z.coerce.number().int().positive().optional(),
  dormitorios: z.coerce.number().int().positive().optional(),
  minDormitorios: z.coerce.number().int().positive().optional(),
  maxDormitorios: z.coerce.number().int().positive().optional(),
  checkIn: z.string().trim().optional(),
  checkOut: z.string().trim().optional(),
  maxListings: z.coerce.number().int().positive().max(100).default(20),
  maxPages: z.coerce.number().int().positive().max(10).default(3),
  maxImages: z.coerce.number().int().positive().max(120).default(DEFAULT_MAX_IMAGES),
  maxEscalationImages: z.coerce.number().int().nonnegative().max(120).default(DEFAULT_MAX_ESCALATION_IMAGES),
  modelCallTimeoutMs: z.coerce.number().int().positive().max(300_000).default(DEFAULT_MODEL_CALL_TIMEOUT_MS),
  model: z.string().trim().default(DEFAULT_MODEL),
  escalationModel: z.string().trim().default(DEFAULT_ESCALATION_MODEL),
});

const ListingFeedbackSchema = z.object({
  listingUrl: z.string().url(),
  expectedLocation: z.enum(["IN_UNIT", "SHARED_BUILDING", "UNKNOWN", "CONFLICTING"]),
  predictedLocation: z.string().optional(),
  source: z.string().optional(),
  note: z.string().trim().optional(),
  item: z.unknown().optional(),
});

type SearchRequest = z.infer<typeof SearchRequestSchema>;

export type SearchUiItem = {
  listingUrl: string;
  failed: boolean;
  printed: boolean;
  decision?: string;
  confidence?: string;
  inUnitMatch: boolean;
  rejectionReason?: string;
  source?: string;
  amenity?: string;
  title?: string;
  description?: string;
  price?: string;
  priceAmountUsd?: number;
  neighborhood?: string;
  totalAreaM2?: number;
  coveredAreaM2?: number;
  ambientes?: number;
  dormitorios?: number;
  bathrooms?: number;
  ageYears?: number;
  propertyType?: string;
  condition?: string;
  disposition?: string;
  orientation?: string;
  luminosity?: string;
  features: string[];
  amenities: Array<{ group: string; items: string[] }>;
  expenses?: string;
  imageUrls: string[];
  imageCount?: number;
  galleryCount?: number | null;
  gallerySource?: string;
  extractionQuality?: {
    score: number;
    status: string;
  };
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
  matchCount: number;
  failedCount: number;
  items: SearchUiItem[];
};

export type SearchScanJob = {
  jobId: string;
  status: "running" | "completed" | "failed";
  createdAt: number;
  stage: string;
  startedListings: number;
  completedListings: number;
  totalListings: number;
  result?: SearchUiResult;
  error?: string;
};

const searchJobs = new Map<string, SearchScanJob>();
const JOB_TTL_MS = 1000 * 60 * 30;

export const runSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SearchRequestSchema.parse(input))
  .handler(async ({ data }): Promise<SearchUiResult> => {
    const { scanSearchUrl, searchUrl, warnings, ignored, scanOptions } = await prepareSearchScan(data);
    const result = await scanSearchUrl(searchUrl, scanOptions);

    return {
      provider: result.search.provider,
      searchUrl: result.search.search_url,
      pageUrls: result.search.page_urls,
      listingUrls: result.search.listing_urls,
      listingCount: result.search.listing_count,
      warnings: [...result.search.warnings, ...warnings],
      ignored,
      matchCount: result.matchCount,
      failedCount: result.failedCount,
      items: result.items.map(toUiItem),
    };
  });

export const startSearchScan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SearchRequestSchema.parse(input))
  .handler(async ({ data }): Promise<{ jobId: string }> => {
    const jobId = crypto.randomUUID();
    searchJobs.set(jobId, {
      jobId,
      status: "running",
      createdAt: Date.now(),
      stage: "Preparing search",
      startedListings: 0,
      completedListings: 0,
      totalListings: 0,
    });

    void runSearchJob(jobId, data);
    cleanupOldJobs();
    return { jobId };
  });

export const getSearchScanJob = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ jobId: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<SearchScanJob> => {
    const job = searchJobs.get(data.jobId);
    if (!job) throw new Error("Scan job not found.");
    return job;
  });

export const recordListingFeedback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ListingFeedbackSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await appendListingFeedback({
      listing_url: data.listingUrl,
      expected_location: data.expectedLocation,
      predicted_location: data.predictedLocation,
      source: data.source || "web",
      note: data.note,
      item: data.item,
    });
    return { ok: true };
  });

async function prepareSearchScan(data: SearchRequest) {
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
      minPriceUsd: data.minPriceUsd,
      maxPriceUsd: data.maxPriceUsd,
      ambientes: data.ambientes,
      minAmbientes: data.minAmbientes,
      maxAmbientes: data.maxAmbientes,
      dormitorios: data.dormitorios,
      minDormitorios: data.minDormitorios,
      maxDormitorios: data.maxDormitorios,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
    });
    searchUrl = built.url;
    warnings.push(...built.warnings);
    ignored.push(...built.ignored);
  }

  if (!searchUrl) throw new Error("Enter a search URL or filter set.");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for scans.");

  return {
    scanSearchUrl,
    searchUrl,
    warnings,
    ignored,
    scanOptions: defaultSearchScanOptions({
      model: data.model,
      escalationModel: data.escalationModel,
      maxImages: data.maxImages,
      maxEscalationImages: data.maxEscalationImages,
      modelCallTimeoutMs: data.modelCallTimeoutMs,
      maxListings: data.maxListings,
      maxPages: data.maxPages,
      includeAll: true,
    }),
  };
}

async function runSearchJob(jobId: string, data: SearchRequest): Promise<void> {
  try {
    const { scanSearchUrl, searchUrl, warnings, ignored, scanOptions } = await prepareSearchScan(data);
    const partialItems: SearchUiItem[] = [];
    const completedItems: SearchUiItem[] = [];
    const result = await scanSearchUrl(
      searchUrl,
      scanOptions,
      ({ index, total }) => {
        const job = searchJobs.get(jobId);
        if (!job) return;
        job.stage = "Scanning listings";
        job.startedListings = Math.max(job.startedListings, Math.min(index + 1, total));
        job.totalListings = total;
      },
      (item, index) => {
        const job = searchJobs.get(jobId);
        if (!job) return;
        partialItems[index] = toUiItem(item);
        completedItems.push(partialItems[index]);
        job.completedListings = partialItems.filter(Boolean).length;
        job.stage = job.completedListings === job.totalListings ? "Finalizing results" : "Scanning listings";
        job.result = {
          provider: job.result?.provider || "searching",
          searchUrl,
          pageUrls: job.result?.pageUrls || [],
          listingUrls: job.result?.listingUrls || [],
          listingCount: job.totalListings,
          warnings: job.result?.warnings || warnings,
          ignored,
          matchCount: partialItems.filter((partial) => partial?.inUnitMatch).length,
          failedCount: partialItems.filter((partial) => partial?.failed).length,
          items: completedItems,
        };
      },
    );

    searchJobs.set(jobId, {
      jobId,
      status: "completed",
      createdAt: searchJobs.get(jobId)?.createdAt || Date.now(),
      stage: "Completed",
      startedListings: result.search.listing_urls.length,
      completedListings: result.items.length,
      totalListings: result.search.listing_urls.length,
      result: {
        provider: result.search.provider,
        searchUrl: result.search.search_url,
        pageUrls: result.search.page_urls,
        listingUrls: result.search.listing_urls,
        listingCount: result.search.listing_count,
        warnings: [...result.search.warnings, ...warnings],
        ignored,
        matchCount: result.matchCount,
        failedCount: result.failedCount,
        items: result.items.map(toUiItem),
      },
    });
  } catch (error) {
    const job = searchJobs.get(jobId);
    searchJobs.set(jobId, {
      jobId,
      status: "failed",
      createdAt: job?.createdAt || Date.now(),
      stage: "Failed",
      startedListings: job?.startedListings || 0,
      completedListings: job?.completedListings || 0,
      totalListings: job?.totalListings || 0,
      result: job?.result,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function cleanupOldJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [jobId, job] of searchJobs) {
    if (job.createdAt < cutoff) searchJobs.delete(jobId);
  }
}

function toUiItem(item: Awaited<ReturnType<typeof import("@/core").scanSearchUrl>>["items"][number]): SearchUiItem {
  const summary = item.result?.summary || item.failure;
  const extraction = item.result?.extraction;
  const details = deriveListingDetails({
    listing_url: item.listingUrl,
    listing_title: extraction?.listing_title,
    listing_description: extraction?.listing_description,
    listing_price_text: extraction?.listing_price_text,
    listing_expenses_text: extraction?.listing_expenses_text,
    listing_neighborhood: extraction?.listing_neighborhood,
    listing_total_area_m2: extraction?.listing_total_area_m2,
    listing_covered_area_m2: extraction?.listing_covered_area_m2,
    listing_ambientes: extraction?.listing_ambientes,
    listing_dormitorios: extraction?.listing_dormitorios,
    listing_bathrooms: extraction?.listing_bathrooms,
    listing_age_years: extraction?.listing_age_years,
  });
  return {
    listingUrl: item.listingUrl,
    failed: item.failed,
    printed: item.printed,
    decision: summary?.decision,
    confidence: summary?.confidence,
    inUnitMatch: isInUnitWasherMatch(summary),
    rejectionReason: summary ? formatInUnitReason(summary) : undefined,
    source: summary?.decision_source,
    amenity: summary?.airbnb_laundry_amenity_text || extraction?.airbnb_laundry_amenity_text,
    title: extraction?.listing_title,
    description: extraction?.listing_description,
    price: details.listing_price_text,
    priceAmountUsd: parseUsdAmount(details.listing_price_text),
    expenses: details.listing_expenses_text,
    neighborhood: details.listing_neighborhood,
    totalAreaM2: details.listing_total_area_m2,
    coveredAreaM2: details.listing_covered_area_m2,
    ambientes: details.listing_ambientes,
    dormitorios: details.listing_dormitorios,
    bathrooms: details.listing_bathrooms,
    ageYears: details.listing_age_years,
    propertyType: extraction?.listing_property_type,
    condition: extraction?.listing_condition,
    disposition: extraction?.listing_disposition,
    orientation: extraction?.listing_orientation,
    luminosity: extraction?.listing_luminosity,
    features: extraction?.listing_features || [],
    amenities: extraction?.listing_amenities || [],
    imageUrls: extraction?.image_urls || [],
    imageCount: summary?.image_count ?? extraction?.image_count,
    galleryCount: extraction?.gallery_count,
    gallerySource: extraction?.extraction_source,
    extractionQuality: extraction?.extraction_quality && typeof extraction.extraction_quality === "object"
      ? {
        score: extraction.extraction_quality.score,
        status: extraction.extraction_quality.status,
      }
      : undefined,
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

function parseUsdAmount(priceText: string | undefined): number | undefined {
  if (!priceText || !/\b(?:USD|US\$|U\$S)\b/i.test(priceText)) return undefined;
  const numberText = priceText.match(/[\d.,]+/)?.[0];
  if (!numberText) return undefined;
  const normalized = numberText.includes(",") && numberText.includes(".")
    ? numberText.replace(/\./g, "").replace(",", ".")
    : numberText.replace(/,/g, "");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : undefined;
}
