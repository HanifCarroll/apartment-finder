import type { SearchProvider } from "../providers/search";

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
  key: string;
  label: string;
  zonaprop: string;
  argenprop: string;
  airbnb: string;
  group: "North corridor" | "Central" | "West" | "South" | "Other CABA";
};

const NEIGHBORHOODS: Record<string, Neighborhood> = {
  nunez: {
    key: "nunez",
    label: "Nuñez",
    zonaprop: "nunez",
    argenprop: "nunez",
    airbnb: "Nuñez",
    group: "North corridor",
  },
  "las-canitas": {
    key: "las-canitas",
    label: "Las Cañitas",
    zonaprop: "las-canitas",
    argenprop: "las-canitas",
    airbnb: "Las Cañitas",
    group: "North corridor",
  },
  belgrano: {
    key: "belgrano",
    label: "Belgrano",
    zonaprop: "belgrano",
    argenprop: "belgrano",
    airbnb: "Belgrano",
    group: "North corridor",
  },
  palermo: {
    key: "palermo",
    label: "Palermo",
    zonaprop: "palermo",
    argenprop: "palermo",
    airbnb: "Palermo",
    group: "North corridor",
  },
  colegiales: {
    key: "colegiales",
    label: "Colegiales",
    zonaprop: "colegiales",
    argenprop: "colegiales",
    airbnb: "Colegiales",
    group: "North corridor",
  },
  chacarita: {
    key: "chacarita",
    label: "Chacarita",
    zonaprop: "chacarita",
    argenprop: "chacarita",
    airbnb: "Chacarita",
    group: "North corridor",
  },
  "villa-urquiza": {
    key: "villa-urquiza",
    label: "Villa Urquiza",
    zonaprop: "villa-urquiza",
    argenprop: "villa-urquiza",
    airbnb: "Villa Urquiza",
    group: "North corridor",
  },
  "villa-ortuzar": {
    key: "villa-ortuzar",
    label: "Villa Ortúzar",
    zonaprop: "villa-ortuzar",
    argenprop: "villa-ortuzar",
    airbnb: "Villa Ortúzar",
    group: "North corridor",
  },
  "villa-crespo": {
    key: "villa-crespo",
    label: "Villa Crespo",
    zonaprop: "villa-crespo",
    argenprop: "villa-crespo",
    airbnb: "Villa Crespo",
    group: "North corridor",
  },
  "barrio-norte": {
    key: "barrio-norte",
    label: "Barrio Norte",
    zonaprop: "barrio-norte",
    argenprop: "barrio-norte",
    airbnb: "Barrio Norte",
    group: "Central",
  },
  caballito: {
    key: "caballito",
    label: "Caballito",
    zonaprop: "caballito",
    argenprop: "caballito",
    airbnb: "Caballito",
    group: "West",
  },
  recoleta: {
    key: "recoleta",
    label: "Recoleta",
    zonaprop: "recoleta",
    argenprop: "recoleta",
    airbnb: "Recoleta",
    group: "Central",
  },
  "puerto-madero": {
    key: "puerto-madero",
    label: "Puerto Madero",
    zonaprop: "puerto-madero",
    argenprop: "puerto-madero",
    airbnb: "Puerto Madero",
    group: "Central",
  },
  "san-telmo": {
    key: "san-telmo",
    label: "San Telmo",
    zonaprop: "san-telmo",
    argenprop: "san-telmo",
    airbnb: "San Telmo",
    group: "Central",
  },
  retiro: {
    key: "retiro",
    label: "Retiro",
    zonaprop: "retiro",
    argenprop: "retiro",
    airbnb: "Retiro",
    group: "Central",
  },
  monserrat: {
    key: "monserrat",
    label: "Monserrat",
    zonaprop: "monserrat",
    argenprop: "monserrat",
    airbnb: "Monserrat",
    group: "Central",
  },
  "san-nicolas": {
    key: "san-nicolas",
    label: "San Nicolás",
    zonaprop: "san-nicolas",
    argenprop: "san-nicolas",
    airbnb: "San Nicolás",
    group: "Central",
  },
  almagro: {
    key: "almagro",
    label: "Almagro",
    zonaprop: "almagro",
    argenprop: "almagro",
    airbnb: "Almagro",
    group: "Central",
  },
  balvanera: {
    key: "balvanera",
    label: "Balvanera",
    zonaprop: "balvanera",
    argenprop: "balvanera",
    airbnb: "Balvanera",
    group: "Central",
  },
  boedo: {
    key: "boedo",
    label: "Boedo",
    zonaprop: "boedo",
    argenprop: "boedo",
    airbnb: "Boedo",
    group: "Central",
  },
  "parque-patricios": {
    key: "parque-patricios",
    label: "Parque Patricios",
    zonaprop: "parque-patricios",
    argenprop: "parque-patricios",
    airbnb: "Parque Patricios",
    group: "South",
  },
  barracas: {
    key: "barracas",
    label: "Barracas",
    zonaprop: "barracas",
    argenprop: "barracas",
    airbnb: "Barracas",
    group: "South",
  },
  "la-boca": {
    key: "la-boca",
    label: "La Boca",
    zonaprop: "la-boca",
    argenprop: "la-boca",
    airbnb: "La Boca",
    group: "South",
  },
  constitucion: {
    key: "constitucion",
    label: "Constitución",
    zonaprop: "constitucion",
    argenprop: "constitucion",
    airbnb: "Constitución",
    group: "South",
  },
  flores: {
    key: "flores",
    label: "Flores",
    zonaprop: "flores",
    argenprop: "flores",
    airbnb: "Flores",
    group: "West",
  },
  floresta: {
    key: "floresta",
    label: "Floresta",
    zonaprop: "floresta",
    argenprop: "floresta",
    airbnb: "Floresta",
    group: "West",
  },
  "villa-del-parque": {
    key: "villa-del-parque",
    label: "Villa del Parque",
    zonaprop: "villa-del-parque",
    argenprop: "villa-del-parque",
    airbnb: "Villa del Parque",
    group: "West",
  },
  "villa-devoto": {
    key: "villa-devoto",
    label: "Villa Devoto",
    zonaprop: "villa-devoto",
    argenprop: "villa-devoto",
    airbnb: "Villa Devoto",
    group: "West",
  },
  "villa-pueyrredon": {
    key: "villa-pueyrredon",
    label: "Villa Pueyrredón",
    zonaprop: "villa-pueyrredon",
    argenprop: "villa-pueyrredon",
    airbnb: "Villa Pueyrredón",
    group: "West",
  },
  paternal: {
    key: "paternal",
    label: "Paternal",
    zonaprop: "paternal",
    argenprop: "paternal",
    airbnb: "Paternal",
    group: "West",
  },
  agronomia: {
    key: "agronomia",
    label: "Agronomía",
    zonaprop: "agronomia",
    argenprop: "agronomia",
    airbnb: "Agronomía",
    group: "West",
  },
  "parque-chacabuco": {
    key: "parque-chacabuco",
    label: "Parque Chacabuco",
    zonaprop: "parque-chacabuco",
    argenprop: "parque-chacabuco",
    airbnb: "Parque Chacabuco",
    group: "West",
  },
  "villa-luro": {
    key: "villa-luro",
    label: "Villa Luro",
    zonaprop: "villa-luro",
    argenprop: "villa-luro",
    airbnb: "Villa Luro",
    group: "West",
  },
  "villa-santa-rita": {
    key: "villa-santa-rita",
    label: "Villa Santa Rita",
    zonaprop: "villa-santa-rita",
    argenprop: "villa-santa-rita",
    airbnb: "Villa Santa Rita",
    group: "West",
  },
  "villa-general-mitre": {
    key: "villa-general-mitre",
    label: "Villa General Mitre",
    zonaprop: "villa-general-mitre",
    argenprop: "villa-general-mitre",
    airbnb: "Villa General Mitre",
    group: "West",
  },
  "parque-centenario": {
    key: "parque-centenario",
    label: "Parque Centenario",
    zonaprop: "parque-centenario",
    argenprop: "parque-centenario",
    airbnb: "Parque Centenario",
    group: "Other CABA",
  },
  "villa-real": {
    key: "villa-real",
    label: "Villa Real",
    zonaprop: "villa-real",
    argenprop: "villa-real",
    airbnb: "Villa Real",
    group: "Other CABA",
  },
  "villa-lugano": {
    key: "villa-lugano",
    label: "Villa Lugano",
    zonaprop: "villa-lugano",
    argenprop: "villa-lugano",
    airbnb: "Villa Lugano",
    group: "South",
  },
  "villa-soldati": {
    key: "villa-soldati",
    label: "Villa Soldati",
    zonaprop: "villa-soldati",
    argenprop: "villa-soldati",
    airbnb: "Villa Soldati",
    group: "South",
  },
  "nueva-pompeya": {
    key: "nueva-pompeya",
    label: "Nueva Pompeya",
    zonaprop: "nueva-pompeya",
    argenprop: "nueva-pompeya",
    airbnb: "Nueva Pompeya",
    group: "South",
  },
  "villa-riachuelo": {
    key: "villa-riachuelo",
    label: "Villa Riachuelo",
    zonaprop: "villa-riachuelo",
    argenprop: "villa-riachuelo",
    airbnb: "Villa Riachuelo",
    group: "South",
  },
};

export type SupportedNeighborhood = {
  key: string;
  label: string;
  group: Neighborhood["group"];
  providers: ReadonlyArray<"zonaprop" | "argenprop" | "airbnb">;
};

export function supportedNeighborhoods(): string[] {
  return Object.keys(NEIGHBORHOODS).sort();
}

export function supportedNeighborhoodOptions(): SupportedNeighborhood[] {
  return Object.values(NEIGHBORHOODS)
    .map((item) => ({
      key: item.key,
      label: item.label,
      group: item.group,
      providers: ["zonaprop", "argenprop", "airbnb"] as const,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
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
