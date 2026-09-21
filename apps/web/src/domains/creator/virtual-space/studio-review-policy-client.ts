import { reviewPolicyCommandSchema, reviewPolicyResponseSchema, studioEntityIdSchema, type ReviewPolicyCommand } from "@toonspectrum/studio-project-model";
import { api } from "@/infrastructure/api";

const path = (reviewId: string) => `/studio-project-graph/reviews/${encodeURIComponent(studioEntityIdSchema.parse(reviewId))}/policy`;
export async function getStudioReviewPolicy(reviewId: string) {
  return reviewPolicyResponseSchema.parse(await api.get<unknown>(path(reviewId)));
}
export async function applyStudioReviewPolicyCommand(command: ReviewPolicyCommand) {
  const input = reviewPolicyCommandSchema.parse(command);
  return reviewPolicyResponseSchema.parse(await api.post<unknown>(`${path(input.pin.reviewId)}/commands`, input));
}
