import { defaultListingScanOptions, type ListingScanOptions } from "../core";

export type CommonScanCliOptions = ListingScanOptions & {
  outPath?: string;
  jsonOutput: boolean;
};

export function defaultCommonScanOptions(): CommonScanCliOptions {
  return {
    ...defaultListingScanOptions(),
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
