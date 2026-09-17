/**
 * §15.3 View, Canvas, Vector and Text — rows whose surface is an inspector route.
 *
 * Four groups, one shape of gap. The minimap navigator, the canvas size/grid/
 * guide settings, the vector eraser's erase-to-intersection mode and the dialogue
 * batch/translate panels are all shipped and all reachable — but only by knowing
 * which inspector tab, which options-bar chip or which popover subtab they hide
 * behind. `openInspectorRoute` and the host's own toggles are what the rows below
 * dispatch, so the menu opens a second door onto one implementation.
 *
 * Deliberately *not* here:
 * - View ▸ Safe Mode. `enterStudioSafeMode("manual", …)` exists and would work,
 *   but Safe Mode is the reliability layer's own product boundary; a manual
 *   entry point is that layer's call, not the menu's.
 * - Canvas ▸ Crop/Trim. Only *layer* crop ships (Layer ▸ 레이어 자르기); a canvas
 *   crop row would point at a feature we do not have.
 */

import {
  Compass,
  Eraser,
  FilePlus2,
  Grid3x3,
  Languages,
  MessageSquare,
  Ruler,
  ScanText,
  SlidersHorizontal,
  Smartphone,
  Stamp,
  StickyNote,
} from "lucide-react";

import { STUDIO_WEBTOON_CANVAS_PRESETS } from "./studio-webtoon-canvas-presets";

import type { StudioWebtoonCanvasPresetId } from "./studio-webtoon-canvas-presets";

import type { StudioMainMenuItemContext } from "./studio-main-menu-contract";
import type { StudioMainMenuItem } from "./studio-main-menu-model";
import { openStudioViewInspectionPanel } from "./studio-view-inspection-store";

export const STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT =
  "toonspectrum:studio-shell-floating-layout-open";

function requestStudioShellFloatingLayoutManagerOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT));
}

const STUDIO_PLATFORM_CANVAS_MENU_ITEMS = [
  { id: "new-webtoon-vertical", commandId: "canvas.new-webtoon-vertical", presetId: "webtoon-vertical" },
  { id: "new-webtoon-naver", commandId: "canvas.new-webtoon-naver", presetId: "webtoon-naver" },
  { id: "new-webtoon-kakao", commandId: "canvas.new-webtoon-kakao", presetId: "webtoon-kakao" },
  { id: "new-webtoon-canvas", commandId: "canvas.new-webtoon-canvas", presetId: "webtoon-canvas" },
] as const satisfies readonly {
  readonly id: string;
  readonly commandId: string;
  readonly presetId: StudioWebtoonCanvasPresetId;
}[];

/** View ▸ Navigator and View ▸ Reference Overlay (밑그림 underlay). */
export function buildStudioViewSurfaceMenuItems({
  ui,
}: StudioMainMenuItemContext): StudioMainMenuItem[] {
  return [
    {
      id: "floating-layout",
      commandId: "view.floating-layout",
      label: "플로팅 UI · 배치 설정…",
      labelEn: "Floating UI · layout settings…",
      icon: SlidersHorizontal,
      separatorAfter: true,
      onSelect: requestStudioShellFloatingLayoutManagerOpen,
    },
    {
      id: "navigator",
      commandId: "view.navigator",
      label: "미니맵 · 탐색",
      icon: Compass,
      onSelect: () => {
        openStudioViewInspectionPanel();
        ui.openCanvasNavigator();
      },
    },
    {
      id: "underlay",
      commandId: "view.underlay",
      label: "밑그림 오버레이 (이메레스)",
      icon: Stamp,
      onSelect: () => {
        ui.openStudioMenu("emeres");
      },
    },
  ];
}

/** Canvas ▸ 크기·해상도 and Canvas ▸ 그리드. */
export function buildStudioCanvasSurfaceMenuItems({
  state,
  ui,
}: StudioMainMenuItemContext): StudioMainMenuItem[] {
  const platformCanvasItems: StudioMainMenuItem[] = STUDIO_PLATFORM_CANVAS_MENU_ITEMS.flatMap(
    (item, index) => {
      const preset = STUDIO_WEBTOON_CANVAS_PRESETS.find((candidate) => candidate.id === item.presetId);
      if (!preset) return [];
      return [{
        id: item.id,
        commandId: item.commandId,
        label: `새 캔버스 · ${preset.labelKo}`,
        labelEn: `New canvas · ${preset.labelEn}`,
        icon: FilePlus2,
        separatorAfter: index === STUDIO_PLATFORM_CANVAS_MENU_ITEMS.length - 1,
        onSelect: () => {
          ui.openQuickStart(preset.id);
        },
      }];
    },
  );
  return [
    {
      id: "canvas-settings",
      commandId: "canvas.document-settings",
      label: "캔버스 크기 · 문서 설정…",
      labelEn: "Canvas size · document settings…",
      icon: Ruler,
      onSelect: () => {
        ui.openCanvasSettings();
      },
    },
    {
      id: "webtoon-guides",
      commandId: "canvas.webtoon-guides",
      label: "웹툰 플랫폼 규격 가이드",
      labelEn: "Webtoon platform width guides",
      icon: Smartphone,
      checked: state.webtoonGuidesVisible,
      selectionRole: "checkbox",
      onSelect: () => {
        ui.toggleWebtoonGuides();
      },
    },
    {
      id: "grid",
      commandId: "canvas.grid",
      label: "그리드",
      labelEn: "Grid",
      icon: Grid3x3,
      checked: state.canvasGridVisible,
      selectionRole: "checkbox",
      separatorAfter: true,
      onSelect: () => {
        ui.toggleCanvasGrid();
      },
    },
    ...platformCanvasItems,
    {
      id: "sticky-note",
      commandId: "canvas.sticky-note",
      label: "스티키 노트",
      labelEn: "Sticky note",
      icon: StickyNote,
      onSelect: () => {
        ui.insertDefaultStickyNote();
      },
    },
  ];
}

/** Vector ▸ Vector Eraser. The chip only exists while the eraser is already armed. */
export function buildStudioVectorEraserMenuItems({
  state,
  ui,
}: StudioMainMenuItemContext): StudioMainMenuItem[] {
  return [
    {
      id: "erase-to-intersection",
      commandId: "vector.erase-to-intersection",
      label: "교차점까지 지우기",
      icon: Eraser,
      checked: state.vectorEraseToIntersection,
      selectionRole: "checkbox",
      onSelect: () => {
        ui.toggleVectorEraseToIntersection();
      },
    },
  ];
}

/**
 * Text ▸ Dialogue Link and Text ▸ Localization Layout (translate + 현지화 QA).
 *
 * 현지화 QA is the same translate panel opened straight onto its report screen
 * (말풍선 넘침·영문 문체·MQM 점수), so the row is a second door onto one surface —
 * `openLocalizationQa` sets the host's translate surface to `"qa"`.
 */
export function buildStudioDialogueMenuItems({
  ui,
}: StudioMainMenuItemContext): StudioMainMenuItem[] {
  return [
    {
      id: "dialogue-batch",
      commandId: "text.dialogue-batch",
      label: "대사 일괄 편집…",
      icon: MessageSquare,
      onSelect: () => {
        ui.openDialogueBatch();
      },
    },
    {
      id: "dialogue-translate",
      commandId: "text.dialogue-translate",
      label: "대사 번역 · 다국어…",
      icon: Languages,
      onSelect: () => {
        ui.openDialogueTranslate();
      },
    },
    {
      id: "localization-qa",
      commandId: "text.localization-qa",
      label: "현지화 QA · 넘침·문체 검사…",
      icon: ScanText,
      onSelect: () => {
        ui.openLocalizationQa();
      },
    },
  ];
}
