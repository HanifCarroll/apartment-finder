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
    .replace(/&#xB2;/gi, "²")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
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

export function classifyAirbnbDescriptionLaundrySignal(
  text: string,
): LaundryMetadataSignal | null {
  const cleaned = cleanMetadataText(text);
  const lower = cleaned.toLowerCase();
  if (!/\b(laundry|washer|washing machine)\b/.test(lower)) return null;
  if (/\blaundromat nearby\b/.test(lower)) return null;

  if (
    /\b(?:laundry|washer|washing machine)\s+(?:available\s+)?(?:in|inside|on)\s+(?:the\s+)?building\b/.test(lower) ||
    /\bbuilding\s+(?:laundry|washer|washing machine)\b/.test(lower) ||
    /\bshared\s+(?:laundry|washer|washing machine)\b/.test(lower) ||
    /\blaundry\s+room\s+(?:in|inside|on)\s+(?:the\s+)?building\b/.test(lower)
  ) {
    return {
      source: "airbnb_description",
      classification: "SHARED_BUILDING",
      strength: "strong",
      text: cleaned.match(/[^.?!]*(?:laundry|washer|washing machine)[^.?!]*/i)?.[0]?.trim() || cleaned,
    };
  }

  return null;
}
