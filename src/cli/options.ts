import {
  DEFAULT_CACHE_DIR,
  DEFAULT_ESCALATION_MODEL,
  DEFAULT_EXTRACTION_CACHE,
  DEFAULT_MAX_IMAGES,
  DEFAULT_MODEL,
  DEFAULT_MODEL_CACHE,
} from "./args";
import { DEFAULT_CONCURRENCY } from "../lib/concurrency";
import type { ListingScanOptions } from "../core";
import { DEFAULT_MAX_ESCALATION_IMAGES } from "../listing/escalation";

export type CommonScanCliOptions = ListingScanOptions & {
  outPath?: string;
  jsonOutput: boolean;
};

export function defaultCommonScanOptions(): CommonScanCliOptions {
  return {
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    escalationModel: process.env.OPENAI_ESCALATION_MODEL || DEFAULT_ESCALATION_MODEL,
    maxImages: DEFAULT_MAX_IMAGES,
    maxEscalationImages: DEFAULT_MAX_ESCALATION_IMAGES,
    concurrency: DEFAULT_CONCURRENCY,
    cacheDir: DEFAULT_CACHE_DIR,
    modelCachePath: DEFAULT_MODEL_CACHE,
    extractionCachePath: DEFAULT_EXTRACTION_CACHE,
    useExtractionCache: true,
    useModelCache: true,
    refreshExtraction: false,
    refreshModelCache: false,
    shadowVerdictV2: true,
    stagedClassification: false,
    jsonOutput: false,
  };
}

export function parseCommonScanOption(
  target: CommonScanCliOptions,
  argv: string[],
  index: number,
): number | null {
  const arg = argv[index];
  const next = argv[index + 1];

  switch (arg) {
    case "--out":
      if (!next) throw new Error("--out requires a value.");
      target.outPath = next;
      return index + 1;
    case "--model":
      if (!next) throw new Error("--model requires a value.");
      target.model = next;
      return index + 1;
    case "--escalation-model":
      if (!next) throw new Error("--escalation-model requires a value.");
      target.escalationModel = next;
      return index + 1;
    case "--max-images": {
      if (!next) throw new Error("--max-images requires a value.");
      const maxImages = Number.parseInt(next, 10);
      if (!Number.isInteger(maxImages) || maxImages < 1) throw new Error("--max-images must be a positive integer.");
      target.maxImages = maxImages;
      return index + 1;
    }
    case "--max-escalation-images": {
      if (!next) throw new Error("--max-escalation-images requires a value.");
      const maxEscalationImages = Number.parseInt(next, 10);
      if (!Number.isInteger(maxEscalationImages) || maxEscalationImages < 0) {
        throw new Error("--max-escalation-images must be a non-negative integer.");
      }
      target.maxEscalationImages = maxEscalationImages;
      return index + 1;
    }
    case "--concurrency": {
      if (!next) throw new Error("--concurrency requires a value.");
      const concurrency = Number.parseInt(next, 10);
      if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("--concurrency must be a positive integer.");
      target.concurrency = concurrency;
      return index + 1;
    }
    case "--cache-dir":
      if (!next) throw new Error("--cache-dir requires a value.");
      target.cacheDir = next;
      return index + 1;
    case "--extraction-cache":
      if (!next) throw new Error("--extraction-cache requires a value.");
      target.extractionCachePath = next;
      return index + 1;
    case "--model-cache":
      if (!next) throw new Error("--model-cache requires a value.");
      target.modelCachePath = next;
      return index + 1;
    case "--refresh-extraction":
      target.refreshExtraction = true;
      return index;
    case "--refresh-model-cache":
      target.refreshModelCache = true;
      return index;
    case "--no-extraction-cache":
      target.useExtractionCache = false;
      return index;
    case "--no-model-cache":
      target.useModelCache = false;
      return index;
    case "--json":
      target.jsonOutput = true;
      return index;
    default:
      return null;
  }
}
