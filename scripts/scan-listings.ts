#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_ESCALATION_MODEL,
  DEFAULT_EXTRACTION_CACHE,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MODEL,
  DEFAULT_MODEL_CACHE,
} from "../src/cli/args";
import { DEFAULT_CONCURRENCY } from "../src/lib/concurrency";
import {
  defaultCommonScanOptions,
  parseCommonScanOption,
  type CommonScanCliOptions,
} from "../src/cli/options";
import {
  appendFailedListingScan,
  formatListingScanResult,
  listingScanHeader,
  scanListing,
} from "../src/core";

type ScanArgs = CommonScanCliOptions & {
  inputPath?: string;
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
  --model-cache <path>      Model result cache path. Defaults to ${DEFAULT_MODEL_CACHE}.
  --refresh-model-cache     Ignore cached model results and write fresh model results.
  --no-model-cache          Disable model result cache reads and writes.
  --extraction-cache <path> Listing extraction cache path. Defaults to ${DEFAULT_EXTRACTION_CACHE}.
  --refresh-extraction      Ignore cached listing extraction and write a fresh one.
  --no-extraction-cache     Disable listing extraction reads and writes.
  --json                    Print one JSON summary object per line instead of tab-separated text.
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): ScanArgs {
  const args: ScanArgs = defaultCommonScanOptions();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") usage(0);

    const commonIndex = parseCommonScanOption(args, argv, i);
    if (commonIndex !== null) {
      i = commonIndex;
      continue;
    }

    switch (arg) {
      case "--input":
        if (!next) usage();
        args.inputPath = next;
        i += 1;
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

const args = parseArgs(process.argv.slice(2));
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
}

const urls = await readInputUrls(args.inputPath);
if (urls.length === 0) {
  throw new Error("No listing URLs provided.");
}

if (!args.jsonOutput) {
  console.log(listingScanHeader());
}

for (const listingUrl of urls) {
  try {
    const { summary, extraction } = await scanListing(listingUrl, args, args.outPath);
    console.log(formatListingScanResult(summary, extraction, args.jsonOutput));
  } catch (error) {
    const failed = await appendFailedListingScan(listingUrl, error, args.outPath);
    console.log(formatListingScanResult(failed, undefined, args.jsonOutput));
  }
}
