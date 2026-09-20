import { requestStudioInspectorFocus } from "./studio-inspector-focus";

import type { StudioInspectorRoute } from "./studio-inspector-layout";

export interface StudioTransformEntryContext {
  readonly selected: { readonly type: string } | null;
  readonly selectedCount: number;
  readonly selectionComplete: boolean;
  readonly selectionLocked: boolean;
  readonly activeSurfaceReviewLocked: boolean;
  readonly selectedImageMutationLocked: boolean;
  readonly pixelSelectionUsable: boolean;
  readonly isMobile: boolean;
  readonly disarmAllPixelTools: () => void;
  readonly setTool: (tool: "select") => void;
  readonly setMenu: (menu: null) => void;
  readonly setError: (error: string | null) => void;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly openInspectorRoute: (route: StudioInspectorRoute, sheet: "props" | null) => void;
  readonly preparePixelTarget: () => boolean;
  readonly selectWholePixelLayer: () => void;
}

/** Entry routing only; the existing editor retains all document, rendering and Undo authority. */
export function enterStudioSelectionTransform(context: StudioTransformEntryContext): void {
  const { selected, selectedCount, selectionComplete, selectionLocked, activeSurfaceReviewLocked,
    selectedImageMutationLocked, pixelSelectionUsable, isMobile, disarmAllPixelTools,
    setTool, setMenu, setError, announceDrawingShortcut, openInspectorRoute,
    preparePixelTarget, selectWholePixelLayer } = context;
  if (selectionLocked) {
    setError("잠긴 선택 항목은 변형할 수 없어요. 잠금을 해제한 뒤 다시 시도하세요.");
    return;
  }
  if (activeSurfaceReviewLocked) {
    setError("현재 작업면의 검토 잠금을 먼저 해제하세요.");
    return;
  }
  if (!selectionComplete) {
    setError("선택 항목이 변경되었어요. 다시 선택한 뒤 변형해 주세요.");
    return;
  }
  const objectTransform = selectedCount > 1 || (selected && (
    selected.type !== "image" || !pixelSelectionUsable
  ));
  if (objectTransform) {
    if (selectedImageMutationLocked) {
      setError("선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요.");
      return;
    }
    disarmAllPixelTools();
    setTool("select");
    setMenu(null);
    setError(null);
    openInspectorRoute({ primary: "properties", image: "transform" }, isMobile ? "props" : null);
    requestStudioInspectorFocus("selection.geometry");
    announceDrawingShortcut(selectedCount > 1
      ? "선택한 레이어를 함께 변형합니다 · 원래 레이어 구조 유지"
      : selected?.type === "draw"
        ? "모서리 핸들을 끌어 선택 선화 레이어의 크기·위치를 조절하세요"
        : "모서리·회전 핸들로 선택 레이어를 변형하세요");
    return;
  }
  if (!preparePixelTarget()) return;
  if (!pixelSelectionUsable) {
    selectWholePixelLayer();
    announceDrawingShortcut("레이어 전체 선택 · 리터치에서 크기·회전·뒤집기를 적용하세요");
  } else {
    announceDrawingShortcut("리터치 패널에서 선택 영역의 내용 변형을 적용하세요");
  }
  openInspectorRoute({ primary: "properties", image: "retouch" }, isMobile ? "props" : null);
}
