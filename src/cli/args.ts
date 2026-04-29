import type { Args } from "../types";
import { DEFAULT_CONCURRENCY } from "../lib/concurrency";

export const DEFAULT_MODEL = "gpt-5.4-mini";
export const DEFAULT_ESCALATION_MODEL = "gpt-5.4";
export const DEFAULT_CACHE_DIR = ".apartment-laundry-cache";
export const DEFAULT_EXTRACTION_CACHE = `${DEFAULT_CACHE_DIR}/extractions.jsonl`;
export const DEFAULT_MAX_IMAGES = 60;

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run classify --image-url <url> [--models model-a,model-b] [--out results.jsonl]
  bun run classify --image <path> [--models model-a,model-b]
  bun run classify --listing-url <url> [--models model-a,model-b] [--classify-all]
  bun run classify --listing-url <url> --extract-only

Options:
  --image-url <url>   Download and classify an image URL.
  --image <path>      Classify a local image file.
  --listing-url <url> Extract Zonaprop listing photos with Playwriter, then classify them.
  --models <list>     Comma-separated OpenAI model IDs. Defaults to ${DEFAULT_MODEL}.
  --out <path>        Append JSONL model results to this file.
  --cache-dir <path>  Where downloaded images are cached. Defaults to ${DEFAULT_CACHE_DIR}.
  --extraction-cache <path> Listing photo extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --refresh-extraction Ignore cached listing extraction and write a fresh one.
  --no-extraction-cache Disable listing extraction reads and writes.
  --detail <level>    Image detail: low, high, or auto. Defaults to auto.
  --max-images <n>    Maximum listing photos to extract. Defaults to ${DEFAULT_MAX_IMAGES}.
  --concurrency <n>   Concurrent model calls for listing classification. Defaults to ${DEFAULT_CONCURRENCY}.
  --listing-summary   Return a listing-level decision using mini first, then ${DEFAULT_ESCALATION_MODEL} for uncertain photos.
  --escalation-model <model> Model for second-pass listing summary checks. Defaults to ${DEFAULT_ESCALATION_MODEL}.
  --classify-all      Classify every extracted listing photo. Default stops once a washer is found.
  --extract-only      Only extract listing photo URLs. Does not require OPENAI_API_KEY.
  --json              Print raw JSON instead of concise listing summary text.
`);
  process.exit(exitCode);
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    models: [process.env.OPENAI_MODEL || DEFAULT_MODEL],
    cacheDir: DEFAULT_CACHE_DIR,
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    useExtractionCache: true,
    refreshExtraction: false,
    detail: "auto",
    maxImages: DEFAULT_MAX_IMAGES,
    concurrency: DEFAULT_CONCURRENCY,
    listingSummary: false,
    escalationModel: process.env.OPENAI_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL,
    classifyAll: false,
    extractOnly: false,
    jsonOutput: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") usage(0);

    switch (arg) {
      case "--image-url":
        if (!next) usage();
        args.imageUrl = next;
        i += 1;
        break;
      case "--image":
        if (!next) usage();
        args.imagePath = next;
        i += 1;
        break;
      case "--listing-url":
        if (!next) usage();
        args.listingUrl = next;
        i += 1;
        break;
      case "--models":
        if (!next) usage();
        args.models = next
          .split(",")
          .map((model) => model.trim())
          .filter(Boolean);
        i += 1;
        break;
      case "--out":
        if (!next) usage();
        args.outPath = next;
        i += 1;
        break;
      case "--cache-dir":
        if (!next) usage();
        args.cacheDir = next;
        i += 1;
        break;
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
      case "--detail":
        if (!next || !["low", "high", "auto"].includes(next)) usage();
        args.detail = next as Args["detail"];
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
      case "--listing-summary":
        args.listingSummary = true;
        args.classifyAll = true;
        break;
      case "--escalation-model":
        if (!next) usage();
        args.escalationModel = next;
        i += 1;
        break;
      case "--classify-all":
        args.classifyAll = true;
        break;
      case "--extract-only":
        args.extractOnly = true;
        break;
      case "--json":
        args.jsonOutput = true;
        break;
      default:
        usage();
    }
  }

  const sourceCount = [args.imageUrl, args.imagePath, args.listingUrl].filter(Boolean).length;
  if (sourceCount !== 1) {
    console.error("Provide exactly one of --image-url, --image, or --listing-url.");
    usage();
  }

  if (args.models.length === 0) {
    console.error("Provide at least one model.");
    usage();
  }

  if (args.extractOnly && !args.listingUrl) {
    console.error("--extract-only only works with --listing-url.");
    usage();
  }

  return args;
}
