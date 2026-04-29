import type { LocationLabel, Verdict } from "./types";

export type ClassificationRecordLike = {
  ok?: boolean;
  listing_image_index?: number;
  image?: { source?: string };
  model?: string;
  verdict?: Verdict;
};

export type ListingEvidence = {
  listing_image_index?: number;
  image_url?: string;
  model?: string;
  location_label: LocationLabel;
  contains_washing_machine: boolean;
  washing_machine_visibility: Verdict["washing_machine_visibility"];
  confidence: number;
  rationale: string;
};

export type ListingAggregate = {
  predictedLocation: LocationLabel;
  evidence: ListingEvidence[];
};

export const DEFAULT_LISTING_POLICY = "shared-overrides-in-unit";

const labelOrder: Record<LocationLabel, number> = {
  IN_UNIT: 0,
  SHARED_BUILDING: 1,
  CONFLICTING: 2,
  UNKNOWN: 3,
};

export function buildEvidence(records: ClassificationRecordLike[]): ListingEvidence[] {
  return records
    .filter((record) => record.ok && record.verdict?.contains_washing_machine)
    .map((record) => ({
      listing_image_index: record.listing_image_index,
      image_url: record.image?.source,
      model: record.model,
      location_label: record.verdict!.location_label,
      contains_washing_machine: record.verdict!.contains_washing_machine,
      washing_machine_visibility: record.verdict!.washing_machine_visibility,
      confidence: record.verdict!.confidence,
      rationale: record.verdict!.rationale,
    }))
    .sort((a, b) => labelOrder[a.location_label] - labelOrder[b.location_label] || b.confidence - a.confidence);
}

export function isStrongEvidence(evidence: ListingEvidence, location: LocationLabel): boolean {
  if (evidence.location_label !== location) return false;
  if (location === "SHARED_BUILDING") {
    return ["clear", "partial"].includes(evidence.washing_machine_visibility) &&
      evidence.confidence >= 0.85;
  }
  return evidence.washing_machine_visibility === "clear"
    ? evidence.confidence >= 0.85
    : evidence.washing_machine_visibility === "partial" && evidence.confidence >= 0.95;
}

function aggregateAnyInUnit(records: ClassificationRecordLike[]): ListingAggregate {
  const evidence = buildEvidence(records);
  if (evidence.some((item) => item.location_label === "IN_UNIT")) {
    return { predictedLocation: "IN_UNIT", evidence };
  }
  if (evidence.some((item) => item.location_label === "SHARED_BUILDING")) {
    return { predictedLocation: "SHARED_BUILDING", evidence };
  }
  if (evidence.some((item) => item.location_label === "CONFLICTING")) {
    return { predictedLocation: "CONFLICTING", evidence };
  }
  return { predictedLocation: "UNKNOWN", evidence };
}

export function aggregateByPolicy(
  policy: string,
  records: ClassificationRecordLike[],
): ListingAggregate {
  if (policy === "any-in-unit") {
    return aggregateAnyInUnit(records);
  }

  const evidence = buildEvidence(records);
  const strongInUnit = evidence.filter((item) => isStrongEvidence(item, "IN_UNIT"));
  const strongShared = evidence.filter((item) => isStrongEvidence(item, "SHARED_BUILDING"));
  const strongConflicting = evidence.filter((item) => isStrongEvidence(item, "CONFLICTING"));

  if (policy === "high-confidence-in-unit") {
    if (strongInUnit.length > 0) return { predictedLocation: "IN_UNIT", evidence };
    if (strongShared.length > 0) return { predictedLocation: "SHARED_BUILDING", evidence };
    if (strongConflicting.length > 0) return { predictedLocation: "CONFLICTING", evidence };
    return { predictedLocation: "UNKNOWN", evidence };
  }

  if (policy === "shared-overrides-in-unit") {
    if (strongShared.length > 0) return { predictedLocation: "SHARED_BUILDING", evidence };
    if (strongInUnit.length > 0) return { predictedLocation: "IN_UNIT", evidence };
    if (strongConflicting.length > 0) return { predictedLocation: "CONFLICTING", evidence };
    return { predictedLocation: "UNKNOWN", evidence };
  }

  throw new Error(`Unknown aggregation policy: ${policy}`);
}

export function aggregateTwoModelAgreement(records: ClassificationRecordLike[]): ListingAggregate {
  const evidenceBySource = new Map<string, Array<ListingEvidence & { model: string }>>();

  for (const record of records) {
    if (!record.ok || !record.model || !record.verdict?.contains_washing_machine) continue;
    const source = record.image?.source || String(record.listing_image_index ?? "");
    const items = evidenceBySource.get(source) || [];
    items.push({
      listing_image_index: record.listing_image_index,
      image_url: record.image?.source,
      model: record.model,
      location_label: record.verdict.location_label,
      contains_washing_machine: record.verdict.contains_washing_machine,
      washing_machine_visibility: record.verdict.washing_machine_visibility,
      confidence: record.verdict.confidence,
      rationale: record.verdict.rationale,
    });
    evidenceBySource.set(source, items);
  }

  const agreedEvidence: ListingEvidence[] = [];
  for (const items of evidenceBySource.values()) {
    const strongSharedModels = new Set(
      items.filter((item) => isStrongEvidence(item, "SHARED_BUILDING")).map((item) => item.model),
    );
    const strongInUnitModels = new Set(
      items.filter((item) => isStrongEvidence(item, "IN_UNIT")).map((item) => item.model),
    );

    if (strongSharedModels.size >= 2 || strongInUnitModels.size >= 2) {
      agreedEvidence.push(...items);
    }
  }

  if (agreedEvidence.some((item) => isStrongEvidence(item, "SHARED_BUILDING"))) {
    return { predictedLocation: "SHARED_BUILDING", evidence: agreedEvidence };
  }
  if (agreedEvidence.some((item) => isStrongEvidence(item, "IN_UNIT"))) {
    return { predictedLocation: "IN_UNIT", evidence: agreedEvidence };
  }
  return { predictedLocation: "UNKNOWN", evidence: agreedEvidence };
}

export function listingConfidence(aggregate: ListingAggregate): "high" | "medium" | "low" {
  const strongEvidence = aggregate.evidence.filter((item) => isStrongEvidence(item, aggregate.predictedLocation));
  if (aggregate.predictedLocation === "UNKNOWN") {
    return aggregate.evidence.length === 0 ? "medium" : "low";
  }
  if (strongEvidence.some((item) => item.confidence >= 0.95)) return "high";
  if (strongEvidence.length > 0) return "medium";
  return "low";
}
