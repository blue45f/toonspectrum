import { describe, expect, it } from "vitest";

import { readStudioCuttoonEditorSource } from "./studio-cuttoon-editor/read-studio-cuttoon-editor-source";

const studioPageSource = readStudioCuttoonEditorSource();

function sourceBetween(startMarker: string, endMarker: string): string {
  const start = studioPageSource.indexOf(startMarker);
  const end = studioPageSource.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return studioPageSource.slice(start, end);
}

describe("Living Ink retained live-draft boundary", () => {
  it("keeps sparse ink strokes current until a material presentation receipt owns pixels", () => {
    const flush = sourceBetween(
      "const flushDirectLiveDraft =",
      "const flushDirectLiveDraftNow =",
    );
    const livingInkBranch = flush.indexOf("const livingInkStroke = livingInkStrokeRef.current;");
    const genericInkBranch = flush.indexOf("const hokusaiStroke = hokusaiLiveStrokeRef.current;");

    expect(livingInkBranch).toBeGreaterThanOrEqual(0);
    expect(livingInkBranch).toBeLessThan(genericInkBranch);
    expect(flush).toContain("!livingInkStroke.overlayPresented");
    expect(flush).toContain('livingInkStroke.mode === "ink"');
    expect(flush).toContain(
      "liveDraftVisualRef.current = studioLivingInkVectorShadowElement(next);",
    );
    expect(flush).toContain("liveDraftLayerRef.current?.drawScene();");
  });

  it("admits Living Ink at pointer-up even though it is not a generic direct ink preset", () => {
    const immediate = sourceBetween(
      "const flushDirectLiveDraftNow =",
      "const exitDirectLiveDraft =",
    );

    expect(immediate).toContain("const directLivingInk = liveDraftDirectRef.current");
    expect(immediate).toContain("livingInkStroke.strokeId === next.id");
    expect(immediate).toContain("!directLivingInk");
  });

  it("does not let predicted samples tear down the pinned Living Ink route", () => {
    const schedule = sourceBetween(
      "const scheduleDraft =",
      "const clearDraftPreview =",
    );
    const livingInkBranch = schedule.indexOf("const livingInkStroke = livingInkStrokeRef.current;");
    const genericDirectBranch = schedule.indexOf("if (next && liveDraftDirectRef.current)");

    expect(livingInkBranch).toBeGreaterThanOrEqual(0);
    expect(livingInkBranch).toBeLessThan(genericDirectBranch);
    expect(schedule).toContain("livingInkStroke.strokeId === next.id");
    expect(schedule).toContain("flushDirectLiveDraft();");
  });

  it("keeps automatic canonical materialization in drawing chrome", () => {
    const finish = sourceBetween(
      "async function finishStudioLivingInkStroke(",
      "async function finishStudioHokusaiLiveStroke(",
    );

    expect(finish).toContain("setSelectedId(null);");
    expect(finish).not.toContain("setSelectedId(transaction.transaction.selectionId);");
  });
});
