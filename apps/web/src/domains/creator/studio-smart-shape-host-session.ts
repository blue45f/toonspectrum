import { isEffectivelyLocked, type LayerGroup } from "./studio-layers";
import {
  recentStudioSmartShapeStroke,
  studioSmartShapeEditReason,
} from "./studio-smart-shape-edit";

import type { StudioEditorMutationTicket } from "./studio-editor-scope";
import type { DrawEl, El } from "./studio-element-model";

export interface StudioSmartShapeEditSession {
  source: DrawEl;
  pageId: string;
  mutationTicket: StudioEditorMutationTicket;
}

export type BeginStudioSmartShapeEditSessionInput = {
  drawing: boolean;
  pointerSession: unknown;
  nodeEditDragging: boolean;
  elements: readonly El[];
  selectedId?: string | null;
  collaborationLocked: boolean;
  groups: LayerGroup[];
  activeSurfaceReviewLocked: boolean;
  pageId: string;
  mutationTicket: StudioEditorMutationTicket;
};

export type BeginStudioSmartShapeEditSessionResult =
  | { ok: true; session: StudioSmartShapeEditSession }
  | { ok: false; error: string };

/** Host open path: refuse in-flight strokes, then clone the current eligible draw. */
export function beginStudioSmartShapeEditSession(
  input: BeginStudioSmartShapeEditSessionInput,
): BeginStudioSmartShapeEditSessionResult {
  if (input.drawing || input.pointerSession || input.nodeEditDragging) {
    return { ok: false, error: "그리는 중인 스트로크를 끝낸 뒤 도형을 교정해 주세요." };
  }
  const source = recentStudioSmartShapeStroke(input.elements, input.selectedId);
  const reason = studioSmartShapeEditReason(source);
  if (reason || !source) {
    return { ok: false, error: reason ?? "교정할 스트로크가 없어요." };
  }
  if (
    input.collaborationLocked
    || isEffectivelyLocked(source, input.groups)
    || input.activeSurfaceReviewLocked
  ) {
    return { ok: false, error: "잠긴 원고나 레이어에서는 도형을 교정할 수 없어요." };
  }
  return {
    ok: true,
    session: {
      source: structuredClone(source),
      pageId: input.pageId,
      mutationTicket: input.mutationTicket,
    },
  };
}

export type ApplyStudioSmartShapeEditSessionInput = {
  session: StudioSmartShapeEditSession | null;
  next: DrawEl;
  pageId: string;
  canApply: boolean;
  drawing: boolean;
  current: El | undefined;
  groups: LayerGroup[];
  elements: readonly El[];
};

export type ApplyStudioSmartShapeEditSessionResult =
  | { ok: true; elements: El[] }
  | { ok: false };

/** Host confirm path: same page + mutation ticket, then replace the live draw. */
export function applyStudioSmartShapeEditSession(
  input: ApplyStudioSmartShapeEditSessionInput,
): ApplyStudioSmartShapeEditSessionResult {
  const session = input.session;
  if (
    !session
    || session.pageId !== input.pageId
    || !input.canApply
    || input.drawing
  ) {
    return { ok: false };
  }
  const current = input.current;
  if (!current || current.type !== "draw" || isEffectivelyLocked(current, input.groups)) {
    return { ok: false };
  }
  return {
    ok: true,
    elements: input.elements.map((element) => (element.id === current.id ? input.next : element)),
  };
}

export interface StudioSmartShapeHostBindings {
  session: StudioSmartShapeEditSession | null;
  setSession: (session: StudioSmartShapeEditSession | null) => void;
  drawingRef: { current: unknown };
  drawingPointerTransportRef: { current: { getSession?: () => unknown } | null };
  nodeEditDragRef: { current: unknown };
  currentPageIdRef: { current: string };
  collaborationAccessRef: { current: { locked: boolean } };
  elements: readonly El[];
  selectedId?: string | null;
  groups: LayerGroup[];
  elementById: Map<string, El>;
  activeSurfaceReviewLocked: boolean;
  captureStudioMutationTicket: () => StudioEditorMutationTicket;
  canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  commit: (next: El[]) => boolean;
  setError: (message: string | null) => void;
  setSelectedId: (id: string | null) => void;
  setMarqueeIds: (ids: string[]) => void;
  setMenu: (menu: null) => void;
  setNodeEditTool: (tool: "move") => void;
  activatePrimaryCanvasTool: (tool: "select") => void;
  announceDrawingShortcut: (message: string) => void;
}

/** Host-facing open/confirm closures. Logic stays in begin/apply so the host file does not grow. */
export function bindStudioSmartShapeHostControllers(host: StudioSmartShapeHostBindings) {
  function openSmartShapeEditor() {
    const result = beginStudioSmartShapeEditSession({
      drawing: Boolean(host.drawingRef.current),
      pointerSession: host.drawingPointerTransportRef.current?.getSession?.() ?? null,
      nodeEditDragging: Boolean(host.nodeEditDragRef.current),
      elements: host.elements,
      selectedId: host.selectedId,
      collaborationLocked: host.collaborationAccessRef.current.locked,
      groups: host.groups,
      activeSurfaceReviewLocked: host.activeSurfaceReviewLocked,
      pageId: host.currentPageIdRef.current,
      mutationTicket: host.captureStudioMutationTicket(),
    });
    if (!result.ok) { host.setError(result.error); return; }
    host.setSelectedId(result.session.source.id);
    host.setMarqueeIds([]);
    host.setSession(result.session);
    host.setMenu(null);
  }
  function confirmSmartShapeEditor(next: DrawEl): boolean {
    const result = applyStudioSmartShapeEditSession({
      session: host.session,
      next,
      pageId: host.currentPageIdRef.current,
      canApply: Boolean(host.session && host.canApplyStudioMutation(host.session.mutationTicket)),
      drawing: Boolean(host.drawingRef.current),
      current: host.session ? host.elementById.get(host.session.source.id) : undefined,
      groups: host.groups,
      elements: host.elements,
    });
    if (!result.ok || !host.commit(result.elements)) return false;
    host.setSession(null);
    host.activatePrimaryCanvasTool("select");
    host.setSelectedId(next.id);
    host.setMarqueeIds([]);
    host.setNodeEditTool("move");
    host.setError(null);
    host.announceDrawingShortcut(
      next.smartShape ? "도형을 확정했어요. 캔버스의 점을 끌어 편집하세요." : "원래 자유선을 복원했어요.",
    );
    return true;
  }
  return { openSmartShapeEditor, confirmSmartShapeEditor };
}
