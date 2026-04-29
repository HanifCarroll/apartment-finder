import type { SearchProvider } from "./search-providers";

export type SiteSmokeCase = {
  provider: SearchProvider;
  url: string;
  minBodyChars: number;
  minLinks: number;
};

export const SITE_SMOKE_CASES: SiteSmokeCase[] = [
  {
    provider: "zonaprop",
    url: "https://www.zonaprop.com.ar/inmuebles-alquiler-temporal-nunez-las-canitas-con-amoblado-menos-1500-dolar.html",
    minBodyChars: 1000,
    minLinks: 10,
  },
  {
    provider: "argenprop",
    url: "https://www.argenprop.com/departamentos/alquiler-temporal/las-canitas-o-nunez/dolares-hasta-1500?con-amoblado",
    minBodyChars: 1000,
    minLinks: 10,
  },
  {
    provider: "airbnb",
    url: "https://www.airbnb.com/s/Nu%C3%B1ez--Buenos-Aires/homes?place_id=ChIJtRA2Ov62vJURh2h44yGJvKI&refinement_paths%5B%5D=%2Fhomes&checkin=2026-06-14&checkout=2026-08-23&date_picker_type=calendar&adults=1&guests=1&query=Nu%C3%B1ez%2C%20Buenos%20Aires&amenities%5B%5D=33&room_types%5B%5D=Entire%20home%2Fapt&price_max=1500",
    minBodyChars: 1000,
    minLinks: 10,
  },
];
