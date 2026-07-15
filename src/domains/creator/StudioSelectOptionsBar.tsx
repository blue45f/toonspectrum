/**
 * Select tool options strip — Photoshop / CSP / Magma context actions when elements are selected.
 * Icon-first commercial chrome; labels live in title/aria.
 */
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Lock,
  LockOpen,
  MousePointer2,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import {
  studioSelectionBadgeText,
  studioSelectionCountChip,
} from "./studio-commercial-residuals";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";

import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

export interface StudioSelectOptionsBarProps {
  selectionLabel: string | null;
  selectionCount: number;
  locked?: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
  onToggleLock?: () => void;
  className?: string;
}

function Action({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  danger?: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "grid size-8 place-items-center rounded-xl border",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        danger
          ? "border-bad/35 bg-bad/10 text-bad hover:bg-bad/15"
          : "border-line/70 bg-card/95 text-fg-2 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.05)] hover:border-line hover:bg-raised hover:text-fg"
      )}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

export function StudioSelectOptionsBar({
  selectionLabel,
  selectionCount,
  locked = false,
  onDuplicate,
  onDelete,
  onBringFront,
  onSendBack,
  onToggleLock,
  className,
}: StudioSelectOptionsBarProps): ReactElement | null {
  if (selectionCount <= 0) return null;
  const badgeText = studioSelectionBadgeText(selectionCount, selectionLabel);
  const countChip = studioSelectionCountChip(selectionCount);
  return (
    <div
      role="toolbar"
      aria-label="선택 옵션"
      data-studio-select-options="true"
      data-studio-icon-first="true"
      className={cn(
        "relative z-[40] flex h-11 min-h-11 shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-line px-2.5",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      <span
        data-studio-selection-badge="true"
        title={selectionCount > 1 ? `${selectionCount}개 선택` : badgeText}
        className={cn(
          "mr-0.5 inline-flex max-w-[12rem] items-center gap-1.5 truncate rounded-xl border border-accent/35",
          "bg-[linear-gradient(135deg,oklch(0.72_0.185_42/0.16),oklch(0.2_0.01_66/0.55))] px-2 py-1",
          "text-[0.68rem] font-bold tracking-tight text-fg shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.08)]"
        )}
      >
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-on-accent"
        >
          {selectionCount > 1 ? (
            <span className="text-[0.58rem] font-black tabular-nums">{countChip}</span>
          ) : (
            <MousePointer2 size={12} strokeWidth={1.75} />
          )}
        </span>
        {selectionCount === 1 ? (
          <span className="min-w-0 truncate">{badgeText}</span>
        ) : (
          <span className="sr-only">{selectionCount}개 선택</span>
        )}
      </span>
      <div className="studio-opt-cluster flex shrink-0 items-center gap-0.5">
        <Action icon={Copy} label="복제" onClick={onDuplicate} />
        <Action icon={ArrowUpToLine} label="맨 앞" onClick={onBringFront} />
        <Action icon={ArrowDownToLine} label="맨 뒤" onClick={onSendBack} />
        {onToggleLock ? (
          <Action
            icon={locked ? LockOpen : Lock}
            label={locked ? "잠금 해제" : "잠금"}
            onClick={onToggleLock}
          />
        ) : null}
      </div>
      <Action icon={Trash2} label="삭제" danger onClick={onDelete} />
    </div>
  );
}
