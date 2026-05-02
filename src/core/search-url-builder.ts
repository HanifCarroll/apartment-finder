import type { SearchProvider } from "../providers/search";

export type SearchFilters = {
  provider: SearchProvider;
  neighborhoods: string[];
  minPriceUsd?: number;
  maxPriceUsd?: number;
  minSurfaceM2?: number;
  maxSurfaceM2?: number;
  surfaceType?: "covered" | "total";
  minBathrooms?: number;
  minParking?: number;
  ambientes?: number;
  minAmbientes?: number;
  maxAmbientes?: number;
  dormitorios?: number;
  minDormitorios?: number;
  maxDormitorios?: number;
  furnished?: boolean;
  propertySubtypes?: string[];
  advertiserType?: "all" | "agency" | "owner";
  publicationDate?: "yesterday" | "today" | "last-week";
  age?: "under-construction" | "new" | "up-to-5-years";
  roomTypes?: string[];
  comforts?: string[];
  propertyFeatures?: string[];
  disposition?: string[];
  services?: string[];
  media?: string[];
  argenpropGeneralServices?: string[];
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  infants?: number;
  pets?: number;
  airbnbRoomTypes?: string[];
  airbnbAmenityIds?: string[];
  minBedrooms?: number;
  minBeds?: number;
  minAirbnbBathrooms?: number;
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

export type FilterOption = {
  value: string;
  label: string;
};

export const ZONAPROP_FILTER_OPTIONS = {
  propertySubtypes: [
    { value: "estandar", label: "Estándar" },
    { value: "monoambiente", label: "Monoambiente" },
    { value: "semipiso", label: "Semipiso" },
    { value: "piso", label: "Piso" },
  ],
  roomTypes: [
    { value: "cocina", label: "Cocina" },
    { value: "living-comedor", label: "Living comedor" },
    { value: "balcon", label: "Balcón" },
    { value: "lavadero", label: "Lavadero" },
  ],
  comforts: [
    { value: "pileta", label: "Pileta" },
    { value: "parrilla", label: "Parrilla" },
    { value: "encargado", label: "Encargado" },
    { value: "vigilancia", label: "Vigilancia" },
  ],
  propertyFeatures: [
    { value: "apto-profesional", label: "Apto profesional" },
    { value: "acceso-para-personas-con-movilidad-reducida", label: "Accesibilidad" },
    { value: "cocina-equipada", label: "Cocina equipada" },
  ],
  disposition: [
    { value: "contrafrente", label: "Contrafrente" },
    { value: "frente", label: "Frente" },
    { value: "interior", label: "Interior" },
  ],
  services: [
    { value: "luz", label: "Luz" },
    { value: "agua-corriente", label: "Agua corriente" },
    { value: "gas-natural", label: "Gas natural" },
    { value: "calefaccion", label: "Calefacción" },
  ],
  media: [
    { value: "recorrido-360", label: "Recorrido 360" },
    { value: "video", label: "Video" },
    { value: "planos", label: "Planos" },
  ],
} satisfies Record<string, FilterOption[]>;

export const ARGENPROP_FILTER_OPTIONS = {
  generalServices: [
    { value: "amoblado", label: "Amoblado" },
    { value: "electricidad", label: "Electricidad" },
    { value: "calefaccion", label: "Calefacción" },
    { value: "aire-acondicionado-individual", label: "Aire acondicionado individual" },
    { value: "ascensores-principales", label: "Ascensores principales" },
    { value: "pileta", label: "Pileta" },
    { value: "solarium", label: "Solarium" },
    { value: "parrilla", label: "Parrilla" },
    { value: "apto-profesional", label: "Apto profesional" },
    { value: "termotanque", label: "Termotanque" },
    { value: "permite-mascotas", label: "Permite mascotas" },
    { value: "agua-corriente", label: "Agua corriente" },
    { value: "ascensor", label: "Ascensor" },
    { value: "gas-natural", label: "Gas natural" },
    { value: "cable", label: "Cable" },
    { value: "ascensores-de-servicio", label: "Ascensores de servicio" },
  ],
} satisfies Record<string, FilterOption[]>;

export const AIRBNB_FILTER_OPTIONS = {
  roomTypes: [
    { value: "Entire home/apt", label: "Entire home" },
    { value: "Private room", label: "Room" },
    { value: "Shared room", label: "Shared room" },
  ],
  amenities: [
    { value: "4", label: "Wifi" },
    { value: "8", label: "Kitchen" },
    { value: "5", label: "Air conditioning" },
    { value: "33", label: "Washer" },
    { value: "34", label: "Dryer" },
    { value: "9", label: "Free parking" },
    { value: "46", label: "Iron" },
    { value: "7", label: "Pool" },
    { value: "15", label: "Gym" },
  ],
} satisfies Record<string, FilterOption[]>;

const NEIGHBORHOODS: Record<string, Neighborhood> = {
  agronomia: {
    key: "agronomia",
    label: "Agronomía",
    zonaprop: "agronomia",
    argenprop: "agronomia",
    airbnb: "Agronomía",
    group: "West",
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
  barracas: {
    key: "barracas",
    label: "Barracas",
    zonaprop: "barracas",
    argenprop: "barracas",
    airbnb: "Barracas",
    group: "South",
  },
  "barrio-norte": {
    key: "barrio-norte",
    label: "Barrio Norte",
    zonaprop: "barrio-norte",
    argenprop: "barrio-norte",
    airbnb: "Barrio Norte",
    group: "Central",
  },
  belgrano: {
    key: "belgrano",
    label: "Belgrano",
    zonaprop: "belgrano",
    argenprop: "belgrano",
    airbnb: "Belgrano",
    group: "North corridor",
  },
  boedo: {
    key: "boedo",
    label: "Boedo",
    zonaprop: "boedo",
    argenprop: "boedo",
    airbnb: "Boedo",
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
  chacarita: {
    key: "chacarita",
    label: "Chacarita",
    zonaprop: "chacarita",
    argenprop: "chacarita",
    airbnb: "Chacarita",
    group: "North corridor",
  },
  coghlan: {
    key: "coghlan",
    label: "Coghlan",
    zonaprop: "coghlan",
    argenprop: "coghlan",
    airbnb: "Coghlan",
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
  "la-boca": {
    key: "la-boca",
    label: "La Boca",
    zonaprop: "la-boca",
    argenprop: "boca",
    airbnb: "La Boca",
    group: "South",
  },
  "la-paternal": {
    key: "la-paternal",
    label: "La Paternal",
    zonaprop: "paternal",
    argenprop: "paternal",
    airbnb: "La Paternal",
    group: "West",
  },
  "las-canitas": {
    key: "las-canitas",
    label: "Las Cañitas",
    zonaprop: "las-canitas",
    argenprop: "las-canitas",
    airbnb: "Las Cañitas",
    group: "North corridor",
  },
  liniers: {
    key: "liniers",
    label: "Liniers",
    zonaprop: "liniers",
    argenprop: "liniers",
    airbnb: "Liniers",
    group: "West",
  },
  mataderos: {
    key: "mataderos",
    label: "Mataderos",
    zonaprop: "mataderos",
    argenprop: "mataderos",
    airbnb: "Mataderos",
    group: "West",
  },
  monserrat: {
    key: "monserrat",
    label: "Monserrat",
    zonaprop: "monserrat",
    argenprop: "monserrat",
    airbnb: "Monserrat",
    group: "Central",
  },
  "monte-castro": {
    key: "monte-castro",
    label: "Monte Castro",
    zonaprop: "monte-castro",
    argenprop: "monte-castro",
    airbnb: "Monte Castro",
    group: "West",
  },
  "nueva-pompeya": {
    key: "nueva-pompeya",
    label: "Nueva Pompeya",
    zonaprop: "nueva-pompeya",
    argenprop: "pompeya",
    airbnb: "Nueva Pompeya",
    group: "South",
  },
  nunez: {
    key: "nunez",
    label: "Nuñez",
    zonaprop: "nunez",
    argenprop: "nunez",
    airbnb: "Nuñez",
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
  "parque-avellaneda": {
    key: "parque-avellaneda",
    label: "Parque Avellaneda",
    zonaprop: "parque-avellaneda",
    argenprop: "parque-avellaneda",
    airbnb: "Parque Avellaneda",
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
  "parque-chacabuco": {
    key: "parque-chacabuco",
    label: "Parque Chacabuco",
    zonaprop: "parque-chacabuco",
    argenprop: "parque-chacabuco",
    airbnb: "Parque Chacabuco",
    group: "West",
  },
  "parque-chas": {
    key: "parque-chas",
    label: "Parque Chas",
    zonaprop: "parque-chas",
    argenprop: "parque-chas",
    airbnb: "Parque Chas",
    group: "North corridor",
  },
  "parque-patricios": {
    key: "parque-patricios",
    label: "Parque Patricios",
    zonaprop: "parque-patricios",
    argenprop: "parque-patricios",
    airbnb: "Parque Patricios",
    group: "South",
  },
  "puerto-madero": {
    key: "puerto-madero",
    label: "Puerto Madero",
    zonaprop: "puerto-madero",
    argenprop: "puerto-madero",
    airbnb: "Puerto Madero",
    group: "Central",
  },
  recoleta: {
    key: "recoleta",
    label: "Recoleta",
    zonaprop: "recoleta",
    argenprop: "recoleta",
    airbnb: "Recoleta",
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
  saavedra: {
    key: "saavedra",
    label: "Saavedra",
    zonaprop: "saavedra",
    argenprop: "saavedra",
    airbnb: "Saavedra",
    group: "North corridor",
  },
  "san-cristobal": {
    key: "san-cristobal",
    label: "San Cristóbal",
    zonaprop: "san-cristobal",
    argenprop: "san-cristobal",
    airbnb: "San Cristóbal",
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
  "san-telmo": {
    key: "san-telmo",
    label: "San Telmo",
    zonaprop: "san-telmo",
    argenprop: "san-telmo",
    airbnb: "San Telmo",
    group: "Central",
  },
  versalles: {
    key: "versalles",
    label: "Versalles",
    zonaprop: "versalles",
    argenprop: "versalles",
    airbnb: "Versalles",
    group: "West",
  },
  "velez-sarsfield": {
    key: "velez-sarsfield",
    label: "Vélez Sarsfield",
    zonaprop: "velez-sarsfield",
    argenprop: "velez-sarsfield",
    airbnb: "Vélez Sarsfield",
    group: "West",
  },
  "villa-crespo": {
    key: "villa-crespo",
    label: "Villa Crespo",
    zonaprop: "villa-crespo",
    argenprop: "villa-crespo",
    airbnb: "Villa Crespo",
    group: "North corridor",
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
  "villa-general-mitre": {
    key: "villa-general-mitre",
    label: "Villa General Mitre",
    zonaprop: "villa-general-mitre",
    argenprop: "villa-general-mitre",
    airbnb: "Villa General Mitre",
    group: "West",
  },
  "villa-lugano": {
    key: "villa-lugano",
    label: "Villa Lugano",
    zonaprop: "villa-lugano",
    argenprop: "villa-lugano",
    airbnb: "Villa Lugano",
    group: "South",
  },
  "villa-luro": {
    key: "villa-luro",
    label: "Villa Luro",
    zonaprop: "villa-luro",
    argenprop: "villa-luro",
    airbnb: "Villa Luro",
    group: "West",
  },
  "villa-ortuzar": {
    key: "villa-ortuzar",
    label: "Villa Ortúzar",
    zonaprop: "villa-ortuzar",
    argenprop: "villa-ortuzar",
    airbnb: "Villa Ortúzar",
    group: "North corridor",
  },
  "villa-pueyrredon": {
    key: "villa-pueyrredon",
    label: "Villa Pueyrredón",
    zonaprop: "villa-pueyrredon",
    argenprop: "villa-pueyrredon",
    airbnb: "Villa Pueyrredón",
    group: "West",
  },
  "villa-real": {
    key: "villa-real",
    label: "Villa Real",
    zonaprop: "villa-real",
    argenprop: "villa-real",
    airbnb: "Villa Real",
    group: "Other CABA",
  },
  "villa-riachuelo": {
    key: "villa-riachuelo",
    label: "Villa Riachuelo",
    zonaprop: "villa-riachuelo",
    argenprop: "villa-riachuelo",
    airbnb: "Villa Riachuelo",
    group: "South",
  },
  "villa-santa-rita": {
    key: "villa-santa-rita",
    label: "Villa Santa Rita",
    zonaprop: "villa-santa-rita",
    argenprop: "br-santa-rita",
    airbnb: "Villa Santa Rita",
    group: "West",
  },
  "villa-soldati": {
    key: "villa-soldati",
    label: "Villa Soldati",
    zonaprop: "villa-soldati",
    argenprop: "villa-soldati",
    airbnb: "Villa Soldati",
    group: "South",
  },
  "villa-urquiza": {
    key: "villa-urquiza",
    label: "Villa Urquiza",
    zonaprop: "villa-urquiza",
    argenprop: "villa-urquiza",
    airbnb: "Villa Urquiza",
    group: "North corridor",
  },
};

const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  paternal: "la-paternal",
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
    const normalizedKey = normalizeNeighborhoodKey(value);
    const key = NEIGHBORHOOD_ALIASES[normalizedKey] || normalizedKey;
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
  const ambientes = rangeFromExactOrBounds(filters.ambientes, filters.minAmbientes, filters.maxAmbientes);
  const dormitorios = rangeFromExactOrBounds(filters.dormitorios, filters.minDormitorios, filters.maxDormitorios);
  const parts = [
    "inmuebles",
    "alquiler",
    "temporal",
    ...neighborhoods.map((item) => item.zonaprop),
  ];
  if (filters.furnished !== false) parts.push("con", "amoblado");
  parts.push(...zonapropRangeParts(ambientes, "ambientes"));
  parts.push(...zonapropRangeParts(dormitorios, "habitaciones"));
  if (filters.minBathrooms) {
    if (filters.minBathrooms === 1) parts.push("1", "bano");
    else parts.push("mas", "de", String(filters.minBathrooms - 1), "banos");
  }
  if (typeof filters.minParking === "number") {
    if (filters.minParking === 0) parts.push("sin", "cocheras");
    else parts.push("mas", "de", String(filters.minParking - 1), "cocheras");
  }
  parts.push(...zonapropSurfaceParts(filters.surfaceType, filters.minSurfaceM2, filters.maxSurfaceM2));
  parts.push(...zonapropConParts(filters.propertySubtypes));
  parts.push(...zonapropConParts(filters.roomTypes));
  parts.push(...zonapropConParts(filters.comforts));
  parts.push(...zonapropConParts(filters.propertyFeatures));
  parts.push(...zonapropConParts(filters.disposition));
  parts.push(...zonapropConParts(filters.services));
  parts.push(...zonapropConParts(filters.media));
  parts.push(...zonapropAdvertiserParts(filters.advertiserType));
  parts.push(...zonapropPublicationDateParts(filters.publicationDate));
  parts.push(...zonapropAgeParts(filters.age));
  parts.push(...zonapropPriceParts(filters.minPriceUsd, filters.maxPriceUsd));

  return {
    provider: "zonaprop",
    url: `https://www.zonaprop.com.ar/${parts.join("-")}.html`,
    warnings: [],
    ignored: [],
  };
}

function buildArgenpropUrl(filters: SearchFilters, neighborhoods: Neighborhood[]): BuiltSearchUrl {
  const ambientes = rangeFromExactOrBounds(filters.ambientes, filters.minAmbientes, filters.maxAmbientes);
  const dormitorios = rangeFromExactOrBounds(filters.dormitorios, filters.minDormitorios, filters.maxDormitorios);
  const pathParts = [
    "departamentos",
    "alquiler-temporal",
    neighborhoods.map((item) => item.argenprop).join("-o-"),
  ];
  pathParts.push(...argenpropRangePathParts(ambientes, "ambientes"));
  pathParts.push(...argenpropRangePathParts(dormitorios, "dormitorios"));
  if (filters.minBathrooms) pathParts.push(`${filters.minBathrooms}-o-mas-banos`);
  pathParts.push(...argenpropSurfacePathParts(filters.minSurfaceM2, filters.maxSurfaceM2));
  const pricePath = argenpropPricePath(filters.minPriceUsd, filters.maxPriceUsd);
  if (pricePath) pathParts.push(pricePath);
  const queryFlags = dedupeStrings([
    ...(filters.furnished === false ? [] : ["con-amoblado"]),
    ...(filters.argenpropGeneralServices || []).map((value) => `con-${value}`),
  ]);

  return {
    provider: "argenprop",
    url: `https://www.argenprop.com/${pathParts.join("/")}${queryFlags.length ? `?${queryFlags.join("&")}` : ""}`,
    warnings: [],
    ignored: [],
  };
}

function rangeFromExactOrBounds(exact?: number, min?: number, max?: number): { min?: number; max?: number } {
  const range = exact ? { min: exact, max: exact } : { min, max };
  if (range.min && range.max && range.min > range.max) {
    throw new Error(`Invalid range: min ${range.min} cannot be greater than max ${range.max}.`);
  }
  return range;
}

function zonapropPriceParts(min?: number, max?: number): string[] {
  validateMinMax(min, max, "price");
  if (min && max) return [String(min), String(max), "dolar"];
  if (max) return ["menos", String(max), "dolar"];
  if (min) return ["mas", "de", String(min), "dolar"];
  return [];
}

function argenpropPricePath(min?: number, max?: number): string | undefined {
  validateMinMax(min, max, "price");
  if (min && max) return `dolares-${min}-${max}`;
  if (max) return `dolares-hasta-${max}`;
  if (min) return `dolares-desde-${min}`;
  return undefined;
}

function validateMinMax(min: number | undefined, max: number | undefined, label: string): void {
  if (min && max && min > max) {
    throw new Error(`Invalid ${label} range: min ${min} cannot be greater than max ${max}.`);
  }
}

function zonapropRangeParts(range: { min?: number; max?: number }, unit: "ambientes" | "habitaciones"): string[] {
  if (range.min && range.max && range.min === range.max) return [String(range.min), unit];
  if (range.min && range.max) {
    if (range.min <= 1) return ["hasta", String(range.max), unit];
    return ["mas", "de", String(range.min - 1), unit, "hasta", String(range.max), unit];
  }
  if (range.min) {
    if (range.min <= 1) return [];
    return ["mas", "de", String(range.min - 1), unit];
  }
  if (range.max) return ["hasta", String(range.max), unit];
  return [];
}

function argenpropRangePathParts(range: { min?: number; max?: number }, unit: "ambientes" | "dormitorios"): string[] {
  if (range.min && range.max && range.min === range.max) return [`${range.min}-${unit}`];
  if (range.min && range.max) return [inclusiveRange(range.min, range.max).map((value) => `${value}-${unit}`).join("-o-")];
  if (range.min) return [`${range.min}-${unit}`];
  if (range.max) return [inclusiveRange(1, range.max).map((value) => `${value}-${unit}`).join("-o-")];
  return [];
}

function zonapropConParts(values: string[] | undefined): string[] {
  return (values || []).flatMap((value) => ["con", value]);
}

function zonapropSurfaceParts(type: SearchFilters["surfaceType"], min?: number, max?: number): string[] {
  validateMinMax(min, max, "surface");
  if (!min && !max) return [];
  const surfaceType = type === "covered" ? "cubierta" : "total";
  if (min && max) return [`${min}-${max}-metros-cuadrados-${surfaceType}`];
  if (max) return [`hasta-${max}-metros-cuadrados-${surfaceType}`];
  return [`mas-de-${min}-metros-cuadrados-${surfaceType}`];
}

function argenpropSurfacePathParts(min?: number, max?: number): string[] {
  validateMinMax(min, max, "surface");
  if (min && max) return [`metros-cuadrados-${min}-${max}`];
  if (max) return [`metros-cuadrados-hasta-${max}`];
  if (min) return [`metros-cuadrados-desde-${min}`];
  return [];
}

function zonapropAdvertiserParts(value: SearchFilters["advertiserType"]): string[] {
  if (value === "agency") return ["inmobiliaria"];
  if (value === "owner") return ["dueno-directo"];
  return [];
}

function zonapropPublicationDateParts(value: SearchFilters["publicationDate"]): string[] {
  if (value === "yesterday") return ["publicado-desde-ayer"];
  if (value === "today") return ["publicado-hoy"];
  if (value === "last-week") return ["publicado-ultimos-7-dias"];
  return [];
}

function zonapropAgeParts(value: SearchFilters["age"]): string[] {
  if (value === "under-construction") return ["en-construccion"];
  if (value === "new") return ["a-estrenar"];
  if (value === "up-to-5-years") return ["hasta-5-anos"];
  return [];
}

function inclusiveRange(min: number, max: number): number[] {
  if (max < min) return [];
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function buildAirbnbUrl(filters: SearchFilters, neighborhoods: Neighborhood[]): BuiltSearchUrl {
  const ignored: string[] = [];
  const warnings: string[] = [];
  if (filters.ambientes) ignored.push("ambientes");
  if (filters.minAmbientes) ignored.push("minAmbientes");
  if (filters.maxAmbientes) ignored.push("maxAmbientes");
  if (filters.dormitorios) ignored.push("dormitorios");
  if (filters.minDormitorios) ignored.push("minDormitorios");
  if (filters.maxDormitorios) ignored.push("maxDormitorios");
  if (filters.minSurfaceM2) ignored.push("minSurfaceM2");
  if (filters.maxSurfaceM2) ignored.push("maxSurfaceM2");
  if (filters.minParking) ignored.push("minParking");
  if (filters.propertySubtypes?.length) ignored.push("propertySubtypes");
  if (filters.argenpropGeneralServices?.length) ignored.push("argenpropGeneralServices");
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
  for (const roomType of filters.airbnbRoomTypes?.length ? filters.airbnbRoomTypes : ["Entire home/apt"]) {
    url.searchParams.append("room_types[]", roomType);
  }
  for (const amenityId of filters.airbnbAmenityIds?.length ? filters.airbnbAmenityIds : ["33"]) {
    url.searchParams.append("amenities[]", amenityId);
  }
  url.searchParams.set("adults", String(filters.adults ?? 1));
  if (filters.children) url.searchParams.set("children", String(filters.children));
  if (filters.infants) url.searchParams.set("infants", String(filters.infants));
  if (filters.pets) url.searchParams.set("pets", String(filters.pets));
  const guests = (filters.adults ?? 1) + (filters.children ?? 0);
  url.searchParams.set("guests", String(guests));
  url.searchParams.set("disable_auto_translation", "true");
  if (filters.checkIn) url.searchParams.set("checkin", filters.checkIn);
  if (filters.checkOut) url.searchParams.set("checkout", filters.checkOut);
  if (filters.minPriceUsd) url.searchParams.set("price_min", String(filters.minPriceUsd));
  if (filters.maxPriceUsd) url.searchParams.set("price_max", String(filters.maxPriceUsd));
  if (filters.minBedrooms) url.searchParams.set("min_bedrooms", String(filters.minBedrooms));
  if (filters.minBeds) url.searchParams.set("min_beds", String(filters.minBeds));
  if (filters.minAirbnbBathrooms) url.searchParams.set("min_bathrooms", String(filters.minAirbnbBathrooms));

  return {
    provider: "airbnb",
    url: url.toString(),
    warnings,
    ignored,
  };
}
