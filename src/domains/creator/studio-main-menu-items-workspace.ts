/**
 * §15.3 workspace groups — Window and Help.
 *
 * Window collects the panel/density/companion toggles that used to be mixed into
 * `보기`, plus the asset and reference entry points from `삽입`. Help keeps the
 * two rows it already had, including the locale-probe fallback that shipped with
 * the group.
 */

import {
  BookOpen,
  Command,
  LayoutGrid,
  LayoutTemplate,
  Layers,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Settings2,
  SlidersHorizontal,
  Square,
} from "lucide-react";

import type { StudioMainMenuItemContext } from "./studio-main-menu-contract";
import type { StudioMainMenuItem } from "./studio-main-menu-model";

export function buildStudioWindowMenuItems({
  state,
  editor,
  ui,
}: StudioMainMenuItemContext): StudioMainMenuItem[] {
  return [
    {
      id: "density-focus",
      commandId: "window.density-focus",
      legacyPath: "view/density-focus",
      label: "슈퍼심플 레이아웃",
      icon: Minimize2,
      onSelect: () => {
        editor.setStudioUiDensity("focus");
        ui.collapseSidePanels();
      },
    },
    {
      id: "density-full",
      commandId: "window.density-full",
      legacyPath: "view/density-full",
      label: "전체 레이아웃",
      icon: LayoutGrid,
      separatorAfter: true,
      onSelect: () => {
        editor.setStudioUiDensity("full");
      },
    },
    {
      id: "left-panel",
      commandId: "window.left-panel",
      legacyPath: "view/left-panel",
      label: state.leftPanelOpen ? "왼쪽 패널 숨기기" : "왼쪽 패널 보이기",
      icon: Layers,
      onSelect: () => {
        ui.toggleLeftPanel();
      },
    },
    {
      id: "right-panel",
      commandId: "window.right-panel",
      legacyPath: "view/right-panel",
      label: state.rightPanelOpen ? "속성 패널 숨기기" : "속성 패널 보이기",
      icon: SlidersHorizontal,
      onSelect: () => {
        ui.toggleRightPanel();
      },
    },
    {
      id: "wide",
      commandId: "window.collapse-side-panels",
      legacyPath: "view/wide",
      label: "패널 접어 넓게",
      icon: Maximize2,
      onSelect: () => {
        ui.collapseSidePanels();
      },
    },
    {
      id: "canvas-only",
      commandId: "window.canvas-only",
      legacyPath: "view/canvas-only",
      label: "캔버스만",
      icon: Square,
      shortcut: "`",
      separatorAfter: true,
      onSelect: () => {
        editor.enterCanvasOnlyMode();
      },
    },
    {
      id: "quick-access-palette",
      commandId: "window.quick-access-palette",
      legacyPath: "view/quick-access-palette",
      label: state.quickAccessPaletteLoading
        ? "빠른 액세스 불러오는 중…"
        : state.quickAccessPaletteOpen
          ? "빠른 액세스 팔레트 숨기기"
          : "빠른 액세스 팔레트 표시",
      icon: Command,
      shortcut: "⇧Q",
      checked: state.quickAccessPaletteOpen,
      disabled: state.quickAccessPaletteLoading,
      separatorAfter: true,
      onSelect: ui.toggleQuickAccessPalette,
    },
    {
      id: "template",
      commandId: "insert.template",
      legacyPath: "insert/template",
      label: "템플릿 · 에셋",
      icon: LayoutTemplate,
      onSelect: () => {
        ui.openAssetMenu();
      },
    },
    {
      id: "ref",
      commandId: "insert.reference-image",
      legacyPath: "insert/ref",
      label: "참고 이미지",
      icon: PictureInPicture2,
      onSelect: () => {
        ui.openReferencePanel();
      },
    },
    {
      id: "reference-window",
      commandId: "window.reference-panel",
      legacyPath: "view/reference-window",
      label: "참고 이미지 창 열기",
      icon: PictureInPicture2,
      checked: state.referencePanelOpen,
      separatorAfter: true,
      onSelect: () => {
        ui.toggleReferencePanel();
      },
    },
    {
      id: "tools-companion",
      commandId: "window.tools-companion",
      legacyPath: "view/tools-companion",
      label: "멀티 디스플레이 작업공간…",
      icon: PictureInPicture2,
      separatorAfter: true,
      onSelect: () => {
        ui.openToolsCompanion();
      },
    },
    {
      // Second entry point to the same dialog as Edit ▸ Preferences. Kept because
      // Wave C only relocates; the id is qualified so menu item ids stay globally
      // unique (audit finding `menu-item-id-collision`).
      id: "app-settings-window",
      commandId: "window.app-settings",
      legacyPath: "view/app-settings",
      label: "애플리케이션 설정",
      icon: Settings2,
      onSelect: () => {
        ui.openAppSettings();
      },
    },
  ];
}

export interface StudioHelpMenuItemsInput extends StudioMainMenuItemContext {
  /** "도움말" when the active locale pack is Korean, otherwise "Help". */
  readonly helpGroupLabel: string;
}

export function buildStudioHelpMenuItems({
  editor,
  ui,
  helpGroupLabel,
}: StudioHelpMenuItemsInput): StudioMainMenuItem[] {
  const korean = helpGroupLabel === "도움말";
  return [
    {
      id: "feature-tutorials",
      commandId: "help.feature-tutorials",
      label: "사용법 · 기능 튜토리얼",
      ...(korean ? {} : { labelKey: "studio.mainMenu.item.view.feature-tutorials" }),
      icon: BookOpen,
      onSelect: () => {
        editor.openFeatureTutorial();
      },
    },
    {
      id: "shortcuts",
      commandId: "help.shortcuts",
      label: "단축키 · 기본 조작",
      ...(korean ? {} : { labelKey: "studio.mainMenu.item.view.shortcuts" }),
      icon: Command,
      shortcut: "?",
      onSelect: () => {
        ui.openShortcuts();
      },
    },
  ];
}
