import type { LaundryMetadataSignal } from "./types";

export function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;/g, "'")
    .replace(/&#xF1;/gi, "ñ")
    .replace(/&#xE1;/gi, "á")
    .replace(/&#xE9;/gi, "é")
    .replace(/&#xED;/gi, "í")
    .replace(/&#xF3;/gi, "ó")
    .replace(/&#xFA;/gi, "ú")
    .replace(/\\u0026/g, "&");
}

function cleanMetadataText(text: string): string {
  return decodeBasicHtmlEntities(text)
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyAirbnbLaundryAmenitySignal(
  text: string,
): LaundryMetadataSignal | null {
  const cleaned = cleanMetadataText(text);
  const lower = cleaned.toLowerCase();
  if (!lower.includes("washer")) return null;

  if (lower.includes("in building")) {
    return {
      source: "airbnb_amenity",
      classification: "SHARED_BUILDING",
      strength: "strong",
      text: cleaned,
    };
  }

  if (lower.includes("in unit")) {
    return {
      source: "airbnb_amenity",
      classification: "IN_UNIT",
      strength: "strong",
      text: cleaned,
    };
  }

  return {
    source: "airbnb_amenity",
    classification: "WASHER_PRESENT",
    strength: "weak",
    text: cleaned,
  };
}
