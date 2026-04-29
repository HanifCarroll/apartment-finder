import type { LocationLabel } from "./types";

export type ListingSummaryRecord = {
  ok?: boolean;
  type?: string;
  listing_url?: string;
  decision?: LocationLabel;
  confidence?: string;
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
  listing_url?: string;
  gallery_count?: number | null;
  image_count?: number;
  gallery_count_matches_extracted?: boolean | null;
  extraction_source?: string;
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

  return [
    summary.decision || "UNKNOWN",
    summary.confidence || "unknown",
    gallery,
    evidence,
    bestUrl,
    summary.listing_url || "",
  ].join("\t");
}
