import { useCallback, useEffect, useState } from "react";

import {
  getProductionCalendarEvents,
  getProductionPersonalInbox,
  getProductionProjectByWork,
  type ProductionCalendarIntegrationEvent,
  type ProductionPersonalInboxItem,
  type ProductionProjectRecord,
} from "../production-hub/production-api";

export interface StudioVirtualOperationsSnapshot {
  readonly phase: "idle" | "loading" | "ready" | "unavailable";
  readonly project: ProductionProjectRecord | null;
  readonly inbox: readonly ProductionPersonalInboxItem[];
  readonly calendar: readonly ProductionCalendarIntegrationEvent[];
  readonly error: string | null;
}

const EMPTY: StudioVirtualOperationsSnapshot = Object.freeze({
  phase: "idle", project: null, inbox: [], calendar: [], error: null,
});

/** Project production context is read-only here. Spatial actions still require explicit tool entry. */
export function useStudioVirtualSpaceOperations(workId: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<StudioVirtualOperationsSnapshot>(EMPTY);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !workId) { setSnapshot(EMPTY); return; }
    setSnapshot((current) => ({ ...current, phase: "loading", error: null }));
    try {
      const [project, inbox] = await Promise.all([
        getProductionProjectByWork(workId),
        getProductionPersonalInbox().catch(() => ({ items: [], counts: { dueToday: 0, inProgress: 0, review: 0, ready: 0, waitingInput: 0, blockingOthers: 0 } })),
      ]);
      if (signal?.aborted) return;
      const calendar = await getProductionCalendarEvents(project.aggregate.projectId).catch(() => ({ events: [] }));
      if (signal?.aborted) return;
      setSnapshot({
        phase: "ready",
        project,
        inbox: inbox.items.filter((item) => item.projectId === project.aggregate.projectId || item.projectId === workId),
        calendar: calendar.events,
        error: null,
      });
    } catch (error) {
      if (signal?.aborted) return;
      setSnapshot({ ...EMPTY, phase: "unavailable", error: error instanceof Error ? error.message : "production-context-unavailable" });
    }
  }, [enabled, workId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  return { snapshot, refresh: () => load() };
}
