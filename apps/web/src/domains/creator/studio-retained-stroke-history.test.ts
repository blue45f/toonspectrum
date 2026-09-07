import { describe, expect, it, vi } from "vitest";

import { StudioCrdtDocument } from "./live/studio-crdt-document";
import { publishStudioCrdtDrawGraphDiff } from "./live/studio-crdt-scene-publisher";
import { publishStudioRetainedStrokeHistory } from "./studio-retained-stroke-history";

import type { DrawEl } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

const eraser: DrawEl = {
  id: "eraser", type: "draw", mode: "eraser", kind: "freehand", brush: "standard-eraser",
  points: [10, 10, 50, 50], pressures: [0.5, 0.5], stroke: "#000000", strokeWidth: 20,
};
const blank: PageState[] = [{ id: "page", elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1080 }];
const pending = { pageId: "page", strokes: [eraser] };

describe("retained stroke history", () => {
  it("tombstones deferred live ink on Undo, restores it on Redo, and keeps it deleted on a new edit", () => {
    const document = new StudioCrdtDocument();
    const livePages = [{ ...blank[0]!, elements: [eraser] }];
    publishStudioCrdtDrawGraphDiff(document, blank, livePages);
    const publish = (before: readonly PageState[], after: readonly PageState[]) => {
      publishStudioCrdtDrawGraphDiff(document, before, after, { registerNewDraws: false });
      return true;
    };
    expect(publishStudioRetainedStrokeHistory(blank, pending, "undo", publish)).toBe(true);
    expect(document.getStroke("eraser", true)?.deleted).toBe(true);
    expect(publishStudioRetainedStrokeHistory(blank, pending, "redo", publish)).toBe(true);
    expect(document.getStroke("eraser", true)?.deleted).toBe(false);
    expect(publishStudioRetainedStrokeHistory(blank, pending, "undo", publish)).toBe(true);
    const next = { ...eraser, id: "next", mode: "pen" as const, brush: "pen" as const };
    publishStudioCrdtDrawGraphDiff(document, blank, [{ ...blank[0]!, elements: [next] }]);
    expect(document.getStrokes().map(stroke => stroke.id)).toEqual(["next"]);
    expect(blank[0]!.elements).toEqual([]);
    expect(pending.strokes).toEqual([eraser]);
    document.destroy();
  });

  it("preserves the pending batch when its page or publication is unavailable", () => {
    const publish = vi.fn(() => false);
    expect(publishStudioRetainedStrokeHistory([], pending, "undo", publish)).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(publishStudioRetainedStrokeHistory(blank, pending, "undo", publish)).toBe(false);
    expect(pending.strokes).toEqual([eraser]);
  });
});
