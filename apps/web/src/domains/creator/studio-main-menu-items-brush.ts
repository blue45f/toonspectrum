/** Brush menu — plain task language first, specialist vocabulary remains searchable. */

import {
  BookMarked,
  Droplets,
  Eraser,
  Grid2x2,
  LibraryBig,
  Mountain,
  PaintBucket,
  Palette,
  Pencil,
  Shapes,
  SlidersHorizontal,
  Upload,
  Wind,
} from "lucide-react";

import type { StudioMainMenuItemContext } from "./studio-main-menu-contract";
import type { StudioMainMenuItem } from "./studio-main-menu-model";

export function buildStudioBrushMenuItems({
  editor,
  state,
  ui,
}: StudioMainMenuItemContext): StudioMainMenuItem[] {
  return [
    {
      id: "pen",
      commandId: "tool.pen",
      legacyPath: "draw/pen",
      label: "펜으로 그리기",
      icon: Pencil,
      shortcut: "B",
      onSelect: () => {
        ui.selectDrawMode("pen");
      },
    },
    {
      id: "eraser",
      commandId: "tool.eraser",
      legacyPath: "draw/eraser",
      label: "지우기",
      icon: Eraser,
      shortcut: "E",
      onSelect: () => {
        ui.selectDrawMode("eraser");
      },
    },
    {
      id: "fill",
      commandId: "tool.fill",
      legacyPath: "draw/fill",
      label: "영역에 색 채우기",
      icon: PaintBucket,
      shortcut: "G",
      onSelect: () => {
        editor.toggleAdvancedFill();
      },
    },
    {
      id: "smart-shape",
      commandId: "tool.smart-shape",
      legacyPath: "draw/smart-shape",
      label: "도형 그리기",
      icon: Shapes,
      separatorAfter: true,
      onSelect: () => {
        ui.enableSmartShape();
      },
    },
    {
      id: "correct-current-stroke",
      commandId: "brush.correct-current-stroke",
      searchActivation: "execute",
      shortcut: "⌥⇧Q",
      label: "방금 그린 선 다듬기…",
      icon: Shapes,
      disabled: !ui.correctCurrentStroke,
      unavailableReason: ui.correctCurrentStroke
        ? undefined
        : "다듬을 수 있는 최근 선이 없거나 선 편집기가 준비되지 않았어요.",
      onSelect: () => { ui.correctCurrentStroke?.(); },
    },
    {
      id: "preset-browser",
      commandId: "brush.preset-browser",
      label: "브러시 고르기…",
      icon: LibraryBig,
      onSelect: () => {
        ui.openBrushPresetBrowser();
      },
    },
    {
      id: "brush-studio",
      commandId: "brush.studio",
      label: "현재 브러시 세부 설정…",
      icon: SlidersHorizontal,
      onSelect: () => {
        ui.openBrushStudio();
      },
    },
    {
      id: "natural-media",
      commandId: "brush.natural-media",
      label: "수채·유화·자연 질감…",
      icon: Droplets,
      onSelect: () => {
        ui.openNaturalMediaBrushes();
      },
    },
    {
      id: "my-brushes",
      commandId: "brush.saved-library",
      label: "저장한 내 브러시…",
      icon: BookMarked,
      onSelect: () => {
        ui.openBrushLibrary();
      },
    },
    {
      id: "import-pack",
      commandId: "brush.import-pack",
      label: "외부 브러시 가져오기…",
      icon: Upload,
      separatorAfter: true,
      onSelect: () => {
        ui.requestBrushPackImport();
      },
    },
    {
      id: "bg",
      commandId: "brush.background-tone",
      legacyPath: "draw/bg",
      label: "배경·톤 만들기",
      icon: Mountain,
      onSelect: () => {
        ui.openStudioMenu("bgFill");
      },
    },
    {
      id: "style",
      commandId: "brush.palette-brand",
      legacyPath: "draw/style",
      label: "색상 팔레트·브랜드 스타일",
      icon: Palette,
      separatorAfter: true,
      onSelect: () => {
        ui.openStudioMenu("palette");
      },
    },
    {
      id: "pixel-art",
      commandId: "brush.pixel-art",
      label: state.pixelArtEnabled ? "픽셀 그리기 끄기" : "픽셀 단위로 그리기",
      icon: Grid2x2,
      checked: state.pixelArtEnabled,
      selectionRole: "checkbox",
      onSelect: () => {
        ui.togglePixelArtMode();
      },
    },
    {
      id: "silk-flow",
      commandId: "brush.silk-flow",
      label: "대칭으로 그리기",
      icon: Wind,
      onSelect: () => {
        ui.enableSilkSymmetry();
      },
    },
  ];
}
