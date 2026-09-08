import { Suspense, useState } from "react";

import { StudioSmartShapeEditDialog } from "./studio-page-lazy-ui";
import { recentStudioSmartShapeStroke, studioSmartShapeEditReason } from "./studio-smart-shape-snapshot";

import type { StudioEditorMutationTicket } from "./studio-editor-scope";
import type { DrawEl, El } from "./studio-element-model";

interface SmartShapeEditingOptions {
  elements: readonly El[];
  selectedId: string | null;
  currentPageId: () => string;
  isDrawing: () => boolean;
  isLocked: (stroke: DrawEl) => boolean;
  captureTicket: () => StudioEditorMutationTicket;
  canApply: (ticket: StudioEditorMutationTicket) => boolean;
  commit: (elements: El[]) => boolean;
  select: (id: string) => void;
  closeMenu: () => void;
  setError: (message: string | null) => void;
  onApplied: (stroke: DrawEl) => void;
}

/** Keeps pending correction previews outside the document and its undo/autosave history. */
export function useStudioSmartShapeEditing(options: SmartShapeEditingOptions) {
  const [session, setSession] = useState<{
    source: DrawEl;
    pageId: string;
    ticket: StudioEditorMutationTicket;
  } | null>(null);

  function openSmartShapeEditor() {
    if (options.isDrawing()) {
      options.setError("그리는 중인 스트로크를 끝낸 뒤 도형을 교정해 주세요.");
      return;
    }
    const source = recentStudioSmartShapeStroke(options.elements, options.selectedId);
    const reason = studioSmartShapeEditReason(source);
    if (reason || !source) {
      options.setError(reason ?? "교정할 스트로크가 없어요.");
      return;
    }
    if (options.isLocked(source)) {
      options.setError("잠긴 원고나 레이어에서는 도형을 교정할 수 없어요.");
      return;
    }
    options.select(source.id);
    setSession({ source: structuredClone(source), pageId: options.currentPageId(), ticket: options.captureTicket() });
    options.closeMenu();
  }

  function confirm(next: DrawEl): boolean {
    if (!session || session.pageId !== options.currentPageId()
      || !options.canApply(session.ticket) || options.isDrawing()
      || next.id !== session.source.id || studioSmartShapeEditReason(next)) return false;
    const current = options.elements.find((element) => element.id === session.source.id);
    if (!current || current.type !== "draw" || options.isLocked(current)
      || JSON.stringify(current) !== JSON.stringify(session.source)) return false;
    if (!options.commit(options.elements.map((element) => element.id === next.id ? next : element))) return false;
    setSession(null);
    options.select(next.id);
    options.setError(null);
    options.onApplied(next);
    return true;
  }

  return {
    openSmartShapeEditor,
    smartShapeDialog: session ? <Suspense fallback={null}>
      <StudioSmartShapeEditDialog key={`${session.pageId}:${session.source.id}`}
        source={session.source} onCancel={() => setSession(null)} onConfirm={confirm} />
    </Suspense> : null,
  };
}
