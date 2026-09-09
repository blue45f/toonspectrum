/**
 * Session-only state for professional View inspection tools.
 *
 * These switches intentionally do not enter the document, collaboration payload,
 * autosave or Neon persistence. They only change how the current browser session
 * observes the canvas, so opening the same work elsewhere keeps its authored pixels
 * and editor state untouched.
 */

export interface StudioViewInspectionSnapshot {
  readonly panelOpen: boolean;
  readonly pixelPreviewEnabled: boolean;
  readonly performanceHudEnabled: boolean;
}

const INITIAL_STUDIO_VIEW_INSPECTION_SNAPSHOT: StudioViewInspectionSnapshot =
  Object.freeze({
    panelOpen: false,
    pixelPreviewEnabled: false,
    performanceHudEnabled: false,
  });

let snapshot = INITIAL_STUDIO_VIEW_INSPECTION_SNAPSHOT;
const listeners = new Set<() => void>();

export function getStudioViewInspectionSnapshot(): StudioViewInspectionSnapshot {
  return snapshot;
}

export function subscribeStudioViewInspection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function patchStudioViewInspectionSnapshot(
  patch: Partial<StudioViewInspectionSnapshot>
): void {
  const next = Object.freeze({ ...snapshot, ...patch });
  if (
    next.panelOpen === snapshot.panelOpen &&
    next.pixelPreviewEnabled === snapshot.pixelPreviewEnabled &&
    next.performanceHudEnabled === snapshot.performanceHudEnabled
  ) {
    return;
  }

  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

export function openStudioViewInspectionPanel(): void {
  patchStudioViewInspectionSnapshot({ panelOpen: true });
}

export function closeStudioViewInspectionPanel(): void {
  patchStudioViewInspectionSnapshot({ panelOpen: false });
}

export function toggleStudioPixelPreview(): void {
  patchStudioViewInspectionSnapshot({
    pixelPreviewEnabled: !snapshot.pixelPreviewEnabled,
  });
}

export function toggleStudioPerformanceHud(): void {
  patchStudioViewInspectionSnapshot({
    performanceHudEnabled: !snapshot.performanceHudEnabled,
  });
}

/** Test-only deterministic reset. Runtime callers should use the explicit actions. */
export function resetStudioViewInspectionStateForTests(): void {
  const changed = snapshot !== INITIAL_STUDIO_VIEW_INSPECTION_SNAPSHOT;
  snapshot = INITIAL_STUDIO_VIEW_INSPECTION_SNAPSHOT;
  if (!changed) return;

  for (const listener of listeners) {
    listener();
  }
}
