/**
 * §15.3 Select — the selection *tools*, as opposed to Select All / Deselect.
 *
 * The regroup audit measured this group at 0 of 7 rows and noted the reason:
 * "선택 도구는 왼쪽 툴레일에만 있다". That was only half true. The rail carries
 * three of them (사각 M, 원형 ⇧M, 올가미 L — and the lasso button *cycles* into
 * the polygon variant rather than naming it), while 다각형·자동 선택·색 범위 have
 * no rail button at all and live behind the inspector's pixel-selection launcher,
 * and 퀵 마스크 is reachable only by pressing `Q` — a chord `view.color-vision-
 * grayscale` also claims (conflict `q-quickmask-vs-grayscale`).
 *
 * So every row below is a door onto `activatePixelSelectionToolFromInspector`,
 * the single host function the rail, the launcher and the shortcuts all already
 * funnel into. Nothing new is armed, disarmed or invented here; the menu simply
 * stops being the one surface that cannot reach a selection tool.
 *
 * Rows §15.3 asks for that the product genuinely lacks — Semantic/Object Select,
 * Expand/Shrink/Feather/Smooth as commands, Save Selection, Selection HUD — stay
 * recorded as gaps in `studio-main-menu-group-spec.ts` rather than faked.
 */

import { Circle, Contrast, Lasso, Pipette, Spline, SquareDashed, Wand2 } from "lucide-react";

import type { StudioMainMenuItemContext } from "./studio-main-menu-contract";
import type { StudioMainMenuItem } from "./studio-main-menu-model";
import type { StudioPixelSelectionToolId } from "./studio-main-menu-surface-contract";

interface SelectToolRow {
  readonly id: string;
  readonly commandId: string;
  readonly tool: StudioPixelSelectionToolId;
  readonly label: string;
  readonly icon: StudioMainMenuItem["icon"];
  readonly shortcut?: string;
  readonly separatorAfter?: boolean;
}

/** Declaration order is the menubar order; ids are globally unique. */
const SELECT_TOOL_ROWS: readonly SelectToolRow[] = [
  {
    id: "marquee-rect",
    commandId: "tool.marquee-rect",
    tool: "rect",
    label: "사각 선택",
    icon: SquareDashed,
    shortcut: "M",
  },
  {
    id: "marquee-ellipse",
    commandId: "tool.marquee-ellipse",
    tool: "circle",
    label: "원형 선택",
    icon: Circle,
    shortcut: "⇧M",
  },
  {
    id: "lasso",
    commandId: "tool.lasso",
    tool: "lasso",
    label: "올가미",
    icon: Lasso,
    shortcut: "L",
  },
  {
    id: "poly-lasso",
    commandId: "tool.poly-lasso",
    tool: "poly-lasso",
    label: "다각형 올가미",
    icon: Spline,
    separatorAfter: true,
  },
  {
    id: "magic-wand",
    commandId: "tool.magic-wand",
    tool: "wand",
    label: "자동 선택 (마술봉)",
    icon: Wand2,
  },
  {
    id: "color-range",
    commandId: "tool.color-range",
    tool: "color-range",
    label: "색 범위 선택",
    icon: Pipette,
    separatorAfter: true,
  },
];

/**
 * Select tool rows. Radio semantics: arming one disarms the rest, and picking the
 * armed one again turns it off — the host's own toggle behaviour, surfaced.
 */
export function buildStudioSelectToolMenuItems({
  state,
  ui,
}: StudioMainMenuItemContext): StudioMainMenuItem[] {
  const items: StudioMainMenuItem[] = SELECT_TOOL_ROWS.map((row) => ({
    id: row.id,
    commandId: row.commandId,
    label: row.label,
    icon: row.icon,
    ...(row.shortcut === undefined ? {} : { shortcut: row.shortcut }),
    checked: state.pixelSelectionTool === row.tool,
    selectionRole: "radio" as const,
    ...(row.separatorAfter === undefined ? {} : { separatorAfter: row.separatorAfter }),
    onSelect: () => {
      ui.activatePixelSelectionTool(row.tool);
    },
  }));

  items.push({
    id: "quick-mask",
    commandId: "select.quick-mask",
    label: state.quickMaskActive ? "퀵 마스크 끝내고 선택 만들기" : "퀵 마스크로 칠하기",
    icon: Contrast,
    shortcut: "Q",
    checked: state.quickMaskActive,
    selectionRole: "checkbox",
    separatorAfter: true,
    onSelect: () => {
      if (state.quickMaskActive) ui.commitQuickMask();
      else ui.enterQuickMask();
    },
  });

  return items;
}
