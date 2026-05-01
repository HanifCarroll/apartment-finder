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

Optional Browserbase credentials are only needed for Browserbase smoke tests:

```sh
BROWSERBASE_API_KEY=...
BROWSERBASE_PROJECT_ID=...
BROWSER_BACKEND=local # local or browserbase
BROWSERBASE_OS=linux # basic Browserbase stealth supports Linux
BROWSERBASE_PROXY=false # paid Browserbase plans only
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
- Airbnb: JSON API extraction through the web `StaysPdpSections` endpoint, including washer amenity metadata when the page says `Washer`, `Washer - in unit`, or `Washer - in building`.

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

For Zonaprop and Argenprop listings, washer text in the title, description, features, or amenities does not classify the listing by itself. It only forces the staged summary path to inspect the full extracted gallery and lets strong in-unit photo evidence win over shared/common-laundry photo evidence.

Use `--json` to print the raw `listing_summary` JSON instead.

The summary record includes:

- `decision`: `IN_UNIT`, `SHARED_BUILDING`, `UNKNOWN`, or `CONFLICTING`
- `confidence`: `high`, `medium`, or `low`
- `decision_source`: `vision`, `text_guided_vision`, `vision_incomplete`, or `airbnb_amenity`
- `vision_decision` and `vision_confidence` when provider metadata or text-guided vision changes the final decision
- `text_guided_full_gallery` when Zonaprop/Argenprop washer text forced the full-gallery vision pass
- `classified_image_count`, `classification_error_count`, and `incomplete` when some photos could not be classified
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

Airbnb extraction is adapter-backed. The default `api` adapter replays Airbnb's web JSON endpoint and falls back to the older HTML payload parser unless explicitly forced. Set `AIRBNB_EXTRACTION_ADAPTER=html` to force the HTML adapter, or `AIRBNB_EXTRACTION_ADAPTER=api` to require the JSON adapter without fallback.

## Model Result Cache

Vision classifications are cached in `.apartment-laundry-cache/model-results.jsonl` by default. Cache keys include the model, image detail level, image SHA-256, prompt version, and schema version, so repeated scans and evals avoid paying for the same image/model verdict again.

Useful flags:

```sh
--refresh-model-cache      # ignore cached verdicts and write fresh results
--no-model-cache           # disable model result cache reads and writes
--model-cache <path>       # use a different model-result cache file
--no-shadow-v2             # disable shadow v2 verdict fields
```

The current v2 image verdict schema runs in shadow mode. It is derived from the accepted v1 verdict and stored in output evidence for analysis, but it does not change the listing decision yet.

## Frozen Fixture Images

Listings can disappear or change their galleries, so listing fixtures can be frozen to local image files:

```sh
bun run fixtures:download-images \
  --fixtures fixtures/listings.jsonl \
  --out fixtures/assets/listing-images.jsonl
```

The downloader reads cached listing extraction from `.apartment-laundry-cache/extractions.jsonl` by default. If you need fresh photo URLs or a fixture has no cached extraction, add `--refresh-extraction`.

Run the default repeatable listing-level regression against local image bytes with:

```sh
bun run regression:frozen
```

The manifest keeps the original remote image URL for evidence while loading the image bytes from `fixtures/assets/listings/...`, so reports remain readable and evals survive unpublished listings.
Frozen runs also hydrate provider metadata from the fixture manifest or extraction cache, including Airbnb washer amenity labels, so the repeatable regression matches the production listing-summary decision path.
Listing fixture runs use the shared listing image limit default instead of a smaller regression-only cap, so full provider galleries are preserved unless `--max-images` is explicitly set.

Fixture image files are tracked with Git LFS. If a clone has pointer files instead of real images, install Git LFS and run:

```sh
git lfs pull
```

Use the live stale-listing check when you want to catch provider drift or fixtures whose original listing pages have been unpublished. This check intentionally ignores cached listing extraction and should not replace frozen regression:

```sh
bun run check:stale-listings
```

## Core QA

Run the cheap deterministic project gate before shipping code-only changes:

```sh
bun run qa:core
```

For model, extraction, or fixture changes, also run the relevant slower gate:

```sh
bun run regression:frozen
bun run smoke:extractions --fixtures fixtures/listings-airbnb.jsonl --limit 1 --refresh-extraction
bun run check:stale-listings
```

## Smoke Test Extraction

Provider-specific smoke fixtures are in `fixtures/listings-<provider>.jsonl`.

```sh
bun run smoke:extractions \
  --fixtures fixtures/listings-airbnb.jsonl \
  --limit 1 \
  --refresh-extraction
```

Smoke extraction records include an `extraction_quality` score. The default smoke run fails below `55`; use `--min-quality-score <n>` to tighten or loosen that provider-specific hardening check.

To smoke test search-result pagination and listing URL discovery without model calls:

```sh
bun run smoke:search
bun run smoke:search --provider airbnb
```

To audit fresh search-result extraction across providers and generate a review page:

```sh
bun run audit:extractions \
  --max-listings 4 \
  --max-pages 1 \
  --max-images 20 \
  --refresh-extraction
```

This writes `fixtures/search-extraction-audit-2026-04-29.jsonl` and `fixtures/review-search-extractions-2026-04-29.html`.

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

Use `bun run find` when you have a provider search/results URL instead of individual listing URLs. The command pages through result pages, discovers listing URLs, classifies each listing, and prints only `IN_UNIT` matches by default:

```sh
bun run find "https://www.zonaprop.com.ar/inmuebles-alquiler-temporal-nunez-las-canitas-con-amoblado-menos-1500-dolar.html" \
  --max-listings 20 \
  --max-pages 5 \
  --out results/search-zonaprop.jsonl
```

`bun run search --search-url <url>` remains available as a compatibility alias for scripts.

You can also let the CLI build the provider search URL from normalized filters:

```sh
bun run find \
  --provider zonaprop \
  --neighborhood nunez,las-canitas \
  --max-price 1500 \
  --min-ambientes 2 \
  --max-ambientes 3
```

Supported generated-filter fields:

- `--provider zonaprop|argenprop|airbnb`
- `--neighborhood <name>` or `--neighborhoods <comma-list>`
- `--min-price <usd>`, `--max-price <usd>`, or `--price <usd>` as a max-price alias
- `--ambientes <n>` or `--min-ambientes <n>` / `--max-ambientes <n>` for Zonaprop/Argenprop
- `--dormitorios <n>` or `--min-dormitorios <n>` / `--max-dormitorios <n>` for Zonaprop/Argenprop
- `--check-in YYYY-MM-DD` and `--check-out YYYY-MM-DD` for Airbnb

Generated Zonaprop and Argenprop searches always include `amoblado`. Airbnb generated searches include `amenities[]=33` for washer, `room_types[]=Entire home/apt`, and ignore `ambientes`/`dormitorios` because Airbnb does not expose those filters in the same way.

Supported search providers:

- Zonaprop search pages
- Argenprop search pages
- Airbnb search pages

Search discovery uses local Playwright for Argenprop and Airbnb. Zonaprop stays on Playwriter because local Playwright and Browserbase currently hit the site's bot check.

When you pass a raw URL, that provider URL remains the source of truth for filters such as neighborhood, furnished, washer amenity, dates, and max dollar amount. For Airbnb, pass a URL or generated filters with `checkin` and `checkout` when you want date-specific availability and pricing.

Search audit records include `page_urls`, so you can confirm which result pages were visited.

## Web UI

The TanStack Start UI wraps the same `src/core` services used by the CLI. It supports provider filters, typeahead neighborhood multi-select, raw search URLs, model-backed scans, result filtering by washer decision, and expandable listing rows with extracted photos and descriptions.

```sh
bun run dev
```

Open `http://localhost:3000`. Web scans require `OPENAI_API_KEY`.

The default local scan throughput is `OPENAI_MODEL_CONCURRENCY=25`, `LISTING_SCAN_CONCURRENCY=20`, and `OPENAI_MODEL_CALLS_PER_MINUTE=240`. This is chosen from observed Tier 2 response headers for the current key: requests are not the bottleneck, `gpt-5.4-mini` reports about 2M TPM, and `gpt-5.4` reports about 1M TPM. At 240 calls/minute, even older high-token image calls around 3.7k tokens remain under the lower `gpt-5.4` token ceiling. The call pacer prevents low-latency bursts from exceeding TPM even when concurrency is high. OpenAI rate limits are account, project, and model specific, so override those env vars if `logs/app.log` shows different `limitTokens`/`remainingTokens` headroom.

Backend scan logs are written to `logs/app.log` by default. The log is JSONL and includes search discovery, extraction/cache, listing, batch, image-load, first-pass model, escalation, and summary timing events. Override with `APP_LOG_PATH=/path/to/app.log`.

Summarize scan timings, cache hit rates, token counts, and a concurrency recommendation with:

```sh
bun run logs:summary
```

Useful CLI flags:

```sh
--discover-only   # only extract listing URLs, no model calls
--max-pages 5     # page through up to 5 result pages
--all             # print every classified listing instead of only IN_UNIT matches
--format cards    # default readable output
--format table    # tab-separated output
--format json     # JSON lines
```

## Evaluate Fixtures

Image labels live in `fixtures/images.jsonl`.

```sh
bun run eval:fixtures \
  --models gpt-5.4-mini,gpt-5.4-nano \
  --concurrency 25 \
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
  --concurrency 25 \
  --listing-concurrency 20

bun run eval:listing-summaries \
  --listings fixtures/listings.jsonl \
  --results results/listing-summary-run.jsonl \
  --out results/eval-listing-summaries.jsonl \
  --summary results/eval-listing-summaries-summary.json
```

Current best benchmark on the original 40 labeled Zonaprop listings was the two-pass summary workflow with `gpt-5.4-mini` plus `gpt-5.4` escalation: `39/40` overall, `10/10` in-unit, `16/17` shared-building, and `13/13` unknown.

Listing summary evals report accuracy by expected class and by `decision_source`, so Airbnb metadata overrides can be tracked separately from vision-only decisions.

For regression comparisons only, set `APARTMENT_FINDER_ESCALATION_GATE=broad` to reproduce the older broad second-pass behavior. Leave it unset for the product default candidate gate.

To inspect mistakes from a listing summary run:

```sh
bun run analyze:failures \
  --results results/listing-summary-run.jsonl \
  --fixtures fixtures/listings.jsonl
```

To record corrected labels from the CLI:

```sh
bun run feedback \
  --listing-url "https://www.zonaprop.com.ar/propiedades/..." \
  --expected SHARED_BUILDING \
  --predicted IN_UNIT \
  --note "False positive on boiler image"
```

## Development

```sh
bun run typecheck
bun run test
bun run smoke:browser
bun run smoke:browser:sites --backend local
bun run smoke:browserbase:sites
```

`bun run playwright:install` installs the Chromium browser used by Playwright smoke checks and future direct browser automation.
After filling `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`, run `bun run smoke:browserbase:sites` to check whether Browserbase can load Zonaprop, Argenprop, and Airbnb.

Source layout:

- `src/core/` - framework-agnostic service API for building search URLs, scanning listings, and scanning search result pages
- `src/routes/` and `src/web/` - TanStack Start routes and server functions
- `src/components/` - local shadcn-style UI components
- `src/providers/` - provider-specific extraction and search behavior
- `src/listing/` - listing extraction, aggregation, and output helpers
- `src/browser/` - browser backend and Playwriter session helpers
- `src/cli/` - CLI defaults and option parsing
- `src/lib/` - generic filesystem, image, concurrency, and shell helpers

Generated outputs, downloaded images, and secrets are ignored:

- `.env`
- `.apartment-laundry-cache/`
- `results/`
- `node_modules/`

Fixtures are intentionally committed so extraction and classification behavior can be regression-tested over time.
