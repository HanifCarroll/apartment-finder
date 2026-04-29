import { describe, expect, it } from "vitest";
import { buildSearchUrl, parseNeighborhoodList, supportedNeighborhoodOptions } from "../src/core";

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

  it("builds a Zonaprop URL with min and max filter ranges", () => {
    const result = buildSearchUrl({
      provider: "zonaprop",
      neighborhoods: ["nunez"],
      minPriceUsd: 1000,
      maxPriceUsd: 1500,
      minAmbientes: 2,
      maxAmbientes: 3,
      minDormitorios: 1,
      maxDormitorios: 2,
    });

    expect(result.url).toBe(
      "https://www.zonaprop.com.ar/inmuebles-alquiler-temporal-nunez-con-amoblado-mas-de-1-ambientes-hasta-3-ambientes-hasta-2-habitaciones-1000-1500-dolar.html",
    );
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

  it("builds an Argenprop URL with min and max filter ranges", () => {
    const result = buildSearchUrl({
      provider: "argenprop",
      neighborhoods: ["belgrano"],
      minPriceUsd: 1000,
      maxPriceUsd: 1500,
      minAmbientes: 2,
      maxAmbientes: 3,
      minDormitorios: 1,
      maxDormitorios: 2,
    });

    expect(result.url).toBe(
      "https://www.argenprop.com/departamentos/alquiler-temporal/belgrano/2-ambientes-o-3-ambientes/1-dormitorios-o-2-dormitorios/dolares-1000-1500?con-amoblado",
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

  it("rejects invalid filter ranges", () => {
    expect(() => buildSearchUrl({
      provider: "zonaprop",
      neighborhoods: ["nunez"],
      minPriceUsd: 1500,
      maxPriceUsd: 1000,
    })).toThrow("Invalid price range");

    expect(() => buildSearchUrl({
      provider: "zonaprop",
      neighborhoods: ["nunez"],
      minAmbientes: 3,
      maxAmbientes: 2,
    })).toThrow("Invalid range");
  });
});

describe("supportedNeighborhoodOptions", () => {
  it("exposes checkbox-ready neighborhood metadata", () => {
    const options = supportedNeighborhoodOptions();
    const nunez = options.find((option) => option.key === "nunez");

    expect(options.length).toBeGreaterThan(25);
    expect(nunez).toMatchObject({
      label: "Nuñez",
      group: "North corridor",
      providers: ["zonaprop", "argenprop", "airbnb"],
    });
  });
});
