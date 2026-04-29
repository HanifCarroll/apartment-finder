import type { ListingExtraction } from "./types";
import {
  cleanMetadataText,
  collectLaundryMetadataSignals,
  decodeBasicHtmlEntities,
  extractTagText,
} from "./laundry-metadata";

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

function parseListingMetadata(html: string): Pick<
  ListingExtraction,
  "metadata_title" | "metadata_description" | "metadata_amenities" | "metadata_laundry_signals"
> {
  const title = extractTagText(html, /<h1[^>]*>\s*([\s\S]*?)\s*<\/h1>/i)
    || extractTagText(html, /<title[^>]*>\s*([\s\S]*?)\s*<\/title>/i);
  const description = extractTagText(
    html,
    /<div[^>]+class="[^"]*section-description--content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  const amenities = Array.from(
    html.matchAll(/<li[^>]*class="[^"]*property-features-item[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/li>/gi),
  )
    .map((match) => cleanMetadataText(match[1] || ""))
    .filter(Boolean);

  return {
    metadata_title: title,
    metadata_description: description,
    metadata_amenities: amenities,
    metadata_laundry_signals: collectLaundryMetadataSignals({ title, description, amenities }),
  };
}

export async function extractArgenpropListingImageUrls(
  listingUrl: string,
  maxImages: number,
): Promise<ListingExtraction> {
  const listingHtml = await fetchText(listingUrl);
  const avisoId = parseAvisoId(listingUrl, listingHtml);
  const galleryUrl = parseGalleryUrl(listingHtml, avisoId);
  const galleryHtml = await fetchText(galleryUrl);
  const metadata = parseListingMetadata(listingHtml);
  const galleryCount = parsePhotoCount(listingHtml) ?? parsePhotoCount(galleryHtml);
  const galleryImageUrls = uniqueArgenpropImageUrls(extractImageUrls(galleryHtml), maxImages);
  const imageUrls =
    galleryCount === null || galleryImageUrls.length >= Math.min(galleryCount, maxImages)
      ? galleryImageUrls
      : uniqueArgenpropImageUrls(
        [...extractImageUrls(galleryHtml), ...extractImageUrls(listingHtml)],
        maxImages,
      );

  return {
    provider: "argenprop",
    ...metadata,
    listing_url: listingUrl,
    page_url: listingUrl,
    image_urls: imageUrls,
    clicked_gallery: false,
    gallery_count: galleryCount,
    gallery_count_matches_extracted: galleryCount === null ? null : galleryCount === imageUrls.length,
    gallery_text: galleryCount === null ? "" : `${galleryCount} fotos`,
  };
}
