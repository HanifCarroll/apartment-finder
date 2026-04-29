import { parseArgs } from "./args";
import { runClassification } from "./classifier-runner";
import { appendJsonl } from "./jsonl";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.extractOnly && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required. Add it to .env as OPENAI_API_KEY=...");
  }

  const records = await runClassification(args);

  if (args.outPath) {
    await appendJsonl(args.outPath, records);
  }

  const output = args.listingSummary
    ? records.find((record) =>
      record &&
      typeof record === "object" &&
      (record as { type?: string }).type === "listing_summary"
    ) || records
    : records;
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
