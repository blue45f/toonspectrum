import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  describeStudioEditableRasterSelectionSurface,
  planStudioEditableRasterCopy,
} from "./studio-raster-edit-preparation";

import type { El } from "./studio-element-model";

const pageUrl = new URL("./StudioPage.tsx", import.meta.url);
const source = readFileSync(pageUrl, "utf8");
const file = ts.createSourceFile(
  pageUrl.pathname,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function nestedFunction(name: string): string {
  let match: ts.FunctionDeclaration | null = null;
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!match) throw new Error(`Missing nested function ${name}`);
  return (match as ts.FunctionDeclaration).getText(file);
}

describe("Studio pixel marquee vector-only raster preparation boundary", () => {
  it("plans a deterministic editable raster surface for a selectable line-only page", () => {
    const line: Extract<El, { type: "draw" }> = {
      id: "line-only",
      type: "draw",
      kind: "freehand",
      points: [12, 20, 90, 96, 180, 104],
      stroke: "#111111",
      strokeWidth: 5,
      brush: "gpen",
    };
    const result = planStudioEditableRasterCopy({
      pageId: "page-line-only",
      width: 320,
      height: 480,
      elements: [line],
      includeBackground: true,
      sourceDisposition: "hide-originals",
      sourceDispositionIds: [line.id],
    });

    expect(result).toMatchObject({
      ok: true,
      plan: {
        sourceIds: ["line-only"],
        sourceDispositionIds: ["line-only"],
        frame: { x: 0, y: 0, width: 320, height: 480, rotation: 0 },
        sourceSummary: {
          visibleVectorDrawCount: 1,
          exactRenderableVisibleCount: 1,
          unsupportedVisibleCount: 0,
        },
      },
    });
    if (!result.ok) return;
    for (const toolKind of [
      "rect",
      "ellipse",
      "lasso",
      "poly-lasso",
      "brush",
      "wand",
      "color-range",
    ] as const) {
      expect(describeStudioEditableRasterSelectionSurface(result.plan, toolKind)).toMatchObject({
        toolKind,
        frame: { x: 0, y: 0, width: 320, height: 480, rotation: 0 },
        sourceFingerprint: result.plan.sourceFingerprint,
      });
    }
  });

  it("reuses the shared editable-raster plan/render/apply seam and commits once", () => {
    const toggle = nestedFunction("togglePixelMarquee");
    const activate = nestedFunction("activatePixelSelectionToolFromInspector");
    const prepare = nestedFunction("preparePixelMarqueeRasterTarget");

    expect(toggle).toContain("activatePixelSelectionToolFromInspector(kind)");
    expect(activate).toContain("preparePixelMarqueeRasterTarget(kind)");
    expect(prepare).toContain('import("./studio-raster-edit-preparation")');
    expect(prepare).toContain("planStudioEditableRasterCopy(");
    expect(prepare).toContain("renderStudioEditableRasterCopy(");
    expect(prepare).toContain("renderStudioVectorReference");
    // applyStudioEditableRasterCopy owns the one synchronous current-plan check. Repeating it in
    // this caller would recalculate the canonical fingerprint with no async gap between checks.
    expect(prepare).not.toContain("isStudioEditableRasterCopyPlanCurrent(");
    expect(prepare).toContain("materializeStudioEditableRasterCopy(");
    expect(prepare).toContain("applyStudioEditableRasterCopy(");
    expect(prepare.match(/\bcommit\(/gu)).toHaveLength(1);
    expect(prepare).toContain("flushSync(() => {");
    expect(prepare).toContain("setSelectedId(composite.id)");
    expect(prepare).toContain("applyPixelSelectionActivation(kind)");
  });

  it("fails closed before rendering when no visible vector or document mutation is unsafe", () => {
    const prepare = nestedFunction("preparePixelMarqueeRasterTarget");

    expect(prepare).toContain("prepareStudioDocumentReplacement");
    expect(prepare).toContain("flushPending: true");
    expect(prepare).not.toContain("summarizeStudioRasterPreparationSources");
    expect(prepare).toContain("planStudioEditableRasterCopy");
    expect(prepare).toContain("documentMutationBlockedReason");
    expect(prepare).toContain("pagesHiRef.current !== historyIndex");
    expect(prepare).toContain("currentPageIdRef.current !== pageId");
    expect(prepare).toContain("canApplyStudioMutation(mutationTicket)");
    expect(prepare).toContain("controller.signal.aborted");
  });

  it("journals and replays a quick first pointer without losing its selection geometry", () => {
    const journal = nestedFunction("journalPendingPixelSelectionRasterGesture");
    const finish = nestedFunction("finishPendingPixelSelectionRasterGesture");
    const nodeInteractionBegin = nestedFunction("nodeInteractionBegin");
    const stageDown = nestedFunction("onStageDown");
    const prepare = nestedFunction("preparePixelMarqueeRasterTarget");

    expect(journal).toContain("pendingPixelSelectionRasterGestureRef.current");
    expect(journal).toContain("setPointerCapture(pointerId)");
    expect(journal).toContain("resolveSelectionCombineOverride(");
    expect(finish).toContain("stage.setPointersPositions(pointerEvent)");
    expect(finish).toContain("pending.released = true");
    expect(finish).toContain("pending.cancelled = cancelled");
    expect(prepare).toContain("beginSelectionDrag(");
    expect(prepare).toContain("updateSelectionDrag(");
    expect(prepare).toMatch(
      /commitSelectionDrag\(\s*selectionOperationBase\(pixelSelRef\.current, pending\.combine\),\s*drag,\s*\)/u,
    );
    expect(prepare).not.toContain("commitSelectionDrag(null, drag)");
    expect(prepare).toContain('pending.tool === "poly-lasso"');
    expect(prepare).toContain('pending.tool === "wand"');
    expect(prepare).toContain("pixelDragRef.current =");
    expect(prepare).toContain("pixelMarqueeRasterPreparationActivationRef.current = preparationTool");
    expect(stageDown).toContain("pixelMarqueeRasterPreparationActivationRef.current");
    expect(stageDown.indexOf("pixelMarqueeRasterPreparationActivationRef.current"))
      .toBeLessThan(stageDown.indexOf("pixelToolGestureArmed"));
    expect(stageDown).toContain("forceCircle: pendingSelectionPreparation.forceCircle");
    expect(nodeInteractionBegin).toContain(
      "pixelMarqueeRasterPreparationActivationRef.current",
    );
    expect(nodeInteractionBegin.indexOf("pixelMarqueeRasterPreparationActivationRef.current"))
      .toBeLessThan(nodeInteractionBegin.indexOf("canvasInteractionUnitIds(elementId)"));
  });

  it("aborts a stale preparation and releases its pointer journal on tool ownership change", () => {
    const disarm = nestedFunction("disarmAllPixelTools");

    expect(disarm).toContain("clearPendingPixelSelectionRasterGesture()");
    expect(disarm).toContain("pixelMarqueeRasterPreparationRunIdRef.current += 1");
    expect(disarm).toContain("pixelMarqueeRasterPreparationAbortRef.current?.abort()");
    expect(disarm).toContain("pixelMarqueeRasterPreparationAbortRef.current = null");
  });

  it("keeps the auto-created image owner and a completed first selection through rerender", () => {
    expect(source).toContain("pixelSelectionAutoTargetRef.current ?? selectedImageElementId");
    expect(source).toContain("const keepAutoTargetGesture =");
    expect(source).toContain("bindPixelSelectionHistory(");
    expect(source).toContain("history.present?.selection ?? pixelSelRef.current");
  });
});
