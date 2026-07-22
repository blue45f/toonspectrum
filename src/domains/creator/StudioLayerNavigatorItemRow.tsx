import {
  Check,
  CircleDot,
  Eye,
  EyeOff,
  Film,
  Ghost,
  Grid2X2,
  Layers3,
  Lock,
  MoreHorizontal,
  ScanLine,
  Sparkles,
} from "lucide-react";
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import {
  STUDIO_LAYER_COLOR_LABELS,
  STUDIO_LAYER_KIND_LABELS,
  STUDIO_LAYER_ROLE_LABELS,
  type StudioLayerColor,
  type StudioLayerKind,
  type StudioLayerNavigatorItem,
} from "./studio-layer-navigator";
import {
  STUDIO_LAYER_NAVIGATOR_COARSE_TARGET,
  STUDIO_LAYER_NAVIGATOR_FOCUS_RING,
  STUDIO_LAYER_NAVIGATOR_KIND_ICONS,
} from "./studio-layer-navigator-row-ui";

import { cn } from "@/lib/utils";

const COLOR_DOT_CLASS: Record<StudioLayerColor, string> = {
  red: "bg-bad",
  orange: "bg-accent",
  yellow: "bg-warning",
  green: "bg-good",
  blue: "bg-cool",
  violet: "bg-[oklch(0.68_0.18_312)]",
};

export interface LayerNavigatorRowHandlers {
  onRowFocus: (key: string) => void;
  onRowKeyDown: (event: ReactKeyboardEvent<HTMLElement>, key: string) => void;
  onRowClick: (event: ReactMouseEvent<HTMLElement>, itemId: string) => void;
  onRowDoubleClick: (
    event: ReactMouseEvent<HTMLElement>,
    itemId: string,
    label: string
  ) => void;
  onToggleItemHidden: (itemId: string, hidden: boolean) => void;
  onOpenItemActionMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    itemId: string
  ) => void;
  registerRowRef: (key: string, node: HTMLElement | null) => void;
}

export interface StudioLayerNavigatorItemRowProps {
  item: StudioLayerNavigatorItem;
  rowKey: string;
  level: number;
  kind: Exclude<StudioLayerKind, "all">;
  groupName: string | null;
  effectivelyHidden: boolean;
  locallyHidden: boolean;
  effectivelyLocked: boolean;
  statusLabel: string;
  selected: boolean;
  current: boolean;
  selectionCount: number;
  tabStop: boolean;
  renameInput: ReactNode | null;
  mobileMultiSelect: boolean;
  readOnly: boolean;
  hiddenByGroup: boolean;
  actionOpen: boolean;
  actionPopoverId: string;
  stableHandlers: LayerNavigatorRowHandlers;
}

/**
 * A row stays memoized even when the parent rebuilds its result list. The parent passes only the
 * stable item reference, primitive projections, and an identity-stable handler bridge so a settled
 * document commit rerenders the rows that actually changed.
 */
export const StudioLayerNavigatorItemRow = memo(
  function StudioLayerNavigatorItemRow({
    item,
    rowKey,
    level,
    kind,
    groupName,
    effectivelyHidden,
    locallyHidden,
    effectivelyLocked,
    statusLabel,
    selected,
    current,
    selectionCount,
    tabStop,
    renameInput,
    mobileMultiSelect,
    readOnly,
    hiddenByGroup,
    actionOpen,
    actionPopoverId,
    stableHandlers,
  }: StudioLayerNavigatorItemRowProps) {
    const Icon = STUDIO_LAYER_NAVIGATOR_KIND_ICONS[kind];
    const displayedStatusLabel = [
      statusLabel || null,
      locallyHidden ? "나만 숨김" : null,
    ]
      .filter(Boolean)
      .join(", ");
    const accessibleMetadata = [
      current ? "현재 작업 레이어" : selected ? "다중 선택됨" : null,
      STUDIO_LAYER_KIND_LABELS[kind],
      groupName ? `그룹 ${groupName}` : null,
      item.role ? `역할 ${STUDIO_LAYER_ROLE_LABELS[item.role]}` : null,
      item.color ? `색 라벨 ${STUDIO_LAYER_COLOR_LABELS[item.color]}` : null,
      displayedStatusLabel || null,
    ]
      .filter(Boolean)
      .join(", ");
    const visuallyHidden = effectivelyHidden || locallyHidden;
    const multipleSelection = selectionCount > 1;
    const selectionState = current ? "current" : selected ? "selected" : "none";

    return (
      <li role="none">
        <div
          id={`studio-layer-${item.id}`}
          ref={(node) => stableHandlers.registerRowRef(rowKey, node)}
          role="treeitem"
          aria-level={level}
          aria-selected={selected}
          aria-current={current ? "true" : undefined}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter Space F2 Shift+F10 Control+A Meta+A"
          aria-label={`${item.label}, ${accessibleMetadata}`}
          tabIndex={tabStop ? 0 : -1}
          onFocus={() => stableHandlers.onRowFocus(rowKey)}
          onKeyDown={(event) => stableHandlers.onRowKeyDown(event, rowKey)}
          onClick={(event) => stableHandlers.onRowClick(event, item.id)}
          onDoubleClick={(event) =>
            stableHandlers.onRowDoubleClick(event, item.id, item.label)
          }
          className={cn(
            "group/layer relative flex min-h-9 items-center gap-1 rounded-lg border px-1 py-0.5 text-left transition-[border-color,background-color,box-shadow] duration-150 [contain-intrinsic-size:44px] [content-visibility:auto] motion-reduce:transition-none max-lg:min-h-11 pointer-coarse:min-h-11",
            current
              ? "border-accent/75 bg-accent-soft/65 shadow-[inset_0_0_0_1px_oklch(0.72_0.185_42/0.18),0_1px_5px_oklch(0.1_0.01_60/0.18)]"
              : selected
                ? "border-accent/50 bg-accent-soft/35 shadow-[inset_0_0_0_1px_oklch(0.72_0.185_42/0.1)]"
              : "border-transparent hover:border-line/80 hover:bg-raised/60",
            STUDIO_LAYER_NAVIGATOR_FOCUS_RING
          )}
          data-studio-layer-row="true"
          data-studio-layer-selected={selected ? "true" : "false"}
          data-studio-layer-selection-state={selectionState}
          data-studio-layer-local-hidden={locallyHidden ? "true" : "false"}
        >
          <span
            aria-hidden
            data-studio-layer-selection-marker={selectionState}
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-md border transition-colors duration-150 motion-reduce:transition-none",
              current
                ? "border-accent bg-accent text-on-accent shadow-sm"
                : selected
                  ? "border-accent/80 bg-accent-soft text-accent"
                  : mobileMultiSelect || multipleSelection
                    ? "border-line-strong bg-card text-transparent"
                    : "border-transparent bg-transparent text-transparent group-hover/layer:border-line"
            )}
          >
            {current ? <CircleDot size={13} strokeWidth={2.25} /> : selected ? <Check size={13} strokeWidth={2.5} /> : null}
          </span>
          {item.color ? (
            <span
              aria-label={`색 라벨 ${STUDIO_LAYER_COLOR_LABELS[item.color]}`}
              className={cn(
                "h-5 w-1.5 shrink-0 rounded-full shadow-sm",
                COLOR_DOT_CLASS[item.color]
              )}
            />
          ) : null}
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg border border-line/50 bg-[linear-gradient(160deg,oklch(0.24_0.01_66),oklch(0.19_0.009_68))] text-fg-3 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.05)]",
              visuallyHidden && !selected && "text-fg-3",
              selected && "border-accent/35 text-accent"
            )}
            aria-hidden
          >
            <Icon size={13} strokeWidth={1.75} />
          </span>
          <span
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 px-0.5"
            )}
          >
            {renameInput ?? (
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[0.72rem] font-semibold",
                    selected ? "text-fg" : "text-fg-2",
                    item.hidden && "line-through decoration-fg-3/80"
                  )}
                >
                  {item.label}
                </span>
                <span className={cn(
                  "flex min-w-0 items-center gap-1 text-[0.68rem] lg:text-[0.58rem]",
                  selected ? "text-fg-2" : "text-fg-3"
                )}>
                  <span className="truncate">
                    {groupName ?? STUDIO_LAYER_KIND_LABELS[kind]}
                  </span>
                  {item.role ? (
                    <span className="shrink-0 rounded bg-raised px-1 py-0.5">
                      {STUDIO_LAYER_ROLE_LABELS[item.role]}
                    </span>
                  ) : null}
                </span>
              </span>
            )}
          </span>
          <span
            className="hidden shrink-0 items-center gap-0.5 min-[330px]:flex"
            aria-hidden
          >
            {locallyHidden ? <Ghost size={12} className="text-fg-3" /> : null}
            {effectivelyLocked ? <Lock size={12} className={selected ? "text-accent" : "text-fg-3"} /> : null}
            {item.fillReference ? (
              <ScanLine size={12} className="text-cool" />
            ) : null}
            {item.alphaLocked ? (
              <Grid2X2 size={12} className="text-accent" />
            ) : null}
            {item.masked ? (
              <Layers3
                size={12}
                className={
                  item.maskEnabled === false ? "text-fg-3/45" : "text-good"
                }
              />
            ) : null}
            {item.aiGenerated ? (
              <Sparkles size={12} className="text-accent" />
            ) : null}
            {item.animated ? <Film size={12} className="text-cool" /> : null}
          </span>
          <button
            type="button"
            tabIndex={-1}
            data-layer-row-control
            onClick={(event) => {
              event.stopPropagation();
              stableHandlers.onToggleItemHidden(item.id, !item.hidden);
            }}
            disabled={readOnly || hiddenByGroup}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded text-fg-3 transition-colors hover:bg-raised hover:text-fg disabled:opacity-35",
              STUDIO_LAYER_NAVIGATOR_COARSE_TARGET,
              STUDIO_LAYER_NAVIGATOR_FOCUS_RING
            )}
            aria-label={
              hiddenByGroup
                ? `${item.label}, 그룹에서 숨김`
                : item.hidden
                  ? `${item.label} 표시`
                  : `${item.label} 숨김`
            }
            title={
              hiddenByGroup
                ? "상위 그룹이 숨겨져 있어 그룹을 먼저 표시해야 해요"
                : undefined
            }
          >
            {effectivelyHidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            data-layer-row-control
            onClick={(event) => {
              event.stopPropagation();
              stableHandlers.onOpenItemActionMenu(event, item.id);
            }}
            aria-haspopup="dialog"
            aria-expanded={actionOpen}
            aria-controls={actionPopoverId}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded text-fg-3 transition-colors hover:bg-raised hover:text-fg",
              STUDIO_LAYER_NAVIGATOR_COARSE_TARGET,
              STUDIO_LAYER_NAVIGATOR_FOCUS_RING
            )}
            aria-label={`${item.label} 레이어 작업`}
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </li>
    );
  }
);
