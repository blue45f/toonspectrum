import type { StudioCommentAnchor } from "./studio-comments";

export interface StudioEditorCommentTarget {
  readonly pageId: string;
  readonly elementId?: string;
  readonly frame?: boolean;
  readonly master?: boolean;
  readonly point?: { readonly x: number; readonly y: number };
}
export interface StudioEditorCommentSelection {
  readonly elementId: string | null;
  readonly master: boolean;
  readonly point: { pageId: string; x: number; y: number } | null;
}
interface ElementIdentity { readonly id: string; readonly type: string }
export interface StudioEditorCommentSelectionPort {
  getPages(): readonly { readonly id: string; readonly elements: readonly ElementIdentity[]; readonly hideMaster?: boolean }[];
  getMasterElements(): readonly ElementIdentity[];
  getCurrentPageId(): string;
  changePage(pageId: string): boolean;
  applySelection(selection: StudioEditorCommentSelection): void;
  onMissing(kind: "page" | "element"): void;
}

export function studioEditorTargetForComment(anchor: StudioCommentAnchor): StudioEditorCommentTarget {
  return { pageId: anchor.pageId,
    ...(anchor.type === "frame" ? { elementId: anchor.frameId, frame: true } : {}),
    ...(anchor.type === "element" ? { elementId: anchor.elementId } : {}),
    ...(anchor.type === "point" ? { point: { x: anchor.x, y: anchor.y } } : {}) };
}

/** Page transport owns its rejection notice. Failed transport never changes selection/tool state. */
export function selectStudioEditorCommentTarget(
  target: StudioEditorCommentTarget, port: StudioEditorCommentSelectionPort, current: () => boolean = () => true,
): boolean {
  if (!current()) return false;
  const matches = port.getPages().filter((page) => page.id === target.pageId);
  if (matches.length !== 1) { port.onMissing("page"); return false; }
  const page = matches[0]!;
  if (target.point && (!Number.isFinite(target.point.x) || !Number.isFinite(target.point.y)
    || target.point.x < 0 || target.point.x > 1 || target.point.y < 0 || target.point.y > 1)) return false;
  if (target.master && (page.hideMaster || !target.elementId)) return false;
  const elements = target.master ? port.getMasterElements() : page.elements;
  if (target.elementId) {
    const selected = elements.filter((element) => element.id === target.elementId);
    if (selected.length !== 1 || (target.frame && selected[0]?.type !== "frame")) {
      port.onMissing("element"); return false;
    }
  }
  if (!current() || !port.changePage(page.id) || port.getCurrentPageId() !== page.id || !current()) return false;
  port.applySelection({ elementId: target.elementId ?? null, master: target.master === true,
    point: target.point ? { pageId: page.id, ...target.point } : null });
  return true;
}
