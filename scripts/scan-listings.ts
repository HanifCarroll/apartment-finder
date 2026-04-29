import { readFile } from "node:fs/promises";
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_ESCALATION_MODEL,
  DEFAULT_EXTRACTION_CACHE,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MODEL,
} from "../src/args";
import { DEFAULT_CONCURRENCY } from "../src/concurrency";
import { runClassification } from "../src/classifier-runner";
import { appendJsonl } from "../src/jsonl";
import {
  findListingExtractionRecord,
  findListingSummaryRecord,
  formatListingScanLine,
} from "../src/listing-output";
import type { Args } from "../src/types";

type ScanArgs = {
  inputPath?: string;
  outPath?: string;
  model: string;
  escalationModel: string;
  maxImages: number;
  concurrency: number;
  cacheDir: string;
  extractionCachePath: string;
  useExtractionCache: boolean;
  refreshExtraction: boolean;
  jsonOutput: boolean;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run scan --input urls.txt [--out results/scan.jsonl]
  printf '%s\\n' <url> | bun run scan

Options:
  --input <path>            Newline-delimited listing URLs. Defaults to stdin.
  --out <path>              Append full JSONL audit records.
  --model <model>           First-pass model. Defaults to ${DEFAULT_MODEL}.
  --escalation-model <id>   Second-pass model. Defaults to ${DEFAULT_ESCALATION_MODEL}.
  --max-images <n>          Maximum photos per listing. Defaults to ${DEFAULT_MAX_IMAGES}.
  --concurrency <n>         Concurrent model calls inside each listing. Defaults to ${DEFAULT_CONCURRENCY}.
  --cache-dir <path>        Image cache directory. Defaults to ${DEFAULT_CACHE_DIR}.
  --extraction-cache <path> Listing extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --refresh-extraction      Ignore cached listing extraction and write a fresh one.
  --no-extraction-cache     Disable listing extraction reads and writes.
  --json                    Print one JSON summary object per line instead of tab-separated text.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): ScanArgs {
  const args: ScanArgs = {
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    escalationModel: process.env.OPENAI_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL,
    maxImages: DEFAULT_MAX_IMAGES,
    concurrency: DEFAULT_CONCURRENCY,
    cacheDir: DEFAULT_CACHE_DIR,
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    useExtractionCache: true,
    refreshExtraction: false,
    jsonOutput: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") usage(0);

    switch (arg) {
      case "--input":
        if (!next) usage();
        args.inputPath = next;
        i += 1;
        break;
      case "--out":
        if (!next) usage();
        args.outPath = next;
        i += 1;
        break;
      case "--model":
        if (!next) usage();
        args.model = next;
        i += 1;
        break;
      case "--escalation-model":
        if (!next) usage();
        args.escalationModel = next;
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
      case "--json":
        args.jsonOutput = true;
        break;
      default:
        usage();
    }
  }

  return args;
}

async function readInputUrls(path?: string): Promise<string[]> {
  const text = path ? await readFile(path, "utf8") : await new Response(Bun.stdin.stream()).text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function toClassificationArgs(listingUrl: string, args: ScanArgs): Args {
  return {
    listingUrl,
    models: [args.model],
    cacheDir: args.cacheDir,
    extractionCachePath: args.extractionCachePath,
    useExtractionCache: args.useExtractionCache,
    refreshExtraction: args.refreshExtraction,
    detail: "auto",
    maxImages: args.maxImages,
    concurrency: args.concurrency,
    listingSummary: true,
    escalationModel: args.escalationModel,
    classifyAll: true,
    extractOnly: false,
    jsonOutput: true,
  };
}

const args = parseArgs(process.argv.slice(2));
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
}

const urls = await readInputUrls(args.inputPath);
if (urls.length === 0) {
  throw new Error("No listing URLs provided.");
}

if (!args.jsonOutput) {
  console.log(["decision", "confidence", "gallery", "evidence", "best_url", "listing_url"].join("\t"));
}

for (const listingUrl of urls) {
  try {
    const records = await runClassification(toClassificationArgs(listingUrl, args));
    if (args.outPath) await appendJsonl(args.outPath, records);

    const summary = findListingSummaryRecord(records);
    if (!summary) throw new Error("No listing_summary record returned.");

    const extraction = findListingExtractionRecord(records);
    console.log(args.jsonOutput
      ? JSON.stringify({ ...summary, extraction })
      : formatListingScanLine(summary, extraction));
  } catch (error) {
    const failed = {
      ok: false,
      type: "listing_summary",
      created_at: new Date().toISOString(),
      listing_url: listingUrl,
      error: error instanceof Error ? error.message : String(error),
    };
    if (args.outPath) await appendJsonl(args.outPath, [failed]);
    console.log(args.jsonOutput ? JSON.stringify(failed) : formatListingScanLine(failed));
  }
}
