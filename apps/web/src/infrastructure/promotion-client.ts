import { api } from "./api";
import { assertPromotionPage, isPromotionPost, promotionRecord } from "../../../../packages/core/src/promotion";

import type { PromotionDetail, PromotionInput, PromotionReport } from "../../../../packages/core/src/promotion";

const root = "/promotions";
const path = (id: string) => `${root}/posts/${encodeURIComponent(id)}`;
const options = { timeout: 20_000 };
export const promotionClient = {
  async list(params: Record<string, string>, signal?: AbortSignal) {
    const data = await api.get<unknown>(`${root}/posts`, { ...options, params, signal });
    assertPromotionPage(data); return data;
  },
  async detail(id: string, signal?: AbortSignal): Promise<PromotionDetail> {
    const data = await api.get<PromotionDetail>(path(id), { ...options, signal });
    if (!data || !isPromotionPost(data.post) || data.post.id !== id || !Array.isArray(data.comments)
      || typeof data.canManage !== "boolean" || typeof data.canModerate !== "boolean"
      || data.comments.some((comment) => typeof comment?.id !== "string" || typeof comment.text !== "string" || typeof comment.author?.id !== "string" || typeof comment.author.name !== "string")) throw new Error("게시물 응답을 확인하지 못했어요.");
    return data;
  },
  async create(input: PromotionInput): Promise<{ id: string }> {
    const data = await api.post<unknown>(`${root}/posts`, input, options);
    const id = promotionRecord(data).id;
    if (typeof id !== "string" || !id) throw new Error("등록 결과를 확인하지 못했어요. 중복 등록 전에 내 게시물 목록을 확인해 주세요.");
    return { id };
  },
  update: (id: string, input: PromotionInput, version: number) => api.patch(path(id), { ...input, version }, options),
  archive: (id: string, archived: boolean, version: number) => api.patch(`${path(id)}/archive`, { archived, version }, options),
  save: (id: string, saved: boolean) => api.post(`${path(id)}/bookmark`, { saved }, options),
  comment: (id: string, text: string) => api.post(`${path(id)}/comments`, { text }, options),
  deleteComment: (id: string, commentId: string) => api.delete(`${path(id)}/comments/${encodeURIComponent(commentId)}`, options),
  report: (id: string, reason: string) => api.post(`${path(id)}/reports`, { reason }, options),
  async reports(signal?: AbortSignal): Promise<PromotionReport[]> {
    const data = await api.get<PromotionReport[]>(`${root}/reports`, { ...options, signal });
    if (!Array.isArray(data) || data.some((row) => typeof row.postId !== "string" || typeof row.reason !== "string" || typeof row.title !== "string" || typeof row.hidden !== "boolean")) throw new Error("신고 목록 응답을 확인하지 못했어요.");
    return data;
  },
  moderate: (id: string, hidden: boolean) => api.patch(`${path(id)}/visibility`, { hidden }, options),
};
