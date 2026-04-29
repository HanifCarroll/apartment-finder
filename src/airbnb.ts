import type { ListingExtraction } from "./types";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
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

function normalizeAirbnbImageUrl(rawUrl: string): string {
  return decodeHtmlEntities(rawUrl).replace(/[?#].*$/, "");
}

function photoId(url: string): string {
  return normalizeAirbnbImageUrl(url).match(/\/([^/?#]+)\.(?:jpe?g|png|webp)$/i)?.[1] || url;
}

export function uniqueAirbnbImageUrls(urls: string[], roomId: string, maxImages: number): string[] {
  const byId = new Map<string, string>();
  const hostingPath = `/Hosting-${roomId}/`;
  const directListingPhotoPattern = /a0\.muscache\.com\/im\/pictures\/[0-9a-f-]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i;

  for (const rawUrl of urls) {
    if (!rawUrl.includes("a0.muscache.com/im/pictures/")) continue;
    const url = normalizeAirbnbImageUrl(rawUrl);
    const isRoomHostingPhoto = url.includes(hostingPath);
    const isDirectListingPhoto = directListingPhotoPattern.test(url);
    if (!isRoomHostingPhoto && !isDirectListingPhoto) continue;
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

export async function extractAirbnbListingImageUrls(
  listingUrl: string,
  maxImages: number,
): Promise<ListingExtraction> {
  const roomId = parseRoomId(listingUrl);
  const html = await fetchText(listingUrl);
  const galleryCount = parsePictureCount(html);
  const imageUrls = uniqueAirbnbImageUrls(extractImageUrls(html), roomId, maxImages);

  return {
    provider: "airbnb",
    listing_url: listingUrl,
    page_url: new URL(`/rooms/${roomId}`, "https://www.airbnb.com").href,
    image_urls: imageUrls,
    clicked_gallery: false,
    gallery_count: galleryCount,
    gallery_count_matches_extracted: galleryCount === null ? null : galleryCount === imageUrls.length,
    gallery_text: galleryCount === null ? "" : `${galleryCount} photos`,
  };
}
