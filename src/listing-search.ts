import { createPlaywriterSession, parsePlaywriterJson, runPlaywriterScript } from "./playwriter-json";
import { createPlaywriterSearchScript } from "./search-playwriter";
import { findListingUrlsWithPlaywright } from "./search-playwright";
import {
  detectSearchProvider,
  validateSearchUrl,
  type SearchProvider,
} from "./search-providers";

const PLAYWRITER_JSON_START = "__APARTMENT_FINDER_SEARCH_JSON_START__";
const PLAYWRITER_JSON_END = "__APARTMENT_FINDER_SEARCH_JSON_END__";

export type { SearchProvider };

export type ListingSearchResult = {
  provider: SearchProvider;
  search_url: string;
  page_url: string;
  page_urls: string[];
  listing_urls: string[];
  listing_count: number;
  session_id: string;
  warnings: string[];
};

export { detectSearchProvider };

export function searchBackendForProvider(provider: SearchProvider): "local-playwright" | "playwriter" {
  return provider === "argenprop" || provider === "airbnb" ? "local-playwright" : "playwriter";
}

export async function findListingUrlsFromSearchUrl(
  searchUrl: string,
  maxListings: number,
  maxPages = 5,
): Promise<ListingSearchResult> {
  const provider = detectSearchProvider(searchUrl);
  const warnings = validateSearchUrl(searchUrl, provider);
  if (searchBackendForProvider(provider) === "local-playwright") {
    const payload = await findListingUrlsWithPlaywright(searchUrl, provider as "argenprop" | "airbnb", maxListings, maxPages);
    const listingUrls = Array.from(new Set(payload.listing_urls)).slice(0, maxListings);
    return {
      provider,
      search_url: payload.search_url,
      page_url: payload.page_url,
      page_urls: payload.page_urls || [payload.page_url],
      listing_urls: listingUrls,
      listing_count: listingUrls.length,
      session_id: "local-playwright",
      warnings,
    };
  }

  const sessionId = createPlaywriterSession();
  const stdout = runPlaywriterScript(
    sessionId,
    createPlaywriterSearchScript(
      searchUrl,
      provider,
      maxListings,
      maxPages,
      PLAYWRITER_JSON_START,
      PLAYWRITER_JSON_END,
    ),
    130_000,
  );
  const payload = parsePlaywriterJson<{
    search_url: string;
    page_url: string;
    page_urls?: string[];
    listing_urls: string[];
  }>(stdout, PLAYWRITER_JSON_START, PLAYWRITER_JSON_END);
  const listingUrls = Array.from(new Set(payload.listing_urls)).slice(0, maxListings);

  return {
    provider,
    search_url: payload.search_url,
    page_url: payload.page_url,
    page_urls: payload.page_urls || [payload.page_url],
    listing_urls: listingUrls,
    listing_count: listingUrls.length,
    session_id: sessionId,
    warnings,
  };
}
