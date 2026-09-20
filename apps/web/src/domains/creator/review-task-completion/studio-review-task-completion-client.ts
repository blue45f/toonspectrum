import { canonicalJson, studioReviewTaskCompletionContextSchema, studioReviewTaskCompletionInputSchema,
  type StudioReviewTaskCompletionContext, type StudioReviewTaskCompletionInput } from "@toonspectrum/studio-project-model";
import { api, isHttpError } from "@/infrastructure/api";
import type { StudioReviewProductionRequest } from "../review-production/studio-review-production-model";

export class StudioReviewTaskCompletionClientError extends Error {
  constructor(readonly reason: "unavailable" | "denied" | "conflict" | "invalid") { super(reason); }
}
export interface StudioReviewTaskCompletionRequest extends StudioReviewProductionRequest { readonly taskId: string }
function parse(raw: unknown, request: StudioReviewTaskCompletionRequest): StudioReviewTaskCompletionContext {
  const result = studioReviewTaskCompletionContextSchema.safeParse(raw);
  if (!result.success || result.data.workId !== request.subject.workId || result.data.taskId !== request.taskId
    || result.data.reference.commentId !== request.commentId || canonicalJson(result.data.reference.subject) !== canonicalJson(request.subject)) {
    throw new StudioReviewTaskCompletionClientError("invalid");
  }
  return result.data;
}
async function call(request: StudioReviewTaskCompletionRequest, signal: AbortSignal, input?: StudioReviewTaskCompletionInput) {
  const path = `/creator/works/${encodeURIComponent(request.subject.workId)}/production-tasks/${encodeURIComponent(request.taskId)}/review-completion`;
  try {
    const response = input ? await api.post(path, studioReviewTaskCompletionInputSchema.parse(input), { signal }) : await api.get(path, { signal });
    return parse(response, request);
  } catch (error) {
    if (isHttpError(error)) {
      if (error.response.status === 409) throw new StudioReviewTaskCompletionClientError("conflict");
      if (error.response.status === 401 || error.response.status === 403) throw new StudioReviewTaskCompletionClientError("denied");
      if (error.response.status >= 400 && error.response.status < 500) throw new StudioReviewTaskCompletionClientError("invalid");
    }
    throw error;
  }
}
export const readStudioReviewTaskCompletion = (request: StudioReviewTaskCompletionRequest, signal: AbortSignal) => call(request, signal);
export const completeStudioReviewTask = (request: StudioReviewTaskCompletionRequest, input: StudioReviewTaskCompletionInput, signal: AbortSignal) => call(request, signal, input);
