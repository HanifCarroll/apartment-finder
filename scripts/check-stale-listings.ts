import { readFile } from "node:fs/promises";
import { DEFAULT_EXTRACTION_CACHE } from "../src/cli/args";
import { DEFAULT_CONCURRENCY } from "../src/lib/concurrency";
import { mapConcurrent } from "../src/lib/concurrency";
import { writeJsonl } from "../src/lib/jsonl";
import { extractListingImageUrls } from "../src/listing/extraction";
import type { ListingExtraction, LocationLabel } from "../src/types";

type ListingFixture = {
  id: string;
  listing_url: string;
  expected_listing_location: LocationLabel;
};

type Args = {
  fixturesPath: string;
  outPath: string;
  extractionCachePath: string;
  maxImages: number;
  minQualityScore: number;
  concurrency: number;
  limit?: number;
  allowFailures: boolean;
};

type CheckStatus = "live" | "unpublished" | "low_quality" | "extraction_failed";

type CheckRecord = {
  type: "live_listing_check";
  ok: boolean;
  status: CheckStatus;
  listing_id: string;
  listing_url: string;
  expected_listing_location: LocationLabel;
  checked_at: string;
  unavailable_reason?: string;
  http_status?: number;
  probe_error?: string;
  image_count?: number;
  gallery_count?: number | null;
  extraction_source?: ListingExtraction["extraction_source"];
  extraction_attempts?: number;
  extraction_quality_score?: number;
  extraction_quality_failed_checks?: string[];
  error?: string;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run check:stale-listings [options]

Checks live fixture listing pages for unpublished listings and provider extraction drift.
This intentionally bypasses the listing extraction cache.

Options:
  --fixtures <path>          Listing fixture JSONL path. Defaults to fixtures/listings.jsonl.
  --out <path>               Write JSONL check records. Defaults to results/stale-listing-check.jsonl.
  --limit <n>                Check only the first n fixtures.
  --max-images <n>           Maximum photos to extract per listing. Defaults to 35.
  --min-quality-score <n>    Minimum extraction quality score. Defaults to 55.
  --concurrency <n>          Concurrent live checks. Defaults to min(${DEFAULT_CONCURRENCY}, 4).
  --extraction-cache <path>  Cache path option passed to extraction code. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --allow-failures           Exit 0 even when stale or failed listings are found.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    fixturesPath: "fixtures/listings.jsonl",
    outPath: "results/stale-listing-check.jsonl",
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    maxImages: 35,
    minQualityScore: 55,
    concurrency: Math.min(DEFAULT_CONCURRENCY, 4),
    allowFailures: false,
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
      case "--min-quality-score": {
        if (!next) usage();
        const minQualityScore = Number.parseInt(next, 10);
        if (!Number.isInteger(minQualityScore) || minQualityScore < 0) usage();
        args.minQualityScore = minQualityScore;
        i += 1;
        break;
      }
      case "--concurrency": {
        if (!next) usage();
        const concurrency = Number.parseInt(next, 10);
        if (!Number.isInteger(concurrency) || concurrency < 1) usage();
        args.concurrency = concurrency;
        i += 1;
        break;
      }
      case "--extraction-cache":
        if (!next) usage();
        args.extractionCachePath = next;
        i += 1;
        break;
      case "--allow-failures":
        args.allowFailures = true;
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

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function detectUnavailablePage(url: string, text: string): string | null {
  const normalized = normalizeText(text);
  const host = new URL(url).hostname;

  if (host.includes("zonaprop.com") && text.includes("section-icon-features-property")) {
    return null;
  }

  const checks = [
    "este aviso ya no esta publicado",
    "aviso ya no esta publicado",
    "publicacion finalizada",
    "publicacion pausada",
    "no se encuentra publicado",
    "pagina no encontrada",
    "page not found",
    "this listing is no longer available",
    "this home is no longer available",
  ];

  return checks.find((check) => normalized.includes(check)) || null;
}

async function probeListingPage(url: string): Promise<{ status?: number; unavailableReason?: string; error?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9,es;q=0.8",
        "user-agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      redirect: "follow",
    });
    const text = await response.text();
    return {
      status: response.status,
      unavailableReason: detectUnavailablePage(url, text) || (response.status === 404 ? "http_404" : undefined),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(records: CheckRecord[]): Record<CheckStatus, number> {
  return records.reduce(
    (acc, record) => {
      acc[record.status] += 1;
      return acc;
    },
    {
      live: 0,
      unpublished: 0,
      low_quality: 0,
      extraction_failed: 0,
    } satisfies Record<CheckStatus, number>,
  );
}

async function checkFixture(fixture: ListingFixture, args: Args): Promise<CheckRecord> {
  const checkedAt = new Date().toISOString();
  const probe = await probeListingPage(fixture.listing_url);

  if (probe.unavailableReason) {
    return {
      type: "live_listing_check",
      ok: false,
      status: "unpublished",
      listing_id: fixture.id,
      listing_url: fixture.listing_url,
      expected_listing_location: fixture.expected_listing_location,
      checked_at: checkedAt,
      unavailable_reason: probe.unavailableReason,
      http_status: probe.status,
    };
  }

  try {
    const extraction = await extractListingImageUrls(fixture.listing_url, {
      maxImages: args.maxImages,
      extractionCachePath: args.extractionCachePath,
      useExtractionCache: false,
      refreshExtraction: true,
    });
    const quality = extraction.extraction_quality;
    const qualityScore = quality?.score ?? 0;
    const failedChecks = quality?.checks.filter((check) => !check.ok).map((check) => check.name) || [];
    const ok = extraction.image_urls.length > 0 && qualityScore >= args.minQualityScore;

    return {
      type: "live_listing_check",
      ok,
      status: ok ? "live" : "low_quality",
      listing_id: fixture.id,
      listing_url: fixture.listing_url,
      expected_listing_location: fixture.expected_listing_location,
      checked_at: checkedAt,
      http_status: probe.status,
      probe_error: probe.error,
      image_count: extraction.image_urls.length,
      gallery_count: extraction.gallery_count,
      extraction_source: extraction.extraction_source,
      extraction_attempts: extraction.extraction_attempts,
      extraction_quality_score: qualityScore,
      extraction_quality_failed_checks: failedChecks,
    };
  } catch (error) {
    return {
      type: "live_listing_check",
      ok: false,
      status: "extraction_failed",
      listing_id: fixture.id,
      listing_url: fixture.listing_url,
      expected_listing_location: fixture.expected_listing_location,
      checked_at: checkedAt,
      http_status: probe.status,
      probe_error: probe.error,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const args = parseArgs(process.argv.slice(2));
const fixtures = parseJsonl<ListingFixture>(await readFile(args.fixturesPath, "utf8")).slice(0, args.limit);
console.log(`Checking ${fixtures.length} live fixture listings with concurrency ${args.concurrency}.`);

const records = await mapConcurrent(fixtures, args.concurrency, async (fixture, index) => {
  const record = await checkFixture(fixture, args);
  console.log(`${index + 1}/${fixtures.length} ${fixture.id}: ${record.status}`);
  return record;
});

await writeJsonl(args.outPath, records);
const summary = summarize(records);
const failed = records.filter((record) => !record.ok);

console.log("\nLive listing check summary");
console.log(`live: ${summary.live}`);
console.log(`unpublished: ${summary.unpublished}`);
console.log(`low quality: ${summary.low_quality}`);
console.log(`extraction failed: ${summary.extraction_failed}`);
console.log(`Wrote ${args.outPath}`);

if (failed.length > 0 && !args.allowFailures) {
  console.error(`\n${failed.length}/${records.length} live listing checks need review.`);
  process.exitCode = 1;
}
