import OpenAI from "openai";
import { mapConcurrent } from "./concurrency";
import { loadImage, loadImageFromUrl } from "./images";
import {
  DEFAULT_LISTING_POLICY,
  aggregateByPolicy,
  isStrongEvidence,
  listingConfidence,
  type ClassificationRecordLike,
} from "./listing-aggregation";
import { extractListingImageUrls } from "./listing-extraction";
import { classifyWithModel } from "./openai-classifier";
import type { Args, ImagePayload, Verdict } from "./types";

function shouldStopAfterImage(records: unknown[]): boolean {
  return records.some((record) => {
    if (!record || typeof record !== "object") return false;
    const maybeRecord = record as { ok?: boolean; verdict?: Verdict };
    return maybeRecord.ok === true && maybeRecord.verdict?.contains_washing_machine === true;
  });
}

async function classifyImagePayload(
  client: OpenAI,
  image: ImagePayload,
  args: Args,
  extra: Record<string, unknown> = {},
): Promise<unknown[]> {
  const records = [];

  for (const model of args.models) {
    try {
      const result = await classifyWithModel(client, model, image, args.detail);
      records.push({
        ok: true,
        created_at: new Date().toISOString(),
        ...extra,
        image: {
          source: image.source,
          cached_path: image.cachedPath,
          content_type: image.contentType,
          bytes: image.bytes,
        },
        ...result,
      });
    } catch (error) {
      records.push({
        ok: false,
        created_at: new Date().toISOString(),
        ...extra,
        image: {
          source: image.source,
          cached_path: image.cachedPath,
          content_type: image.contentType,
          bytes: image.bytes,
        },
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return records;
}

async function classifySingleImage(args: Args, client: OpenAI): Promise<unknown[]> {
  const image = await loadImage(args);
  return classifyImagePayload(client, image, args);
}

function imageRecord(
  image: ImagePayload,
  result: Awaited<ReturnType<typeof classifyWithModel>>,
  extra: Record<string, unknown>,
) {
  return {
    ok: true,
    created_at: new Date().toISOString(),
    ...extra,
    image: {
      source: image.source,
      cached_path: image.cachedPath,
      content_type: image.contentType,
      bytes: image.bytes,
    },
    ...result,
  };
}

function isEscalationCandidate(record: ClassificationRecordLike, firstPassAggregateLocation: string): boolean {
  const verdict = record.verdict;
  if (!record.ok || !verdict) return false;

  if (firstPassAggregateLocation === "UNKNOWN") return true;
  if (verdict.location_label === "CONFLICTING") return true;
  if (verdict.contains_washing_machine && verdict.location_label === "UNKNOWN") return true;
  if (verdict.location_label === "IN_UNIT" && verdict.confidence < 0.95) return true;
  if (verdict.location_label === "IN_UNIT" && verdict.washing_machine_visibility !== "clear") return true;
  if (verdict.location_label === "SHARED_BUILDING" && !isStrongEvidence({
    location_label: verdict.location_label,
    contains_washing_machine: verdict.contains_washing_machine,
    washing_machine_visibility: verdict.washing_machine_visibility,
    confidence: verdict.confidence,
    rationale: verdict.rationale,
  }, "SHARED_BUILDING")) return true;

  return false;
}

async function classifyListing(args: Args): Promise<unknown[]> {
  if (!args.listingUrl) throw new Error("Missing listing URL.");

  const extraction = await extractListingImageUrls(args.listingUrl, args);
  const records: unknown[] = [
    {
      ok: true,
      type: "listing_photo_extraction",
      created_at: new Date().toISOString(),
      ...extraction,
      image_count: extraction.image_urls.length,
    },
  ];

  if (args.extractOnly) {
    return records;
  }

  const client = new OpenAI();

  const classifyImageUrl = async (imageUrl: string, index: number): Promise<unknown[]> => {
    try {
      const image = await loadImageFromUrl(imageUrl, args.cacheDir);
      const imageRecords = await classifyImagePayload(client, image, args, {
        listing_url: args.listingUrl,
        listing_image_index: index,
      });
      return imageRecords;
    } catch (error) {
      return [{
        ok: false,
        created_at: new Date().toISOString(),
        listing_url: args.listingUrl,
        listing_image_index: index,
        image: {
          source: imageUrl,
        },
        error: error instanceof Error ? error.message : String(error),
      }];
    }
  };

  if (args.classifyAll) {
    const imageRecords = await mapConcurrent(
      extraction.image_urls,
      args.concurrency,
      classifyImageUrl,
    );
    records.push(...imageRecords.flat());

    if (args.listingSummary) {
      const firstPassRecords = records.filter((record): record is ClassificationRecordLike =>
        Boolean(record && typeof record === "object" && "verdict" in record),
      );
      const firstPassAggregate = aggregateByPolicy(DEFAULT_LISTING_POLICY, firstPassRecords);
      const firstPassRecordsByIndex = new Map<number, ClassificationRecordLike>();
      for (const record of firstPassRecords) {
        if (typeof record.listing_image_index === "number") {
          firstPassRecordsByIndex.set(record.listing_image_index, record);
        }
      }

      const escalationIndexes = extraction.image_urls
        .map((_, index) => index)
        .filter((index) => {
          const record = firstPassRecordsByIndex.get(index);
          return record
            ? isEscalationCandidate(record, firstPassAggregate.predictedLocation)
            : firstPassAggregate.predictedLocation === "UNKNOWN";
        });

      const escalationRecords = await mapConcurrent(
        escalationIndexes,
        args.concurrency,
        async (index): Promise<unknown> => {
          const imageUrl = extraction.image_urls[index];
          try {
            const image = await loadImageFromUrl(imageUrl, args.cacheDir);
            const result = await classifyWithModel(client, args.escalationModel, image, args.detail);
            return imageRecord(image, result, {
              listing_url: args.listingUrl,
              listing_image_index: index,
              pass: "escalation",
              escalated_from_model: args.models[0],
            });
          } catch (error) {
            return {
              ok: false,
              created_at: new Date().toISOString(),
              listing_url: args.listingUrl,
              listing_image_index: index,
              pass: "escalation",
              model: args.escalationModel,
              image: { source: imageUrl },
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      );
      records.push(...escalationRecords);

      const finalRecords = [...firstPassRecords, ...escalationRecords.filter((record): record is ClassificationRecordLike =>
        Boolean(record && typeof record === "object" && "verdict" in record),
      )];
      const finalAggregate = aggregateByPolicy(DEFAULT_LISTING_POLICY, finalRecords);
      records.push({
        ok: true,
        type: "listing_summary",
        created_at: new Date().toISOString(),
        listing_url: args.listingUrl,
        decision: finalAggregate.predictedLocation,
        confidence: listingConfidence(finalAggregate),
        policy: DEFAULT_LISTING_POLICY,
        first_pass_model: args.models[0],
        escalation_model: args.escalationModel,
        escalated_image_indexes: escalationIndexes,
        image_count: extraction.image_urls.length,
        evidence: finalAggregate.evidence.slice(0, 8),
      });
    }
    return records;
  }

  for (let index = 0; index < extraction.image_urls.length; index += 1) {
    const imageRecords = await classifyImageUrl(extraction.image_urls[index], index);
    records.push(...imageRecords);

    if (shouldStopAfterImage(imageRecords)) {
      records.push({
        ok: true,
        type: "listing_classification_stopped",
        created_at: new Date().toISOString(),
        listing_url: args.listingUrl,
        reason: "washing_machine_found",
        listing_image_index: index,
      });
      break;
    }
  }

  return records;
}

export async function runClassification(args: Args): Promise<unknown[]> {
  return args.listingUrl
    ? classifyListing(args)
    : classifySingleImage(args, new OpenAI());
}
