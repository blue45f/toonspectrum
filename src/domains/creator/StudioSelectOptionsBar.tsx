/**
 * Select tool options strip — Photoshop / CSP / Magma context actions when elements are selected.
 */
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Lock,
  LockOpen,
  Trash2,
  type LucideIcon,
} from "lucide-react";

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
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[0.68rem] font-semibold",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        danger
          ? "border-bad/35 bg-bad/10 text-bad hover:bg-bad/15"
          : "border-line/70 bg-card/95 text-fg-2 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.05)] hover:border-line hover:bg-raised hover:text-fg"
      )}
    >
      <span
        className={cn(
          "grid size-5 place-items-center rounded-md",
          danger ? "bg-bad/15" : "bg-canvas/60 text-fg-2"
        )}
      >
        <Icon size={13} strokeWidth={1.75} aria-hidden />
      </span>
      {label}
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
  return (
    <div
      role="toolbar"
      aria-label="선택 옵션"
      data-studio-select-options="true"
      className={cn(
        "relative z-[40] flex h-11 min-h-11 shrink-0 flex-nowrap items-center gap-2 overflow-x-auto border-b border-line px-3",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      <span
        data-studio-selection-badge="true"
        className={cn(
          "mr-0.5 inline-flex max-w-[14rem] items-center gap-2 truncate rounded-xl border border-accent/35",
          "bg-[linear-gradient(135deg,oklch(0.72_0.185_42/0.16),oklch(0.2_0.01_66/0.55))] px-2.5 py-1.5",
          "text-[0.7rem] font-bold tracking-tight text-fg shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.08)]"
        )}
      >
        <span
          aria-hidden
          className="grid size-5 shrink-0 place-items-center rounded-md bg-accent text-[0.6rem] font-black text-on-accent"
        >
          {selectionCount > 9 ? "9+" : selectionCount}
        </span>
        <span className="min-w-0 truncate">
          {selectionCount > 1 ? `${selectionCount}개 선택` : selectionLabel ?? "선택됨"}
        </span>
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
