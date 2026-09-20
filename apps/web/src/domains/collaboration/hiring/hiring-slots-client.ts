import { api } from "@/infrastructure/api";

import type { HiringSlot, HiringSlotTerms } from "../../../../../../packages/contracts/src/creator-hiring";

const path = (postId: string) => `/collaborations/hiring/posts/${encodeURIComponent(postId)}/slots`;
export const hiringSlotsClient = {
  list: (postId: string, signal?: AbortSignal) => api.get<HiringSlot[]>(path(postId), { signal }),
  save: (postId: string, slotId: string | null, terms: HiringSlotTerms, expectedRevision: number, expectedPostVersion: number) => slotId
    ? api.patch(`${path(postId)}/${encodeURIComponent(slotId)}`, { terms, expectedRevision, expectedPostVersion })
    : api.post(`${path(postId)}`, { terms, expectedRevision, expectedPostVersion }),
  state: (postId: string, slot: HiringSlot, state: "open" | "paused" | "cancelled") => api.patch(`${path(postId)}/${encodeURIComponent(slot.id)}/state`, { state, expectedRevision: slot.revision }),
};
