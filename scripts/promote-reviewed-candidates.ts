import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

type LocationLabel = "IN_UNIT" | "SHARED_BUILDING" | "UNKNOWN" | "CONFLICTING";

type Fixture = {
  id: string;
  image_url: string;
  expected_location: LocationLabel;
  expected_contains_washing_machine: boolean;
  notes?: string;
};

type Candidate = {
  id: string;
  image_url: string;
  proposed_location: LocationLabel;
  proposed_contains_washing_machine: boolean;
  review_location?: LocationLabel | "";
  review_contains_washing_machine?: boolean | "";
  proposed_by?: string;
  notes?: string;
};

function parseJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function imageId(url: string): string {
  return url.match(/\/([^/?#]+)\.(?:jpe?g|webp|png)(?:[?#].*)?$/i)?.[1] || basename(url);
}

function parseArgs(argv: string[]) {
  const args = {
    candidatesPath: "",
    fixturesPath: "fixtures/images.jsonl",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--candidates":
        if (!next) throw new Error("--candidates requires a path.");
        args.candidatesPath = next;
        i += 1;
        break;
      case "--fixtures":
        if (!next) throw new Error("--fixtures requires a path.");
        args.fixturesPath = next;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.candidatesPath) throw new Error("Provide --candidates.");
  return args;
}

const args = parseArgs(process.argv.slice(2));
const existing = parseJsonl<Fixture>(await readFile(args.fixturesPath, "utf8"));
const candidates = parseJsonl<Candidate>(await readFile(args.candidatesPath, "utf8"));
const seen = new Set(existing.map((fixture) => fixture.image_url));
const promoted: Fixture[] = [];

for (const candidate of candidates) {
  if (seen.has(candidate.image_url)) continue;
  seen.add(candidate.image_url);

  const expectedLocation = candidate.review_location || candidate.proposed_location;
  const expectedContains =
    candidate.review_contains_washing_machine === ""
      ? candidate.proposed_contains_washing_machine
      : candidate.review_contains_washing_machine ?? candidate.proposed_contains_washing_machine;

  promoted.push({
    id: `zonaprop-${imageId(candidate.image_url)}`,
    image_url: candidate.image_url,
    expected_location: expectedLocation,
    expected_contains_washing_machine: expectedContains,
    notes: candidate.notes || `Promoted from ${candidate.proposed_by || "candidate review"}.`,
  });
}

const fixtures = [...existing, ...promoted];
await writeFile(args.fixturesPath, `${fixtures.map((fixture) => JSON.stringify(fixture)).join("\n")}\n`);

console.log(`Promoted ${promoted.length} candidates.`);
console.log(`${fixtures.length} total fixtures.`);
