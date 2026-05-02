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

describe("neighborhood registry", () => {
  it("builds provider URLs for every supported neighborhood", () => {
    const options = supportedNeighborhoodOptions();
    expect(options).toHaveLength(51);

    for (const option of options) {
      const zonaprop = buildSearchUrl({ provider: "zonaprop", neighborhoods: [option.key] });
      const argenprop = buildSearchUrl({ provider: "argenprop", neighborhoods: [option.key] });
      const airbnb = buildSearchUrl({ provider: "airbnb", neighborhoods: [option.key] });

      expect(zonaprop.url).toMatch(/^https:\/\/www\.zonaprop\.com\.ar\/inmuebles-alquiler-temporal-.+-con-amoblado\.html$/);
      expect(argenprop.url).toMatch(/^https:\/\/www\.argenprop\.com\/departamentos\/alquiler-temporal\/.+\?con-amoblado$/);
      expect(new URL(airbnb.url).searchParams.get("query")).toContain("Buenos Aires");
    }
  });

  it("keeps common aliases working", () => {
    const result = buildSearchUrl({
      provider: "zonaprop",
      neighborhoods: ["Paternal"],
    });

    expect(result.url).toContain("alquiler-temporal-paternal-con-amoblado");
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

  it("builds a Zonaprop URL with native advanced filters", () => {
    const result = buildSearchUrl({
      provider: "zonaprop",
      neighborhoods: ["palermo"],
      maxPriceUsd: 1500,
      minBathrooms: 1,
      minParking: 0,
      minSurfaceM2: 40,
      maxSurfaceM2: 80,
      surfaceType: "total",
      roomTypes: ["lavadero"],
      comforts: ["pileta", "parrilla"],
      advertiserType: "owner",
      publicationDate: "last-week",
      age: "new",
    });

    expect(result.url).toBe(
      "https://www.zonaprop.com.ar/inmuebles-alquiler-temporal-palermo-con-amoblado-1-bano-sin-cocheras-40-80-metros-cuadrados-total-con-lavadero-con-pileta-con-parrilla-dueno-directo-publicado-ultimos-7-dias-a-estrenar-menos-1500-dolar.html",
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

  it("builds an Argenprop URL with native services without duplicate furnished flags", () => {
    const result = buildSearchUrl({
      provider: "argenprop",
      neighborhoods: ["palermo"],
      maxPriceUsd: 1500,
      argenpropGeneralServices: ["amoblado", "pileta", "parrilla"],
    });

    expect(result.url).toBe(
      "https://www.argenprop.com/departamentos/alquiler-temporal/palermo/dolares-hasta-1500?con-amoblado&con-pileta&con-parrilla",
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

  it("builds an Airbnb URL with native guest, room, and amenity filters", () => {
    const result = buildSearchUrl({
      provider: "airbnb",
      neighborhoods: ["palermo"],
      checkIn: "2026-06-14",
      checkOut: "2026-08-23",
      adults: 2,
      children: 1,
      pets: 1,
      airbnbRoomTypes: ["Entire home/apt", "Private room"],
      airbnbAmenityIds: ["33", "4", "8"],
      minBedrooms: 2,
      minBeds: 2,
      minAirbnbBathrooms: 1,
    });
    const url = new URL(result.url);

    expect(url.searchParams.get("guests")).toBe("3");
    expect(url.searchParams.get("pets")).toBe("1");
    expect(url.searchParams.getAll("room_types[]")).toEqual(["Entire home/apt", "Private room"]);
    expect(url.searchParams.getAll("amenities[]")).toEqual(["33", "4", "8"]);
    expect(url.searchParams.get("min_bedrooms")).toBe("2");
    expect(url.searchParams.get("min_beds")).toBe("2");
    expect(url.searchParams.get("min_bathrooms")).toBe("1");
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

    expect(options.length).toBe(51);
    expect(nunez).toMatchObject({
      label: "Nuñez",
      group: "North corridor",
      providers: ["zonaprop", "argenprop", "airbnb"],
    });
  });
});
