import type { ListingExtraction } from "../types";

export type ListingDetails = Pick<
  ListingExtraction,
  | "listing_price_text"
  | "listing_expenses_text"
  | "listing_neighborhood"
  | "listing_total_area_m2"
  | "listing_covered_area_m2"
  | "listing_ambientes"
  | "listing_dormitorios"
  | "listing_bathrooms"
  | "listing_age_years"
>;

const NEIGHBORHOOD_LABELS: Array<[RegExp, string]> = [
  [/\bnu[nñ]ez\b/i, "Nuñez"],
  [/\blas ca[nñ]itas\b/i, "Las Cañitas"],
  [/\bbelgrano\b/i, "Belgrano"],
  [/\bpalermo\b/i, "Palermo"],
  [/\bcolegiales\b/i, "Colegiales"],
  [/\brecoleta\b/i, "Recoleta"],
  [/\bbarrio norte\b/i, "Barrio Norte"],
  [/\bcaballito\b/i, "Caballito"],
  [/\bpuerto madero\b/i, "Puerto Madero"],
  [/\bsan telmo\b/i, "San Telmo"],
  [/\balmagro\b/i, "Almagro"],
  [/\bagronom[ií]a\b/i, "Agronomía"],
  [/\bbalvanera\b/i, "Balvanera"],
  [/\bbarracas\b/i, "Barracas"],
];

function normalizeUrlText(url: string): string {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ");
  } catch {
    return url.replace(/[-_]+/g, " ");
  }
}

function parsePriceText(text: string): string | undefined {
  const match = text.match(/\b(?:USD|US\$|U\$S)\s*([\d.,]+)/i);
  if (!match) return undefined;
  return `USD ${match[1].replace(/\.$/, "")}`;
}

function parseExpensesText(text: string): string | undefined {
  const match = text.match(/\b(?:expensas?|gastos)\D{0,30}((?:USD|US\$|U\$S|\$)\s*[\d.,]+)/i);
  if (!match) return undefined;
  const amount = match[1].replace(/^US\$|^U\$S/i, "USD").replace(/\.$/, "").trim();
  return amount.startsWith("$") ? amount : amount.replace(/^USD\s*/i, "USD ");
}

function parseCount(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern)?.[1];
  if (!match) return undefined;
  const value = Number.parseInt(match, 10);
  return Number.isFinite(value) ? value : undefined;
}

function parseNeighborhood(text: string): string | undefined {
  return NEIGHBORHOOD_LABELS.find(([pattern]) => pattern.test(text))?.[1];
}

function parseArea(text: string, pattern: RegExp): number | undefined {
  return parseCount(text.replace(/m²/g, "m2"), pattern);
}

export function deriveListingDetails(input: {
  listing_url?: string;
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
}): ListingDetails {
  const text = [
    input.listing_title,
    input.listing_description,
    input.listing_url ? normalizeUrlText(input.listing_url) : "",
  ].filter(Boolean).join(" ");

  return {
    listing_price_text: input.listing_price_text || parsePriceText(text),
    listing_expenses_text: input.listing_expenses_text || parseExpensesText(text),
    listing_neighborhood: input.listing_neighborhood || parseNeighborhood(text),
    listing_total_area_m2: input.listing_total_area_m2 ??
      parseArea(text, /\b(\d{1,4})\s*m2\s*(?:tot\.?|total|totales?)\b/i),
    listing_covered_area_m2: input.listing_covered_area_m2 ??
      parseArea(text, /\b(\d{1,4})\s*m2\s*(?:cub\.?|cubierta|cubiertos?)\b/i),
    listing_ambientes: input.listing_ambientes ??
      parseCount(text, /\b(\d{1,2})\s*(?:amb\.?|ambientes?)\b/i),
    listing_dormitorios: input.listing_dormitorios ??
      parseCount(text, /\b(\d{1,2})\s*(?:dorm\.?|dormitorios?|habitaciones?)\b/i),
    listing_bathrooms: input.listing_bathrooms ??
      parseCount(text, /\b(\d{1,2})\s*(?:ba[nñ]os?)\b/i),
    listing_age_years: input.listing_age_years ??
      parseCount(text, /\b(\d{1,3})\s*(?:a[nñ]os?)\b/i),
  };
}
