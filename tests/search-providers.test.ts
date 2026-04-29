import { describe, expect, it } from "vitest";
import { detectSearchProvider, validateSearchUrl } from "../src/providers/search";

describe("detectSearchProvider", () => {
  it("detects supported search providers from URLs", () => {
    expect(detectSearchProvider("https://www.zonaprop.com.ar/inmuebles-alquiler-temporal.html")).toBe("zonaprop");
    expect(detectSearchProvider("https://www.argenprop.com/departamentos/alquiler-temporal")).toBe("argenprop");
    expect(detectSearchProvider("https://www.airbnb.com/s/Nunez--Buenos-Aires/homes")).toBe("airbnb");
  });

  it("rejects unsupported hosts", () => {
    expect(() => detectSearchProvider("https://example.com/search")).toThrow("Unsupported search provider");
  });
});

describe("validateSearchUrl", () => {
  it("warns when Airbnb URLs are missing dates or washer filter", () => {
    const warnings = validateSearchUrl("https://www.airbnb.com/s/Nunez--Buenos-Aires/homes", "airbnb");

    expect(warnings).toContain("Airbnb search URL has no checkin/checkout dates; results and pricing may be incomplete.");
    expect(warnings).toContain("Airbnb URL does not include amenities[]=33, so results may not be washer-filtered.");
  });

  it("accepts Airbnb URLs with dates and washer filter", () => {
    const warnings = validateSearchUrl(
      "https://www.airbnb.com/s/Nunez--Buenos-Aires/homes?checkin=2026-06-14&checkout=2026-08-23&amenities%5B%5D=33",
      "airbnb",
    );

    expect(warnings).toEqual([]);
  });
});
