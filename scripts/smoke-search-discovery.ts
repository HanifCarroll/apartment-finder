#!/usr/bin/env bun
import { findListingUrlsFromSearchUrl } from "../src/listing-search";

type SmokeCase = {
  provider: string;
  searchUrl: string;
  minListings: number;
  maxListings: number;
  maxPages: number;
  minPages: number;
};

const CASES: SmokeCase[] = [
  {
    provider: "zonaprop",
    searchUrl: "https://www.zonaprop.com.ar/inmuebles-alquiler-temporal-nunez-las-canitas-con-amoblado-menos-1500-dolar.html",
    minListings: 30,
    maxListings: 45,
    maxPages: 2,
    minPages: 2,
  },
  {
    provider: "argenprop",
    searchUrl: "https://www.argenprop.com/departamentos/alquiler-temporal/las-canitas-o-nunez/dolares-hasta-1500?con-amoblado",
    minListings: 25,
    maxListings: 30,
    maxPages: 2,
    minPages: 2,
  },
  {
    provider: "airbnb",
    searchUrl: "https://www.airbnb.com/s/Nu%C3%B1ez--Buenos-Aires/homes?place_id=ChIJtRA2Ov62vJURh2h44yGJvKI&refinement_paths%5B%5D=%2Fhomes&checkin=2026-06-14&checkout=2026-08-23&date_picker_type=calendar&flexible_start_date_search_filter_type=1&flexible_end_date_search_filter_type=6&adults=1&guests=1&search_type=filter_change&query=Nu%C3%B1ez%2C%20Buenos%20Aires&flexible_trip_lengths%5B%5D=one_week&monthly_start_date=2026-05-01&monthly_length=3&monthly_end_date=2026-08-01&search_mode=regular_search&price_filter_input_type=1&price_filter_num_nights=70&channel=EXPLORE&amenities%5B%5D=33&selected_filter_order%5B%5D=amenities%3A33&selected_filter_order%5B%5D=room_types%3AEntire%20home%2Fapt&selected_filter_order%5B%5D=price_max%3A1500&update_selected_filters=true&room_types%5B%5D=Entire%20home%2Fapt&disable_auto_translation=true&price_max=1500",
    minListings: 20,
    maxListings: 25,
    maxPages: 2,
    minPages: 2,
  },
];

function parseArgs(argv: string[]) {
  const args = {
    provider: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--provider":
        if (!next) throw new Error("--provider requires a value.");
        args.provider = next;
        i += 1;
        break;
      case "--help":
      case "-h":
        console.log("Usage: bun run smoke:search [--provider zonaprop|argenprop|airbnb]");
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const cases = args.provider
  ? CASES.filter((item) => item.provider === args.provider)
  : CASES;

if (cases.length === 0) {
  throw new Error(`No search smoke case found for provider: ${args.provider}`);
}

for (const smokeCase of cases) {
  console.log(`Checking ${smokeCase.provider} search discovery`);
  const result = await findListingUrlsFromSearchUrl(
    smokeCase.searchUrl,
    smokeCase.maxListings,
    smokeCase.maxPages,
  );
  const uniqueCount = new Set(result.listing_urls).size;

  if (result.provider !== smokeCase.provider) {
    throw new Error(`${smokeCase.provider}: expected provider ${smokeCase.provider}, got ${result.provider}`);
  }
  if (result.listing_count < smokeCase.minListings) {
    throw new Error(`${smokeCase.provider}: expected at least ${smokeCase.minListings} listings, got ${result.listing_count}`);
  }
  if (uniqueCount !== result.listing_count) {
    throw new Error(`${smokeCase.provider}: duplicate listing URLs found`);
  }
  if (result.page_urls.length < smokeCase.minPages) {
    throw new Error(`${smokeCase.provider}: expected at least ${smokeCase.minPages} page URLs, got ${result.page_urls.length}`);
  }

  console.log(`${smokeCase.provider}: ${result.listing_count} listings across ${result.page_urls.length} page(s)`);
}
