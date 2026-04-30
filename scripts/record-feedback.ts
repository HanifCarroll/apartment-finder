#!/usr/bin/env bun
import { appendListingFeedback } from "../src/feedback";
import type { LocationLabel } from "../src/types";

type Args = {
  listingUrl: string;
  expectedLocation: LocationLabel;
  predictedLocation?: string;
  note?: string;
  outPath?: string;
};

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run feedback --listing-url <url> --expected IN_UNIT|SHARED_BUILDING|UNKNOWN|CONFLICTING

Options:
  --listing-url <url>  Listing URL that was reviewed.
  --expected <label>   Correct listing label.
  --predicted <label>  Optional model/system prediction.
  --note <text>        Optional reviewer note.
  --out <path>         Feedback JSONL path. Defaults to fixtures/user-feedback.jsonl.
`);
  process.exit(exitCode);
}

function parseLocation(value: string | undefined): LocationLabel {
  if (value === "IN_UNIT" || value === "SHARED_BUILDING" || value === "UNKNOWN" || value === "CONFLICTING") return value;
  usage();
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") usage(0);
    switch (arg) {
      case "--listing-url":
        if (!next) usage();
        args.listingUrl = next;
        i += 1;
        break;
      case "--expected":
        args.expectedLocation = parseLocation(next);
        i += 1;
        break;
      case "--predicted":
        args.predictedLocation = parseLocation(next);
        i += 1;
        break;
      case "--note":
        if (!next) usage();
        args.note = next;
        i += 1;
        break;
      case "--out":
        if (!next) usage();
        args.outPath = next;
        i += 1;
        break;
      default:
        usage();
    }
  }
  if (!args.listingUrl || !args.expectedLocation) usage();
  return args as Args;
}

const args = parseArgs(process.argv.slice(2));
await appendListingFeedback({
  listing_url: args.listingUrl,
  expected_location: args.expectedLocation,
  predicted_location: args.predictedLocation,
  source: "cli",
  note: args.note,
}, args.outPath);
console.log(`Recorded feedback for ${args.listingUrl}`);
