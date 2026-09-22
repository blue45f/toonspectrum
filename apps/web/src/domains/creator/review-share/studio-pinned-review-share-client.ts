import { z } from "zod";
import {
  pinnedShareAccessSchema,
  pinnedShareCreatedSchema,
  pinnedShareFeedbackInputSchema,
  pinnedShareFeedbackSchema,
  pinnedShareId,
  pinnedShareOwnerViewSchema,
  pinnedSharePublicListSchema,
  pinnedShareSourcesSchema,
  pinnedShareViewSchema,
  type PinnedShareAccess,
  type PinnedShareCreate,
  type PinnedShareFeedbackInput,
} from "@toonspectrum/studio-project-model/pinned-review-share";

import { api, apiPath } from "@/infrastructure/api";

const ownerListSchema = z.object({
  items: z.array(pinnedShareOwnerViewSchema).max(25),
  nextCursor: pinnedShareId.nullable(),
}).strict();

const base = (workId: string) => `/creator/works/${encodeURIComponent(workId)}/pinned-review-shares`;

export async function listPinnedReviewShares(workId: string, cursor?: string | null) {
  return ownerListSchema.parse(await api.get<unknown>(base(workId), { params: { cursor } }));
}

export async function listPinnedReviewShareSources(
  workId: string,
  subject: PinnedShareCreate["subject"],
  offset = 0,
) {
  return pinnedShareSourcesSchema.parse(await api.post<unknown>(`${base(workId)}/sources`, { subject, offset }));
}

export async function createPinnedReviewShare(workId: string, input: PinnedShareCreate) {
  return pinnedShareCreatedSchema.parse(await api.post<unknown>(base(workId), input));
}

export async function revokePinnedReviewShare(workId: string, shareId: string) {
  return pinnedShareOwnerViewSchema.parse(
    await api.post<unknown>(`${base(workId)}/${encodeURIComponent(shareId)}/revoke`, {}),
  );
}

export async function viewPinnedReviewShare(access: PinnedShareAccess) {
  return pinnedShareViewSchema.parse(
    await api.post<unknown>("/creator/pinned-review-shares/view", {
      access: pinnedShareAccessSchema.parse(access),
    }),
  );
}

export async function loadPinnedReviewSharePage(
  access: PinnedShareAccess,
  ordinal: number,
  signal?: AbortSignal,
) {
  const response = await api.raw.post(apiPath("/creator/pinned-review-shares/page"), {
    json: { access: pinnedShareAccessSchema.parse(access), ordinal },
    signal,
    cache: "no-store",
    credentials: "include",
    retry: 0,
    timeout: false,
  });
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (!mediaType || !["image/png", "image/jpeg", "image/webp"].includes(mediaType)) {
    throw new Error("공유 페이지 이미지 형식을 확인하지 못했어요.");
  }
  const blob = await response.blob();
  if (blob.size <= 0 || blob.size > 32 * 1024 * 1024) {
    throw new Error("공유 페이지 이미지 크기가 올바르지 않아요.");
  }
  return blob;
}

export async function submitPinnedReviewShareFeedback(
  access: PinnedShareAccess,
  feedback: PinnedShareFeedbackInput,
) {
  return pinnedShareFeedbackSchema.parse(
    await api.post<unknown>("/creator/pinned-review-shares/feedback", {
      access: pinnedShareAccessSchema.parse(access),
      feedback: pinnedShareFeedbackInputSchema.parse(feedback),
    }),
  );
}

export async function listPinnedReviewShowcase(cursor?: string | null) {
  return pinnedSharePublicListSchema.parse(
    await api.get<unknown>("/creator/pinned-review-shares/showcase", { params: { cursor } }),
  );
}
