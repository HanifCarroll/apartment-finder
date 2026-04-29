# Apartment Finder

Bun CLI for checking whether an apartment listing appears to have a washing machine in the unit, shared laundry in the building, or no clear washer evidence.

The initial use case is filtering rentals from Zonaprop, Argenprop, and Airbnb where listing sites often say "washing machine" even when the washer is only in a shared building laundry room.

## What It Does

- Extracts listing photo URLs from supported providers.
- Classifies photos with OpenAI vision models.
- Supports model comparisons for cost and quality testing.
- Produces listing-level decisions with a two-pass workflow: `gpt-5.4-mini` first, then `gpt-5.4` for uncertain or risky photos.
- Keeps JSONL outputs for auditability and fixture-based evals.

## Setup

```sh
bun install
cp .env.example .env
```

Then add your API key to `.env`:

```sh
OPENAI_API_KEY=...
```

## Classify One Image

```sh
bun run classify \
  --image-url "https://example.com/photo.jpg" \
  --models gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.4-nano
```

Local files work too:

```sh
bun run classify --image ./fixtures/known-in-unit.jpg --models gpt-5.4-mini
```

## Classify A Listing

Supported providers:

- Zonaprop: browser extraction with Playwriter.
- Argenprop: gallery endpoint extraction.
- Airbnb: room page payload extraction, including washer amenity metadata when the page says `Washer`, `Washer - in unit`, or `Washer - in building`.

For normal use, prefer the two-pass listing summary:

```sh
bun run classify \
  --listing-url "https://www.airbnb.com/rooms/24077932" \
  --listing-summary \
  --out results/listing-summary.jsonl
```

By default this prints a concise listing-level result:

```text
IN_UNIT high
source: vision
evidence: photo 16 0.98, photo 14 0.97, photo 2 0.93
gallery: airbnb 32/32 photos cache
best_url: https://a0.muscache.com/im/pictures/...
```

For Airbnb listings, explicit page amenities override the vision aggregate when they distinguish location. `Washer - in unit` becomes `IN_UNIT`; `Washer - in building` becomes `SHARED_BUILDING`; plain `Washer` still falls back to vision.

Use `--json` to print the raw `listing_summary` JSON instead.

The summary record includes:

- `decision`: `IN_UNIT`, `SHARED_BUILDING`, `UNKNOWN`, or `CONFLICTING`
- `confidence`: `high`, `medium`, or `low`
- `decision_source`: `vision` or `airbnb_amenity`
- `vision_decision` and `vision_confidence` when a provider metadata override is used
- `airbnb_laundry_amenity_label` and `airbnb_laundry_amenity_text` when present
- `evidence`: strongest photo-level evidence and image URLs
- `escalated_image_indexes`: photos sent to the second-pass model
- `first_pass_model`, `escalation_model`, and `policy`

To classify every extracted photo:

```sh
bun run classify \
  --listing-url "https://www.zonaprop.com.ar/propiedades/..." \
  --models gpt-5.4-mini \
  --classify-all \
  --out results/listing.jsonl
```

To test only extraction without model calls:

```sh
bun run classify \
  --listing-url "https://www.argenprop.com/departamento-en-alquiler-temporal-..." \
  --extract-only \
  --out results/listing-extraction.jsonl
```

Extraction records include `provider`, `gallery_count`, `image_count`, `gallery_count_matches_extracted`, and `extraction_source`.

## Evidence Report

Use the report command when you want a debuggable listing-level answer:

```sh
bun run report \
  --listing-url "https://www.zonaprop.com.ar/propiedades/..." \
  --out results/report.jsonl
```

The report includes:

- final decision, confidence, and decision source
- provider and gallery extraction status
- Airbnb washer amenity metadata when available
- strongest photo evidence, URLs, and model rationales

Use `--json` for a machine-readable report object.

## Extraction Cache

Listing extraction is cached in `.apartment-laundry-cache/extractions.jsonl` by default. The cache is intentionally ignored by git.

Useful flags:

```sh
--refresh-extraction      # ignore cache and fetch fresh URLs
--no-extraction-cache     # disable cache reads and writes
--extraction-cache <path> # use a different cache file
```

If live extraction fails and a cached record exists, the CLI falls back to cached photo URLs and marks `extraction_source` as `cache_after_live_failure`.

## Smoke Test Extraction

Provider-specific smoke fixtures are in `fixtures/listings-<provider>.jsonl`.

```sh
bun run smoke:extractions \
  --fixtures fixtures/listings-airbnb.jsonl \
  --limit 1 \
  --refresh-extraction
```

To smoke test search-result pagination and listing URL discovery without model calls:

```sh
bun run smoke:search
bun run smoke:search --provider airbnb
```

## Scan Multiple Listings

Put listing URLs in a newline-delimited file:

```text
https://www.airbnb.com/rooms/24077932
https://www.argenprop.com/departamento-en-alquiler-temporal-en-nunez-4-ambientes--18636518
```

Then scan them:

```sh
bun run scan \
  --input urls.txt \
  --out results/scan.jsonl
```

The default output is tab-separated for easy filtering:

```text
decision  confidence  source  amenity  gallery  evidence  best_url  listing_url
IN_UNIT   high        vision          32/32    photo 16 0.98, photo 14 0.97  https://...  https://...
```

You can also pipe URLs through stdin:

```sh
pbpaste | bun run scan
```

Use `--json` to print one summary JSON object per line.

## Search And Scan

Use `bun run search` when you have a provider search/results URL instead of individual listing URLs. The command pages through result pages, discovers listing URLs, classifies each listing, and prints only `IN_UNIT` matches by default:

```sh
bun run search \
  --search-url "https://www.zonaprop.com.ar/inmuebles-alquiler-temporal-nunez-las-canitas-con-amoblado-menos-1500-dolar.html" \
  --max-listings 20 \
  --max-pages 5 \
  --out results/search-zonaprop.jsonl
```

Supported search providers:

- Zonaprop search pages
- Argenprop search pages
- Airbnb search pages

The provider URL remains the source of truth for filters such as neighborhood, furnished, washer amenity, dates, and max dollar amount. For Airbnb, pass a URL with `checkin` and `checkout` when you want date-specific availability and pricing.

Search audit records include `page_urls`, so you can confirm which result pages were visited.

Useful flags:

```sh
--discover-only # only extract listing URLs, no model calls
--max-pages 5   # page through up to 5 result pages
--all           # print every classified listing instead of only IN_UNIT matches
--json          # print JSON lines
```

## Evaluate Fixtures

Image labels live in `fixtures/images.jsonl`.

```sh
bun run eval:fixtures \
  --models gpt-5.4-mini,gpt-5.4-nano \
  --concurrency 4 \
  --out results/eval-fixtures.jsonl \
  --summary results/eval-fixtures-summary.json
```

Listing labels live in `fixtures/listings.jsonl`.

```sh
bun run summary:listings \
  --fixtures fixtures/listings.jsonl \
  --out results/listing-summary-run.jsonl \
  --model gpt-5.4-mini \
  --escalation-model gpt-5.4 \
  --max-images 35 \
  --concurrency 4

bun run eval:listing-summaries \
  --listings fixtures/listings.jsonl \
  --results results/listing-summary-run.jsonl \
  --out results/eval-listing-summaries.jsonl \
  --summary results/eval-listing-summaries-summary.json
```

Current best benchmark on the original 40 labeled Zonaprop listings was the two-pass summary workflow with `gpt-5.4-mini` plus `gpt-5.4` escalation: `39/40` overall, `10/10` in-unit, `16/17` shared-building, and `13/13` unknown.

Listing summary evals report accuracy by expected class and by `decision_source`, so Airbnb metadata overrides can be tracked separately from vision-only decisions.

## Development

```sh
bun run typecheck
bun run test
bun run smoke:browser
```

`bun run playwright:install` installs the Chromium browser used by Playwright smoke checks and future direct browser automation.

Generated outputs, downloaded images, and secrets are ignored:

- `.env`
- `.apartment-laundry-cache/`
- `results/`
- `node_modules/`

Fixtures are intentionally committed so extraction and classification behavior can be regression-tested over time.
