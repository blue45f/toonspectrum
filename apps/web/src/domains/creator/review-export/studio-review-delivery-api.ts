import { reviewDeliveryAcceptSchema, reviewDeliveryActionSchema, reviewDeliveryJobSchema,
  reviewDeliveryListSchema, reviewDeliveryPrepareSchema, type ReviewDeliveryAccept,
  type ReviewDeliveryAction, type ReviewDeliveryPrepare } from "@toonspectrum/studio-project-model/review-delivery";
import { api, apiPath } from "@/platform/api";

const base = (workId: string) => `/creator/works/${encodeURIComponent(workId)}/review-deliveries`;
export async function listStudioReviewDeliveries(workId: string) {
  return reviewDeliveryListSchema.parse(await api.get<unknown>(base(workId)));
}
export async function prepareStudioReviewDelivery(workId: string, input: ReviewDeliveryPrepare) {
  const body = reviewDeliveryPrepareSchema.parse(input);
  return reviewDeliveryJobSchema.parse(await api.post<unknown>(base(workId), body));
}
async function action(workId: string, deliveryId: string, suffix: string, input: ReviewDeliveryAction) {
  const body = reviewDeliveryActionSchema.parse(input);
  return reviewDeliveryJobSchema.parse(await api.post<unknown>(`${base(workId)}/${encodeURIComponent(deliveryId)}/${suffix}`, body));
}
export const issueStudioReviewDelivery = (workId: string, id: string, input: ReviewDeliveryAction) => action(workId, id, "issue", input);
export const cancelStudioReviewDelivery = (workId: string, id: string, input: ReviewDeliveryAction) => action(workId, id, "cancel", input);
export async function acceptStudioReviewDelivery(workId: string, id: string, input: ReviewDeliveryAccept) {
  const body = reviewDeliveryAcceptSchema.parse(input);
  return reviewDeliveryJobSchema.parse(await api.post<unknown>(`${base(workId)}/${encodeURIComponent(id)}/accept`, body));
}
export async function downloadStudioReviewDelivery(workId: string, id: string, input: ReviewDeliveryAction, signal?: AbortSignal) {
  const response = await api.raw.post(apiPath(`${base(workId)}/${encodeURIComponent(id)}/download`), {
    json: reviewDeliveryActionSchema.parse(input), signal, cache: "no-store", credentials: "include", retry: 0, timeout: false,
  });
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/zip") throw new Error("전달 ZIP 응답을 확인하지 못했어요.");
  const blob = await response.blob();
  if (blob.size <= 0 || blob.size > 160 * 1024 * 1024) throw new Error("전달 ZIP 크기가 올바르지 않아요.");
  return blob;
}
