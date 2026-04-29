import { runCommand } from "./shell";

const PLAYWRITER_JSON_START = "__APARTMENT_FINDER_SEARCH_JSON_START__";
const PLAYWRITER_JSON_END = "__APARTMENT_FINDER_SEARCH_JSON_END__";

export type SearchProvider = "zonaprop" | "argenprop" | "airbnb";

export type ListingSearchResult = {
  provider: SearchProvider;
  search_url: string;
  page_url: string;
  listing_urls: string[];
  listing_count: number;
  session_id: string;
  warnings: string[];
};

function parsePlaywriterJson<T>(stdout: string): T {
  const cleaned = stdout.replace(/^\[log\]\s?/gm, "");
  const pattern = new RegExp(`${PLAYWRITER_JSON_START}\\n([\\s\\S]*?)\\n${PLAYWRITER_JSON_END}`);
  const match = cleaned.match(pattern);
  if (!match) {
    throw new Error(`Could not find Playwriter search JSON payload in output:\n${stdout.slice(-4000)}`);
  }

  return JSON.parse(match[1]) as T;
}

export function detectSearchProvider(searchUrl: string): SearchProvider {
  const host = new URL(searchUrl).hostname;
  if (host.includes("zonaprop.com")) return "zonaprop";
  if (host.includes("argenprop.com")) return "argenprop";
  if (host.includes("airbnb.com")) return "airbnb";
  throw new Error(`Unsupported search provider: ${host}`);
}

function validateSearchUrl(searchUrl: string, provider: SearchProvider): string[] {
  const parsed = new URL(searchUrl);
  const warnings: string[] = [];

  if (provider === "airbnb") {
    if (!parsed.searchParams.get("checkin") || !parsed.searchParams.get("checkout")) {
      warnings.push("Airbnb search URL has no checkin/checkout dates; results and pricing may be incomplete.");
    }
    if (!parsed.searchParams.getAll("amenities[]").includes("33")) {
      warnings.push("Airbnb URL does not include amenities[]=33, so results may not be washer-filtered.");
    }
  }

  if ((provider === "zonaprop" || provider === "argenprop") && !/1500|dolar|dolares/i.test(searchUrl)) {
    warnings.push("Search URL does not visibly include the expected dollar/max-price filter; verify the site URL before scanning.");
  }

  return warnings;
}

function createPlaywriterSearchScript(searchUrl: string, provider: SearchProvider, maxListings: number): string {
  return `
const searchUrl = ${JSON.stringify(searchUrl)};
const provider = ${JSON.stringify(provider)};
const maxListings = ${JSON.stringify(maxListings)};

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

state.page = context.pages().find((p) => p.url() === 'about:blank') ?? await context.newPage();
await state.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitForPageLoad({ page: state.page, timeout: 15000 }).catch(() => undefined);
await state.page.waitForTimeout(1600);
await scrollResults();

const listingUrls = await state.page.evaluate(({ limit, provider }) => {
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
  return Array.from(urls).slice(0, limit);
}, { limit: maxListings, provider });

const payload = {
  search_url: searchUrl,
  page_url: state.page.url(),
  listing_urls: listingUrls,
};
console.log(${JSON.stringify(PLAYWRITER_JSON_START)});
console.log(JSON.stringify(payload));
console.log(${JSON.stringify(PLAYWRITER_JSON_END)});
`;
}

export async function findListingUrlsFromSearchUrl(
  searchUrl: string,
  maxListings: number,
): Promise<ListingSearchResult> {
  const provider = detectSearchProvider(searchUrl);
  const warnings = validateSearchUrl(searchUrl, provider);
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
      "120000",
      "-e",
      createPlaywriterSearchScript(searchUrl, provider, maxListings),
    ],
    130_000,
  );
  const payload = parsePlaywriterJson<{
    search_url: string;
    page_url: string;
    listing_urls: string[];
  }>(stdout);
  const listingUrls = Array.from(new Set(payload.listing_urls)).slice(0, maxListings);

  return {
    provider,
    search_url: payload.search_url,
    page_url: payload.page_url,
    listing_urls: listingUrls,
    listing_count: listingUrls.length,
    session_id: sessionId,
    warnings,
  };
}
