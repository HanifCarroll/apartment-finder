export type SearchProvider = "zonaprop" | "argenprop" | "airbnb";

export function detectSearchProvider(searchUrl: string): SearchProvider {
  const host = new URL(searchUrl).hostname;
  if (host.includes("zonaprop.com")) return "zonaprop";
  if (host.includes("argenprop.com")) return "argenprop";
  if (host.includes("airbnb.com")) return "airbnb";
  throw new Error(`Unsupported search provider: ${host}`);
}

export function validateSearchUrl(searchUrl: string, provider: SearchProvider): string[] {
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

