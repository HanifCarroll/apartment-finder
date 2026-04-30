import type { LocationLabel, Verdict } from "../types";
import { isStrongEvidence, type ClassificationRecordLike, type ListingAggregate } from "./aggregation";

export const DEFAULT_ESCALATION_POLICY = "targeted-top-k";
export const DEFAULT_MAX_ESCALATION_IMAGES = 6;

export type EscalationSelectionOptions = {
  maxImages: number;
  broadGate?: boolean;
};

type Candidate = {
  index: number;
  score: number;
  reasons: string[];
};

function verdictText(verdict: Verdict): string {
  return [
    verdict.rationale,
    ...verdict.visual_evidence,
    ...verdict.in_unit_signals,
    ...verdict.shared_space_signals,
  ].join(" ").toLowerCase();
}

function addCandidate(candidates: Map<number, Candidate>, index: number, score: number, reason: string): void {
  const existing = candidates.get(index);
  if (!existing) {
    candidates.set(index, { index, score, reasons: [reason] });
    return;
  }
  existing.score = Math.max(existing.score, score);
  if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
}

function evidenceCandidateScore(verdict: Verdict, aggregateLocation: LocationLabel): Candidate["score"] {
  let score = 0;
  if (verdict.location_label === "CONFLICTING") score += 100;
  if (verdict.location_label === aggregateLocation && aggregateLocation !== "UNKNOWN") score += 25;
  if (verdict.contains_washing_machine) score += 30;
  if (verdict.location_label === "IN_UNIT") score += 20;
  if (verdict.location_label === "SHARED_BUILDING") score += 18;
  if (verdict.washing_machine_visibility === "clear") score += 12;
  if (verdict.washing_machine_visibility === "partial") score += 7;
  score += Math.round(verdict.confidence * 20);
  return score;
}

export function selectEscalationIndexes(
  records: ClassificationRecordLike[],
  aggregate: ListingAggregate,
  options: EscalationSelectionOptions,
): number[] {
  if (options.maxImages <= 0) return [];

  const candidates = new Map<number, Candidate>();

  for (const record of records) {
    const verdict = record.verdict;
    if (!record.ok || !verdict || typeof record.listing_image_index !== "number") continue;

    const index = record.listing_image_index;
    const text = verdictText(verdict);
    const looksLikeConfuser = /\b(boiler|water heater|calef[oó]n|termotanque|wall[- ]mounted|above (?:a )?(?:counter|sink)|kitchen appliance|dishwasher|utility box)\b/.test(text);
    const mentionsLaundryEvidence = /\b(washer|washing machine|laundry|laundromat|laundry room|lavarropas|lavasecarropas|lavadero|lavander[ií]a|shared laundry)\b/.test(text);

    if (options.broadGate && aggregate.predictedLocation === "UNKNOWN") {
      addCandidate(candidates, index, evidenceCandidateScore(verdict, aggregate.predictedLocation), "broad_unknown_gate");
    }
    if (verdict.location_label === "CONFLICTING") {
      addCandidate(candidates, index, 100 + Math.round(verdict.confidence * 20), "conflicting_label");
    }
    if (verdict.contains_washing_machine) {
      addCandidate(candidates, index, evidenceCandidateScore(verdict, aggregate.predictedLocation), "washer_detected");
    }
    if (mentionsLaundryEvidence) {
      addCandidate(candidates, index, 45 + Math.round(verdict.confidence * 20), "laundry_text_or_rationale");
    }
    if (looksLikeConfuser) {
      addCandidate(candidates, index, 130 + Math.round(verdict.confidence * 10), "confuser_risk");
    }
    if (verdict.location_label === "IN_UNIT" && verdict.confidence < 0.98) {
      addCandidate(candidates, index, 70 + Math.round((1 - verdict.confidence) * 20), "in_unit_below_very_high_confidence");
    }
    if (verdict.location_label === "IN_UNIT" && verdict.washing_machine_visibility !== "clear") {
      addCandidate(candidates, index, 120, "in_unit_weak_visibility");
    }
    if (verdict.location_label === "SHARED_BUILDING" && !isStrongEvidence({
      location_label: verdict.location_label,
      contains_washing_machine: verdict.contains_washing_machine,
      washing_machine_visibility: verdict.washing_machine_visibility,
      confidence: verdict.confidence,
      rationale: verdict.rationale,
    }, "SHARED_BUILDING")) {
      addCandidate(candidates, index, 65 + Math.round(verdict.confidence * 20), "shared_below_strong_threshold");
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, options.maxImages)
    .map((candidate) => candidate.index)
    .sort((a, b) => a - b);
}
