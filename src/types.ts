import { z } from "zod";

export const LocationLabel = z.enum([
  "IN_UNIT",
  "SHARED_BUILDING",
  "UNKNOWN",
  "CONFLICTING",
]);

export const VerdictSchema = z.object({
  contains_washing_machine: z.boolean(),
  washing_machine_visibility: z.enum(["clear", "partial", "none", "unsure"]),
  location_label: LocationLabel,
  confidence: z.number(),
  in_unit_signals: z.array(z.string()),
  shared_space_signals: z.array(z.string()),
  visual_evidence: z.array(z.string()),
  rationale: z.string(),
  recommended_next_step: z.string(),
});

export type LocationLabel = z.infer<typeof LocationLabel>;
export type Verdict = z.infer<typeof VerdictSchema>;

export type Args = {
  imageUrl?: string;
  imagePath?: string;
  listingUrl?: string;
  models: string[];
  outPath?: string;
  cacheDir: string;
  extractionCachePath: string;
  useExtractionCache: boolean;
  refreshExtraction: boolean;
  detail: "low" | "high" | "auto";
  maxImages: number;
  concurrency: number;
  listingSummary: boolean;
  escalationModel: string;
  classifyAll: boolean;
  extractOnly: boolean;
  jsonOutput: boolean;
};

export type ImagePayload = {
  source: string;
  dataUrl: string;
  contentType: string;
  bytes: number;
  cachedPath?: string;
};

export type ListingExtraction = {
  listing_url: string;
  provider?: "zonaprop" | "argenprop" | "airbnb";
  listing_title?: string;
  listing_description?: string;
  airbnb_laundry_amenity_label?: "WASHER" | "WASHER_IN_UNIT" | "WASHER_IN_BUILDING" | "NONE";
  airbnb_laundry_amenity_text?: string;
  metadata_laundry_signals?: LaundryMetadataSignal[];
  session_id?: string;
  page_url: string;
  image_urls: string[];
  clicked_gallery: boolean;
  gallery_count: number | null;
  gallery_count_matches_extracted: boolean | null;
  gallery_text: string;
  extraction_source?: "live" | "cache" | "cache_after_live_failure";
  extraction_attempts?: number;
  extraction_error?: string;
  cached_at?: string;
};

export type PlaywriterListingPayload = Omit<
  ListingExtraction,
  "session_id" | "gallery_count_matches_extracted"
>;

export type LaundryMetadataSignal = {
  source: "airbnb_amenity";
  classification: "IN_UNIT" | "SHARED_BUILDING" | "WASHER_PRESENT" | "AMBIGUOUS";
  strength: "strong" | "medium" | "weak";
  text: string;
};
