import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

describe("Studio pixel-selection pointer lifecycle", () => {
  it("captures the owning pointer and keeps global release/cancel safety nets", () => {
    expect(pageSource).toContain("captureTarget?.setPointerCapture(pointerId)");
    expect(pageSource).toContain('globalThis.addEventListener("pointerup", onPointerUp, true)');
    expect(pageSource).toContain('globalThis.addEventListener("pointercancel", onPointerCancel, true)');
    expect(pageSource).toContain('globalThis.addEventListener("lostpointercapture", onPointerCancel, true)');
    expect(pageSource).toContain("pixelSelectionHandledNativeEndEventsRef.current.add(event)");
  });

  it("commits only the owner release and cancels without mutating the selection", () => {
    expect(pageSource).toContain("session.pointerId !== pointerId");
    expect(pageSource).toContain("if (!cancelled) {");
    expect(pageSource).toContain("commitSelectionDragAtPoint(");
    expect(pageSource).toContain("commitSelectionDrag(previous, session.drag)");
    expect(pageSource).toContain('session.drag.tool === "lasso"');
    expect(pageSource).toContain("releasePixelSelectionPointerCapture(session)");
  });

  it("samples the owning pointerup coordinate before committing a rectangle or ellipse", () => {
    expect(pageSource).toContain("stage.setPointersPositions(pointerEvent)");
    expect(pageSource).toContain("stage.getRelativePointerPosition()");
    expect(pageSource).toContain("commitSelectionDragAtPoint(");
    expect(pageSource).toContain("canvasPointToNormalized(position.x, position.y, session.frame)");
  });
});
