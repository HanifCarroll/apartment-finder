import { chromium } from "playwright";
import type { SearchProvider } from "../providers/search";

export type PlaywrightSearchPayload = {
  search_url: string;
  page_url: string;
  page_urls: string[];
  listing_urls: string[];
};

export async function findListingUrlsWithPlaywright(
  searchUrl: string,
  provider: Extract<SearchProvider, "argenprop" | "airbnb">,
  maxListings: number,
  maxPages: number,
): Promise<PlaywrightSearchPayload> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      locale: "es-AR",
      timezoneId: "America/Argentina/Buenos_Aires",
      viewport: { width: 1365, height: 900 },
      extraHTTPHeaders: {
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      },
    });
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1600);

    const listingUrls: string[] = [];
    const seenListingUrls = new Set<string>();
    const pageUrls: string[] = [];
    const seenPageUrls = new Set<string>();

    for (let pageIndex = 0; pageIndex < maxPages && listingUrls.length < maxListings; pageIndex += 1) {
      await scrollResults(page);
      const currentPageUrl = page.url();
      if (!seenPageUrls.has(currentPageUrl)) {
        seenPageUrls.add(currentPageUrl);
        pageUrls.push(currentPageUrl);
      }

      for (const url of await collectListingUrls(page, provider)) {
        if (seenListingUrls.has(url)) continue;
        seenListingUrls.add(url);
        listingUrls.push(url);
        if (listingUrls.length >= maxListings) break;
      }

      if (listingUrls.length >= maxListings) break;
      const clickedNext = await goToNextPage(page, provider, pageIndex + 2);
      if (!clickedNext) break;
    }

    return {
      search_url: searchUrl,
      page_url: page.url(),
      page_urls: pageUrls,
      listing_urls: listingUrls,
    };
  } finally {
    await browser.close();
  }
}

async function scrollResults(page: Awaited<ReturnType<typeof chromium.launch>> extends infer _ ? import("playwright").Page : never): Promise<void> {
  let previousHeight = 0;
  for (let i = 0; i < 10; i += 1) {
    const height = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(900);
    if (height === previousHeight && i >= 3) break;
    previousHeight = height;
  }
}

async function collectListingUrls(page: import("playwright").Page, provider: "argenprop" | "airbnb"): Promise<string[]> {
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((anchor) => anchor.getAttribute("href"))
      .filter((href): href is string => Boolean(href)),
  );

  const urls = new Set<string>();
  for (const href of hrefs) {
    const normalized = normalizeListingUrl(provider, href, page.url());
    if (normalized) urls.add(normalized);
  }
  return Array.from(urls);
}

function normalizeListingUrl(provider: "argenprop" | "airbnb", rawUrl: string, baseUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl, baseUrl);
    parsed.hash = "";
    if (provider === "airbnb") {
      const roomId = parsed.pathname.match(/\/rooms\/(\d+)/)?.[1];
      return roomId ? new URL(`/rooms/${roomId}`, "https://www.airbnb.com").href : null;
    }
    if (!/--\d+$/.test(parsed.pathname)) return null;
    parsed.search = "";
    return parsed.href;
  } catch {
    return null;
  }
}

async function goToNextPage(page: import("playwright").Page, provider: "argenprop" | "airbnb", nextPageNumber: number): Promise<boolean> {
  const nextHref = await page.evaluate(({ provider, nextPageNumber }) => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const usableHref = (anchor: Element) => {
      const href = anchor.getAttribute("href");
      if (!href || href === "#" || href.startsWith("javascript:")) return null;
      try {
        return new URL(href, location.href).href;
      } catch {
        return null;
      }
    };

    if (provider === "argenprop") {
      const byText = anchors.find((anchor) => (anchor.textContent || "").trim() === String(nextPageNumber));
      if (byText) return usableHref(byText);

      const current = location.href;
      if (/([?&])pagina-\d+/.test(current)) return current.replace(/([?&])pagina-\d+/, `$1pagina-${nextPageNumber}`);
      return `${current}${current.includes("?") ? "&" : "?"}pagina-${nextPageNumber}`;
    }

    const byRel = anchors.find((anchor) => (anchor.getAttribute("rel") || "").toLowerCase().includes("next"));
    if (byRel) return usableHref(byRel);

    const byAria = anchors.find((anchor) =>
      /next|siguiente/i.test(anchor.getAttribute("aria-label") || "") && usableHref(anchor)
    );
    return byAria ? usableHref(byAria) : null;
  }, { provider, nextPageNumber });

  if (nextHref) {
    await page.goto(nextHref, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1600);
    return true;
  }

  if (provider === "airbnb") {
    const locator = page.locator('a[aria-label*="Next"], button[aria-label*="Next"], a[aria-label*="next"], button[aria-label*="next"]').first();
    try {
      if (await locator.isVisible({ timeout: 1200 }) && !(await locator.isDisabled().catch(() => false))) {
        await locator.click({ timeout: 8000 });
        await page.waitForTimeout(1800);
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}
