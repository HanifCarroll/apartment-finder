import { runCommand } from "./shell";
import type { ListingExtraction, PlaywriterListingPayload } from "./types";

const PLAYWRITER_JSON_START = "__APARTMENT_FINDER_JSON_START__";
const PLAYWRITER_JSON_END = "__APARTMENT_FINDER_JSON_END__";

function parsePlaywriterJson<T>(stdout: string): T {
  const cleaned = stdout.replace(/^\[log\]\s?/gm, "");
  const pattern = new RegExp(`${PLAYWRITER_JSON_START}\\n([\\s\\S]*?)\\n${PLAYWRITER_JSON_END}`);
  const match = cleaned.match(pattern);
  if (!match) {
    throw new Error(`Could not find Playwriter JSON payload in output:\n${stdout.slice(-4000)}`);
  }

  return JSON.parse(match[1]) as T;
}

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

function cleanText(text) {
  return String(text || '').replace(/[–—]/g, '-').replace(/\\s+/g, ' ').trim();
}

function laundrySnippets(text) {
  const cleaned = cleanText(text);
  const snippets = new Set();
  const pattern = /.{0,90}(lavarropas|lavadero|laundry|lavander[ií]a|washer|washing machine).{0,130}/gi;
  for (const match of cleaned.matchAll(pattern)) snippets.add(cleanText(match[0] || ''));
  return Array.from(snippets).slice(0, 8);
}

function classifyLaundrySignal(source, text) {
  const cleaned = cleanText(text);
  const lower = cleaned.toLowerCase();
  if (!/(lavarropas|lavadero|laundry|lavander[ií]a|washer|washing machine)/i.test(cleaned)) return null;
  if (/(in building|lavadero com[uú]n|laundry|lavander[ií]a|amenit|sum|gimnasio|pileta|solarium)/i.test(cleaned)) {
    return {
      source,
      classification: 'SHARED_BUILDING',
      strength: /(in building|lavadero com[uú]n|laundry|lavander[ií]a)/i.test(cleaned) ? 'strong' : 'medium',
      text: cleaned,
    };
  }
  if (/(in unit|lavadero.*lavarropas|lavarropas.*lavadero|cocina.*lavarropas|lavarropas.*cocina|departamento.*lavarropas|unidad.*lavarropas)/i.test(lower)) {
    return { source, classification: 'IN_UNIT', strength: 'medium', text: cleaned };
  }
  if (/(lavarropas|washer|washing machine)/i.test(cleaned)) {
    return { source, classification: 'WASHER_PRESENT', strength: 'weak', text: cleaned };
  }
  return { source, classification: 'AMBIGUOUS', strength: 'weak', text: cleaned };
}

function collectLaundrySignals({ title, description, amenities, pageText }) {
  const signals = [];
  const seen = new Set();
  const add = (signal) => {
    if (!signal) return;
    const key = signal.source + ':' + signal.classification + ':' + signal.text;
    if (seen.has(key)) return;
    seen.add(key);
    signals.push(signal);
  };
  add(classifyLaundrySignal('title', title));
  for (const snippet of laundrySnippets(description)) add(classifyLaundrySignal('description', snippet));
  for (const amenity of amenities || []) add(classifyLaundrySignal('amenities', amenity));
  if (signals.length === 0) {
    for (const snippet of laundrySnippets(pageText)) add(classifyLaundrySignal('page_text', snippet));
  }
  return signals;
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

function extractPageMetadata() {
  const cleanText = (text) => String(text || '').replace(/[–—]/g, '-').replace(/\\s+/g, ' ').trim();
  const laundrySnippets = (text) => {
    const cleaned = cleanText(text);
    const snippets = new Set();
    const pattern = /.{0,90}(lavarropas|lavadero|laundry|lavander[ií]a|washer|washing machine).{0,130}/gi;
    for (const match of cleaned.matchAll(pattern)) snippets.add(cleanText(match[0] || ''));
    return Array.from(snippets).slice(0, 8);
  };
  const classifyLaundrySignal = (source, text) => {
    const cleaned = cleanText(text);
    const lower = cleaned.toLowerCase();
    if (!/(lavarropas|lavadero|laundry|lavander[ií]a|washer|washing machine)/i.test(cleaned)) return null;
    if (/(in building|lavadero com[uú]n|laundry|lavander[ií]a|amenit|sum|gimnasio|pileta|solarium)/i.test(cleaned)) {
      return {
        source,
        classification: 'SHARED_BUILDING',
        strength: /(in building|lavadero com[uú]n|laundry|lavander[ií]a)/i.test(cleaned) ? 'strong' : 'medium',
        text: cleaned,
      };
    }
    if (/(in unit|lavadero.*lavarropas|lavarropas.*lavadero|cocina.*lavarropas|lavarropas.*cocina|departamento.*lavarropas|unidad.*lavarropas)/i.test(lower)) {
      return { source, classification: 'IN_UNIT', strength: 'medium', text: cleaned };
    }
    if (/(lavarropas|washer|washing machine)/i.test(cleaned)) {
      return { source, classification: 'WASHER_PRESENT', strength: 'weak', text: cleaned };
    }
    return { source, classification: 'AMBIGUOUS', strength: 'weak', text: cleaned };
  };
  const collectLaundrySignals = ({ title, description, amenities, pageText }) => {
    const signals = [];
    const seen = new Set();
    const add = (signal) => {
      if (!signal) return;
      const key = signal.source + ':' + signal.classification + ':' + signal.text;
      if (seen.has(key)) return;
      seen.add(key);
      signals.push(signal);
    };
    add(classifyLaundrySignal('title', title));
    for (const snippet of laundrySnippets(description)) add(classifyLaundrySignal('description', snippet));
    for (const amenity of amenities || []) add(classifyLaundrySignal('amenities', amenity));
    if (signals.length === 0) {
      for (const snippet of laundrySnippets(pageText)) add(classifyLaundrySignal('page_text', snippet));
    }
    return signals;
  };

  const title = cleanText(document.querySelector('h1')?.innerText || document.title || '');
  const descriptionCandidates = Array.from(document.querySelectorAll('[class*="description"], .section-description, section'))
    .map((el) => cleanText(el.innerText || el.textContent || ''))
    .filter((text) => text.length > 80)
    .sort((a, b) => b.length - a.length);
  const description = descriptionCandidates.find((text) => !/Contactar|Ver teléfono|Publicar|Ingresar/i.test(text.slice(0, 250))) || descriptionCandidates[0] || '';
  const amenities = Array.from(document.querySelectorAll('[class*="features"] li, [class*="amenit"] li'))
    .map((el) => cleanText(el.innerText || el.textContent || ''))
    .filter(Boolean);
  const pageText = cleanText(document.body?.innerText || '');
  return {
    metadata_title: title,
    metadata_description: description.slice(0, 4000),
    metadata_amenities: Array.from(new Set(amenities)).slice(0, 80),
    metadata_laundry_signals: collectLaundrySignals({ title, description, amenities, pageText }),
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
const pageMetadata = await state.page.evaluate(extractPageMetadata);
const clickedGallery = await clickGalleryButton();
if (clickedGallery) {
  await waitForPageLoad({ page: state.page, timeout: 8000 }).catch(() => undefined);
  await state.page.waitForTimeout(1500);
}
await scrollLazyContainers();

const imageUrls = uniqueZonapropImageUrls([
  ...Array.from(state.zonapropImageUrls),
  ...await state.page.evaluate(collectDomImageUrls),
]);
const payload = {
  listing_url: listingUrl,
  page_url: state.page.url(),
  ...pageMetadata,
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

function createPlaywriterListingSearchScript(searchUrl: string, maxListings: number): string {
  return `
const searchUrl = ${JSON.stringify(searchUrl)};
const maxListings = ${JSON.stringify(maxListings)};

state.page = context.pages().find((p) => p.url() === 'about:blank') ?? await context.newPage();
await state.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
await waitForPageLoad({ page: state.page, timeout: 12000 }).catch(() => undefined);
await state.page.waitForTimeout(1200);

for (let i = 0; i < 6; i += 1) {
  await state.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await state.page.waitForTimeout(700);
}

const payload = {
  search_url: searchUrl,
  page_url: state.page.url(),
  listing_urls: await state.page.evaluate((limit) => {
    function normalizeListingUrl(url) {
      try {
        const parsed = new URL(url, location.href);
        parsed.search = '';
        parsed.hash = '';
        return parsed.href;
      } catch {
        return null;
      }
    }

    const urls = new Set();
    for (const anchor of document.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href') || '';
      if (!/\\/propiedades\\/clasificado\\//.test(href)) continue;
      const normalized = normalizeListingUrl(href);
      if (normalized) urls.add(normalized);
    }
    return Array.from(urls).slice(0, limit);
  }, maxListings),
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
  const sessionOutput = runCommand("bunx", ["playwriter@latest", "session", "new"], 30_000);
  const sessionId = sessionOutput.match(/Session\s+(\d+)\s+created/)?.[1];

  if (!sessionId) {
    throw new Error(`Could not create Playwriter session:\n${sessionOutput}`);
  }

  const stdout = runCommand(
    "bunx",
    [
      "playwriter@latest",
      "-s",
      sessionId,
      "--timeout",
      "90000",
      "-e",
      createPlaywriterListingExtractionScript(listingUrl, maxImages),
    ],
    100_000,
  );
  const payload = parsePlaywriterJson<PlaywriterListingPayload>(stdout);
  const imageUrls = uniqueZonapropImageUrls(payload.image_urls, maxImages);

  return {
    ...payload,
    session_id: sessionId,
    image_urls: imageUrls,
    gallery_count_matches_extracted:
      payload.gallery_count === null ? null : payload.gallery_count === imageUrls.length,
  };
}

export async function findListingUrlsWithPlaywriter(
  searchUrl: string,
  maxListings: number,
): Promise<{ search_url: string; page_url: string; listing_urls: string[]; session_id: string }> {
  const sessionOutput = runCommand("bunx", ["playwriter@latest", "session", "new"], 30_000);
  const sessionId = sessionOutput.match(/Session\s+(\d+)\s+created/)?.[1];

  if (!sessionId) {
    throw new Error(`Could not create Playwriter session:\n${sessionOutput}`);
  }

  const stdout = runCommand(
    "bunx",
    [
      "playwriter@latest",
      "-s",
      sessionId,
      "--timeout",
      "90000",
      "-e",
      createPlaywriterListingSearchScript(searchUrl, maxListings),
    ],
    100_000,
  );
  const payload = parsePlaywriterJson<{
    search_url: string;
    page_url: string;
    listing_urls: string[];
  }>(stdout);

  return {
    ...payload,
    listing_urls: Array.from(new Set(payload.listing_urls)).slice(0, maxListings),
    session_id: sessionId,
  };
}
