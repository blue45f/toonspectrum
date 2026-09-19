import { containingPanel } from "../studio-element-geometry";
import { uid } from "../studio-id";
import { isEffectivelyHidden, isEffectivelyLocked } from "../studio-layers";

import { planStudioNativeBrushDocument, studioNativeBrushSourceRevision } from "./studio-native-brush-document-contract";
import { NATIVE_BRUSH_DOCUMENT_MAX_PNG_BYTES } from "./studio-native-brush-probe-contract";

import type { El } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";
import type { StudioNativeBrushDocumentResult } from "./studio-native-brush-document-contract";

export interface StudioNativeBrushDocumentState {
  readonly pageId: string;
  readonly masterEditMode: boolean;
  readonly historyIdentity: object;
  readonly historyIndex: number;
  readonly elements: readonly El[];
  readonly groups: LayerGroup[];
  readonly documentWidth: number;
  readonly documentHeight: number;
}
export interface StudioNativeBrushDocumentTarget {
  readonly pageId: string;
  readonly masterEditMode: boolean;
  readonly sourceElementId: string;
  readonly sourceRevision: string;
}
export type StudioNativeBrushDocumentCommit = (result: StudioNativeBrushDocumentResult) => boolean;
/** The lazy inspector supplies its existing validator synchronously; no early host import is needed. */
export type StudioNativeBrushDocumentPrepare = (
  target: StudioNativeBrushDocumentTarget,
  prepare: typeof prepareStudioNativeBrushDocumentCommit,
) => StudioNativeBrushDocumentCommit | null;

/** Source and image remain ordinary document elements; existing history/save/export own them. */
export function planStudioNativeBrushDocumentReplacement(
  state: StudioNativeBrushDocumentState,
  result: StudioNativeBrushDocumentResult,
  createId: () => string = uid,
): { rasterId: string; nextElements: El[] } | null {
  const sourceIndex = state.elements.findIndex((element) => element.id === result.sourceElementId);
  const source = state.elements[sourceIndex];
  if (!source || source.type !== "draw" || isEffectivelyLocked(source, state.groups) || isEffectivelyHidden(source, state.groups)) return null;
  try {
    if (studioNativeBrushSourceRevision(source) !== result.sourceRevision
      || typeof result.src !== "string" || !result.src.startsWith("data:image/png;base64,iVBORw0KGgo")
      || result.src.length > Math.ceil(NATIVE_BRUSH_DOCUMENT_MAX_PNG_BYTES / 3) * 4 + 32
      || !/^[a-f0-9]{64}$/u.test(result.pngHash)) return null;
    const expected = planStudioNativeBrushDocument(source, { engine: result.engine, style: result.style, seed: result.seed,
      documentWidth: state.documentWidth, documentHeight: state.documentHeight });
    if (["x", "y", "width", "height"].some((key) =>
      expected.bounds[key as keyof typeof expected.bounds] !== result.bounds[key as keyof typeof result.bounds])) return null;
    const rasterId = createId();
    if (!rasterId || state.elements.some((element) => element.id === rasterId)) return null;
    const raster: El = {
      id: rasterId, type: "image", src: result.src, ...expected.bounds, rotation: 0,
      name: `${result.engine} ${result.style} · ${source.name ?? source.brush ?? "선화"}`.slice(0, 180),
      opacity: source.opacity ?? 1, lockAspect: true,
      ...(source.groupId ? { groupId: source.groupId } : {}),
      ...(source.noClip !== undefined ? { noClip: source.noClip } : {}),
      ...(source.layerRole ? { layerRole: source.layerRole } : {}),
      ...(source.layerColor ? { layerColor: source.layerColor } : {}),
    };
    // Clipping is currently inferred from the object's center. A crop must not change its panel.
    if (!source.noClip && containingPanel(source, [...state.elements])?.id !== containingPanel(raster, [...state.elements])?.id) return null;
    const nextElements = state.elements.map((element, index) => index === sourceIndex ? { ...source, hidden: true } : element);
    nextElements.splice(sourceIndex + 1, 0, raster);
    return { rasterId, nextElements };
  } catch { return null; }
}

/** Capture before starting the Worker. One operation may commit once, only on its original frontier. */
export function prepareStudioNativeBrushDocumentCommit(
  target: StudioNativeBrushDocumentTarget,
  ports: {
    read(): StudioNativeBrushDocumentState | null;
    canMutate(): boolean;
    commit(elements: El[]): boolean;
    onCommitted(id: string): void;
  },
): StudioNativeBrushDocumentCommit | null {
  const captured = ports.read();
  const source = captured?.elements.find((element) => element.id === target.sourceElementId);
  if (!captured || captured.masterEditMode || target.masterEditMode || captured.pageId !== target.pageId
    || !ports.canMutate() || !source || source.type !== "draw"
    || isEffectivelyLocked(source, captured.groups) || isEffectivelyHidden(source, captured.groups)) return null;
  try { if (studioNativeBrushSourceRevision(source) !== target.sourceRevision) return null; } catch { return null; }
  let used = false;
  return (result) => {
    if (used) return false;
    used = true;
    const current = ports.read();
    if (!current || !ports.canMutate() || current.masterEditMode || current.pageId !== target.pageId
      || current.historyIdentity !== captured.historyIdentity || current.historyIndex !== captured.historyIndex
      || current.documentWidth !== captured.documentWidth || current.documentHeight !== captured.documentHeight
      || result.sourceElementId !== target.sourceElementId || result.sourceRevision !== target.sourceRevision) return false;
    const planned = planStudioNativeBrushDocumentReplacement(current, result);
    if (!planned || !ports.commit(planned.nextElements)) return false;
    // A UI notification failure cannot undo an already accepted document transaction.
    try { ports.onCommitted(planned.rasterId); } catch { /* Document commit remains authoritative. */ }
    return true;
  };
}
