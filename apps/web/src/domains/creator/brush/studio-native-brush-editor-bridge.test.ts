import { describe, expect, it, vi } from "vitest";

import { createNativeBrushDocumentEditorPreparer } from "./studio-native-brush-editor-bridge";

import type { El } from "../studio-element-model";
import type { StudioNativeBrushDocumentState } from "./studio-native-brush-document-commit";

const delegate = vi.hoisted(() => vi.fn(() => () => true));
vi.mock("./studio-native-brush-document-commit", () => ({ prepareStudioNativeBrushDocumentCommit: delegate }));
function fixture() {
  const page = { id: "page", elements: [] as El[], canvasH: 1000 };
  return {
    captureStudioMutationTicket: vi.fn(() => "ticket"), canApplyStudioMutation: vi.fn(() => true),
    editorMountedRef: { current: true }, documentSaveInFlightRef: { current: false },
    collaborationAccessRef: { current: { locked: false } }, activeSurfaceReviewLockedRef: { current: false },
    drawingRef: { current: false }, pendingStrokeCommitsRef: { current: false },
    pagesHistoryRef: { current: [[page]] }, pagesHiRef: { current: 0 }, currentPageIdRef: { current: "page" },
    masterEditModeRef: { current: false }, documentWidth: 720,
    commit: vi.fn(() => true), setSelectedId: vi.fn(), announceDrawingShortcut: vi.fn(),
  };
}
function wiring(ports: ReturnType<typeof fixture>) {
  delegate.mockClear();
  const prepare = createNativeBrushDocumentEditorPreparer(ports);
  expect(ports.captureStudioMutationTicket).not.toHaveBeenCalled();
  prepare({ pageId: "page", masterEditMode: false, sourceElementId: "stroke", sourceRevision: "source" });
  return (delegate.mock.calls as unknown as Array<[unknown, { canMutate(): boolean; read(): StudioNativeBrushDocumentState | null; commit(elements: El[]): boolean; onCommitted(id: string): void }]>)[0]![1];
}
describe("native brush editor bridge extraction", () => {
  it("captures the ticket at the action and reads refs at each validation", () => {
    const ports = fixture(), bridge = wiring(ports);
    expect(ports.captureStudioMutationTicket).toHaveBeenCalledTimes(1);
    expect(bridge.canMutate()).toBe(true);
    expect(ports.canApplyStudioMutation).toHaveBeenCalledWith("ticket");
    expect(bridge.read()).toMatchObject({ pageId: "page", historyIndex: 0, documentWidth: 720, documentHeight: 1000 });
    ports.currentPageIdRef.current = "missing"; expect(bridge.read()).toBeNull();
  });
  it.each(["documentSaveInFlightRef", "activeSurfaceReviewLockedRef", "drawingRef", "pendingStrokeCommitsRef"] as const)("rechecks %s after preparation", (key) => {
    const ports = fixture(), bridge = wiring(ports);
    expect(bridge.canMutate()).toBe(true); ports[key].current = true; expect(bridge.canMutate()).toBe(false);
  });
  it("preserves mounted/access locks and delegates one accepted commit notification", () => {
    const ports = fixture(), bridge = wiring(ports);
    ports.editorMountedRef.current = false; expect(bridge.canMutate()).toBe(false);
    ports.editorMountedRef.current = true; ports.collaborationAccessRef.current.locked = true; expect(bridge.canMutate()).toBe(false);
    bridge.commit([]); bridge.onCommitted("result");
    expect(ports.commit).toHaveBeenCalledWith([]); expect(ports.setSelectedId).toHaveBeenCalledWith("result");
    expect(ports.announceDrawingShortcut).toHaveBeenCalledTimes(1);
  });
});
