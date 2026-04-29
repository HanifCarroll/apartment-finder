import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { withGlobalModelCallSlot } from "./lib/concurrency";
import { logger } from "./lib/logger";
import type { Args, ImagePayload, Verdict } from "./types";
import { VerdictSchema } from "./types";

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
): Promise<{
  model: string;
  verdict: Verdict;
  usage?: unknown;
  rate_limits?: Record<string, string>;
  latency_ms: number;
}> {
  const startedAt = performance.now();
  const { data, response } = await withGlobalModelCallSlot(() =>
    client.responses.parse({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: classificationPrompt() },
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
    }).withResponse(),
  );

  const latency_ms = Math.round(performance.now() - startedAt);
  const verdict = data.output_parsed;
  if (!verdict) {
    throw new Error(`Model ${model} returned no parsed verdict.`);
  }

  const rate_limits = readRateLimitHeaders(response);
  logger.info({
    event: "model_call_finished",
    model,
    imageSource: image.source,
    latencyMs: latency_ms,
    totalTokens: data.usage?.total_tokens,
    remainingRequests: rate_limits["x-ratelimit-remaining-requests"],
    remainingTokens: rate_limits["x-ratelimit-remaining-tokens"],
  });

  return {
    model,
    verdict,
    usage: data.usage,
    rate_limits,
    latency_ms,
  };
}
