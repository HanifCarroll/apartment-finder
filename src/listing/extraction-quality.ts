import type { ExtractionQuality, ListingExtraction } from "../types";

function check(name: string, ok: boolean, message: string): ExtractionQuality["checks"][number] {
  return { name, ok, message };
}

export function scoreListingExtraction(extraction: ListingExtraction): ExtractionQuality {
  const checks: ExtractionQuality["checks"] = [];
  checks.push(check(
    "images_present",
    extraction.image_urls.length > 0,
    `${extraction.image_urls.length} image(s) extracted`,
  ));
  checks.push(check(
    "gallery_match",
    extraction.gallery_count_matches_extracted !== false,
    extraction.gallery_count === null
      ? "gallery count unavailable"
      : `${extraction.image_urls.length}/${extraction.gallery_count} gallery images extracted`,
  ));
  checks.push(check(
    "title_present",
    Boolean(extraction.listing_title?.trim()),
    extraction.listing_title ? "title extracted" : "missing title",
  ));
  checks.push(check(
    "description_present",
    Boolean(extraction.listing_description?.trim()),
    extraction.listing_description ? "description extracted" : "missing description",
  ));
  checks.push(check(
    "price_present",
    Boolean(extraction.listing_price_text?.trim()),
    extraction.listing_price_text ? "price extracted" : "missing price",
  ));

  const provider = extraction.provider || "unknown";
  if (provider === "airbnb") {
    checks.push(check(
      "airbnb_laundry_metadata_present",
      Boolean(extraction.airbnb_laundry_amenity_label),
      extraction.airbnb_laundry_amenity_text || extraction.airbnb_laundry_amenity_label || "missing Airbnb laundry metadata",
    ));
  } else {
    checks.push(check(
      "features_present",
      Boolean(extraction.listing_features?.length),
      extraction.listing_features?.length ? `${extraction.listing_features.length} feature(s) extracted` : "missing property features",
    ));
  }

  const score = Math.round((checks.filter((item) => item.ok).length / checks.length) * 100);
  return {
    score,
    status: score >= 80 ? "good" : score >= 55 ? "warning" : "poor",
    checks,
  };
}
