import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

type Verdict = {
  contains_washing_machine: boolean;
  washing_machine_visibility: string;
  location_label: "IN_UNIT" | "SHARED_BUILDING" | "UNKNOWN" | "CONFLICTING";
  confidence: number;
  rationale: string;
  visual_evidence: string[];
};

type ResultRecord = {
  ok?: boolean;
  created_at?: string;
  listing_url?: string;
  listing_image_index?: number;
  image?: {
    source?: string;
  };
  model?: string;
  verdict?: Verdict;
};

type ExistingFixture = {
  id: string;
  image_url: string;
  expected_location: Verdict["location_label"];
  expected_contains_washing_machine: boolean;
  notes?: string;
};

type Candidate = {
  id: string;
  image_url: string;
  proposed_location: Verdict["location_label"];
  proposed_contains_washing_machine: boolean;
  proposed_by: string;
  needs_review: true;
  review_location: "";
  review_contains_washing_machine: "";
  source_listing_url?: string;
  source_listing_image_index?: number;
  model_votes: Array<{
    model: string;
    location_label: Verdict["location_label"];
    contains_washing_machine: boolean;
    confidence: number;
    rationale: string;
    visual_evidence: string[];
  }>;
  notes: string;
};

const seedResultFiles = [
  "results/zonaprop-1884907148.jsonl",
  "results/zonaprop-1941308447.jsonl",
  "results/zonaprop-1989740335.jsonl",
];

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

async function readExistingFixtures(): Promise<Map<string, ExistingFixture>> {
  const fixtures = parseJsonl<ExistingFixture>(await readFile("fixtures/images.jsonl", "utf8"));
  return new Map(fixtures.map((fixture) => [fixture.image_url, fixture]));
}

async function readResultRecords(): Promise<ResultRecord[]> {
  const candidateFiles = (await readdir("results"))
    .filter((name) => /^candidate-fixture-run.*\.jsonl$/.test(name))
    .map((name) => `results/${name}`)
    .sort();
  const resultFiles = [...candidateFiles, ...seedResultFiles];
  const records: ResultRecord[] = [];
  for (const path of resultFiles) {
    const parsed = parseJsonl<ResultRecord>(await readFile(path, "utf8"));
    records.push(...parsed);
  }
  return records;
}

function chooseProposal(records: ResultRecord[], fixture?: ExistingFixture) {
  if (fixture) {
    return {
      location: fixture.expected_location,
      contains: fixture.expected_contains_washing_machine,
      proposedBy: "existing-fixture",
      notes: fixture.notes || "Existing hand-labeled fixture; included here for review context.",
    };
  }

  const votes = records
    .filter((record) => record.ok && record.verdict && record.model)
    .map((record) => ({
      location: record.verdict!.location_label,
      contains: record.verdict!.contains_washing_machine,
      confidence: record.verdict!.confidence,
    }));

  const positiveVotes = votes.filter((vote) => vote.contains);
  if (positiveVotes.length > 0 && positiveVotes.length === votes.length) {
    const best = positiveVotes.sort((a, b) => b.confidence - a.confidence)[0];
    return {
      location: best.location,
      contains: true,
      proposedBy: "model-positive-vote",
      notes: "Provisional model label. Confirm visually before promoting to ground truth.",
    };
  }

  if (positiveVotes.length > 0) {
    return {
      location: "UNKNOWN" as const,
      contains: false,
      proposedBy: "model-disagreement",
      notes: "Model disagreement: at least one model saw a washer and at least one did not. Review carefully before labeling.",
    };
  }

  return {
    location: "UNKNOWN" as const,
    contains: false,
    proposedBy: "model-consensus-negative",
    notes: "Provisional negative. Confirm this is not a washer, dryer, dishwasher, boiler, or AC condenser before promoting.",
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderHtml(candidates: Candidate[]): string {
  const rows = candidates
    .map((candidate, index) => {
      const votes = candidate.model_votes
        .map(
          (vote) => `
          <div class="vote">
            <strong>${escapeHtml(vote.model)}</strong>:
            ${escapeHtml(vote.location_label)} / ${escapeHtml(vote.contains_washing_machine)}
            <span class="confidence">${escapeHtml(vote.confidence)}</span>
            <p>${escapeHtml(vote.rationale)}</p>
          </div>`,
        )
        .join("");

      return `
      <article class="card">
        <div class="media"><img src="${escapeHtml(candidate.image_url)}" alt="${escapeHtml(candidate.id)}"></div>
        <div class="body">
          <div class="topline">
            <span>#${index + 1}</span>
            <code>${escapeHtml(candidate.id)}</code>
          </div>
          <h2>${escapeHtml(candidate.proposed_location)} / washer: ${escapeHtml(candidate.proposed_contains_washing_machine)}</h2>
          <p class="note">${escapeHtml(candidate.notes)}</p>
          <p><a href="${escapeHtml(candidate.image_url)}">Open image URL</a></p>
          ${candidate.source_listing_url ? `<p><a href="${escapeHtml(candidate.source_listing_url)}">Source listing</a></p>` : ""}
          <div class="review">
            <label>review_location <input value=""></label>
            <label>review_contains_washing_machine <input value=""></label>
          </div>
          <details>
            <summary>Model votes</summary>
            ${votes}
          </details>
        </div>
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Apartment Finder Fixture Candidate Review</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f7f5; color: #191919; }
    header { position: sticky; top: 0; padding: 16px 24px; background: #fffffff2; border-bottom: 1px solid #ddd; z-index: 1; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    header p { margin: 0; color: #555; }
    main { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; padding: 16px; }
    .card { display: grid; grid-template-columns: 46% 1fr; overflow: hidden; border: 1px solid #d7d7d2; border-radius: 8px; background: #fff; }
    .media { min-height: 320px; background: #eee; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .body { padding: 14px; }
    .topline { display: flex; gap: 8px; align-items: center; color: #666; font-size: 12px; }
    h2 { margin: 10px 0; font-size: 17px; }
    .note, details, .vote p { color: #4b4b4b; font-size: 13px; line-height: 1.4; }
    .review { display: grid; gap: 8px; margin: 12px 0; }
    label { display: grid; gap: 4px; font-size: 12px; color: #555; }
    input { min-height: 30px; border: 1px solid #bbb; border-radius: 4px; padding: 4px 8px; font: inherit; }
    .vote { border-top: 1px solid #eee; padding: 8px 0; }
    .confidence { margin-left: 6px; color: #666; }
    a { color: #075c88; }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; } .card { grid-template-columns: 1fr; } .media { height: 360px; } }
  </style>
</head>
<body>
  <header>
    <h1>Fixture Candidate Review</h1>
    <p>${candidates.length} provisional labels. Fill review fields or edit the JSONL before promoting to fixtures/images.jsonl.</p>
  </header>
  <main>${rows}</main>
</body>
</html>`;
}

async function main() {
  const existingFixtures = await readExistingFixtures();
  const records = await readResultRecords();
  const grouped = new Map<string, ResultRecord[]>();

  for (const record of records) {
    const source = record.image?.source;
    if (!source || !record.verdict) continue;
    const list = grouped.get(source) || [];
    list.push(record);
    grouped.set(source, list);
  }

  const candidates = Array.from(grouped.entries())
    .filter(([imageUrl]) => !existingFixtures.has(imageUrl))
    .map(([imageUrl, imageRecords]): Candidate => {
      const proposal = chooseProposal(imageRecords);
      const first = imageRecords.find((record) => record.listing_url || record.listing_image_index !== undefined);

      return {
        id: `candidate-${imageId(imageUrl)}`,
        image_url: imageUrl,
        proposed_location: proposal.location,
        proposed_contains_washing_machine: proposal.contains,
        proposed_by: proposal.proposedBy,
        needs_review: true,
        review_location: "",
        review_contains_washing_machine: "",
        source_listing_url: first?.listing_url,
        source_listing_image_index: first?.listing_image_index,
        model_votes: imageRecords
          .filter((record) => record.model && record.verdict)
          .map((record) => ({
            model: record.model!,
            location_label: record.verdict!.location_label,
            contains_washing_machine: record.verdict!.contains_washing_machine,
            confidence: record.verdict!.confidence,
            rationale: record.verdict!.rationale,
            visual_evidence: record.verdict!.visual_evidence,
          })),
        notes: proposal.notes,
      };
    })
    .sort((a, b) => {
      const sourceOrder: Record<string, number> = {
        "model-positive-vote": 0,
        "model-disagreement": 1,
        "model-consensus-negative": 2,
      };
      const labelOrder = { IN_UNIT: 0, SHARED_BUILDING: 1, CONFLICTING: 2, UNKNOWN: 3 };
      return (
        (sourceOrder[a.proposed_by] ?? 9) - (sourceOrder[b.proposed_by] ?? 9) ||
        labelOrder[a.proposed_location] - labelOrder[b.proposed_location] ||
        a.id.localeCompare(b.id)
      );
    });
  const priorityCandidates = candidates.filter(
    (candidate) => candidate.proposed_by !== "model-consensus-negative",
  );

  await mkdir("fixtures", { recursive: true });
  await writeFile(
    "fixtures/candidates-2026-04-28.jsonl",
    `${candidates.map((candidate) => JSON.stringify(candidate)).join("\n")}\n`,
  );
  await writeFile("fixtures/review-2026-04-28.html", renderHtml(candidates));
  await writeFile(
    "fixtures/candidates-priority-2026-04-28.jsonl",
    `${priorityCandidates.map((candidate) => JSON.stringify(candidate)).join("\n")}\n`,
  );
  await writeFile("fixtures/review-priority-2026-04-28.html", renderHtml(priorityCandidates));

  console.log(`Wrote ${candidates.length} candidates.`);
  console.log(`Wrote ${priorityCandidates.length} priority candidates.`);
  console.log("fixtures/candidates-2026-04-28.jsonl");
  console.log("fixtures/review-2026-04-28.html");
  console.log("fixtures/candidates-priority-2026-04-28.jsonl");
  console.log("fixtures/review-priority-2026-04-28.html");
}

await main();
