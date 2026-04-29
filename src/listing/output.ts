import type { LocationLabel } from "../types";
import type { LaundryMetadataSignal } from "../types";
import type { ListingAmenityGroup } from "../types";

export type ListingSummaryRecord = {
  ok?: boolean;
  type?: string;
  created_at?: string;
  listing_url?: string;
  decision?: LocationLabel;
  confidence?: string;
  decision_source?: "vision" | "airbnb_amenity" | string;
  vision_decision?: LocationLabel;
  vision_confidence?: string;
  airbnb_laundry_amenity_label?: string;
  airbnb_laundry_amenity_text?: string;
  metadata_laundry_signals?: LaundryMetadataSignal[];
  policy?: string;
  image_count?: number;
  evidence?: Array<{
    listing_image_index?: number;
    image_url?: string;
    model?: string;
    location_label?: LocationLabel;
    contains_washing_machine?: boolean;
    washing_machine_visibility?: string;
    confidence?: number;
    rationale?: string;
  }>;
  error?: string;
};

export type ListingExtractionRecord = {
  ok?: boolean;
  type?: string;
  provider?: string;
  listing_title?: string;
  listing_description?: string;
  listing_price_text?: string;
  listing_expenses_text?: string;
  listing_neighborhood?: string;
  listing_total_area_m2?: number;
  listing_covered_area_m2?: number;
  listing_ambientes?: number;
  listing_dormitorios?: number;
  listing_bathrooms?: number;
  listing_age_years?: number;
  listing_property_type?: string;
  listing_condition?: string;
  listing_disposition?: string;
  listing_orientation?: string;
  listing_luminosity?: string;
  listing_features?: string[];
  listing_amenities?: ListingAmenityGroup[];
  listing_url?: string;
  image_urls?: string[];
  gallery_count?: number | null;
  image_count?: number;
  gallery_count_matches_extracted?: boolean | null;
  extraction_source?: string;
  airbnb_laundry_amenity_label?: string;
  airbnb_laundry_amenity_text?: string;
  metadata_laundry_signals?: LaundryMetadataSignal[];
};

export function findListingSummaryRecord(records: unknown[]): ListingSummaryRecord | undefined {
  return records.find((record): record is ListingSummaryRecord =>
    Boolean(record && typeof record === "object" && (record as { type?: string }).type === "listing_summary"),
  );
}

export function findListingExtractionRecord(records: unknown[]): ListingExtractionRecord | undefined {
  return records.find((record): record is ListingExtractionRecord =>
    Boolean(record && typeof record === "object" && (record as { type?: string }).type === "listing_photo_extraction"),
  );
}

function formatPhotoRefs(summary: ListingSummaryRecord): string {
  const refs = (summary.evidence || [])
    .filter((item) => item.contains_washing_machine)
    .slice(0, 3)
    .map((item) => {
      const index = typeof item.listing_image_index === "number" ? `photo ${item.listing_image_index}` : "photo ?";
      const confidence = typeof item.confidence === "number" ? ` ${item.confidence.toFixed(2)}` : "";
      return `${index}${confidence}`;
    });

  return refs.length ? refs.join(", ") : "none";
}

function bestEvidenceUrl(summary: ListingSummaryRecord): string {
  return summary.evidence?.find((item) => item.image_url)?.image_url || "";
}

function formatDecisionSource(summary: ListingSummaryRecord): string {
  if (summary.decision_source === "airbnb_amenity") {
    const text = summary.airbnb_laundry_amenity_text || summary.airbnb_laundry_amenity_label || "Airbnb washer amenity";
    const vision = summary.vision_decision ? `, vision ${summary.vision_decision}` : "";
    return `source: airbnb_amenity (${text}${vision})`;
  }

  return `source: ${summary.decision_source || "vision"}`;
}

function formatAmenity(summary: ListingSummaryRecord, extraction?: ListingExtractionRecord): string {
  return summary.airbnb_laundry_amenity_text
    || extraction?.airbnb_laundry_amenity_text
    || summary.airbnb_laundry_amenity_label
    || extraction?.airbnb_laundry_amenity_label
    || "";
}

export function formatListingSummaryText(
  summary: ListingSummaryRecord,
  extraction?: ListingExtractionRecord,
): string {
  if (!summary.ok) {
    return `ERROR ${summary.listing_url || ""}\nerror: ${summary.error || "unknown error"}`;
  }

  const gallery = extraction
    ? `${extraction.image_count ?? summary.image_count ?? "?"}/${extraction.gallery_count ?? "?"}`
    : `${summary.image_count ?? "?"}/?`;
  const provider = extraction?.provider ? ` ${extraction.provider}` : "";
  const source = extraction?.extraction_source ? ` ${extraction.extraction_source}` : "";
  const bestUrl = bestEvidenceUrl(summary);

  return [
    `${summary.decision || "UNKNOWN"} ${summary.confidence || "unknown"}`,
    formatDecisionSource(summary),
    `evidence: ${formatPhotoRefs(summary)}`,
    `gallery:${provider} ${gallery} photos${source}`,
    bestUrl ? `best_url: ${bestUrl}` : undefined,
  ].filter(Boolean).join("\n");
}

export function formatListingScanLine(
  summary: ListingSummaryRecord,
  extraction?: ListingExtractionRecord,
): string {
  if (!summary.ok) {
    return `ERROR\t${summary.listing_url || ""}\t${summary.error || "unknown error"}`;
  }

  const gallery = extraction
    ? `${extraction.image_count ?? summary.image_count ?? "?"}/${extraction.gallery_count ?? "?"}`
    : `${summary.image_count ?? "?"}/?`;
  const evidence = formatPhotoRefs(summary);
  const bestUrl = bestEvidenceUrl(summary);
  const amenity = formatAmenity(summary, extraction);

  return [
    summary.decision || "UNKNOWN",
    summary.confidence || "unknown",
    summary.decision_source || "vision",
    amenity,
    gallery,
    evidence,
    bestUrl,
    summary.listing_url || "",
  ].join("\t");
}
