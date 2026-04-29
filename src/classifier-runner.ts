import OpenAI from "openai";
import { mapConcurrent } from "./lib/concurrency";
import { loadImage, loadImageFromUrl } from "./lib/images";
import { logger } from "./lib/logger";
import {
  DEFAULT_LISTING_POLICY,
  aggregateByPolicy,
  isStrongEvidence,
  listingConfidence,
  type ClassificationRecordLike,
} from "./listing/aggregation";
import { extractListingImageUrls } from "./listing/extraction";
import { classifyWithModel } from "./openai-classifier";
import type { Args, ImagePayload, Verdict } from "./types";

const STAGED_BATCH_SIZE = 6;

function useBroadEscalationGate(): boolean {
  return process.env.APARTMENT_FINDER_ESCALATION_GATE === "broad";
}

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

function isEscalationCandidate(record: ClassificationRecordLike, _firstPassAggregateLocation: string): boolean {
  const verdict = record.verdict;
  if (!record.ok || !verdict) return false;
  const verdictText = [
    verdict.rationale,
    ...verdict.visual_evidence,
    ...verdict.in_unit_signals,
    ...verdict.shared_space_signals,
  ].join(" ").toLowerCase();
  const looksLikeBoilerConfusion = /\b(boiler|water heater|calef[oó]n|termotanque|wall[- ]mounted|above (?:a )?(?:counter|sink)|kitchen appliance)\b/.test(verdictText);
  const mentionsLaundryEvidence = /\b(washer|washing machine|laundry|laundromat|laundry room|lavarropas|lavasecarropas|lavadero|lavander[ií]a|shared laundry)\b/.test(verdictText);

  if (useBroadEscalationGate() && _firstPassAggregateLocation === "UNKNOWN") return true;
  if (verdict.location_label === "CONFLICTING") return true;
  if (verdict.contains_washing_machine) return true;
  if (mentionsLaundryEvidence) return true;
  if (verdict.location_label === "IN_UNIT" && verdict.confidence < 0.98) return true;
  if (verdict.location_label === "IN_UNIT" && looksLikeBoilerConfusion) return true;
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

function airbnbAmenityDecision(extraction: {
  provider?: string;
  airbnb_laundry_amenity_label?: string;
}): "IN_UNIT" | "SHARED_BUILDING" | null {
  if (extraction.provider !== "airbnb") return null;
  if (extraction.airbnb_laundry_amenity_label === "WASHER_IN_UNIT") return "IN_UNIT";
  if (extraction.airbnb_laundry_amenity_label === "WASHER_IN_BUILDING") return "SHARED_BUILDING";
  return null;
}

function listingSummaryRecord(args: Args, extraction: Awaited<ReturnType<typeof extractListingImageUrls>>, values: {
  decision: string;
  confidence: string;
  decisionSource: string;
  visionDecision?: string;
  visionConfidence?: string;
  escalatedImageIndexes?: number[];
  evidence?: ClassificationRecordLike[];
}) {
  return {
    ok: true,
    type: "listing_summary",
    created_at: new Date().toISOString(),
    listing_url: args.listingUrl,
    decision: values.decision,
    confidence: values.confidence,
    decision_source: values.decisionSource,
    vision_decision: values.visionDecision,
    vision_confidence: values.visionConfidence,
    airbnb_laundry_amenity_label: extraction.airbnb_laundry_amenity_label,
    airbnb_laundry_amenity_text: extraction.airbnb_laundry_amenity_text,
    policy: DEFAULT_LISTING_POLICY,
    first_pass_model: args.models[0],
    escalation_model: args.escalationModel,
    escalated_image_indexes: values.escalatedImageIndexes || [],
    image_count: extraction.image_urls.length,
    evidence: (values.evidence || []).slice(0, 8),
  };
}

async function classifyListing(args: Args): Promise<unknown[]> {
  if (!args.listingUrl) throw new Error("Missing listing URL.");

  const extractionStartedAt = performance.now();
  const extraction = await extractListingImageUrls(args.listingUrl, args);
  logger.info({
    event: "listing_phase_finished",
    phase: "extraction",
    listingUrl: args.listingUrl,
    provider: extraction.provider,
    imageCount: extraction.image_urls.length,
    galleryCount: extraction.gallery_count,
    extractionSource: extraction.extraction_source,
    durationMs: Math.round(performance.now() - extractionStartedAt),
  });
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

  const amenityDecision = airbnbAmenityDecision(extraction);
  if (args.listingSummary && amenityDecision) {
    logger.info({
      event: "listing_phase_finished",
      phase: "amenity_short_circuit",
      listingUrl: args.listingUrl,
      provider: extraction.provider,
      decision: amenityDecision,
      durationMs: 0,
    });
    records.push(listingSummaryRecord(args, extraction, {
      decision: amenityDecision,
      confidence: "high",
      decisionSource: "airbnb_amenity",
      escalatedImageIndexes: [],
      evidence: [],
    }));
    return records;
  }

  const client = new OpenAI();

  const classifyImageUrl = async (imageUrl: string, index: number): Promise<unknown[]> => {
    try {
      const imageLoadStartedAt = performance.now();
      const image = await loadImageFromUrl(imageUrl, args.cacheDir);
      logger.info({
        event: "image_phase_finished",
        phase: "load_image",
        listingUrl: args.listingUrl,
        imageIndex: index,
        imageUrl,
        bytes: image.bytes,
        contentType: image.contentType,
        durationMs: Math.round(performance.now() - imageLoadStartedAt),
      });
      const firstPassStartedAt = performance.now();
      const imageRecords = await classifyImagePayload(client, image, args, {
        listing_url: args.listingUrl,
        listing_image_index: index,
      });
      logger.info({
        event: "image_phase_finished",
        phase: "classify_first_pass",
        listingUrl: args.listingUrl,
        imageIndex: index,
        imageUrl,
        models: args.models,
        recordCount: imageRecords.length,
        durationMs: Math.round(performance.now() - firstPassStartedAt),
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
    const classifyIndexes = async (indexes: number[]): Promise<unknown[]> => {
      const batchStartedAt = performance.now();
      const imageRecords = await mapConcurrent(
        indexes,
        args.concurrency,
        async (imageIndex) => classifyImageUrl(extraction.image_urls[imageIndex], imageIndex),
      );
      const flattened = imageRecords.flat();
      logger.info({
        event: "listing_phase_finished",
        phase: "first_pass_batch",
        listingUrl: args.listingUrl,
        imageIndexes: indexes,
        imageCount: indexes.length,
        recordCount: flattened.length,
        durationMs: Math.round(performance.now() - batchStartedAt),
      });
      return flattened;
    };

    const buildSummary = async (firstPassRecords: ClassificationRecordLike[], classifiedIndexes: number[]) => {
      const aggregateStartedAt = performance.now();
      const firstPassAggregate = aggregateByPolicy(DEFAULT_LISTING_POLICY, firstPassRecords);
      logger.info({
        event: "listing_phase_finished",
        phase: "summary_aggregate",
        listingUrl: args.listingUrl,
        classifiedImageCount: classifiedIndexes.length,
        evidenceCount: firstPassAggregate.evidence.length,
        predictedLocation: firstPassAggregate.predictedLocation,
        durationMs: Math.round(performance.now() - aggregateStartedAt),
      });
      const firstPassRecordsByIndex = new Map<number, ClassificationRecordLike>();
      for (const record of firstPassRecords) {
        if (typeof record.listing_image_index === "number") {
          firstPassRecordsByIndex.set(record.listing_image_index, record);
        }
      }

      const escalationIndexes = classifiedIndexes.filter((index) => {
        const record = firstPassRecordsByIndex.get(index);
        return record ? isEscalationCandidate(record, firstPassAggregate.predictedLocation) : false;
      });

      const escalationStartedAt = performance.now();
      const escalationRecords = await mapConcurrent(
        escalationIndexes,
        args.concurrency,
        async (index): Promise<unknown> => {
          const imageUrl = extraction.image_urls[index];
          try {
            const imageLoadStartedAt = performance.now();
            const image = await loadImageFromUrl(imageUrl, args.cacheDir);
            logger.info({
              event: "image_phase_finished",
              phase: "load_image_escalation",
              listingUrl: args.listingUrl,
              imageIndex: index,
              imageUrl,
              bytes: image.bytes,
              contentType: image.contentType,
              durationMs: Math.round(performance.now() - imageLoadStartedAt),
            });
            const escalationImageStartedAt = performance.now();
            const result = await classifyWithModel(client, args.escalationModel, image, args.detail);
            logger.info({
              event: "image_phase_finished",
              phase: "classify_escalation",
              listingUrl: args.listingUrl,
              imageIndex: index,
              imageUrl,
              model: args.escalationModel,
              durationMs: Math.round(performance.now() - escalationImageStartedAt),
            });
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
      logger.info({
        event: "listing_phase_finished",
        phase: "escalation",
        listingUrl: args.listingUrl,
        imageIndexes: escalationIndexes,
        imageCount: escalationIndexes.length,
        recordCount: escalationRecords.length,
        durationMs: Math.round(performance.now() - escalationStartedAt),
      });

      const finalStartedAt = performance.now();
      const finalRecords = [...firstPassRecords, ...escalationRecords.filter((record): record is ClassificationRecordLike =>
        Boolean(record && typeof record === "object" && "verdict" in record),
      )];
      const finalAggregate = aggregateByPolicy(DEFAULT_LISTING_POLICY, finalRecords);
      const finalConfidence = listingConfidence(finalAggregate);
      logger.info({
        event: "listing_phase_finished",
        phase: "summary_final",
        listingUrl: args.listingUrl,
        decision: finalAggregate.predictedLocation,
        confidence: finalConfidence,
        evidenceCount: finalAggregate.evidence.length,
        durationMs: Math.round(performance.now() - finalStartedAt),
      });

      return {
        escalationRecords,
        summary: listingSummaryRecord(args, extraction, {
          decision: finalAggregate.predictedLocation,
          confidence: finalConfidence,
          decisionSource: "vision",
          visionDecision: finalAggregate.predictedLocation,
          visionConfidence: finalConfidence,
          escalatedImageIndexes: escalationIndexes,
          evidence: finalAggregate.evidence,
        }),
      };
    };

    const allIndexes = extraction.image_urls.map((_, index) => index);
    if (args.stagedClassification && args.listingSummary) {
      for (let start = 0; start < allIndexes.length; start += STAGED_BATCH_SIZE) {
        const batchIndexes = allIndexes.slice(start, start + STAGED_BATCH_SIZE);
        const batchRecords = await classifyIndexes(batchIndexes);
        records.push(...batchRecords);

        const firstPassRecords = records.filter((record): record is ClassificationRecordLike =>
          Boolean(record && typeof record === "object" && "verdict" in record && (record as { pass?: string }).pass !== "escalation"),
        );
        const classifiedIndexes = allIndexes.filter((index) =>
          firstPassRecords.some((record) => record.listing_image_index === index),
        );
        const candidateSummary = await buildSummary(firstPassRecords, classifiedIndexes);
        const decision = candidateSummary.summary.decision;
        const confidence = candidateSummary.summary.confidence;

        if ((decision === "IN_UNIT" || decision === "SHARED_BUILDING") && confidence === "high") {
          records.push(...candidateSummary.escalationRecords);
          records.push(candidateSummary.summary);
          return records;
        }
      }
    } else {
      const imageRecords = await classifyIndexes(allIndexes);
      records.push(...imageRecords);
    }

    if (args.stagedClassification && !args.listingSummary) {
      return records;
    }

    if (args.listingSummary) {
      const firstPassRecords = records.filter((record): record is ClassificationRecordLike =>
        Boolean(record && typeof record === "object" && "verdict" in record && (record as { pass?: string }).pass !== "escalation"),
      );
      const summary = await buildSummary(firstPassRecords, allIndexes.filter((index) =>
        firstPassRecords.some((record) => record.listing_image_index === index),
      ));
      records.push(...summary.escalationRecords);
      records.push(summary.summary);
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
