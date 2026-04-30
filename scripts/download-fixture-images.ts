import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { DEFAULT_CACHE_DIR, DEFAULT_EXTRACTION_CACHE, DEFAULT_MAX_IMAGES } from "../src/cli/args";
import { readCachedListingExtraction } from "../src/extraction-cache";
import { extractListingImageUrls } from "../src/listing/extraction";
import { DEFAULT_CONCURRENCY, mapConcurrent } from "../src/lib/concurrency";
import { loadImageFromUrl } from "../src/lib/images";
import { writeJsonl } from "../src/lib/jsonl";
import type { LocationLabel } from "../src/types";

type ListingFixture = {
  id: string;
  listing_url: string;
  expected_listing_location: LocationLabel;
};

type DownloadArgs = {
  fixturesPath: string;
  outPath: string;
  assetsDir: string;
  extractionCachePath: string;
  cacheDir: string;
  maxImages: number;
  concurrency: number;
  refreshExtraction: boolean;
  useExtractionCache: boolean;
};

class UsageExit extends Error {
  constructor(public readonly exitCode: number) {
    super("usage");
  }
}

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run fixtures:download-images [--fixtures fixtures/listings.jsonl]

Options:
  --fixtures <path>         Listing fixture JSONL path. Defaults to fixtures/listings.jsonl.
  --out <path>              Image manifest JSONL path. Defaults to fixtures/assets/listing-images.jsonl.
  --assets-dir <path>       Directory for copied fixture images. Defaults to fixtures/assets/listings.
  --extraction-cache <path> Listing extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --cache-dir <path>        Temporary remote image cache. Defaults to ${DEFAULT_CACHE_DIR}.
  --max-images <n>          Maximum photos per listing. Defaults to ${DEFAULT_MAX_IMAGES}.
  --concurrency <n>         Concurrent image downloads. Defaults to ${DEFAULT_CONCURRENCY}.
  --refresh-extraction      Extract live photo URLs when a cached extraction is missing.
  --no-extraction-cache     Do not read/write the extraction cache during live refresh.
`);
  throw new UsageExit(exitCode);
}

function parseArgs(argv: string[]): DownloadArgs {
  const args: DownloadArgs = {
    fixturesPath: "fixtures/listings.jsonl",
    outPath: "fixtures/assets/listing-images.jsonl",
    assetsDir: "fixtures/assets/listings",
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    cacheDir: DEFAULT_CACHE_DIR,
    maxImages: DEFAULT_MAX_IMAGES,
    concurrency: DEFAULT_CONCURRENCY,
    refreshExtraction: false,
    useExtractionCache: true,
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
      case "--assets-dir":
        if (!next) usage();
        args.assetsDir = next;
        i += 1;
        break;
      case "--extraction-cache":
        if (!next) usage();
        args.extractionCachePath = next;
        i += 1;
        break;
      case "--cache-dir":
        if (!next) usage();
        args.cacheDir = next;
        i += 1;
        break;
      case "--max-images": {
        if (!next) usage();
        const maxImages = Number.parseInt(next, 10);
        if (!Number.isInteger(maxImages) || maxImages < 1) usage();
        args.maxImages = maxImages;
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

function extensionForContentType(contentType: string): string {
  const normalized = contentType.split(";")[0]?.toLowerCase();
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  return ".img";
}

function imageExtension(contentType: string, cachedPath?: string): string {
  const fromContent = extensionForContentType(contentType);
  if (fromContent !== ".img") return fromContent;
  const fromPath = cachedPath ? extname(cachedPath) : "";
  return fromPath || ".img";
}

function manifestPath(path: string): string {
  return path.startsWith("/") ? relative(process.cwd(), path) : path;
}

async function imageUrlsForFixture(listing: ListingFixture, args: DownloadArgs): Promise<string[] | null> {
  const cached = args.useExtractionCache
    ? await readCachedListingExtraction(args.extractionCachePath, listing.listing_url)
    : null;
  if (cached?.image_urls.length && !args.refreshExtraction) return cached.image_urls.slice(0, args.maxImages);

  if (!args.refreshExtraction) return null;

  const extraction = await extractListingImageUrls(listing.listing_url, {
    maxImages: args.maxImages,
    useExtractionCache: args.useExtractionCache,
    refreshExtraction: args.refreshExtraction,
    extractionCachePath: args.extractionCachePath,
  });
  return extraction.image_urls.slice(0, args.maxImages);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const listings = parseJsonl<ListingFixture>(await readFile(args.fixturesPath, "utf8"));
  const records: unknown[] = [];
  let skipped = 0;
  let failed = 0;

  for (const listing of listings) {
    console.log(`Resolving ${listing.id}`);
    const imageUrls = await imageUrlsForFixture(listing, args);
    if (!imageUrls?.length) {
      skipped += 1;
      console.warn(`Skipping ${listing.id}: no cached extraction. Re-run with --refresh-extraction to fetch live URLs.`);
      continue;
    }

    const listingRecords = await mapConcurrent(imageUrls, args.concurrency, async (imageUrl, index) => {
      try {
        const image = await loadImageFromUrl(imageUrl, args.cacheDir);
        if (!image.cachedPath) throw new Error("download cache path missing");

        const extension = imageExtension(image.contentType, image.cachedPath);
        const localPath = join(args.assetsDir, listing.id, `${String(index).padStart(3, "0")}-${image.sha256.slice(0, 12)}${extension}`);
        await mkdir(dirname(localPath), { recursive: true });
        await copyFile(image.cachedPath, localPath);

        return {
          ok: true,
          type: "fixture_listing_image",
          created_at: new Date().toISOString(),
          fixture_id: listing.id,
          listing_url: listing.listing_url,
          expected_listing_location: listing.expected_listing_location,
          listing_image_index: index,
          image_url: imageUrl,
          local_path: manifestPath(localPath),
          sha256: image.sha256,
          content_type: image.contentType,
          bytes: image.bytes,
        };
      } catch (error) {
        failed += 1;
        return {
          ok: false,
          type: "fixture_listing_image",
          created_at: new Date().toISOString(),
          fixture_id: listing.id,
          listing_url: listing.listing_url,
          expected_listing_location: listing.expected_listing_location,
          listing_image_index: index,
          image_url: imageUrl,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    records.push(...listingRecords);
  }

  await writeJsonl(args.outPath, records);
  const okCount = records.filter((record) => Boolean(record && typeof record === "object" && (record as { ok?: boolean }).ok)).length;
  console.log(`Wrote ${args.outPath}`);
  console.log(`downloaded: ${okCount}`);
  console.log(`failed: ${failed}`);
  console.log(`skipped listings: ${skipped}`);
}

try {
  await main();
} catch (error) {
  if (error instanceof UsageExit) {
    process.exitCode = error.exitCode;
  } else {
    throw error;
  }
}
