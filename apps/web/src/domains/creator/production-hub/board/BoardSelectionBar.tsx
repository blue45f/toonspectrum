import { useId } from "react";

import type { ProductionTask, ProductionTaskStatus } from "@toonstudio/core/production";

import { productionText, useProductionCopy } from "../production-workboard-copy";
import { BOARD_MOVE_TARGETS, boardStatusLabel } from "../production-workboard-model";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const FIELD =
  "min-h-11 min-w-0 rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

interface Props {
  readonly visible: readonly ProductionTask[];
  readonly selectedIds: readonly string[];
  readonly canBulkEdit: boolean;
  readonly busy: boolean;
  readonly target: ProductionTaskStatus;
  readonly onTargetChange: (status: ProductionTaskStatus) => void;
  readonly onSelectAll: () => void;
  readonly onClear: () => void;
  readonly onMove: () => void;
  readonly onBulkEdit: () => void;
}

/** 여러 카드를 골라 한 번에 옮기거나 고치는 줄. 선택이 없을 때는 조용히 접혀 있는 한 줄이다. */
export function BoardSelectionBar({ selectedIds, canBulkEdit, busy, target, onTargetChange, onSelectAll, onClear, onMove, onBulkEdit }: Props) {
  useProductionCopy();
  const bt = useBilingual("ProductionBoardSelectionBar");
  const noteId = useId();
  const count = selectedIds.length;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-2",
        count > 0 ? "border-accent/60 bg-accent-soft/40" : "border-line",
      )}
    >
      <button type="button" disabled={busy} className={cn(buttonClass({ variant: "outline" }), "min-h-11 text-xs")} onClick={onSelectAll}>
        {productionText("현재 결과 선택 (최대 200개)")}
      </button>
      <span className="px-1 text-xs font-semibold text-fg-2" aria-live="polite">
        {count}
        {productionText("개 선택")}
      </span>
      <select
        aria-label={productionText("선택한 작업 이동 상태")}
        className={FIELD}
        value={target}
        disabled={busy || count === 0}
        onChange={(event) => {
          const value = BOARD_MOVE_TARGETS.find((status) => status === event.target.value);
          if (value) onTargetChange(value);
        }}
      >
        {BOARD_MOVE_TARGETS.map((status) => (
          <option key={status} value={status}>
            {boardStatusLabel(status, bt)}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || count === 0}
        aria-describedby={noteId}
        className={cn(buttonClass(), "min-h-11 text-xs")}
        onClick={onMove}
      >
        {productionText("선택 작업 이동")}
      </button>
      <button type="button" disabled={busy || !canBulkEdit} className={cn(buttonClass({ variant: "outline" }), "min-h-11 text-xs")} onClick={onBulkEdit}>
        {productionText("선택 작업 일괄 편집")}
      </button>
      {count > 0 ? (
        <button type="button" className={cn(buttonClass({ variant: "ghost" }), "min-h-11 text-xs")} onClick={onClear}>
          {productionText("선택 해제")}
        </button>
      ) : null}
      <p id={noteId} className={cn("w-full text-[0.6875rem] leading-5 text-fg-3", count === 0 && "sr-only")}>
        {count > 0 && !canBulkEdit ? (
          <span className="text-warn">{productionText("일괄 편집하려면 승인·완료·보관된 작업의 선택을 해제하세요.")} </span>
        ) : null}
        {productionText("하나라도 선행 조건을 충족하지 못하면 선택한 작업 전체가 이동하지 않습니다. 필터를 바꾸면 선택이 해제됩니다.")}
      </p>
    </div>
  );
}
