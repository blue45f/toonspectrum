import { api } from "./api";

import type {
  CollaborationApplication, CollaborationApplicationInput, CollaborationDetail, CollaborationInput,
  CollaborationList, CollaborationReport,
} from "../../../../packages/core/src/collaboration";

const root = "/collaborations";
const path = (id: string) => `${root}/posts/${encodeURIComponent(id)}`;
const options = { timeout: 20_000 };
export const collaborationClient = {
  async list(params: Record<string, string>, signal?: AbortSignal): Promise<CollaborationList> {
    const data = await api.get<CollaborationList>(`${root}/posts`, { ...options, params, signal });
    if (!data || !Array.isArray(data.items) || typeof data.hasMore !== "boolean") throw new Error("목록 응답을 확인하지 못했어요. 다시 불러와 주세요.");
    return data;
  },
  async detail(id: string, signal?: AbortSignal): Promise<CollaborationDetail> {
    const data = await api.get<CollaborationDetail>(path(id), { ...options, signal });
    if (!data?.post?.id || !data.post.details || typeof data.canManage !== "boolean") throw new Error("공고 응답을 확인하지 못했어요.");
    return data;
  },
  create: (input: CollaborationInput) => api.post<{ id: string }>(`${root}/posts`, input, options),
  update: (id: string, input: CollaborationInput, version: number) => api.patch(path(id), { ...input, version }, options),
  status: (id: string, status: string, version: number) => api.patch(`${path(id)}/status`, { status, version }, options),
  remove: (id: string) => api.delete(path(id), options),
  save: (id: string, saved: boolean) => api.post(`${path(id)}/bookmark`, { saved }, options),
  apply: (id: string, input: CollaborationApplicationInput) => api.post(`${path(id)}/applications`, input, options),
  applications: (id: string, signal?: AbortSignal) => api.get<CollaborationApplication[]>(`${path(id)}/applications`, { ...options, signal }),
  applicationStatus: (id: string, applicationId: string, status: string) => api.patch(`${path(id)}/applications/${encodeURIComponent(applicationId)}`, { status }, options),
  withdraw: (id: string) => api.delete(`${path(id)}/applications/me`, options),
  report: (id: string, reason: string) => api.post(`${path(id)}/reports`, { reason }, options),
  reports: (signal?: AbortSignal) => api.get<CollaborationReport[]>(`${root}/reports`, { ...options, signal }),
  moderate: (id: string, hidden: boolean) => api.patch(`${path(id)}/visibility`, { hidden }, options),
};
