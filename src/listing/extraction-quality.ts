import type { ExtractionQuality, ListingExtraction } from "../types";

function check(name: string, ok: boolean, message: string): ExtractionQuality["checks"][number] {
  return { name, ok, message };
}

export function scoreListingExtraction(extraction: ListingExtraction): ExtractionQuality {
  const checks: ExtractionQuality["checks"] = [];
  const provider = extraction.provider || "unknown";
  const minUsefulImages = provider === "unknown" ? 1 : 3;
  checks.push(check(
    "images_present",
    extraction.image_urls.length > 0,
    `${extraction.image_urls.length} image(s) extracted`,
  ));
  checks.push(check(
    "image_count_sufficient",
    extraction.image_urls.length >= minUsefulImages,
    `${extraction.image_urls.length}/${minUsefulImages} minimum useful images extracted`,
  ));
  checks.push(check(
    "gallery_match",
    extraction.gallery_count_matches_extracted !== false,
    extraction.gallery_count === null
      ? "gallery count unavailable"
      : `${extraction.image_urls.length}/${extraction.gallery_count} gallery images extracted`,
  ));
  if (provider === "zonaprop") {
    checks.push(check(
      "zonaprop_gallery_count_present",
      extraction.gallery_count !== null,
      extraction.gallery_count === null ? "missing Zonaprop gallery count" : `${extraction.gallery_count} gallery images listed`,
    ));
  }
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
  const criticalFailure = extraction.image_urls.length === 0 ||
    (provider === "zonaprop" && extraction.image_urls.length < minUsefulImages && extraction.gallery_count === null);
  return {
    score,
    status: criticalFailure ? "poor" : score >= 80 ? "good" : score >= 55 ? "warning" : "poor",
    checks,
  };
}
