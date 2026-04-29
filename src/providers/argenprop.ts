import type { ListingExtraction } from "../types";
import { decodeBasicHtmlEntities } from "../laundry-metadata";
import { deriveListingDetails } from "../listing/details";

const ARG_PROP_ORIGIN = "https://www.argenprop.com";

function decodeHtmlEntities(text: string): string {
  return decodeBasicHtmlEntities(text);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 apartment-finder/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Argenprop fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseAvisoId(listingUrl: string, html: string): string {
  const fromUrl = listingUrl.match(/--(\d+)(?:[/?#]|$)/)?.[1];
  if (fromUrl) return fromUrl;

  const fromGallery = html.match(/gallerypartial\?idAviso=(\d+)/i)?.[1];
  if (fromGallery) return fromGallery;

  throw new Error("Could not find Argenprop listing id.");
}

function parseGalleryUrl(html: string, avisoId: string): string {
  const rawPath = html.match(/data-url-get-gallery="([^"]+)"/i)?.[1];
  const path = rawPath ? decodeHtmlEntities(rawPath) : `/aviso/gallerypartial?idAviso=${avisoId}`;
  return new URL(path, ARG_PROP_ORIGIN).href;
}

function parsePhotoCount(html: string): number | null {
  const multimediaMatch = html.match(
    /data-tipo-gallery="fotos"[\s\S]*?<p>\s*(\d{1,4})\s*<\/p>/i,
  )?.[1];
  if (multimediaMatch) return Number.parseInt(multimediaMatch, 10);

  const galleryCounterMatch = html.match(/data-gallery-current>\s*\d+\s*<\/span>\s*\/\s*(\d{1,4})/i)?.[1];
  return galleryCounterMatch ? Number.parseInt(galleryCounterMatch, 10) : null;
}

function cleanText(text: string): string {
  return decodeHtmlEntities(text)
    .replace(/<[^>]+>/g, " ")
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
    if (match) return cleanText(match);
  }
  return "";
}

function normalizeArgenpropImageUrl(rawUrl: string): string {
  const url = decodeHtmlEntities(rawUrl).replace(/[?#].*$/, "");
  return url.replace(/_(?:u_)?(?:xsmall|small|medium|large)(\.(?:jpe?g|png|webp))$/i, "_u_large$1");
}

function photoId(url: string): string {
  return normalizeArgenpropImageUrl(url)
    .match(/\/([^/?#]+?)(?:_(?:u_)?(?:xsmall|small|medium|large))?\.(?:jpe?g|png|webp)$/i)?.[1] || url;
}

export function uniqueArgenpropImageUrls(urls: string[], maxImages: number): string[] {
  const byId = new Map<string, string>();
  for (const rawUrl of urls) {
    if (!rawUrl.includes("argenprop.com/static-content/")) continue;
    const url = normalizeArgenpropImageUrl(rawUrl);
    byId.set(photoId(url), url);
  }

  return Array.from(byId.values()).slice(0, maxImages);
}

function extractImageUrls(html: string): string[] {
  const urls = new Set<string>();
  const imagePattern = /https?:\/\/www\.argenprop\.com\/static-content\/[^"'\s<>]+?\.(?:jpe?g|png|webp)/gi;
  for (const match of html.matchAll(imagePattern)) {
    urls.add(match[0]);
  }

  return Array.from(urls);
}

function parsePropertyFeatures(html: string): Partial<ListingExtraction> {
  const features: string[] = [];
  const result: Partial<ListingExtraction> = {};
  const listMatch = html.match(/<ul[^>]+class=["'][^"']*property-main-features[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || "";

  for (const liMatch of listMatch.matchAll(/<li(?:\s+title=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/li>/gi)) {
    const title = cleanText(liMatch[1] || "");
    const value = cleanText(liMatch[2] || "");
    if (!value) continue;
    const feature = value;
    features.push(feature);

    const lowerTitle = title.toLowerCase();
    const lowerValue = value.toLowerCase();
    const number = Number.parseInt(value.match(/\d{1,4}/)?.[0] || "", 10);
    if (/cubierta/.test(lowerTitle) && Number.isFinite(number)) result.listing_covered_area_m2 = number;
    if (/dormitorios/.test(lowerTitle) && Number.isFinite(number)) result.listing_dormitorios = number;
    if (/antig/.test(lowerTitle) && Number.isFinite(number)) result.listing_age_years = number;
    if (/baños|banos/.test(lowerTitle) && Number.isFinite(number)) result.listing_bathrooms = number;
    if (/ambientes/.test(lowerTitle) && Number.isFinite(number)) result.listing_ambientes = number;
    if (/estado/.test(lowerTitle)) result.listing_condition = value;
    if (/disposici/.test(lowerTitle)) result.listing_disposition = value;
    if (/departamento|casa|monoambiente/.test(lowerValue) && !result.listing_property_type) {
      result.listing_property_type = value;
    }
  }

  return {
    ...result,
    listing_features: features,
  };
}

function parseMoneyText(html: string, labelPattern?: RegExp): string | undefined {
  const text = cleanText(html);
  const scoped = labelPattern ? text.match(labelPattern)?.[0] || "" : text;
  const match = (scoped || text).match(/\b(?:USD|US\$|U\$S|\$)\s*[\d.,]+/i);
  if (!match) return undefined;
  const digitCount = match[0].replace(/\D/g, "").length;
  if (digitCount < 3) return undefined;
  return match[0].replace(/^US\$|^U\$S/i, "USD").replace(/^USD\s*/i, "USD ");
}

function parseTitlebarPrice(html: string): string | undefined {
  const titlebar = html.match(/class=["'][^"']*titlebar__price[^"']*["'][^>]*>([\s\S]{0,160})<\/p>/i)?.[1];
  const text = titlebar ? cleanText(titlebar) : "";
  return text ? parseMoneyText(text) : parseMoneyText(html);
}

export async function extractArgenpropListingImageUrls(
  listingUrl: string,
  maxImages: number,
): Promise<ListingExtraction> {
  const listingHtml = await fetchText(listingUrl);
  const avisoId = parseAvisoId(listingUrl, listingHtml);
  const galleryUrl = parseGalleryUrl(listingHtml, avisoId);
  const galleryHtml = await fetchText(galleryUrl);
  const galleryCount = parsePhotoCount(listingHtml) ?? parsePhotoCount(galleryHtml);
  const galleryImageUrls = uniqueArgenpropImageUrls(extractImageUrls(galleryHtml), maxImages);
  const imageUrls =
    galleryCount === null || galleryImageUrls.length >= Math.min(galleryCount, maxImages)
      ? galleryImageUrls
      : uniqueArgenpropImageUrls(
        [...extractImageUrls(galleryHtml), ...extractImageUrls(listingHtml)],
        maxImages,
      );

  const baseExtraction = {
    provider: "argenprop",
    listing_title: parseMetaContent(listingHtml, "og:title"),
    listing_description: parseMetaContent(listingHtml, "og:description") || parseMetaContent(listingHtml, "description"),
    listing_price_text: parseTitlebarPrice(listingHtml),
    listing_expenses_text: parseMoneyText(listingHtml, /\b(?:expensas?|gastos)[\s\S]{0,80}/i),
    ...parsePropertyFeatures(listingHtml),
    listing_url: listingUrl,
    page_url: listingUrl,
    image_urls: imageUrls,
    clicked_gallery: false,
    gallery_count: galleryCount,
    gallery_count_matches_extracted: galleryCount === null ? null : galleryCount === imageUrls.length,
    gallery_text: galleryCount === null ? "" : `${galleryCount} fotos`,
  } satisfies ListingExtraction;

  return {
    ...baseExtraction,
    ...deriveListingDetails(baseExtraction),
  };
}
