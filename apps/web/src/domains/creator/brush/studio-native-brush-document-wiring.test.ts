import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(file: string) { return readFileSync(new URL(file, import.meta.url), "utf8"); }

describe("native document product wiring", () => {
  it("captures a mutation ticket and reads the current history frontier before a single normal commit", () => {
    const host = source("../StudioCuttoonEditorHost.tsx");
    const start = host.indexOf("prepareNativeBrushDocumentConversion: (target)");
    expect(start).toBeGreaterThan(0);
    const handler = host.slice(start, host.indexOf("replaceDrawWithHokusaiNaturalMedia:", start));
    for (const token of ["captureStudioMutationTicket()", "canApply: canApplyStudioMutation", "history: pagesHistoryRef",
      "index: pagesHiRef", "pageId: currentPageIdRef", "saving: documentSaveInFlightRef",
      "collaboration: collaborationAccessRef", "surfaceLocked: activeSurfaceReviewLockedRef", "pending: pendingStrokeCommitsRef", "commit,"]) {
      expect(handler).toContain(token);
    }
    const adapter = source("./studio-native-brush-editor-commit.ts");
    for (const token of ["prepareStudioNativeBrushDocumentCommit", "ports.canApply(ticket)",
      "ports.history.current", "ports.index.current", "ports.pageId.current", "ports.saving.current",
      "ports.collaboration.current.locked", "ports.surfaceLocked.current", "ports.pending.current"]) {
      expect(adapter).toContain(token);
    }
  });
  it("reaches the document conversion from both drawing and selected-freehand inspectors", () => {
    expect(source("../StudioInspectorDrawingSection.tsx")).toContain("onPrepare={prepareNativeBrushDocumentConversion}");
    expect(source("../StudioInspectorSelectionSection.tsx")).toContain("prepareNativeBrushDocumentConversion={prepareNativeBrushDocumentConversion}");
    expect(source("../StudioInspectorShapeSection.tsx")).toContain("onNativePrepare={prepareNativeBrushDocumentConversion}");
    expect(source("../StudioInspectorFreehandPathControls.tsx")).toContain("onPrepare={onNativePrepare}");
    expect(source("./StudioNativeBrushDocumentInspectorMount.tsx")).toContain('lazy(() => import("./StudioNativeBrushDocumentInspector"))');
  });
  it("keeps native rendering and final PNG encode in the selected Dedicated Worker", () => {
    const worker = source("./studio-native-brush-probe.worker.ts");
    expect(worker).toContain('request.type === "render-document"');
    expect(worker).toContain("encodeNativeBrushDocumentFrame(frame, surface, request.clipEdges)");
    expect(worker).toContain('reply.type === "document" ? [reply.png]');
    expect(source("./studio-native-brush-document-product.ts")).toContain('client.request({ type: "render-document"');
    expect(source("./studio-native-brush-document-product.ts")).not.toContain('getContext("2d")');
  });
});
