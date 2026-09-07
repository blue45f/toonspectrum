import { projectStudioPendingStrokes, type StudioPendingStrokeBatch } from "./studio-pending-stroke-durability";

import type { DrawEl } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

/** Retained ink is already published to CRDT even while it is outside page-snapshot history. */
export function publishStudioRetainedStrokeHistory(
  pages: readonly PageState[],
  batch: StudioPendingStrokeBatch<DrawEl>,
  direction: "undo" | "redo",
  publish: (before: readonly PageState[], after: readonly PageState[]) => boolean,
): boolean {
  const projected = projectStudioPendingStrokes(pages, batch);
  if (projected.status !== "projected") return false;
  return direction === "undo"
    ? publish(projected.pagesList, pages)
    : publish(pages, projected.pagesList);
}
