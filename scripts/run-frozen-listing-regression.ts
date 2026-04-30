import { readFile } from "node:fs/promises";

type Args = {
  fixturesPath: string;
  fixtureImagesPath: string;
  runOutPath: string;
  evalOutPath: string;
  summaryPath: string;
  runId: string;
  passthrough: string[];
};

function timestampId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function usage(exitCode = 1): never {
  console.error(`Usage:
  bun run regression:frozen [options]

Runs listing summaries against frozen local fixture images, then evaluates listing-level accuracy.

Options:
  --fixtures <path>        Listing fixture JSONL path. Defaults to fixtures/listings.jsonl.
  --fixture-images <path>  Frozen image manifest. Defaults to fixtures/assets/listing-images.jsonl.
  --run-out <path>         Summary-run JSONL path. Defaults to results/frozen-listing-summary-run.jsonl.
  --eval-out <path>        Evaluation JSONL path. Defaults to results/frozen-listing-summary-eval.jsonl.
  --summary <path>         Evaluation summary JSON path. Defaults to results/frozen-listing-summary-eval-summary.json.
  --run-id <id>            Run id. Defaults to frozen-<timestamp>.

Any model/scanning options accepted by summary:listings can also be passed through, including:
  --model, --escalation-model, --max-images, --max-escalation-images,
  --concurrency, --listing-concurrency, --model-cache, --refresh-model-cache,
  --no-model-cache
`);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    fixturesPath: "fixtures/listings.jsonl",
    fixtureImagesPath: "fixtures/assets/listing-images.jsonl",
    runOutPath: "results/frozen-listing-summary-run.jsonl",
    evalOutPath: "results/frozen-listing-summary-eval.jsonl",
    summaryPath: "results/frozen-listing-summary-eval-summary.json",
    runId: `frozen-${timestampId()}`,
    passthrough: [],
  };

  const passthroughArgs = new Set([
    "--model",
    "--escalation-model",
    "--max-images",
    "--max-escalation-images",
    "--concurrency",
    "--listing-concurrency",
    "--model-cache",
    "--extraction-cache",
  ]);
  const passthroughFlags = new Set([
    "--refresh-model-cache",
    "--no-model-cache",
    "--refresh-extraction",
    "--no-extraction-cache",
  ]);

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
      case "--fixture-images":
        if (!next) usage();
        args.fixtureImagesPath = next;
        i += 1;
        break;
      case "--run-out":
        if (!next) usage();
        args.runOutPath = next;
        i += 1;
        break;
      case "--eval-out":
        if (!next) usage();
        args.evalOutPath = next;
        i += 1;
        break;
      case "--summary":
        if (!next) usage();
        args.summaryPath = next;
        i += 1;
        break;
      case "--run-id":
        if (!next) usage();
        args.runId = next;
        i += 1;
        break;
      default:
        if (passthroughFlags.has(arg)) {
          args.passthrough.push(arg);
          break;
        }
        if (passthroughArgs.has(arg)) {
          if (!next) usage();
          args.passthrough.push(arg, next);
          i += 1;
          break;
        }
        usage();
    }
  }

  return args;
}

async function run(label: string, command: string[]): Promise<void> {
  console.log(`\n${label}`);
  console.log(command.join(" "));
  const process = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
    env: processEnv(),
  });
  const code = await process.exited;
  if (code !== 0) {
    throw new Error(`${label} failed with exit code ${code}`);
  }
}

function processEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

type EvalSummary = {
  listing_count: number;
  records_ok: number;
  records_failed: number;
  overall: {
    total: number;
    correct: number;
    accuracy: number;
    false_in_unit: number;
    false_shared: number;
    missed_in_unit: number;
    missed_shared: number;
  };
  by_expected_location: Record<string, { total: number; correct: number; accuracy: number }>;
};

function printFrozenSummary(summary: EvalSummary): void {
  console.log("\nFrozen regression summary");
  console.log(`listings: ${summary.records_ok}/${summary.listing_count} evaluated`);
  console.log(`accuracy: ${summary.overall.correct}/${summary.overall.total} (${summary.overall.accuracy})`);
  console.log(`false in-unit: ${summary.overall.false_in_unit}`);
  console.log(`missed in-unit: ${summary.overall.missed_in_unit}`);
  console.log(`false shared: ${summary.overall.false_shared}`);
  console.log(`missed shared: ${summary.overall.missed_shared}`);
  console.log("by class:");
  for (const [label, bucket] of Object.entries(summary.by_expected_location)) {
    console.log(`  ${label}: ${bucket.correct}/${bucket.total} (${bucket.accuracy})`);
  }
}

const args = parseArgs(process.argv.slice(2));

await run("Running frozen listing summaries", [
  "bun",
  "run",
  "scripts/run-listing-summaries.ts",
  "--fixtures",
  args.fixturesPath,
  "--fixture-images",
  args.fixtureImagesPath,
  "--out",
  args.runOutPath,
  "--run-id",
  args.runId,
  ...args.passthrough,
]);

await run("Evaluating frozen listing summaries", [
  "bun",
  "run",
  "scripts/evaluate-listing-summaries.ts",
  "--listings",
  args.fixturesPath,
  "--results",
  args.runOutPath,
  "--out",
  args.evalOutPath,
  "--summary",
  args.summaryPath,
]);

const summary = JSON.parse(await readFile(args.summaryPath, "utf8")) as EvalSummary;
printFrozenSummary(summary);

