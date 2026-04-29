import { appendJsonl } from "../src/lib/jsonl";
import { findListingUrlsWithPlaywriter } from "../src/providers/zonaprop";

function parseArgs(argv: string[]) {
  const args = {
    searchUrl: "",
    maxListings: 10,
    outPath: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--search-url":
        if (!next) throw new Error("--search-url requires a value.");
        args.searchUrl = next;
        i += 1;
        break;
      case "--max-listings":
        if (!next) throw new Error("--max-listings requires a value.");
        args.maxListings = Number.parseInt(next, 10);
        i += 1;
        break;
      case "--out":
        if (!next) throw new Error("--out requires a value.");
        args.outPath = next;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.searchUrl) throw new Error("Provide --search-url.");
  if (!Number.isInteger(args.maxListings) || args.maxListings < 1) {
    throw new Error("--max-listings must be a positive integer.");
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const result = await findListingUrlsWithPlaywriter(args.searchUrl, args.maxListings);

if (args.outPath) {
  await appendJsonl(args.outPath, [{
    ok: true,
    type: "zonaprop_listing_search",
    created_at: new Date().toISOString(),
    ...result,
    listing_count: result.listing_urls.length,
  }]);
}

console.log(JSON.stringify(result, null, 2));
