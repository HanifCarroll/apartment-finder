import type { ListingExtraction } from "../types";
import { classifyAirbnbLaundryAmenitySignal } from "../laundry-metadata";
import { deriveListingDetails } from "../listing/details";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\\u0026/g, "&");
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 apartment-finder/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Airbnb fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseRoomId(listingUrl: string): string {
  const roomId = new URL(listingUrl).pathname.match(/\/rooms\/(\d+)/)?.[1];
  if (!roomId) throw new Error(`Could not find Airbnb room id in ${listingUrl}`);
  return roomId;
}

function parsePictureCount(html: string): number | null {
  const match = html.match(/"pictureCount"\s*:\s*(\d{1,4})/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function cleanText(text: string): string {
  return normalizeAmenityText(text)
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMetaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];
    if (match) return cleanText(decodeHtmlEntities(match));
  }
  return "";
}

function normalizeAmenityText(text: string): string {
  return decodeHtmlEntities(text)
    .replace(/\\u00a0/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[–—-]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAirbnbLaundryAmenity(html: string): Pick<
  ListingExtraction,
  "airbnb_laundry_amenity_label" | "airbnb_laundry_amenity_text"
> {
  const washerTitles = new Set<string>();

  const washerAmenityPattern = /"title"\s*:\s*"([^"]*washer[^"]*)"[\s\S]{0,220}?"icon"\s*:\s*"SYSTEM_WASHER"|"icon"\s*:\s*"SYSTEM_WASHER"[\s\S]{0,220}?"title"\s*:\s*"([^"]*washer[^"]*)"/gi;
  for (const match of html.matchAll(washerAmenityPattern)) {
    const title = normalizeAmenityText(match[1] || match[2] || "");
    if (title) washerTitles.add(title);
  }

  if (washerTitles.size === 0) {
    for (const match of html.matchAll(/"title"\s*:\s*"([^"]*washer[^"]*)"/gi)) {
      const title = normalizeAmenityText(match[1] || "");
      if (title) washerTitles.add(title);
    }
  }

  const text = Array.from(washerTitles).join("; ");
  const lower = text.toLowerCase();
  if (!text) return { airbnb_laundry_amenity_label: "NONE", airbnb_laundry_amenity_text: "" };
  if (lower.includes("in building")) {
    return { airbnb_laundry_amenity_label: "WASHER_IN_BUILDING", airbnb_laundry_amenity_text: text };
  }
  if (lower.includes("in unit")) {
    return { airbnb_laundry_amenity_label: "WASHER_IN_UNIT", airbnb_laundry_amenity_text: text };
  }
  return { airbnb_laundry_amenity_label: "WASHER", airbnb_laundry_amenity_text: text };
}

function normalizeAirbnbImageUrl(rawUrl: string): string {
  return decodeHtmlEntities(rawUrl).replace(/[?#].*$/, "");
}

function photoId(url: string): string {
  return normalizeAirbnbImageUrl(url).match(/\/([^/?#]+)\.(?:jpe?g|png|webp)$/i)?.[1] || url;
}

export function uniqueAirbnbImageUrls(urls: string[], roomId: string, maxImages: number): string[] {
  const byId = new Map<string, string>();
  const hostingPath = `/Hosting-${roomId}/`;
  const encodedHostingPhotoPattern = /a0\.muscache\.com\/im\/pictures\/hosting\/Hosting-[A-Za-z0-9_-]+\/original\/[^/?#]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i;
  const directListingPhotoPattern = /a0\.muscache\.com\/im\/pictures\/[0-9a-f-]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i;

  for (const rawUrl of urls) {
    if (!rawUrl.includes("a0.muscache.com/im/pictures/")) continue;
    const url = normalizeAirbnbImageUrl(rawUrl);
    const isRoomHostingPhoto = url.includes(hostingPath);
    const isEncodedHostingPhoto = encodedHostingPhotoPattern.test(url);
    const isDirectListingPhoto = directListingPhotoPattern.test(url);
    if (!isRoomHostingPhoto && !isEncodedHostingPhoto && !isDirectListingPhoto) continue;
    byId.set(photoId(url), url);
  }

  return Array.from(byId.values()).slice(0, maxImages);
}

function extractImageUrls(html: string): string[] {
  const urls = new Set<string>();
  const pattern = /https:\/\/a0\.muscache\.com\/im\/pictures\/[^"'\\<> ]+\.(?:jpe?g|png|webp)(?:\?[^"'\\<> ]*)?/gi;
  for (const match of html.matchAll(pattern)) {
    urls.add(match[0]);
  }
  return Array.from(urls);
}

function parseAirbnbAmenities(html: string): ListingExtraction["listing_amenities"] {
  const byGroup = new Map<string, Set<string>>();
  const rowPattern = /id=["']pdp_v3_([^"'_]+(?:_[^"'_]+)*)_\d+_[^"']*row-title["'][^>]*>([\s\S]*?)<\/div>/gi;

  for (const match of html.matchAll(rowPattern)) {
    const group = cleanText(match[1].replace(/_/g, " "))
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    const item = cleanText(match[2]).replace(/^Unavailable:\s*/i, "");
    if (!group || !item || item.length > 120) continue;
    const items = byGroup.get(group) || new Set<string>();
    items.add(item);
    byGroup.set(group, items);
  }

  if (byGroup.size === 0) {
    const items = new Set<string>();
    const amenityPattern = /\b(wifi|kitchen|washer|dryer|tv|air conditioning|heating|bathtub|hair dryer|cleaning products|soap|bidet|hot water|hangers|bed linens|pillows|blankets|shades|iron|drying rack|clothing storage|refrigerator|microwave|cooking basics|dishes|silverware|freezer|stove|oven|kettle|coffee maker|toaster|patio|balcony|outdoor|parking|elevator|workspace|fire extinguisher|self check-in|keypad)\b/i;
    for (const match of html.matchAll(/"title"\s*:\s*"([^"]+)"/gi)) {
      const item = cleanText(match[1]);
      if (!item || item.length > 120) continue;
      if (!amenityPattern.test(item)) continue;
      if (/^(what this place offers|not included|show all|where you'll sleep)$/i.test(item)) continue;
      if (/^(bathroom|bedroom and laundry|entertainment|heating and cooling|home safety|internet and office|kitchen and dining|outdoor|parking and facilities|services)$/i.test(item)) continue;
      items.add(item.replace(/^Unavailable:\s*/i, ""));
    }
    if (items.size > 0) byGroup.set("Amenities", items);
  }

  return Array.from(byGroup.entries())
    .map(([group, items]) => ({ group, items: Array.from(items).slice(0, 24) }))
    .filter((group) => group.items.length > 0);
}

function parseAirbnbPrice(html: string): string | undefined {
  const text = cleanText(html);
  const match = text.match(/\b(?:USD|US\$|\$)\s*([\d.,]+)\b/i);
  if (!match) return undefined;
  return match[0].startsWith("$") ? `USD ${match[1]}` : match[0];
}

export async function extractAirbnbListingImageUrls(
  listingUrl: string,
  maxImages: number,
): Promise<ListingExtraction> {
  const roomId = parseRoomId(listingUrl);
  const html = await fetchText(listingUrl);
  const galleryCount = parsePictureCount(html);
  const imageUrls = uniqueAirbnbImageUrls(extractImageUrls(html), roomId, maxImages);
  const laundryAmenity = parseAirbnbLaundryAmenity(html);
  const airbnbSignal = laundryAmenity.airbnb_laundry_amenity_text
    ? classifyAirbnbLaundryAmenitySignal(laundryAmenity.airbnb_laundry_amenity_text)
    : null;

  const baseExtraction = {
    provider: "airbnb",
    listing_title: parseMetaContent(html, "og:title"),
    listing_description: parseMetaContent(html, "og:description") || parseMetaContent(html, "description"),
    listing_price_text: parseAirbnbPrice(html),
    listing_amenities: parseAirbnbAmenities(html),
    ...laundryAmenity,
    metadata_laundry_signals: airbnbSignal ? [airbnbSignal] : [],
    listing_url: listingUrl,
    page_url: new URL(`/rooms/${roomId}`, "https://www.airbnb.com").href,
    image_urls: imageUrls,
    clicked_gallery: false,
    gallery_count: galleryCount,
    gallery_count_matches_extracted: galleryCount === null ? null : galleryCount === imageUrls.length,
    gallery_text: galleryCount === null ? "" : `${galleryCount} photos`,
  } satisfies ListingExtraction;

  return {
    ...baseExtraction,
    ...deriveListingDetails(baseExtraction),
  };
}
