/**
 * §15.3 artwork groups — Select, Layer, Brush.
 *
 * These three are the groups the UX audit called out as structurally missing
 * (`docs/rewrite/ux-audit-v5.md` §2.7): selection and layer commands used to be
 * buried inside Edit, and drawing lived in a product-only `그리기` group. Every
 * relocated item keeps its original handler and carries `legacyPath` so locale
 * keys and disabled-reason copy do not move with it.
 */

import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Crop,
  Eraser,
  ImagePlus,
  Lasso,
  Layers,
  LayoutGrid,
  Mountain,
  PaintBucket,
  Palette,
  Pencil,
  Shapes,
  X,
} from "lucide-react";

import { STUDIO_EDIT_MENU_COMMANDS } from "./studio-edit-controls";

import type { StudioMainMenuItemContext } from "./studio-main-menu-contract";
import type { StudioMainMenuItem } from "./studio-main-menu-model";

/** Select — lifted out of Edit. §15.3 Select. */
export function buildStudioSelectMenuItems({
  state,
  editor,
}: StudioMainMenuItemContext): StudioMainMenuItem[] {
  return [
    {
      ...STUDIO_EDIT_MENU_COMMANDS["select-all"],
      commandId: "select.all",
      legacyPath: "edit/select-all",
      icon: LayoutGrid,
      disabled: state.edit.selectAllDisabled,
      onSelect: () => {
        editor.selectAll();
      },
    },
    {
      ...STUDIO_EDIT_MENU_COMMANDS.deselect,
      commandId: "select.deselect",
      legacyPath: "edit/deselect",
      icon: X,
      disabled: state.edit.deselectDisabled,
      onSelect: () => {
        editor.deselect();
      },
    },
    {
      ...STUDIO_EDIT_MENU_COMMANDS["invert-selection"],
      commandId: "select.invert",
      legacyPath: "edit/invert-selection",
      icon: Lasso,
      disabled: state.edit.invertSelectionDisabled,
      onSelect: () => {
        editor.invertSelection();
      },
    },
  ];
}

/**
 * Layer — order commands and the layer-scoped crop lifted out of Edit, raster
 * insert lifted out of Insert, local visibility reset lifted out of View.
 */
export function buildStudioLayerMenuItems({
  state,
  editor,
  ui,
}: StudioMainMenuItemContext): StudioMainMenuItem[] {
  return [
    {
      id: "image",
      commandId: "insert.image",
      legacyPath: "insert/image",
      label: "이미지…",
      icon: ImagePlus,
      separatorAfter: true,
      onSelect: () => {
        ui.requestImageInsert();
      },
    },
    {
      ...STUDIO_EDIT_MENU_COMMANDS["bring-front"],
      commandId: "layer.bring-front",
      legacyPath: "edit/bring-front",
      icon: ArrowUpToLine,
      disabled: state.edit.reorderDisabled,
      onSelect: () => {
        editor.reorder("front");
      },
    },
    {
      ...STUDIO_EDIT_MENU_COMMANDS["bring-forward"],
      commandId: "layer.bring-forward",
      legacyPath: "edit/bring-forward",
      icon: ChevronUp,
      disabled: state.edit.reorderDisabled,
      onSelect: () => {
        editor.reorder("forward");
      },
    },
    {
      ...STUDIO_EDIT_MENU_COMMANDS["send-back"],
      commandId: "layer.send-back",
      legacyPath: "edit/send-back",
      icon: ArrowDownToLine,
      disabled: state.edit.reorderDisabled,
      onSelect: () => {
        editor.reorder("back");
      },
    },
    {
      ...STUDIO_EDIT_MENU_COMMANDS["send-backward"],
      commandId: "layer.send-backward",
      legacyPath: "edit/send-backward",
      icon: ChevronDown,
      disabled: state.edit.reorderDisabled,
      separatorAfter: true,
      onSelect: () => {
        editor.reorder("backward");
      },
    },
    {
      ...STUDIO_EDIT_MENU_COMMANDS["crop-layer"],
      commandId: "edit.crop-layer",
      legacyPath: "edit/crop-layer",
      icon: Crop,
      disabled: state.edit.cropLayerDisabled,
      separatorAfter: true,
      onSelect: () => {
        editor.openSelectedLayerCrop();
      },
    },
    {
      id: "reset-local-visibility",
      commandId: "layer.show-locally-hidden",
      legacyPath: "view/reset-local-visibility",
      label: "나만 숨긴 레이어 모두 표시",
      icon: Layers,
      disabled: !state.hasLocallyHiddenLayers,
      onSelect: () => {
        editor.showAllLocallyHiddenLayers();
      },
    },
  ];
}

/**
 * Brush — the former `그리기` group. The group id becomes `brush` to match
 * §15.3; the Korean label and its locale key stay put (see the spec table's
 * `labelKey`), so shipped translations keep resolving.
 */
export function buildStudioBrushMenuItems({
  editor,
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
      id: "bg",
      commandId: "brush.background-tone",
      legacyPath: "draw/bg",
      label: "배경 · 톤",
      icon: Mountain,
      onSelect: () => {
        ui.openStudioMenu("bgFill");
      },
    },
    {
      id: "style",
      commandId: "brush.palette-brand",
      legacyPath: "draw/style",
      label: "팔레트 · 브랜드",
      icon: Palette,
      onSelect: () => {
        ui.openStudioMenu("palette");
      },
    },
  ];
}
