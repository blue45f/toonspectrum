import { api } from "@/infrastructure/api";

export interface AutomaticInvitationState {
  enabled: boolean;
  supported: boolean;
  job: null | {
    id: string; generation: number; termsRevision: number;
    status: "queued" | "processing" | "completed" | "failed" | "stopped" | "expired";
    attempts: number; nextExecutionAt: string; updatedAt: string;
  };
}
export interface AutomaticInvitationInput {
  mutationId: string; expectedRevision: number;
  expectedPostVersion: number; mode: "automatic";
}
const path = (postId: string, slotId: string) => `/collaborations/hiring/posts/${encodeURIComponent(postId)}/slots/${encodeURIComponent(slotId)}/campaign/automation`;
export const automaticInvitations = {
  read: (postId: string, slotId: string, signal?: AbortSignal) => api.get<AutomaticInvitationState>(path(postId, slotId), { signal, timeout: 10000, retry: 0 }),
  start: (postId: string, slotId: string, input: AutomaticInvitationInput, signal?: AbortSignal) => api.post<{ id: string }>(`${path(postId, slotId)}/start`, input, { signal, timeout: 10000, retry: 0 }),
  stop: (postId: string, slotId: string, signal?: AbortSignal) => api.post<{ ok: true }>(`${path(postId, slotId)}/stop`, {}, { signal, timeout: 10000, retry: 0 }),
};
