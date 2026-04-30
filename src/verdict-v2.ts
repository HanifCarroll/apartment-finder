import type { ShadowVerdictV2, Verdict } from "./types";

function verdictText(verdict: Verdict): string {
  return [
    verdict.rationale,
    ...verdict.visual_evidence,
    ...verdict.in_unit_signals,
    ...verdict.shared_space_signals,
  ].join(" ").toLowerCase();
}

export function buildShadowVerdictV2(verdict: Verdict): ShadowVerdictV2 {
  const washerVisible = verdict.contains_washing_machine && verdict.washing_machine_visibility !== "none";
  const text = verdictText(verdict);
  const confuserRisk = /\b(boiler|water heater|calef[oó]n|termotanque|dishwasher|utility box|refrigerator)\b/.test(text);
  const conflictRisk = verdict.location_label === "CONFLICTING" ||
    (verdict.in_unit_signals.length > 0 && verdict.shared_space_signals.length > 0);
  const evidenceStrength = !washerVisible
    ? "none"
    : verdict.confidence >= 0.9 && verdict.washing_machine_visibility === "clear" && !confuserRisk
      ? "strong"
      : verdict.confidence >= 0.75 && verdict.washing_machine_visibility !== "unsure"
        ? "medium"
        : "weak";

  return {
    schema_version: "image-verdict-v2-shadow",
    washer_visible: washerVisible,
    washer_visibility: verdict.washing_machine_visibility,
    likely_location: verdict.location_label,
    evidence_strength: evidenceStrength,
    in_unit_signal_count: verdict.in_unit_signals.length,
    shared_space_signal_count: verdict.shared_space_signals.length,
    visual_evidence_count: verdict.visual_evidence.length,
    confuser_risk: confuserRisk,
    conflict_risk: conflictRisk,
  };
}
