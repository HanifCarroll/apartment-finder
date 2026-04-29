import { parseArgs } from "./args";
import { runClassification } from "./classifier-runner";
import { appendJsonl } from "./jsonl";
import {
  findListingExtractionRecord,
  findListingSummaryRecord,
  formatListingSummaryText,
} from "./listing-output";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.extractOnly && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
  }

  const records = await runClassification(args);

  if (args.outPath) {
    await appendJsonl(args.outPath, records);
  }

  const summary = args.listingSummary ? findListingSummaryRecord(records) : undefined;
  if (summary && !args.jsonOutput) {
    console.log(formatListingSummaryText(summary, findListingExtractionRecord(records)));
    return;
  }

  console.log(JSON.stringify(summary || records, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
