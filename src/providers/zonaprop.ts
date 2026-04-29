import { createPlaywriterSession, parsePlaywriterJson, runPlaywriterScript } from "../browser/playwriter-json";
import { findListingUrlsFromSearchUrl } from "../listing/search";
import { deriveListingDetails } from "../listing/details";
import type { ListingExtraction, PlaywriterListingPayload } from "../types";

const PLAYWRITER_JSON_START = "__APARTMENT_FINDER_JSON_START__";
const PLAYWRITER_JSON_END = "__APARTMENT_FINDER_JSON_END__";

function normalizeZonapropImageUrl(url: string): string {
  return url
    .replace(/\/\d+x\d+\//, "/1200x1200/")
    .replace(/[?#].*$/, "");
}

function zonapropPhotoId(url: string): string {
  return url.match(/\/([^/?#]+)\.(?:jpe?g|webp|png)(?:[?#].*)?$/i)?.[1] || url;
}

export function uniqueZonapropImageUrls(urls: string[], maxImages: number): string[] {
  const byId = new Map<string, string>();
  for (const rawUrl of urls) {
    if (!rawUrl.includes("imgar.zonapropcdn.com/avisos/resize/")) continue;
    const url = normalizeZonapropImageUrl(rawUrl);
    byId.set(zonapropPhotoId(url), url);
  }

  return Array.from(byId.values()).slice(0, maxImages);
}

function createPlaywriterListingExtractionScript(listingUrl: string, maxImages: number): string {
  return `
const listingUrl = ${JSON.stringify(listingUrl)};
const maxImages = ${JSON.stringify(maxImages)};

function normalizeImageUrl(url) {
  return String(url || '').replace(/\\/\\d+x\\d+\\//, '/1200x1200/').replace(/[?#].*$/, '');
}

function photoId(url) {
  return normalizeImageUrl(url).match(/\\/([^/?#]+)\\.(?:jpe?g|webp|png)$/i)?.[1] || normalizeImageUrl(url);
}

function uniqueZonapropImageUrls(urls) {
  const byId = new Map();
  for (const rawUrl of urls) {
    if (!rawUrl.includes('imgar.zonapropcdn.com/avisos/resize/')) continue;
    const url = normalizeImageUrl(rawUrl);
    byId.set(photoId(url), url);
  }
  return Array.from(byId.values()).slice(0, maxImages * 4);
}

function cleanText(text) {
  const div = document.createElement('div');
  div.innerHTML = String(text || '');
  return (div.textContent || div.innerText || '')
    .replace(/\\s+/g, ' ')
    .trim();
}

function metaContent(key) {
  const selector = [
    \`meta[property="\${key}"]\`,
    \`meta[name="\${key}"]\`,
  ].join(',');
  return cleanText(document.querySelector(selector)?.getAttribute('content') || '');
}

function extractGalleryMeta() {
  const containers = Array.from(document.querySelectorAll('#multimedia-content, #new-gallery-portal, [class*="gallery"], [class*="multimedia"]'))
    .map((el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim())
    .filter((text) => /Ver todas las fotos/i.test(text));
  const parsed = containers
    .map((text) => ({
      text: text.slice(0, 220),
      count: Number(text.match(/(?:^|\\s)(\\d{1,3})\\s+Ver todas las fotos/i)?.[1]),
    }))
    .filter((item) => Number.isFinite(item.count));
  return {
    gallery_count: parsed[0]?.count ?? null,
    gallery_text: parsed[0]?.text || containers[0]?.slice(0, 220) || '',
  };
}

function collectDomImageUrls() {
  const urls = new Set();
  const add = (value) => {
    if (!value) return;
    try { urls.add(new URL(value, location.href).href); } catch {}
  };
  for (const img of document.querySelectorAll('img')) {
    add(img.currentSrc || img.src);
    add(img.getAttribute('data-src'));
    add(img.getAttribute('data-original'));
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      for (const part of srcset.split(',')) add(part.trim().split(/\\s+/)[0]);
    }
  }
  for (const source of document.querySelectorAll('source')) {
    const srcset = source.getAttribute('srcset');
    if (srcset) {
      for (const part of srcset.split(',')) add(part.trim().split(/\\s+/)[0]);
    }
  }
  for (const el of document.querySelectorAll('[style]')) {
    const style = el.getAttribute('style') || '';
    for (const match of style.matchAll(/url\\((['"]?)(.*?)\\1\\)/g)) add(match[2]);
  }
  return Array.from(urls);
}

async function clickGalleryButton() {
  const candidates = [
    state.page.getByRole('button', { name: /Ver todas las fotos/i }),
    state.page.locator('button:has-text("Ver todas las fotos")'),
    state.page.locator('text=/Ver todas las fotos/i'),
  ];
  for (const locator of candidates) {
    try {
      if (await locator.first().isVisible({ timeout: 2500 })) {
        await locator.first().click({ timeout: 8000 });
        return true;
      }
    } catch {}
  }
  return false;
}

async function expandDescription() {
  const candidates = [
    state.page.getByRole('button', { name: /Leer descripción completa/i }),
    state.page.locator('button:has-text("Leer descripción completa")'),
    state.page.locator('text=/Leer descripción completa/i'),
  ];
  for (const locator of candidates) {
    try {
      if (await locator.first().isVisible({ timeout: 1200 })) {
        await locator.first().click({ timeout: 4000 });
        await state.page.waitForTimeout(500);
        return true;
      }
    } catch {}
  }
  return false;
}

async function scrollLazyContainers() {
  for (let i = 0; i < 8; i += 1) {
    await state.page.evaluate(() => {
      const scrollers = Array.from(document.querySelectorAll('*')).filter((el) => {
        const style = window.getComputedStyle(el);
        return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
      });
      for (const el of scrollers) el.scrollTop = el.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
    });
    await state.page.waitForTimeout(450);
  }
}

state.page = context.pages().find((p) => p.url() === 'about:blank') ?? await context.newPage();
state.page.removeAllListeners('response');
state.zonapropImageUrls = new Set();
state.page.on('response', (response) => {
  const url = response.url();
  if (url.includes('imgar.zonapropcdn.com/avisos/resize/')) state.zonapropImageUrls.add(url);
});

await state.page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
await waitForPageLoad({ page: state.page, timeout: 12000 }).catch(() => undefined);
await state.page.waitForTimeout(1000);

const galleryMeta = await state.page.evaluate(extractGalleryMeta);
const clickedGallery = await clickGalleryButton();
if (clickedGallery) {
  await waitForPageLoad({ page: state.page, timeout: 8000 }).catch(() => undefined);
  await state.page.waitForTimeout(1500);
}
await scrollLazyContainers();
await expandDescription();

const imageUrls = uniqueZonapropImageUrls([
  ...Array.from(state.zonapropImageUrls),
  ...await state.page.evaluate(collectDomImageUrls),
]);
const listingMeta = await state.page.evaluate(() => {
  function cleanPageText(text) {
    const div = document.createElement('div');
    div.innerHTML = String(text || '');
    return (div.textContent || div.innerText || '')
      .replace(/\\s+/g, ' ')
      .trim();
  }
  function metaContent(key) {
    const selector = [
      \`meta[property="\${key}"]\`,
      \`meta[name="\${key}"]\`,
    ].join(',');
    return cleanPageText(document.querySelector(selector)?.getAttribute('content') || '');
  }
  const bodyText = cleanPageText(document.body?.innerText || document.body?.textContent || '');
  const price = bodyText.match(/\\b(?:USD|US\\$|U\\$S)\\s*([\\d.,]+)/i)?.[0] || '';
  const ambientes = Number(bodyText.match(/\\b(\\d{1,2})\\s*(?:amb\\.?|ambientes?)\\b/i)?.[1] || '') || undefined;
  const dormitorios = Number(bodyText.match(/\\b(\\d{1,2})\\s*(?:dorm\\.?|dormitorios?|habitaciones?)\\b/i)?.[1] || '') || undefined;
  const featureItems = Array.from(document.querySelectorAll('#section-icon-features-property li, .section-icon-features-property li'))
    .map((item) => cleanPageText(item.textContent || ''))
    .filter(Boolean);
  const findFeature = (pattern) => featureItems.find((item) => pattern.test(item)) || '';
  const parseFeatureNumber = (pattern) => Number(findFeature(pattern).match(/\\d{1,4}/)?.[0] || '') || undefined;
  const descriptionContainers = Array.from(document.querySelectorAll('[class*="description"], [id*="description"], [data-qa*="description"]'))
    .map((item) => cleanPageText(item.textContent || ''))
    .filter((text) => text && !/Leer descripción completa/i.test(text))
    .sort((a, b) => b.length - a.length);
  const description = descriptionContainers[0] || metaContent('og:description') || metaContent('description');
  const expenses = description.match(/\\b(?:expensas?|gastos)[^$]{0,80}((?:USD|US\\$|U\\$S|\\$)\\s*[\\d.,]+)/i)?.[1]
    || bodyText.match(/\\b(?:expensas?|gastos)[^$]{0,80}((?:USD|US\\$|U\\$S|\\$)\\s*[\\d.,]+)/i)?.[1]
    || '';
  return {
    listing_title: metaContent('og:title') || cleanPageText(document.querySelector('h1')?.textContent || ''),
    listing_description: description,
    listing_price_text: price,
    listing_expenses_text: expenses,
    listing_total_area_m2: parseFeatureNumber(/m²\\s*tot|m2\\s*tot/i),
    listing_covered_area_m2: parseFeatureNumber(/m²\\s*cub|m2\\s*cub/i),
    listing_ambientes: ambientes,
    listing_dormitorios: dormitorios,
    listing_bathrooms: parseFeatureNumber(/ba[nñ]o/i),
    listing_age_years: parseFeatureNumber(/a[nñ]os/i),
    listing_disposition: findFeature(/Contrafrente|Frente|Lateral|Interno/i) || undefined,
    listing_orientation: findFeature(/^(N|S|E|O|NE|NO|SE|SO)$/i) || undefined,
    listing_luminosity: findFeature(/luminoso/i) || undefined,
    listing_features: featureItems,
  };
});
const payload = {
  listing_url: listingUrl,
  ...listingMeta,
  page_url: state.page.url(),
  clicked_gallery: clickedGallery,
  gallery_count: galleryMeta.gallery_count,
  gallery_text: galleryMeta.gallery_text,
  image_urls: imageUrls,
};
console.log(${JSON.stringify(PLAYWRITER_JSON_START)});
console.log(JSON.stringify(payload));
console.log(${JSON.stringify(PLAYWRITER_JSON_END)});
`;
}

export async function extractListingImageUrlsWithPlaywriter(
  listingUrl: string,
  maxImages: number,
): Promise<ListingExtraction> {
  const sessionId = createPlaywriterSession();
  const stdout = runPlaywriterScript(sessionId, createPlaywriterListingExtractionScript(listingUrl, maxImages), 100_000);
  const payload = parsePlaywriterJson<PlaywriterListingPayload>(stdout, PLAYWRITER_JSON_START, PLAYWRITER_JSON_END);
  const imageUrls = uniqueZonapropImageUrls(payload.image_urls, maxImages);

  const baseExtraction = {
    ...payload,
    session_id: sessionId,
    image_urls: imageUrls,
    gallery_count_matches_extracted:
      payload.gallery_count === null ? null : payload.gallery_count === imageUrls.length,
  } satisfies ListingExtraction;

  return {
    ...baseExtraction,
    ...deriveListingDetails(baseExtraction),
  };
}

export async function findListingUrlsWithPlaywriter(
  searchUrl: string,
  maxListings: number,
): Promise<{ search_url: string; page_url: string; listing_urls: string[]; session_id: string }> {
  const result = await findListingUrlsFromSearchUrl(searchUrl, maxListings, 1);
  return {
    search_url: result.search_url,
    page_url: result.page_url,
    listing_urls: result.listing_urls,
    session_id: result.session_id,
  };
}
