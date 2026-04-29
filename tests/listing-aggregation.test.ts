import { describe, expect, it } from "vitest";
import {
  aggregateByPolicy,
  isStrongEvidence,
  listingConfidence,
  type ClassificationRecordLike,
  type ListingEvidence,
} from "../src/listing/aggregation";

function record(
  locationLabel: "IN_UNIT" | "SHARED_BUILDING" | "UNKNOWN" | "CONFLICTING",
  confidence: number,
  washingMachineVisibility: "clear" | "partial" | "none" | "unsure" = "clear",
  options: { pass?: string; imageIndex?: number; source?: string } = {},
): ClassificationRecordLike {
  return {
    ok: true,
    model: "gpt-5.4-mini",
    pass: options.pass,
    listing_image_index: options.imageIndex,
    image: { source: options.source || `https://example.com/${locationLabel}-${confidence}.jpg` },
    verdict: {
      contains_washing_machine: locationLabel !== "UNKNOWN",
      washing_machine_visibility: washingMachineVisibility,
      location_label: locationLabel,
      confidence,
      in_unit_signals: [],
      shared_space_signals: [],
      visual_evidence: [],
      rationale: "fixture",
      recommended_next_step: "none",
    },
  };
}

describe("isStrongEvidence", () => {
  it("allows partial shared-building washer evidence at high confidence", () => {
    const evidence: ListingEvidence = {
      location_label: "SHARED_BUILDING",
      contains_washing_machine: true,
      washing_machine_visibility: "partial",
      confidence: 0.85,
      rationale: "shared laundry room",
    };

    expect(isStrongEvidence(evidence, "SHARED_BUILDING")).toBe(true);
  });

  it("requires stronger partial in-unit evidence", () => {
    const evidence: ListingEvidence = {
      location_label: "IN_UNIT",
      contains_washing_machine: true,
      washing_machine_visibility: "partial",
      confidence: 0.9,
      rationale: "private kitchen",
    };

    expect(isStrongEvidence(evidence, "IN_UNIT")).toBe(false);
  });
});

describe("aggregateByPolicy", () => {
  it("lets strong shared-building evidence override strong in-unit evidence", () => {
    const aggregate = aggregateByPolicy("shared-overrides-in-unit", [
      record("IN_UNIT", 0.98),
      record("SHARED_BUILDING", 0.9, "partial"),
    ]);

    expect(aggregate.predictedLocation).toBe("SHARED_BUILDING");
    expect(listingConfidence(aggregate)).toBe("medium");
  });

  it("returns unknown when there is no washer evidence", () => {
    const aggregate = aggregateByPolicy("shared-overrides-in-unit", [
      record("UNKNOWN", 0.8, "none"),
    ]);

    expect(aggregate.predictedLocation).toBe("UNKNOWN");
    expect(listingConfidence(aggregate)).toBe("medium");
  });

  it("lets an escalation verdict replace first-pass washer evidence for the same image", () => {
    const source = "https://example.com/kitchen-wall-boiler.jpg";
    const aggregate = aggregateByPolicy("shared-overrides-in-unit", [
      record("IN_UNIT", 0.96, "clear", { imageIndex: 8, source }),
      record("UNKNOWN", 0.95, "none", { pass: "escalation", imageIndex: 8, source }),
    ]);

    expect(aggregate.predictedLocation).toBe("UNKNOWN");
    expect(aggregate.evidence).toHaveLength(0);
  });
});
