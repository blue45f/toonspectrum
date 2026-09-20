import { api } from "@/infrastructure/api";

import type { HiringAcceptance, HiringAvailability, HiringAvailabilityInput, HiringCandidatePage, HiringCandidateQuery, HiringOffer } from "../../../../../../packages/contracts/src/creator-hiring";

const root = "/collaborations/hiring";
const slotPath = (postId: string, slotId: string) => `${root}/posts/${encodeURIComponent(postId)}/slots/${encodeURIComponent(slotId)}`;
export const hiringMatchingClient = {
  availability: (signal?: AbortSignal) => api.get<HiringAvailability | null>(`${root}/availability/me`, { signal }),
  confirm: (input: HiringAvailabilityInput) => api.put<{ revision: number; confirmedAt: string; expiresAt: string }>(`${root}/availability/me`, input),
  discover: (postId: string, slotId: string, query: HiringCandidateQuery = {}, signal?: AbortSignal) => api.get<HiringCandidatePage>(`${slotPath(postId, slotId)}/candidates`, { params: { ...query }, signal, timeout: 10000, retry: 0 }),
  send: (postId: string, slotId: string, input: { candidateId: string; expectedRevision: number; expiresAt: string; mutationId: string }, signal?: AbortSignal) => api.post(`${slotPath(postId, slotId)}/offers`, input, { signal, timeout: 10000, retry: 0 }),
  offers: (signal?: AbortSignal) => api.get<HiringOffer[]>(`${root}/offers`, { signal }),
  accept: (id: string, mutationId: string) => api.post<HiringAcceptance>(`${root}/offers/${encodeURIComponent(id)}/accept`, { mutationId }),
  change: (id: string, action: "decline" | "cancel", mutationId: string) => api.patch(`${root}/offers/${encodeURIComponent(id)}`, { action, mutationId }),
};
