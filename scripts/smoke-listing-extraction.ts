import { readFile } from "node:fs/promises";
import { DEFAULT_EXTRACTION_CACHE, DEFAULT_MAX_IMAGES } from "../src/args";
import { extractListingImageUrls } from "../src/listing-extraction";
import { appendJsonl } from "../src/jsonl";

type ListingFixture = {
  id: string;
  listing_url: string;
};

type SmokeArgs = {
  fixturesPath: string;
  outPath: string;
  limit: number;
  maxImages: number;
  extractionCachePath: string;
  useExtractionCache: boolean;
  refreshExtraction: boolean;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run smoke:extractions [--fixtures fixtures/listings.jsonl] [--limit 5]

Options:
  --fixtures <path>         Listing fixture JSONL path. Defaults to fixtures/listings.jsonl.
  --out <path>              Append smoke JSONL records. Defaults to results/extraction-smoke.jsonl.
  --limit <n>               Number of fixtures to test. Defaults to 5.
  --max-images <n>          Maximum photos per listing. Defaults to ${DEFAULT_MAX_IMAGES}.
  --extraction-cache <path> Listing photo extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --refresh-extraction      Ignore cached listing extraction and write a fresh one.
  --no-extraction-cache     Disable listing extraction reads and writes.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): SmokeArgs {
  const args: SmokeArgs = {
    fixturesPath: "fixtures/listings.jsonl",
    outPath: "results/extraction-smoke.jsonl",
    limit: 5,
    maxImages: DEFAULT_MAX_IMAGES,
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    useExtractionCache: true,
    refreshExtraction: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") usage(0);

    switch (arg) {
      case "--fixtures":
        if (!next) usage();
        args.fixturesPath = next;
        i += 1;
        break;
      case "--out":
        if (!next) usage();
        args.outPath = next;
        i += 1;
        break;
      case "--limit": {
        if (!next) usage();
        const limit = Number.parseInt(next, 10);
        if (!Number.isInteger(limit) || limit < 1) usage();
        args.limit = limit;
        i += 1;
        break;
      }
      case "--max-images": {
        if (!next) usage();
        const maxImages = Number.parseInt(next, 10);
        if (!Number.isInteger(maxImages) || maxImages < 1) usage();
        args.maxImages = maxImages;
        i += 1;
        break;
      }
      case "--extraction-cache":
        if (!next) usage();
        args.extractionCachePath = next;
        i += 1;
        break;
      case "--refresh-extraction":
        args.refreshExtraction = true;
        break;
      case "--no-extraction-cache":
        args.useExtractionCache = false;
        break;
      default:
        usage();
    }
  }

  return args;
}

function parseJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

const args = parseArgs(process.argv.slice(2));
const fixtures = parseJsonl<ListingFixture>(await readFile(args.fixturesPath, "utf8"))
  .slice(0, args.limit);

let failed = 0;
for (const fixture of fixtures) {
  try {
    const extraction = await extractListingImageUrls(fixture.listing_url, args);
    const record = {
      ok: true,
      type: "listing_extraction_smoke",
      created_at: new Date().toISOString(),
      listing_id: fixture.id,
      image_count: extraction.image_urls.length,
      ...extraction,
    };
    await appendJsonl(args.outPath, [record]);
    console.log(`${fixture.id}: ${record.image_count} images (${record.extraction_source})`);
  } catch (error) {
    failed += 1;
    const record = {
      ok: false,
      type: "listing_extraction_smoke",
      created_at: new Date().toISOString(),
      listing_id: fixture.id,
      listing_url: fixture.listing_url,
      error: error instanceof Error ? error.message : String(error),
    };
    await appendJsonl(args.outPath, [record]);
    console.error(`${fixture.id}: failed: ${record.error}`);
  }
}

if (failed > 0) {
  throw new Error(`${failed}/${fixtures.length} extraction smoke checks failed.`);
}
