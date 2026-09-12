export type StudioLiveAdjustmentStatus = { readonly state: "loading" | "ready" | "error"; readonly message?: string };
const statuses = new Map<string, StudioLiveAdjustmentStatus>();
const listeners = new Set<() => void>();
export const subscribeStudioLiveAdjustmentStatus = (listener: () => void) => {
  listeners.add(listener); return () => { listeners.delete(listener); };
};
export const readStudioLiveAdjustmentStatus = (id: string) => statuses.get(id);
export function publishStudioLiveAdjustmentStatus(id: string, status: StudioLiveAdjustmentStatus | undefined) {
  const previous = statuses.get(id);
  if (previous?.state === status?.state && previous?.message === status?.message) return;
  if (status) statuses.set(id, status); else statuses.delete(id);
  for (const listener of listeners) listener();
}
