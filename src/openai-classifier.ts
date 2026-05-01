import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { withGlobalModelCallSlot } from "./lib/concurrency";
import { logger } from "./lib/logger";
import {
  CLASSIFICATION_PROMPT_VERSION,
  CLASSIFICATION_SCHEMA_VERSION,
  readCachedModelResult,
  writeCachedModelResult,
} from "./model-result-cache";
import type { Args, ImagePayload, ShadowVerdictV2, Verdict } from "./types";
import { VerdictSchema } from "./types";
import { buildShadowVerdictV2 } from "./verdict-v2";

export type ModelRunOptions = {
  modelCachePath?: string;
  useModelCache?: boolean;
  refreshModelCache?: boolean;
  shadowVerdictV2?: boolean;
  timeoutMs?: number;
  promptContextKey?: string;
  promptContext?: string;
};

export function modelRunOptionsFromArgs(args: Pick<Args,
  "modelCachePath" | "useModelCache" | "refreshModelCache" | "shadowVerdictV2"
> & { modelCallTimeoutMs?: number }): ModelRunOptions {
  return {
    modelCachePath: args.modelCachePath,
    useModelCache: args.useModelCache,
    refreshModelCache: args.refreshModelCache,
    shadowVerdictV2: args.shadowVerdictV2,
    timeoutMs: args.modelCallTimeoutMs,
  };
}

function classificationPrompt(): string {
  return `You are classifying apartment listing photos for a renter who wants a washing machine inside the private apartment unit.

Return JSON only. Decide whether the image contains a washing machine, then classify the likely location:

- IN_UNIT: the machine appears inside the private apartment unit, such as a kitchen, bathroom, closet, utility nook, balcony, or private laundry area attached to the apartment.
- SHARED_BUILDING: the machine appears in a shared/public building laundry space, such as a laundry room with multiple machines, commercial machines, shared signage, folding tables, coin/card equipment, public corridors, or other multi-unit building cues.
- UNKNOWN: no washing machine is visible, or the image lacks enough context to infer the location.
- CONFLICTING: a washing machine is visible, but there are meaningful signals for both in-unit and shared-building placement.

Important: contains_washing_machine means any washing machine is visible in the image, including machines in a shared building laundry room. Do not set contains_washing_machine to false just because the washer is not private/in-unit.

If a shared laundry room or amenity laundry area shows laundry machines, set contains_washing_machine true and location_label SHARED_BUILDING. Shared-building cues include multiple machines, stacked machines, numbered machines, payment or control panels, posted instructions or wall signs, folding tables, utility sinks in a public room, amenity-room context, and service-room layouts.

Do not count wall-mounted boilers, water heaters, calefones, termotanques, dishwashers, refrigerators, sinks, dryer-only machines, laundry baskets, or utility boxes as washing machines. A washing machine should show washer-specific cues like a round front-loading door or drum, top-loading lid, detergent drawer, washer control panel, or laundry appliance body at floor/counter height. A white wall-mounted appliance above a counter or sink is usually a boiler/water heater, not a washer.

Be conservative about IN_UNIT. If a photo only shows a washer close-up with no room context, use UNKNOWN unless there are clear private-unit or shared-laundry signals. Keep confidence between 0 and 1.`;
}

function contextualClassificationPrompt(options: ModelRunOptions): string {
  if (!options.promptContext) return classificationPrompt();
  return `${classificationPrompt()}

Context: ${options.promptContext}

Use the context only to inspect the image more carefully. Do not report a washing machine unless washer-specific visual evidence is visible in this image.`;
}

function readRateLimitHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(
    Array.from(response.headers.entries()).filter(([name]) => name.startsWith("x-ratelimit-")),
  );
}

export async function classifyWithModel(
  client: OpenAI,
  model: string,
  image: ImagePayload,
  detail: Args["detail"],
  options: ModelRunOptions = {},
): Promise<{
  model: string;
  verdict: Verdict;
  shadow_verdict_v2?: ShadowVerdictV2;
  usage?: unknown;
  rate_limits?: Record<string, string>;
  latency_ms: number;
  cache_hit?: boolean;
}> {
  const startedAt = performance.now();
  const cacheInput = {
    model,
    detail,
    imageSha256: image.sha256,
    promptVersion: CLASSIFICATION_PROMPT_VERSION,
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
    promptContextKey: options.promptContextKey,
  };
  if (options.useModelCache && options.modelCachePath && !options.refreshModelCache) {
    const cached = await readCachedModelResult(options.modelCachePath, cacheInput);
    if (cached) {
      logger.info({
        event: "model_result_cache_hit",
        model,
        imageSource: image.source,
        imageSha256: image.sha256,
        latencyMs: Math.round(performance.now() - startedAt),
      });
      return {
        model,
        verdict: cached.verdict,
        shadow_verdict_v2: cached.shadow_verdict_v2,
        usage: cached.usage,
        latency_ms: 0,
        cache_hit: true,
      };
    }
  }

  let data: {
    output_parsed: Verdict | null;
    usage?: { total_tokens?: number } | null;
  } | undefined;
  let response: Response | undefined;
  const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : undefined;
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeout = timeoutMs
    ? setTimeout(() => controller?.abort(`Model call exceeded ${timeoutMs}ms timeout.`), timeoutMs)
    : undefined;
  try {
    const result = await withGlobalModelCallSlot(() =>
      client.responses.parse({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: contextualClassificationPrompt(options) },
              {
                type: "input_image",
                image_url: image.dataUrl,
                detail,
              },
            ],
          },
        ],
        text: {
          format: zodTextFormat(VerdictSchema, "washing_machine_location_verdict"),
        },
      }, controller ? { signal: controller.signal } : undefined).withResponse(),
    );
    data = result.data;
    response = result.response;
  } catch (error) {
    logger.warn({
      event: "model_call_failed",
      model,
      imageSource: image.source,
      latencyMs: Math.round(performance.now() - startedAt),
      status: typeof error === "object" && error !== null && "status" in error ? (error as { status?: unknown }).status : undefined,
      code: typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  const latency_ms = Math.round(performance.now() - startedAt);
  const verdict = data.output_parsed;
  if (!verdict) {
    throw new Error(`Model ${model} returned no parsed verdict.`);
  }
  const shadow_verdict_v2 = options.shadowVerdictV2 ? buildShadowVerdictV2(verdict) : undefined;

  const rate_limits = readRateLimitHeaders(response);
  logger.info({
    event: "model_call_finished",
    model,
    imageSource: image.source,
    latencyMs: latency_ms,
    totalTokens: data.usage?.total_tokens,
    limitRequests: rate_limits["x-ratelimit-limit-requests"],
    limitTokens: rate_limits["x-ratelimit-limit-tokens"],
    remainingRequests: rate_limits["x-ratelimit-remaining-requests"],
    remainingTokens: rate_limits["x-ratelimit-remaining-tokens"],
    resetRequests: rate_limits["x-ratelimit-reset-requests"],
    resetTokens: rate_limits["x-ratelimit-reset-tokens"],
  });

  const result = {
    model,
    verdict,
    shadow_verdict_v2,
    usage: data.usage,
    rate_limits,
    latency_ms,
    cache_hit: false,
  };

  if (options.useModelCache && options.modelCachePath) {
    await writeCachedModelResult(options.modelCachePath, cacheInput, {
      verdict,
      shadow_verdict_v2,
      usage: data.usage,
      latency_ms,
    });
  }

  return result;
}
