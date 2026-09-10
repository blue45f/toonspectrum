/**
 * Drawing and brush commands.
 *
 * The underlying editor surfaces remain compatible, but the user-facing model is intentionally
 * reduced to three concepts: choose a brush, edit the current brush, or create a new brush.
 * Saved/imported/natural-media capabilities are projections of that same system rather than
 * separate products.
 */

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
  Sparkles,
  Upload,
  Wind,
} from "lucide-react";

import type { StudioMainMenuItemContext } from "./studio-main-menu-contract";
import type { StudioMainMenuItem } from "./studio-main-menu-model";

/** Keep the current document/remix context when moving into the full Brush Editor workspace. */
export function studioBrushLabHref(pathname: string): string {
  const work = /^\/studio\/work\/([^/]+)/u.exec(pathname);
  if (work?.[1]) return `/studio/work/${work[1]}/brush-lab`;
  const remix = /^\/studio\/remix\/([^/]+)/u.exec(pathname);
  if (remix?.[1]) return `/studio/remix/${remix[1]}/brush-lab`;
  return "/studio/assets/brushes/new";
}

function openGuidedBrushEditor(): void {
  const location = globalThis.location;
  if (!location) return;
  location.assign(studioBrushLabHref(location.pathname));
}

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
      label: "펜",
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
      label: "지우개",
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
      label: "채우기",
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
      label: "스마트 도형",
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
        : "다듬을 수 있는 선을 먼저 그려 주세요.",
      onSelect: () => { ui.correctCurrentStroke?.(); },
    },
    {
      id: "preset-browser",
      commandId: "brush.preset-browser",
      label: "브러시 선택…",
      icon: LibraryBig,
      onSelect: () => {
        ui.openBrushPresetBrowser();
      },
    },
    {
      id: "brush-studio",
      commandId: "brush.studio",
      label: "현재 브러시 설정…",
      icon: SlidersHorizontal,
      onSelect: () => {
        ui.openBrushStudio();
      },
    },
    {
      id: "brush-lab",
      commandId: "brush.lab",
      searchActivation: "execute",
      label: "새 브러시 만들기…",
      icon: Sparkles,
      onSelect: openGuidedBrushEditor,
    },
    {
      id: "natural-media",
      commandId: "brush.natural-media",
      label: "자연 매체 설정…",
      icon: Droplets,
      onSelect: () => {
        ui.openNaturalMediaBrushes();
      },
    },
    {
      id: "my-brushes",
      commandId: "brush.saved-library",
      label: "브러시 관리…",
      icon: BookMarked,
      onSelect: () => {
        ui.openBrushLibrary();
      },
    },
    {
      id: "import-pack",
      commandId: "brush.import-pack",
      label: "브러시 가져오기 (ABR · MYB · KPP)…",
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
      label: "배경·톤 열기",
      icon: Mountain,
      onSelect: () => {
        ui.openStudioMenu("bgFill");
      },
    },
    {
      id: "style",
      commandId: "brush.palette-brand",
      legacyPath: "draw/style",
      label: "작품 팔레트",
      icon: Palette,
      separatorAfter: true,
      onSelect: () => {
        ui.openStudioMenu("palette");
      },
    },
    {
      id: "pixel-art",
      commandId: "brush.pixel-art",
      label: state.pixelArtEnabled ? "픽셀 아트 끄기" : "픽셀 아트",
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
      label: "대칭 그리기",
      icon: Wind,
      onSelect: () => {
        ui.enableSilkSymmetry();
      },
    },
  ];
}
