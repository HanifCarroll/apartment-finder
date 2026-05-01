import type { SearchProvider } from "../providers/search";

export function createPlaywriterSearchScript(
  searchUrl: string,
  provider: SearchProvider,
  maxListings: number,
  maxPages: number,
  startMarker: string,
  endMarker: string,
): string {
  return `
const searchUrl = ${JSON.stringify(searchUrl)};
const provider = ${JSON.stringify(provider)};
const maxListings = ${JSON.stringify(maxListings)};
const maxPages = ${JSON.stringify(maxPages)};

function normalizeListingUrl(rawUrl, baseUrl) {
  try {
    const parsed = new URL(rawUrl, baseUrl);
    parsed.hash = '';
    if (provider === 'airbnb') {
      const roomId = parsed.pathname.match(/\\/rooms\\/(\\d+)/)?.[1];
      if (!roomId) return null;
      return new URL('/rooms/' + roomId, 'https://www.airbnb.com').href;
    }
    if (provider === 'zonaprop') {
      if (!/\\/propiedades\\/clasificado\\//.test(parsed.pathname)) return null;
      parsed.search = '';
      return parsed.href;
    }
    if (provider === 'argenprop') {
      if (!/--\\d+$/.test(parsed.pathname)) return null;
      parsed.search = '';
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

function listingHrefPattern() {
  if (provider === 'airbnb') return /\\/rooms\\/\\d+/;
  if (provider === 'zonaprop') return /\\/propiedades\\/clasificado\\//;
  if (provider === 'argenprop') return /--\\d+(?:[/?#]|$)/;
  return /$a/;
}

async function discoverZonapropFromHtml() {
  state.page = context.pages().find((p) => p.url() === 'about:blank') ?? await context.newPage();
  if (!state.page.url().startsWith('https://www.zonaprop.com.ar/')) {
    await state.page.goto('https://www.zonaprop.com.ar/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForPageLoad({ page: state.page, timeout: 12000 }).catch(() => undefined);
  }

  const result = await state.page.evaluate(async ({ searchUrl, maxListings, maxPages }) => {
    function normalizeZonapropListingUrl(rawUrl, baseUrl) {
      try {
        const parsed = new URL(rawUrl, baseUrl);
        parsed.hash = '';
        if (!/\\/propiedades\\/clasificado\\//.test(parsed.pathname)) return null;
        parsed.search = '';
        return parsed.href;
      } catch {
        return null;
      }
    }

    function collectListingUrlsFromDocument(doc, baseUrl) {
      const urls = new Set();
      for (const anchor of doc.querySelectorAll('a[href]')) {
        const href = anchor.getAttribute('href') || '';
        if (!/\\/propiedades\\/clasificado\\//.test(href)) continue;
        const normalized = normalizeZonapropListingUrl(href, baseUrl);
        if (normalized) urls.add(normalized);
      }
      return Array.from(urls);
    }

    function findNextPageUrlFromDocument(doc, baseUrl, nextPageNumber) {
      function usableHref(anchor) {
        const href = anchor.getAttribute('href');
        if (!href || href === '#' || href.startsWith('javascript:')) return null;
        try { return new URL(href, baseUrl).href; } catch { return null; }
      }

      const anchors = Array.from(doc.querySelectorAll('a[href]'));
      const arrow = anchors.find((anchor) => (anchor.getAttribute('class') || '').includes('paging-module__page-arrow'));
      if (arrow) return usableHref(arrow);
      const numbered = anchors.find((anchor) => {
        const text = (anchor.textContent || '').trim();
        return text === String(nextPageNumber) && /pagina-\\d+\\.html/i.test(anchor.getAttribute('href') || '');
      });
      if (numbered) return usableHref(numbered);
      if (/\\.html(?:[?#].*)?$/.test(baseUrl)) return baseUrl.replace(/\\.html([?#].*)?$/, '-pagina-' + nextPageNumber + '.html');
      return null;
    }

    const listingUrls = [];
    const seenListingUrls = new Set();
    const pageUrls = [];
    const seenPageUrls = new Set();
    let pageUrl = searchUrl;

    for (let pageIndex = 0; pageIndex < maxPages && listingUrls.length < maxListings && pageUrl; pageIndex += 1) {
      const response = await fetch(pageUrl, {
        credentials: 'include',
        headers: { accept: 'text/html,application/xhtml+xml' },
      });
      const html = await response.text();
      if (!response.ok) throw new Error('Zonaprop search HTML fetch failed with HTTP ' + response.status);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const responseUrl = response.url || pageUrl;
      if (!seenPageUrls.has(responseUrl)) {
        seenPageUrls.add(responseUrl);
        pageUrls.push(responseUrl);
      }

      for (const url of collectListingUrlsFromDocument(doc, responseUrl)) {
        if (seenListingUrls.has(url)) continue;
        seenListingUrls.add(url);
        listingUrls.push(url);
        if (listingUrls.length >= maxListings) break;
      }

      if (listingUrls.length >= maxListings) break;
      pageUrl = findNextPageUrlFromDocument(doc, responseUrl, pageIndex + 2);
      if (pageUrl && seenPageUrls.has(pageUrl)) break;
    }

    return {
      search_url: searchUrl,
      page_url: pageUrls.at(-1) || searchUrl,
      page_urls: pageUrls,
      listing_urls: listingUrls,
    };
  }, { searchUrl, maxListings, maxPages });

  if (result.listing_urls.length > 0) return result;
  throw new Error('Zonaprop search HTML discovery returned no listing URLs.');
}

async function scrollResults() {
  let previousHeight = 0;
  for (let i = 0; i < 10; i += 1) {
    const height = await state.page.evaluate(() => document.body.scrollHeight);
    await state.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await state.page.waitForTimeout(900);
    if (height === previousHeight && i >= 3) break;
    previousHeight = height;
  }
}

async function collectListingUrls() {
  return state.page.evaluate(({ provider }) => {
    function normalizeUrl(rawUrl) {
      try {
        const parsed = new URL(rawUrl, location.href);
        parsed.hash = '';
        if (provider === 'airbnb') {
          const roomId = parsed.pathname.match(/\\/rooms\\/(\\d+)/)?.[1];
          if (!roomId) return null;
          return new URL('/rooms/' + roomId, 'https://www.airbnb.com').href;
        }
        if (provider === 'zonaprop') {
          if (!/\\/propiedades\\/clasificado\\//.test(parsed.pathname)) return null;
          parsed.search = '';
          return parsed.href;
        }
        if (provider === 'argenprop') {
          if (!/--\\d+$/.test(parsed.pathname)) return null;
          parsed.search = '';
          return parsed.href;
        }
        return null;
      } catch {
        return null;
      }
    }

    function isListingHref(href) {
      if (provider === 'airbnb') return /\\/rooms\\/\\d+/.test(href);
      if (provider === 'zonaprop') return /\\/propiedades\\/clasificado\\//.test(href);
      if (provider === 'argenprop') return /--\\d+(?:[/?#]|$)/.test(href);
      return false;
    }

    const urls = new Set();
    for (const anchor of document.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href') || '';
      if (!isListingHref(href)) continue;
      const normalized = normalizeUrl(href);
      if (normalized) urls.add(normalized);
    }
    return Array.from(urls);
  }, { provider });
}

async function clickNextPage(nextPageNumber) {
  const nextHref = await state.page.evaluate(({ provider, nextPageNumber }) => {
    function usableHref(anchor) {
      const href = anchor.getAttribute('href');
      if (!href || href === '#' || href.startsWith('javascript:')) return null;
      try { return new URL(href, location.href).href; } catch { return null; }
    }

    const anchors = Array.from(document.querySelectorAll('a[href]'));
    if (provider === 'zonaprop') {
      const arrow = anchors.find((anchor) => (anchor.getAttribute('class') || '').includes('paging-module__page-arrow'));
      if (arrow) return usableHref(arrow);
      const numbered = anchors.find((anchor) => {
        const text = (anchor.innerText || anchor.textContent || '').trim();
        return text === String(nextPageNumber) && /pagina-\\d+\\.html/i.test(anchor.getAttribute('href') || '');
      });
      if (numbered) return usableHref(numbered);
    }

    if (provider === 'argenprop') {
      const byText = anchors.find((anchor) => {
        const text = (anchor.innerText || anchor.textContent || '').trim();
        return text === String(nextPageNumber);
      });
      if (byText) return usableHref(byText);

      const current = location.href;
      if (/([?&])pagina-\\d+/.test(current)) {
        return current.replace(/([?&])pagina-\\d+/, '$1pagina-' + nextPageNumber);
      }
      return current + (current.includes('?') ? '&' : '?') + 'pagina-' + nextPageNumber;
    }

    const byRel = anchors.find((anchor) => (anchor.getAttribute('rel') || '').toLowerCase().includes('next'));
    if (byRel) return usableHref(byRel);

    const textMatch = anchors.find((anchor) => {
      const text = (anchor.innerText || anchor.textContent || anchor.getAttribute('aria-label') || '').trim();
      return /^(next|siguiente|>)$/i.test(text);
    });
    if (textMatch) return usableHref(textMatch);

    return null;
  }, { provider, nextPageNumber });

  if (nextHref) {
    await state.page.goto(nextHref, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForPageLoad({ page: state.page, timeout: 12000 }).catch(() => undefined);
    await state.page.waitForTimeout(1400);
    return true;
  }

  if (provider === 'airbnb') {
    const clickableNextLocators = [
      state.page.locator('a[aria-label*="Next"], button[aria-label*="Next"], a[aria-label*="next"], button[aria-label*="next"]'),
      state.page.getByRole('link', { name: /^(Next|Siguiente)$/i }),
      state.page.getByRole('button', { name: /^(Next|Siguiente)$/i }),
    ];

    for (const locator of clickableNextLocators) {
      try {
        const candidate = locator.first();
        if (!(await candidate.isVisible({ timeout: 1200 }))) continue;
        if (await candidate.isDisabled().catch(() => false)) continue;
        await candidate.click({ timeout: 8000 });
        await waitForPageLoad({ page: state.page, timeout: 12000 }).catch(() => undefined);
        await state.page.waitForTimeout(1800);
        return true;
      } catch {}
    }
  }

  return false;
}

if (provider === 'zonaprop') {
  const payload = await discoverZonapropFromHtml();
  console.log(${JSON.stringify(startMarker)});
  console.log(JSON.stringify(payload));
  console.log(${JSON.stringify(endMarker)});
  return;
}

state.page = context.pages().find((p) => p.url() === 'about:blank') ?? await context.newPage();
await state.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitForPageLoad({ page: state.page, timeout: 15000 }).catch(() => undefined);
await state.page.waitForTimeout(1600);

const listingUrls = [];
const seenListingUrls = new Set();
const pageUrls = [];
const seenPageUrls = new Set();

for (let pageIndex = 0; pageIndex < maxPages && listingUrls.length < maxListings; pageIndex += 1) {
  await scrollResults();
  const currentPageUrl = state.page.url();
  if (!seenPageUrls.has(currentPageUrl)) {
    seenPageUrls.add(currentPageUrl);
    pageUrls.push(currentPageUrl);
  }

  for (const url of await collectListingUrls()) {
    if (seenListingUrls.has(url)) continue;
    seenListingUrls.add(url);
    listingUrls.push(url);
    if (listingUrls.length >= maxListings) break;
  }

  if (listingUrls.length >= maxListings) break;
  const beforeNextUrl = state.page.url();
  const clickedNext = await clickNextPage(pageIndex + 2);
  if (!clickedNext) break;
  if (state.page.url() === beforeNextUrl && pageIndex > 0) {
    await state.page.waitForTimeout(1200);
  }
}

const payload = {
  search_url: searchUrl,
  page_url: state.page.url(),
  page_urls: pageUrls,
  listing_urls: listingUrls,
};
console.log(${JSON.stringify(startMarker)});
console.log(JSON.stringify(payload));
console.log(${JSON.stringify(endMarker)});
`;
}
