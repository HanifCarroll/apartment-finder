import { describe, expect, it } from "vitest";
import { selectEscalationIndexes } from "../src/listing/escalation";
import type { ClassificationRecordLike, ListingAggregate } from "../src/listing/aggregation";
import type { LocationLabel, Verdict } from "../src/types";

function record(
  index: number,
  locationLabel: LocationLabel,
  confidence: number,
  overrides: Partial<Verdict> = {},
): ClassificationRecordLike {
  const rationale = overrides.rationale ?? "fixture";
  return {
    ok: true,
    listing_image_index: index,
    model: "gpt-5.4-mini",
    image: { source: `https://example.com/${index}.jpg` },
    verdict: {
      contains_washing_machine: locationLabel !== "UNKNOWN",
      washing_machine_visibility: locationLabel === "UNKNOWN" ? "none" : "clear",
      location_label: locationLabel,
      confidence,
      in_unit_signals: [],
      shared_space_signals: [],
      visual_evidence: [],
      rationale,
      recommended_next_step: "none",
      ...overrides,
    },
  };
}

function aggregate(predictedLocation: LocationLabel): ListingAggregate {
  return { predictedLocation, evidence: [] };
}

describe("selectEscalationIndexes", () => {
  it("caps escalation candidates by score", () => {
    const indexes = selectEscalationIndexes([
      record(0, "UNKNOWN", 0.6),
      record(1, "IN_UNIT", 0.99),
      record(2, "SHARED_BUILDING", 0.9),
      record(3, "CONFLICTING", 0.8),
      record(4, "IN_UNIT", 0.7, { washing_machine_visibility: "partial" }),
    ], aggregate("IN_UNIT"), { maxImages: 2 });

    expect(indexes).toEqual([3, 4]);
  });

  it("prioritizes confuser risk even when the model says in-unit", () => {
    const indexes = selectEscalationIndexes([
      record(0, "IN_UNIT", 0.99),
      record(1, "IN_UNIT", 0.96, { rationale: "wall-mounted water heater above a kitchen counter" }),
      record(2, "SHARED_BUILDING", 0.86),
    ], aggregate("IN_UNIT"), { maxImages: 1 });

    expect(indexes).toEqual([1]);
  });

  it("returns no indexes when the cap is zero", () => {
    const indexes = selectEscalationIndexes([
      record(0, "CONFLICTING", 0.99),
    ], aggregate("CONFLICTING"), { maxImages: 0 });

    expect(indexes).toEqual([]);
  });
});
