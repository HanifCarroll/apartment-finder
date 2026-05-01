# Apartment Finder Agent Guide

## Purpose

This repo is a Bun CLI prototype for deciding whether an apartment listing has laundry in the unit, shared laundry in the building, or no clear washer evidence. The core workflow extracts listing photos, sends them to OpenAI vision models, and aggregates photo-level results into a listing-level decision.

## Operating Rules

- Keep the CLI simple and auditable. Prefer small provider modules over a broad scraping framework.
- Preserve fixtures. They are the regression set and should stay in the repo unless Hanif explicitly says otherwise.
- Do not commit `.env`, downloaded images, extraction caches, `results/`, or `node_modules/`.
- Treat `fixtures/listings.jsonl` as the combined labeled listing set. Provider-specific fixture files can exist for smoke tests.
- When adding a listing provider, implement it in its own `src/<provider>.ts` file and route through `src/listing-extraction.ts`.
- Extraction records should include `provider`, `gallery_count`, `image_count`, `gallery_count_matches_extracted`, and `extraction_source`.
- Prefer direct listing metadata or gallery endpoints when available. Use browser automation only when HTTP extraction is unreliable.
- For Airbnb, treat explicit washer amenity labels as first-class listing metadata: `Washer - in unit` maps to `IN_UNIT`, `Washer - in building` maps to `SHARED_BUILDING`, and plain `Washer` falls back to the vision aggregate.
- Keep single-listing and batch-scan human output consistent by using `src/listing-output.ts`.

## Checks

Run these after code changes:

```sh
bun run typecheck
```

For provider extraction changes, also run an extraction-only smoke test:

```sh
bun run smoke:extractions --fixtures fixtures/listings-<provider>.jsonl --limit 1 --refresh-extraction
```

For model behavior changes, run the listing summary workflow and evaluator:

```sh
bun run summary:listings --fixtures fixtures/listings.jsonl --out results/listing-summary-run.jsonl
bun run eval:listing-summaries --results results/listing-summary-run.jsonl
```

## Current Providers

- Zonaprop: Playwriter-backed same-origin HTML extraction first, falling back to rendered Playwriter extraction and `Ver todas las fotos` only when needed.
- Argenprop: HTTP extraction from `gallerypartial`, ignores video counts.
- Airbnb: adapter-backed extraction. Default API adapter replays the web `StaysPdpSections` JSON endpoint and can fall back to the HTML page payload adapter; `AIRBNB_EXTRACTION_ADAPTER=html|api` forces either path.
