import {
  alignStudioSelection,
  type StudioAlignMode,
} from "../studio-cuttoon-editor/studio-align-selected";
import { type El } from "../studio-element-model";
import {
  planStudioMultiSelectionLayoutPatch,
  planStudioSelectionFlip,
  planStudioSelectionLayoutPatch,
  selectStudioFigmaDesignTargets,
  type StudioFigmaSelectionLayoutPatch,
} from "../studio-figma-selection-ux";
import { planAtomicSelectionTranslation } from "../studio-group-selection";
import { isEffectivelyLocked, reorderLayerItem, type LayerGroup } from "../studio-layers";

export interface StudioSelectionTransformOptions {
  elements: El[];
  selectedId: string | null;
  selected: El | null;
  marqueeIds: string[];
  groups: LayerGroup[];
  activeGroupIdRef: React.MutableRefObject<string | null>;
  canvasH: number;
  completeSelectedGroupId: () => string | null;
  commit: (els: El[]) => boolean;
  commitCoalesced: (els: El[], coalescingKey: string) => void;
  patchEl: (id: string, patch: Partial<El>) => void;
  reorderSelectedElements: (dir: "front" | "back" | "forward" | "backward") => void;
  setError: (err: string | null) => void;
  announceDrawingShortcut: (msg: string) => void;
}

export function useStudioSelectionTransform(options: StudioSelectionTransformOptions) {
  const {
    elements,
    selectedId,
    selected,
    marqueeIds,
    groups,
    activeGroupIdRef,
    canvasH,
    completeSelectedGroupId,
    commit,
    commitCoalesced,
    patchEl,
    reorderSelectedElements,
    setError,
    announceDrawingShortcut,
  } = options;

  function nudgeSelected(dx: number, dy: number) {
    if (marqueeIds.length > 0) {
      const next = planAtomicSelectionTranslation({
        items: elements,
        selectedIds: marqueeIds,
        deltaX: dx,
        deltaY: dy,
        isLocked: (element) => isEffectivelyLocked(element, groups),
      });
      if (!next.some((element, index) => element !== elements[index])) {
        setError("잠긴 멤버가 포함된 선택은 일부만 이동하지 않아요. 잠금을 먼저 해제하세요.");
        return;
      }
      commitCoalesced(next, "nudge-multi");
      return;
    }
    if (!selected || isEffectivelyLocked(selected, groups)) return;
    const id = selected.id;
    const next = elements.map((e) =>
      e.id !== id
        ? e
        : e.type === "draw"
          ? ({ ...e, points: (e as { points: number[] }).points.map((v: number, i: number) => v + (i % 2 === 0 ? dx : dy)) } as El)
          : ({ ...e, x: (e as { x: number }).x + dx, y: (e as { y: number }).y + dy } as El)
    );
    commitCoalesced(next, `nudge:${id}`);
  }

  function alignSelected(mode: StudioAlignMode) {
    alignStudioSelection(mode, {
      elements,
      marqueeIds,
      selected,
      groups,
      activeGroupIdRef,
      canvasH,
      completeSelectedGroupId,
      commit,
      patchEl,
      setError,
    });
  }

  function flipSelected(axis: "horizontal" | "vertical") {
    const targets = selectStudioFigmaDesignTargets(elements, marqueeIds, selected);
    if (targets.length === 0) return;
    if (targets.some((element) => isEffectivelyLocked(element, groups))) {
      setError("잠긴 레이어는 반전할 수 없어요. 잠금을 해제한 뒤 다시 시도하세요.");
      return;
    }
    const next = planStudioSelectionFlip(
      elements,
      targets.map((element) => element.id),
      axis,
    );
    if (!next) return;
    if (next.every((element, index) => element === elements[index])) {
      announceDrawingShortcut("이 선택은 반전할 수 없어요 · 이미지나 여러 요소를 골라 보세요");
      return;
    }
    if (!commit(next)) return;
    announceDrawingShortcut(axis === "horizontal" ? "좌우 반전" : "상하 반전");
  }

  function applyFigmaSelectionLayoutPatch(patch: StudioFigmaSelectionLayoutPatch) {
    const targets = selectStudioFigmaDesignTargets(elements, marqueeIds, selected);
    if (targets.length > 1) {
      if (targets.some((element) => isEffectivelyLocked(element, groups))) {
        setError("잠긴 레이어가 포함되어 있어 함께 수정할 수 없어요. 잠금을 해제한 뒤 다시 시도하세요.");
        return;
      }
      const next = planStudioMultiSelectionLayoutPatch(elements, marqueeIds, patch);
      if (!next || !commit(next)) return;
      announceDrawingShortcut(`${targets.length}개 요소 속성을 함께 변경했어요`);
      return;
    }
    const target = targets[0];
    if (!target) return;
    if (isEffectivelyLocked(target, groups)) {
      setError("잠긴 레이어는 수정할 수 없어요.");
      return;
    }
    const next = planStudioSelectionLayoutPatch(target, patch);
    if (!next) return;
    patchEl(target.id, next);
  }

  function reorder(dir: "front" | "back" | "forward" | "backward") {
    if (marqueeIds.length > 0) {
      reorderSelectedElements(dir);
      return;
    }
    if (!selectedId) return;
    const next = reorderLayerItem(elements, selectedId, dir);
    if (next === elements) return;
    commit(next);
  }

  return {
    nudgeSelected,
    alignSelected,
    flipSelected,
    applyFigmaSelectionLayoutPatch,
    reorder,
  };
}
