import { api } from "@/infrastructure/api";

import type { HiringApplicationSnapshot, HiringResume, HiringResumeInput, HiringResumeVersion, HiringSubmissionInput } from "../../../../../../packages/contracts/src/creator-hiring";

const root = "/collaborations/hiring";
const options = { timeout: 20_000 };
export const hiringClient = {
  resumes: (signal?: AbortSignal) => api.get<HiringResume[]>(`${root}/resumes`, { ...options, signal }),
  versions: (id: string, signal?: AbortSignal) => api.get<HiringResumeVersion[]>(`${root}/resumes/${encodeURIComponent(id)}/versions`, { ...options, signal }),
  save: (id: string | null, input: HiringResumeInput) => id
    ? api.patch<{ id: string; versionId: string; revision: number }>(`${root}/resumes/${encodeURIComponent(id)}`, input, options)
    : api.post<{ id: string; versionId: string; revision: number }>(`${root}/resumes`, input, options),
  remove: (id: string, revision: number) => api.delete(`${root}/resumes/${encodeURIComponent(id)}?revision=${revision}`, options),
  submit: (postId: string, input: HiringSubmissionInput) => api.post<{ applicationId: string; snapshotId: string }>(`${root}/posts/${encodeURIComponent(postId)}/submit`, input, options),
  snapshots: (postId: string, applicationId: string, signal?: AbortSignal) => api.get<HiringApplicationSnapshot[]>(`${root}/posts/${encodeURIComponent(postId)}/applications/${encodeURIComponent(applicationId)}/snapshots`, { ...options, signal }),
};
