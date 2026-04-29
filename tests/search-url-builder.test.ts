import { describe, expect, it } from "vitest";
import { buildSearchUrl, parseNeighborhoodList } from "../src/core";

describe("parseNeighborhoodList", () => {
  it("supports repeated and comma-separated neighborhoods", () => {
    expect(parseNeighborhoodList(["nunez, las-canitas", "belgrano"])).toEqual([
      "nunez",
      "las-canitas",
      "belgrano",
    ]);
  });
});

describe("buildSearchUrl", () => {
  it("builds a furnished Zonaprop URL with provider-specific filter slugs", () => {
    const result = buildSearchUrl({
      provider: "zonaprop",
      neighborhoods: ["Nuñez", "Las Cañitas"],
      maxPriceUsd: 1500,
      ambientes: 2,
    });

    expect(result.url).toBe(
      "https://www.zonaprop.com.ar/inmuebles-alquiler-temporal-nunez-las-canitas-con-amoblado-2-ambientes-menos-1500-dolar.html",
    );
    expect(result.ignored).toEqual([]);
  });

  it("builds a furnished Argenprop URL with provider-specific path segments", () => {
    const result = buildSearchUrl({
      provider: "argenprop",
      neighborhoods: ["las canitas", "nunez"],
      maxPriceUsd: 1500,
      dormitorios: 1,
    });

    expect(result.url).toBe(
      "https://www.argenprop.com/departamentos/alquiler-temporal/las-canitas-o-nunez/1-dormitorios/dolares-hasta-1500?con-amoblado",
    );
  });

  it("builds an Airbnb URL with washer, dates, price, and whole-home filters", () => {
    const result = buildSearchUrl({
      provider: "airbnb",
      neighborhoods: ["nunez"],
      maxPriceUsd: 1500,
      checkIn: "2026-06-14",
      checkOut: "2026-08-23",
      ambientes: 2,
    });
    const url = new URL(result.url);

    expect(url.hostname).toBe("www.airbnb.com");
    expect(url.searchParams.get("checkin")).toBe("2026-06-14");
    expect(url.searchParams.get("checkout")).toBe("2026-08-23");
    expect(url.searchParams.get("price_max")).toBe("1500");
    expect(url.searchParams.get("amenities[]")).toBe("33");
    expect(url.searchParams.get("room_types[]")).toBe("Entire home/apt");
    expect(result.ignored).toEqual(["ambientes"]);
  });

  it("rejects unsupported neighborhoods", () => {
    expect(() => buildSearchUrl({
      provider: "zonaprop",
      neighborhoods: ["not-a-real-neighborhood"],
    })).toThrow("Unsupported neighborhood");
  });
});
