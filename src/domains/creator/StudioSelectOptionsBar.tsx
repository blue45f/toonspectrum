/**
 * Select tool options strip — Photoshop/CSP context actions when elements are selected.
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
        "inline-flex h-8 items-center gap-1.5 rounded-xl border border-line/80 bg-card/90 px-2.5 text-[0.68rem] font-semibold",
        STUDIO_EASE,
        STUDIO_FOCUS_RING,
        danger
          ? "text-bad hover:bg-bad/10"
          : "text-fg-2 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.04)] hover:bg-raised hover:text-fg"
      )}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
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
        "flex h-11 min-h-11 shrink-0 flex-nowrap items-center gap-2 overflow-x-auto border-b border-line px-3",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      <span className="mr-1 max-w-[12rem] truncate rounded-xl border border-line/60 bg-card/70 px-2.5 py-1.5 text-[0.7rem] font-semibold tracking-tight text-fg shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.05)]">
        {selectionCount > 1 ? `${selectionCount}개 선택` : selectionLabel ?? "선택됨"}
      </span>
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
      <Action icon={Trash2} label="삭제" danger onClick={onDelete} />
    </div>
  );
}
