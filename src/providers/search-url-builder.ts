import type { SearchProvider } from "./search";

export type SearchFilters = {
  provider: SearchProvider;
  neighborhoods: string[];
  maxPriceUsd?: number;
  ambientes?: number;
  dormitorios?: number;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
};

export type BuiltSearchUrl = {
  provider: SearchProvider;
  url: string;
  warnings: string[];
  ignored: string[];
};

type Neighborhood = {
  label: string;
  zonaprop: string;
  argenprop: string;
  airbnb: string;
};

const NEIGHBORHOODS: Record<string, Neighborhood> = {
  nunez: {
    label: "Nuñez",
    zonaprop: "nunez",
    argenprop: "nunez",
    airbnb: "Nuñez",
  },
  "las-canitas": {
    label: "Las Cañitas",
    zonaprop: "las-canitas",
    argenprop: "las-canitas",
    airbnb: "Las Cañitas",
  },
  belgrano: {
    label: "Belgrano",
    zonaprop: "belgrano",
    argenprop: "belgrano",
    airbnb: "Belgrano",
  },
  palermo: {
    label: "Palermo",
    zonaprop: "palermo",
    argenprop: "palermo",
    airbnb: "Palermo",
  },
  caballito: {
    label: "Caballito",
    zonaprop: "caballito",
    argenprop: "caballito",
    airbnb: "Caballito",
  },
  recoleta: {
    label: "Recoleta",
    zonaprop: "recoleta",
    argenprop: "recoleta",
    airbnb: "Recoleta",
  },
  "puerto-madero": {
    label: "Puerto Madero",
    zonaprop: "puerto-madero",
    argenprop: "puerto-madero",
    airbnb: "Puerto Madero",
  },
  "san-telmo": {
    label: "San Telmo",
    zonaprop: "san-telmo",
    argenprop: "san-telmo",
    airbnb: "San Telmo",
  },
};

export function supportedNeighborhoods(): string[] {
  return Object.keys(NEIGHBORHOODS).sort();
}

export function parseNeighborhoodList(values: string[]): string[] {
  return values.flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function buildSearchUrl(filters: SearchFilters): BuiltSearchUrl {
  const neighborhoods = resolveNeighborhoods(filters.neighborhoods);
  if (filters.provider === "zonaprop") return buildZonapropUrl(filters, neighborhoods);
  if (filters.provider === "argenprop") return buildArgenpropUrl(filters, neighborhoods);
  return buildAirbnbUrl(filters, neighborhoods);
}

function resolveNeighborhoods(values: string[]): Neighborhood[] {
  if (values.length === 0) {
    throw new Error(`At least one --neighborhood is required. Supported: ${supportedNeighborhoods().join(", ")}.`);
  }

  return values.map((value) => {
    const key = normalizeNeighborhoodKey(value);
    const neighborhood = NEIGHBORHOODS[key];
    if (!neighborhood) {
      throw new Error(`Unsupported neighborhood "${value}". Supported: ${supportedNeighborhoods().join(", ")}.`);
    }
    return neighborhood;
  });
}

function normalizeNeighborhoodKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildZonapropUrl(filters: SearchFilters, neighborhoods: Neighborhood[]): BuiltSearchUrl {
  const parts = [
    "inmuebles",
    "alquiler",
    "temporal",
    ...neighborhoods.map((item) => item.zonaprop),
    "con",
    "amoblado",
  ];
  if (filters.ambientes) parts.push(String(filters.ambientes), "ambientes");
  if (filters.dormitorios) parts.push(String(filters.dormitorios), "dormitorios");
  if (filters.maxPriceUsd) parts.push("menos", String(filters.maxPriceUsd), "dolar");

  return {
    provider: "zonaprop",
    url: `https://www.zonaprop.com.ar/${parts.join("-")}.html`,
    warnings: [],
    ignored: [],
  };
}

function buildArgenpropUrl(filters: SearchFilters, neighborhoods: Neighborhood[]): BuiltSearchUrl {
  const pathParts = [
    "departamentos",
    "alquiler-temporal",
    neighborhoods.map((item) => item.argenprop).join("-o-"),
  ];
  if (filters.ambientes) pathParts.push(`${filters.ambientes}-ambientes`);
  if (filters.dormitorios) pathParts.push(`${filters.dormitorios}-dormitorios`);
  if (filters.maxPriceUsd) pathParts.push(`dolares-hasta-${filters.maxPriceUsd}`);

  return {
    provider: "argenprop",
    url: `https://www.argenprop.com/${pathParts.join("/")}?con-amoblado`,
    warnings: [],
    ignored: [],
  };
}

function buildAirbnbUrl(filters: SearchFilters, neighborhoods: Neighborhood[]): BuiltSearchUrl {
  const ignored: string[] = [];
  const warnings: string[] = [];
  if (filters.ambientes) ignored.push("ambientes");
  if (filters.dormitorios) ignored.push("dormitorios");
  if (!filters.checkIn || !filters.checkOut) {
    warnings.push("Airbnb searches work best with --check-in and --check-out; results and pricing may be incomplete.");
  }
  if (neighborhoods.length > 1) {
    warnings.push("Airbnb search URLs use one text query, so multiple neighborhoods are sent as a combined Buenos Aires query.");
  }

  const location = `${neighborhoods.map((item) => item.airbnb).join(", ")}, Buenos Aires`;
  const url = new URL(`https://www.airbnb.com/s/${encodeURIComponent(location).replace(/%20/g, "-")}/homes`);
  url.searchParams.set("refinement_paths[]", "/homes");
  url.searchParams.set("query", location);
  url.searchParams.set("search_mode", "regular_search");
  url.searchParams.set("room_types[]", "Entire home/apt");
  url.searchParams.set("amenities[]", "33");
  url.searchParams.set("adults", String(filters.adults ?? 1));
  url.searchParams.set("guests", String(filters.adults ?? 1));
  url.searchParams.set("disable_auto_translation", "true");
  if (filters.checkIn) url.searchParams.set("checkin", filters.checkIn);
  if (filters.checkOut) url.searchParams.set("checkout", filters.checkOut);
  if (filters.maxPriceUsd) url.searchParams.set("price_max", String(filters.maxPriceUsd));

  return {
    provider: "airbnb",
    url: url.toString(),
    warnings,
    ignored,
  };
}
