import {
  reconcileStudioCrdtPages,
  type StudioCrdtCompatibleElement,
  type StudioCrdtCompatiblePage,
} from "./studio-crdt-page-bridge";

import type { StudioCrdtStrokeRecord } from "./studio-crdt-document";

export interface StudioCrdtHistoryReconcileResult<TPage> {
  history: TPage[][];
  changed: boolean;
}

/**
 * Keeps collaborative operations out of another artist's undo path.
 *
 * Initial hydration has no local operation ownership yet, so the complete durable frontier is
 * carried into every existing snapshot. Later remote transactions carry only their exact changed
 * stroke IDs through history; untouched local strokes retain their own undo semantics. The current
 * snapshot is then reconciled with the complete frontier so it always renders the converged page.
 */
export function reconcileStudioCrdtHistory<
  TElement extends StudioCrdtCompatibleElement,
  TPage extends StudioCrdtCompatiblePage<TElement>,
>(
  history: TPage[][],
  currentIndex: number,
  records: readonly StudioCrdtStrokeRecord[],
  changedStrokeIds: ReadonlySet<string> | null
): StudioCrdtHistoryReconcileResult<TPage> {
  if (history.length === 0) return { history, changed: false };
  if (changedStrokeIds !== null && changedStrokeIds.size === 0) {
    return { history, changed: false };
  }

  const historicalRecords = changedStrokeIds === null
    ? records
    : records.filter((record) => changedStrokeIds.has(record.id));
  let nextHistory = history;
  let changed = false;

  const replaceSnapshot = (index: number, pages: TPage[]) => {
    if (!changed) nextHistory = [...history];
    nextHistory[index] = pages;
    changed = true;
  };

  for (let index = 0; index < history.length; index += 1) {
    const snapshot = nextHistory[index];
    if (!snapshot) continue;
    const reconciled = reconcileStudioCrdtPages(snapshot, historicalRecords);
    if (reconciled.changed) replaceSnapshot(index, reconciled.pages);
  }

  if (changedStrokeIds !== null) {
    const boundedCurrentIndex = Math.max(0, Math.min(currentIndex, history.length - 1));
    const currentSnapshot = nextHistory[boundedCurrentIndex];
    if (currentSnapshot) {
      const current = reconcileStudioCrdtPages(currentSnapshot, records);
      if (current.changed) replaceSnapshot(boundedCurrentIndex, current.pages);
    }
  }

  return { history: nextHistory, changed };
}
