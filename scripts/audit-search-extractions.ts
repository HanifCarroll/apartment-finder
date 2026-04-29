#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command } from "commander";
import { DEFAULT_EXTRACTION_CACHE, DEFAULT_MAX_IMAGES } from "../src/cli/args";
import { extractListingImageUrls } from "../src/listing/extraction";
import { findListingUrlsFromSearchUrl } from "../src/listing/search";
import type { ListingExtraction } from "../src/types";

type AuditCase = {
  provider: "zonaprop" | "argenprop" | "airbnb";
  searchUrl: string;
};

type AuditRecord = {
  ok: boolean;
  type: "search_extraction_audit";
  created_at: string;
  provider: AuditCase["provider"];
  search_url: string;
  listing_url?: string;
  listing_index?: number;
  extraction?: ListingExtraction & { image_count: number; gallery_coverage_ok: boolean | null };
  error?: string;
};

const AUDIT_CASES: AuditCase[] = [
  {
    provider: "zonaprop",
    searchUrl: "https://www.zonaprop.com.ar/inmuebles-alquiler-temporal-nunez-las-canitas-con-amoblado-menos-1500-dolar.html",
  },
  {
    provider: "argenprop",
    searchUrl: "https://www.argenprop.com/departamentos/alquiler-temporal/las-canitas-o-nunez/dolares-hasta-1500?con-amoblado",
  },
  {
    provider: "airbnb",
    searchUrl: "https://www.airbnb.com/s/Nu%C3%B1ez--Buenos-Aires/homes?place_id=ChIJtRA2Ov62vJURh2h44yGJvKI&refinement_paths%5B%5D=%2Fhomes&checkin=2026-06-14&checkout=2026-08-23&date_picker_type=calendar&adults=1&guests=1&query=Nu%C3%B1ez%2C%20Buenos%20Aires&amenities%5B%5D=33&room_types%5B%5D=Entire%20home%2Fapt&price_max=1500",
  },
];

const program = new Command()
  .name("bun run audit:extractions")
  .description("Discover listings from search URLs and audit listing photo extraction reliability.")
  .option("--provider <provider>", "Only audit one provider: zonaprop, argenprop, or airbnb")
  .option("--max-listings <n>", "Listings to audit per provider.", "8")
  .option("--max-pages <n>", "Search result pages to discover per provider.", "2")
  .option("--max-images <n>", "Maximum listing images to extract.", String(DEFAULT_MAX_IMAGES))
  .option("--out <path>", "JSONL output path.", "fixtures/search-extraction-audit-2026-04-29.jsonl")
  .option("--html <path>", "Review HTML output path.", "fixtures/review-search-extractions-2026-04-29.html")
  .option("--refresh-extraction", "Ignore cached listing extraction and fetch fresh listing extractions.")
  .parse(process.argv);

const options = program.opts<{
  provider?: AuditCase["provider"];
  maxListings: string;
  maxPages: string;
  maxImages: string;
  out: string;
  html: string;
  refreshExtraction?: boolean;
}>();

const maxListings = positiveInt(options.maxListings, "--max-listings");
const maxPages = positiveInt(options.maxPages, "--max-pages");
const maxImages = positiveInt(options.maxImages, "--max-images");
const cases = options.provider ? AUDIT_CASES.filter((item) => item.provider === options.provider) : AUDIT_CASES;
if (cases.length === 0) throw new Error(`No audit case found for provider: ${options.provider}`);

const records: AuditRecord[] = [];

for (const auditCase of cases) {
  console.error(`Discovering ${auditCase.provider}`);
  const search = await findListingUrlsFromSearchUrl(auditCase.searchUrl, maxListings, maxPages);
  for (let index = 0; index < search.listing_urls.length; index += 1) {
    const listingUrl = search.listing_urls[index];
    console.error(`Extracting ${auditCase.provider} ${index + 1}/${search.listing_urls.length}: ${listingUrl}`);
    try {
      const extraction = await extractListingImageUrls(listingUrl, {
        maxImages,
        extractionCachePath: DEFAULT_EXTRACTION_CACHE,
        useExtractionCache: true,
        refreshExtraction: Boolean(options.refreshExtraction),
      });
      records.push({
        ok: true,
        type: "search_extraction_audit",
        created_at: new Date().toISOString(),
        provider: auditCase.provider,
        search_url: auditCase.searchUrl,
        listing_url: listingUrl,
        listing_index: index,
        extraction: {
          ...extraction,
          image_count: extraction.image_urls.length,
          gallery_coverage_ok:
            extraction.gallery_count === null
              ? null
              : extraction.image_urls.length >= Math.min(extraction.gallery_count, maxImages),
        },
      });
    } catch (error) {
      records.push({
        ok: false,
        type: "search_extraction_audit",
        created_at: new Date().toISOString(),
        provider: auditCase.provider,
        search_url: auditCase.searchUrl,
        listing_url: listingUrl,
        listing_index: index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

await mkdir(dirname(options.out), { recursive: true });
await writeFile(options.out, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
await mkdir(dirname(options.html), { recursive: true });
await writeFile(options.html, renderHtml(records));

const byProvider = summarize(records);
for (const [provider, summary] of Object.entries(byProvider)) {
  console.log(`${provider}: ${summary.ok}/${summary.total} extracted, ${summary.galleryCoverageOk}/${summary.ok} gallery coverage ok, ${summary.failures} failures`);
}
console.log(`Wrote ${options.out}`);
console.log(`Wrote ${options.html}`);

function positiveInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function summarize(items: AuditRecord[]) {
  const summary: Record<string, { total: number; ok: number; failures: number; galleryCoverageOk: number }> = {};
  for (const item of items) {
    const bucket = summary[item.provider] || { total: 0, ok: 0, failures: 0, galleryCoverageOk: 0 };
    bucket.total += 1;
    if (item.ok) {
      bucket.ok += 1;
      if (item.extraction?.gallery_coverage_ok) bucket.galleryCoverageOk += 1;
    } else {
      bucket.failures += 1;
    }
    summary[item.provider] = bucket;
  }
  return summary;
}

function renderHtml(items: AuditRecord[]): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Search Extraction Audit</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #1f2933; }
    .record { border: 1px solid #ccd6e0; border-radius: 8px; padding: 16px; margin: 0 0 16px; }
    .bad { border-color: #d64545; background: #fff5f5; }
    .meta { color: #52606d; font-size: 13px; line-height: 1.5; }
    .thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin-top: 12px; }
    img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 6px; background: #eef2f7; }
    a { color: #0b69a3; }
  </style>
</head>
<body>
  <h1>Search Extraction Audit</h1>
  ${items.map(renderRecord).join("\n")}
</body>
</html>`;
}

function renderRecord(record: AuditRecord): string {
  const extraction = record.extraction;
  const imageUrls = extraction?.image_urls.slice(0, 12) || [];
  return `<section class="record ${record.ok ? "" : "bad"}">
    <h2>${escapeHtml(record.provider)} #${(record.listing_index ?? 0) + 1} ${record.ok ? "OK" : "FAILED"}</h2>
    <div class="meta">
      <div><a href="${escapeAttr(record.listing_url || "")}">${escapeHtml(record.listing_url || "")}</a></div>
      <div>images: ${extraction?.image_count ?? 0} / gallery: ${extraction?.gallery_count ?? "?"} / coverage ok: ${String(extraction?.gallery_coverage_ok ?? false)}</div>
      <div>source: ${escapeHtml(extraction?.extraction_source || "")} / attempts: ${extraction?.extraction_attempts ?? ""}</div>
      ${record.error ? `<div>error: ${escapeHtml(record.error)}</div>` : ""}
    </div>
    <div class="thumbs">
      ${imageUrls.map((url) => `<a href="${escapeAttr(url)}"><img src="${escapeAttr(url)}" loading="lazy"></a>`).join("\n")}
    </div>
  </section>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]!));
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
