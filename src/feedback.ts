import { appendJsonl } from "./lib/jsonl";
import type { LocationLabel } from "./types";

export const DEFAULT_FEEDBACK_PATH = "fixtures/user-feedback.jsonl";

export type ListingFeedback = {
  type: "listing_feedback";
  created_at: string;
  listing_url: string;
  expected_location: LocationLabel;
  predicted_location?: string;
  source: string;
  note?: string;
  item?: unknown;
};

export async function appendListingFeedback(
  feedback: Omit<ListingFeedback, "type" | "created_at">,
  path = DEFAULT_FEEDBACK_PATH,
): Promise<void> {
  await appendJsonl(path, [{
    type: "listing_feedback",
    created_at: new Date().toISOString(),
    ...feedback,
  } satisfies ListingFeedback]);
}
