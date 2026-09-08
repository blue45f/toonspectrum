#!/usr/bin/env python3
"""Integrate the verified selection workbench into the current Studio shell.

This patch is intentionally fail-closed: every anchor must occur exactly once. The
workflow removes this script after the real source changes pass all validation.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative: str, before: str, after: str) -> None:
    path = ROOT / relative
    text = path.read_text(encoding="utf-8")
    if after in text:
        return
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one patch anchor, found {count}")
    path.write_text(text.replace(before, after, 1), encoding="utf-8")


replace_once(
    "apps/web/src/domains/creator/StudioInspectorImageToolsSection.tsx",
    'import { StudioMagicWandPanel } from "./StudioMagicWandPanel";\n',
    'import { StudioMagicWandPanel } from "./StudioMagicWandPanel";\n'
    'import { StudioSelectionWorkbenchPanel } from "./StudioSelectionWorkbenchPanel";\n',
)

replace_once(
    "apps/web/src/domains/creator/StudioInspectorImageToolsSection.tsx",
    "                        <StudioMagicWandPanel\n",
    """                        <StudioSelectionWorkbenchPanel
                          selection={pixelSel}
                          operation={pixelCombine}
                          imageSource={selectedReadableImageSource ?? null}
                          scopeKey={selected.id}
                          aspect={selected.width > 0 ? selected.height / selected.width : 1}
                          flipX={selected.flipped === true}
                          flipY={selected.flippedY === true}
                          busy={pixelBusy}
                          onCommitSelection={(next, intent) => {
                            clearPolyLassoDraft();
                            commitPixelSelectionState(
                              next,
                              intent === "smooth"
                                ? "transform"
                                : intent === "restore-saved"
                                  ? "other"
                                  : "magic-wand",
                            );
                          }}
                        />
                        <StudioMagicWandPanel
""",
)

replace_once(
    "apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorCanvasColumn.tsx",
    'import { StudioSelectionContextBar } from "../StudioSelectionContextBar";\n',
    'import { StudioPixelSelectionHud } from "../StudioPixelSelectionHud";\n'
    'import { smoothPixelSelection } from "../studio-selection-refinement";\n'
    'import {\n'
    '  SELECTION_EXPAND_DEFAULT,\n'
    '  expandContractSelection,\n'
    '  setSelectionFeather,\n'
    '  toggleSelectionInvert,\n'
    '} from "../studio-selection-tools";\n'
    'import { StudioSelectionContextBar } from "../StudioSelectionContextBar";\n',
)

replace_once(
    "apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorCanvasColumn.tsx",
    "        <StudioSelectionContextBar\n",
    """        <StudioPixelSelectionHud
          visible={
            !!pixelOverlaySel
            && selected?.type === "image"
            && !canvasOnlyMode
            && !canvasInteractionBlocked
            && !isExporting
            && !quickMaskArmed
          }
          selection={pixelOverlaySel}
          operation={s.pixelCombine}
          busy={s.pixelBusy}
          readOnly={activeSurfaceReviewLocked || pageEditLocked}
          stableHandlers={studioOnCanvasSurfaceHandlers}
          onOperationChange={s.setPixelCombine}
          onExpand={() => {
            s.commitPixelSelectionState(
              (selection) => expandContractSelection(selection, SELECTION_EXPAND_DEFAULT),
              "transform",
            );
          }}
          onContract={() => {
            s.commitPixelSelectionState(
              (selection) => expandContractSelection(selection, -SELECTION_EXPAND_DEFAULT),
              "transform",
            );
          }}
          onSmooth={() => {
            s.commitPixelSelectionState(
              (selection) => smoothPixelSelection(selection, { passes: 2, strength: 0.26 }),
              "transform",
            );
          }}
          onFeatherChange={(featherPx) => {
            s.commitPixelSelectionState(
              (selection) => selection ? setSelectionFeather(selection, featherPx) : selection,
              "feather",
              "hud-feather",
            );
          }}
          onInvert={() => {
            s.commitPixelSelectionState(
              (selection) => selection ? toggleSelectionInvert(selection) : selection,
              "invert",
            );
          }}
          onClear={() => {
            s.clearPolyLassoDraft();
            s.commitPixelSelectionState(null, "clear");
          }}
        />
        <StudioSelectionContextBar
""",
)

replace_once(
    "apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorCanvasColumn.tsx",
    """          visible={
            tool === "select"
            && currentCanvasSelectionCount > 0
            && !canvasOnlyMode
            && !canvasInteractionBlocked
            && !isExporting
          }
""",
    """          visible={
            tool === "select"
            && currentCanvasSelectionCount > 0
            && !canvasOnlyMode
            && !canvasInteractionBlocked
            && !isExporting
            && !pixelOverlaySel
          }
""",
)

replace_once(
    "apps/web/src/domains/creator/studio-main-menu-group-spec.ts",
    """      gap(
        "Semantic/Object Select",
        "AI 피사체 분리는 ‘레이어 분리’로 있으나 결과가 선택 영역이 아니라 레이어라 이 행을 채우지 못한다.",
      ),
""",
    """      part(
        "Semantic/Object Select",
        "인스펙터 선택 작업대에서 레이어 불투명도와 온디바이스 AI 피사체를 현재 결합 모드로 선택한다. 독립 메인 메뉴 명령은 아직 없다.",
      ),
""",
)

replace_once(
    "apps/web/src/domains/creator/studio-main-menu-group-spec.ts",
    """      gap(
        "Expand/Shrink/Feather/Smooth",
        "확장·축소·페더는 선택 도구 패널의 슬라이더로만 있고 명령이 아니다. Smooth 는 아예 없다.",
      ),
""",
    """      part(
        "Expand/Shrink/Feather/Smooth",
        "선택 도구 패널과 캔버스 HUD에서 확장·축소·페더·면적 보존 스무딩을 제공한다. 메인 메뉴 수치 대화상자는 아직 없다.",
      ),
""",
)

replace_once(
    "apps/web/src/domains/creator/studio-main-menu-group-spec.ts",
    '      gap("Save Selection", "선택 실행취소·다시실행만 있고 이름 붙인 선택 저장은 없다."),\n',
    """      part(
        "Save Selection",
        "이미지 단위·기기 로컬 이름 저장/불러오기를 제공한다. 프로젝트·CRDT 영구 채널과 팀 동기화는 아직 없다.",
      ),
""",
)

replace_once(
    "apps/web/src/domains/creator/studio-main-menu-group-spec.ts",
    '      gap("Selection HUD", "요소 선택용 컨텍스트 바만 있고 픽셀 선택용 HUD 는 없다."),\n',
    """      part(
        "Selection HUD",
        "픽셀 선택 대상 근처에 safe-area 인지 HUD를 제공한다. 사용자가 명령 구성을 편집하는 기능은 아직 없다.",
      ),
""",
)

replace_once(
    "apps/web/src/domains/creator/studio-main-menu-items-selection.ts",
    """ * Rows §15.3 asks for that the product genuinely lacks — Semantic/Object Select,
 * Expand/Shrink/Feather/Smooth as commands, Save Selection, Selection HUD — stay
 * recorded as gaps in `studio-main-menu-group-spec.ts` rather than faked.
""",
    """ * The workbench and contextual HUD now partially deliver Semantic/Object Select,
 * Expand/Shrink/Feather/Smooth, Save Selection and Selection HUD. They remain
 * recorded as partial in `studio-main-menu-group-spec.ts`: no direct menubar command,
 * project-synced named-selection channel or user-customizable launcher is invented.
""",
)
