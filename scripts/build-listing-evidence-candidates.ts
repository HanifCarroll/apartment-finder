import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

type LocationLabel = "IN_UNIT" | "SHARED_BUILDING" | "UNKNOWN" | "CONFLICTING";

type ListingFixture = {
  id: string;
  listing_url: string;
  expected_listing_location: LocationLabel;
};

type Verdict = {
  contains_washing_machine: boolean;
  location_label: LocationLabel;
  confidence: number;
  rationale: string;
  visual_evidence: string[];
};

type ResultRecord = {
  ok?: boolean;
  listing_url?: string;
  listing_image_index?: number;
  image?: { source?: string };
  model?: string;
  verdict?: Verdict;
};

type Candidate = {
  id: string;
  image_url: string;
  proposed_location: LocationLabel;
  proposed_contains_washing_machine: boolean;
  proposed_by: string;
  needs_review: true;
  review_location: "";
  review_contains_washing_machine: "";
  source_listing_url?: string;
  source_listing_image_index?: number;
  source_listing_expected_location: LocationLabel;
  model_votes: Array<{
    model: string;
    location_label: LocationLabel;
    contains_washing_machine: boolean;
    confidence: number;
    rationale: string;
    visual_evidence: string[];
  }>;
  notes: string;
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

function normalizeListingUrl(url: string): string {
  const parsed = new URL(url);
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderHtml(candidates: Candidate[]): string {
  const rows = candidates.map((candidate, index) => {
    const votes = candidate.model_votes.map((vote) => `
      <div class="vote">
        <strong>${escapeHtml(vote.model)}</strong>:
        ${escapeHtml(vote.location_label)} / ${escapeHtml(vote.contains_washing_machine)}
        <span>${escapeHtml(vote.confidence)}</span>
        <p>${escapeHtml(vote.rationale)}</p>
      </div>`).join("");

    return `
      <article class="card">
        <div class="media"><img src="${escapeHtml(candidate.image_url)}" alt="${escapeHtml(candidate.id)}"></div>
        <div class="body">
          <div class="topline">#${index + 1} <code>${escapeHtml(candidate.id)}</code></div>
          <h2>${escapeHtml(candidate.proposed_location)} / washer: ${escapeHtml(candidate.proposed_contains_washing_machine)}</h2>
          <p class="note">${escapeHtml(candidate.notes)}</p>
          <p><a href="${escapeHtml(candidate.image_url)}">Open image URL</a></p>
          <p><a href="${escapeHtml(candidate.source_listing_url)}">Source listing</a></p>
          <details open><summary>Model votes</summary>${votes}</details>
        </div>
      </article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Listing Evidence Candidate Review</title>
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
    .topline { color: #666; font-size: 12px; }
    h2 { margin: 10px 0; font-size: 17px; }
    .note, details, .vote p { color: #4b4b4b; font-size: 13px; line-height: 1.4; }
    .vote { border-top: 1px solid #eee; padding: 8px 0; }
    a { color: #075c88; }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; } .card { grid-template-columns: 1fr; } .media { height: 360px; } }
  </style>
</head>
<body>
  <header>
    <h1>Listing Evidence Candidate Review</h1>
    <p>${candidates.length} model-positive evidence photos from user-labeled listings.</p>
  </header>
  <main>${rows}</main>
</body>
</html>`;
}

const listings = parseJsonl<ListingFixture>(await readFile("fixtures/listings.jsonl", "utf8"));
const listingLabels = new Map(
  listings.map((listing) => [normalizeListingUrl(listing.listing_url), listing.expected_listing_location]),
);
const existingFixtures = new Set(
  parseJsonl<{ image_url: string }>(await readFile("fixtures/images.jsonl", "utf8"))
    .map((fixture) => fixture.image_url),
);
const resultFiles = (await readdir("results"))
  .filter((name) => /^listing-label-run.*\.jsonl$/.test(name))
  .map((name) => `results/${name}`)
  .sort();

const parsedRecords: ResultRecord[] = [];
for (const path of resultFiles) {
  parsedRecords.push(...parseJsonl<ResultRecord>(await readFile(path, "utf8")));
}

const grouped = new Map<string, ResultRecord[]>();
for (const record of parsedRecords) {
  const imageUrl = record.image?.source;
  if (!imageUrl || !record.verdict || existingFixtures.has(imageUrl)) continue;
  const normalizedListingUrl = record.listing_url ? normalizeListingUrl(record.listing_url) : "";
  if (!listingLabels.has(normalizedListingUrl)) continue;
  const group = grouped.get(imageUrl) || [];
  group.push(record);
  grouped.set(imageUrl, group);
}

const candidates = Array.from(grouped.entries())
  .map(([imageUrl, imageRecords]): Candidate | null => {
    const first = imageRecords[0];
    const normalizedListingUrl = first.listing_url ? normalizeListingUrl(first.listing_url) : "";
    const listingLabel = listingLabels.get(normalizedListingUrl);
    if (!listingLabel) return null;
    const positiveVotes = imageRecords.filter((record) => record.verdict?.contains_washing_machine);
    if (positiveVotes.length === 0) return null;

    return {
      id: `listing-evidence-${imageId(imageUrl)}`,
      image_url: imageUrl,
      proposed_location: listingLabel,
      proposed_contains_washing_machine: listingLabel !== "UNKNOWN",
      proposed_by: "listing-label-positive-vote",
      needs_review: true,
      review_location: "",
      review_contains_washing_machine: "",
      source_listing_url: first.listing_url,
      source_listing_image_index: first.listing_image_index,
      source_listing_expected_location: listingLabel,
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
      notes:
        listingLabel === "UNKNOWN"
          ? "User labeled listing as None; model saw a washer, so review as likely false positive."
          : `User labeled listing as ${listingLabel}; model-positive photo proposed as evidence.`,
    };
  })
  .filter((candidate): candidate is Candidate => candidate !== null)
  .sort((a, b) => {
    const labelOrder = { IN_UNIT: 0, SHARED_BUILDING: 1, CONFLICTING: 2, UNKNOWN: 3 };
    return labelOrder[a.proposed_location] - labelOrder[b.proposed_location] || a.id.localeCompare(b.id);
  });

await mkdir("fixtures", { recursive: true });
await writeFile(
  "fixtures/listing-evidence-candidates-2026-04-28.jsonl",
  `${candidates.map((candidate) => JSON.stringify(candidate)).join("\n")}\n`,
);
await writeFile("fixtures/review-listing-evidence-2026-04-28.html", renderHtml(candidates));
console.log(`Wrote ${candidates.length} listing evidence candidates.`);
