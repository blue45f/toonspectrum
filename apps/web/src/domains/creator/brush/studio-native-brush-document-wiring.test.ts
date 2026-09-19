import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(file: string) { return readFileSync(new URL(file, import.meta.url), "utf8"); }

describe("native document product wiring", () => {
  it("captures a mutation ticket and reads the current history frontier before a single normal commit", () => {
    const host = source("../StudioCuttoonEditorHost.tsx");
    expect(host).toContain("prepareNativeBrushDocumentConversion: createNativeBrushDocumentEditorPreparer({");
    const bridge = source("./studio-native-brush-editor-bridge.ts");
    expect(bridge.indexOf("ports.captureStudioMutationTicket()")).toBeGreaterThan(bridge.indexOf("return (target) =>"));
    for (const token of ["captureStudioMutationTicket()", "canApplyStudioMutation(ticket)", "pagesHistoryRef.current",
      "pagesHiRef.current", "currentPageIdRef.current", "documentSaveInFlightRef.current",
      "collaborationAccessRef.current.locked", "activeSurfaceReviewLockedRef.current", "pendingStrokeCommitsRef.current", "ports.commit(elements)"]) {
      expect(bridge).toContain(token);
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
