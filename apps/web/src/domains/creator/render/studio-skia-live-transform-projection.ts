import { studioLiveTransformDraftReceipt } from "../studio-live-transform-draft-store";

import type { DrawEl, El } from "../studio-element-model";
import type { StudioLiveTransformDraftSnapshot } from "../studio-live-transform-draft-store";

export interface StudioSkiaLiveTransformProjection {
  readonly elements: readonly El[];
  /** Stable across pointer frames; changes only when GPU source ownership changes. */
  readonly token: string;
}

function authoritativeDrawById(
  elements: readonly El[],
  id: string,
): DrawEl | null {
  const candidate = elements.find((element) => element.id === id);
  return candidate?.type === "draw" ? candidate : null;
}

function handoffHasAuthoritativeReceipt(
  elements: readonly El[],
  snapshot: StudioLiveTransformDraftSnapshot,
): boolean {
  return snapshot.entries.every(({ element: expected }) => {
    const current = authoritativeDrawById(elements, expected.id);
    return current !== null && (
      current === expected
      || studioLiveTransformDraftReceipt(current)
        === studioLiveTransformDraftReceipt(expected)
    );
  });
}

/**
 * Removes exact-draft sources from the retained GPU document without subscribing the viewport
 * React tree to every pointer frame. The isolated Konva draft node owns those pixels until the
 * transformed document revision has caught up, then the normal GPU source resumes before the
 * draft-store handoff is acknowledged.
 */
export function projectStudioSkiaLiveTransformElements(
  elements: readonly El[],
  snapshot: StudioLiveTransformDraftSnapshot | null,
  scope: string,
): StudioSkiaLiveTransformProjection {
  if (!snapshot || snapshot.scope !== scope) {
    return { elements, token: "base" };
  }
  if (snapshot.phase === "handoff" && handoffHasAuthoritativeReceipt(elements, snapshot)) {
    return { elements, token: "base" };
  }
  const hiddenIds = new Set(snapshot.entries.map(({ element }) => element.id));
  if (hiddenIds.size === 0) return { elements, token: "base" };
  return {
    token: `draft:${JSON.stringify([...hiddenIds])}`,
    elements: elements.map((element) =>
      hiddenIds.has(element.id) && !element.hidden
        ? { ...element, hidden: true }
        : element
    ),
  };
}
