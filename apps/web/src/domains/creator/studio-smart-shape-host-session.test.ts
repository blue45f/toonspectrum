import { describe, expect, it } from "vitest";

import {
  commitStudioSmartShapeEdit,
  createStudioSmartShapePath,
} from "./studio-smart-shape-edit";
import {
  applyStudioSmartShapeEditSession,
  beginStudioSmartShapeEditSession,
  bindStudioSmartShapeHostControllers,
  type StudioSmartShapeEditSession,
} from "./studio-smart-shape-host-session";

import type { DrawEl, El } from "./studio-element-model";
import type { StudioEditorMutationTicket } from "./studio-editor-scope";

const ticket = (): StudioEditorMutationTicket => ({
  authScopeKey: "owner-1",
  workId: "work-1",
  accessGeneration: 1,
  documentGeneration: 1,
});

const stroke = (id = "stroke-1"): DrawEl => ({
  id,
  type: "draw",
  kind: "freehand",
  mode: "pen",
  brush: "pen",
  points: [10, 20, 25, 21, 50, 19, 75, 20, 100, 20],
  stroke: "#245678",
  strokeWidth: 6,
  opacity: 0.6,
  pressures: [0.1, 0.3, 0.6, 0.8, 1],
  pressureModel: "linear-full-v1",
});

const openInput = (overrides: Partial<Parameters<typeof beginStudioSmartShapeEditSession>[0]> = {}) => ({
  drawing: false,
  pointerSession: null,
  nodeEditDragging: false,
  elements: [stroke()] as El[],
  selectedId: "stroke-1",
  collaborationLocked: false,
  groups: [],
  activeSurfaceReviewLocked: false,
  pageId: "page-1",
  mutationTicket: ticket(),
  ...overrides,
});

describe("studio smart shape host session", () => {
  it("opens a cloned session for the current freehand stroke and confirms a document replace", () => {
    const source = stroke();
    const opened = beginStudioSmartShapeEditSession(openInput({ elements: [source] }));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.session.source).toEqual(source);
    expect(opened.session.source).not.toBe(source);
    opened.session.source.points[0] = 999;
    expect(source.points[0]).toBe(10);

    const next = commitStudioSmartShapeEdit(
      opened.session.source,
      "line",
      createStudioSmartShapePath(opened.session.source, "line"),
    );
    expect(next).not.toBeNull();
    const applied = applyStudioSmartShapeEditSession({
      session: opened.session,
      next: next!,
      pageId: "page-1",
      canApply: true,
      drawing: false,
      current: source,
      groups: [],
      elements: [source, stroke("other")],
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.elements[0]).toBe(next);
    expect(applied.elements[1]?.id).toBe("other");
    expect(source.points[0]).toBe(10);
  });

  it("refuses to open while a stroke is in flight or the layer is locked", () => {
    expect(beginStudioSmartShapeEditSession(openInput({ drawing: true }))).toEqual({
      ok: false,
      error: "그리는 중인 스트로크를 끝낸 뒤 도형을 교정해 주세요.",
    });
    expect(beginStudioSmartShapeEditSession(openInput({ pointerSession: { id: "live" } }))).toEqual({
      ok: false,
      error: "그리는 중인 스트로크를 끝낸 뒤 도형을 교정해 주세요.",
    });
    expect(beginStudioSmartShapeEditSession(openInput({
      elements: [{ ...stroke(), locked: true }],
    })).ok).toBe(false);
    expect(beginStudioSmartShapeEditSession(openInput({ collaborationLocked: true }))).toEqual({
      ok: false,
      error: "잠긴 원고나 레이어에서는 도형을 교정할 수 없어요.",
    });
    expect(beginStudioSmartShapeEditSession(openInput({ elements: [] }))).toEqual({
      ok: false,
      error: "교정할 펜 스트로크를 먼저 그려 주세요.",
    });
  });

  it("refuses confirm when the page, mutation ticket, or live element no longer matches", () => {
    const source = stroke();
    const opened = beginStudioSmartShapeEditSession(openInput({ elements: [source] }));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const next = commitStudioSmartShapeEdit(source, "line", [10, 20, 100, 20])!;
    const base = {
      session: opened.session,
      next,
      pageId: "page-1",
      canApply: true,
      drawing: false,
      current: source as El,
      groups: [],
      elements: [source] as El[],
    };
    expect(applyStudioSmartShapeEditSession({ ...base, pageId: "page-2" }).ok).toBe(false);
    expect(applyStudioSmartShapeEditSession({ ...base, canApply: false }).ok).toBe(false);
    expect(applyStudioSmartShapeEditSession({ ...base, drawing: true }).ok).toBe(false);
    expect(applyStudioSmartShapeEditSession({ ...base, current: { ...source, locked: true } }).ok).toBe(false);
    expect(applyStudioSmartShapeEditSession({ ...base, current: undefined }).ok).toBe(false);
  });

  it("bindStudioSmartShapeHostControllers drives begin/apply and commits the replaced document", () => {
    const source = stroke();
    let session: StudioSmartShapeEditSession | null = null;
    let selectedId: string | null = "stroke-1";
    let committed: El[] | null = null;
    const host = bindStudioSmartShapeHostControllers({
      get session() { return session; },
      setSession: (next) => { session = next; },
      drawingRef: { current: null },
      drawingPointerTransportRef: { current: null },
      nodeEditDragRef: { current: null },
      currentPageIdRef: { current: "page-1" },
      collaborationAccessRef: { current: { locked: false } },
      elements: [source],
      selectedId: "stroke-1",
      groups: [],
      elementById: new Map([[source.id, source]]),
      activeSurfaceReviewLocked: false,
      captureStudioMutationTicket: ticket,
      canApplyStudioMutation: () => true,
      commit: (next) => { committed = next; return true; },
      setError: () => {},
      setSelectedId: (id) => { selectedId = id; },
      setMarqueeIds: () => {},
      setMenu: () => {},
      setNodeEditTool: () => {},
      activatePrimaryCanvasTool: () => {},
      announceDrawingShortcut: () => {},
    });
    host.openSmartShapeEditor();
    expect(session).not.toBeNull();
    const next = commitStudioSmartShapeEdit(source, "line", [10, 20, 100, 20])!;
    expect(host.confirmSmartShapeEditor(next)).toBe(true);
    expect(committed?.[0]).toBe(next);
    expect(session).toBeNull();
    expect(selectedId).toBe(next.id);
  });
});
