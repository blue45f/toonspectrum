import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";
import { Gauge } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { ProductionBoardScroller } from "./ProductionBoardScroller";
import { PRODUCTION_DEFAULT_PROCESS_ORDER, productionProcessLabel } from "./production-labels";
import { productionProcessColumns } from "./production-workboard-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/**
 * 공정별 칸반: 콘티·선화·배경·채색·식자·검수 공정을 열로 두고, 각 작업 카드에
 * 담당·마감·상태를 보여 준다. 공정 자체는 작업마다 고정이므로 열 사이 끌어 옮기기는 없고,
 * 상태는 카드의 "상태 이동"으로 바꾼다. 열 머리에는 지금 작업 중인 수와 팀 한도를 보여 준다.
 */
export function ProductionProcessBoard({
  aggregate,
  tasks,
  renderCard,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly tasks: readonly ProductionTask[];
  readonly renderCard: (task: ProductionTask) => ReactNode;
}) {
  const bt = useBilingual("ProductionProcessBoard");
  const columns = useMemo(
    () => productionProcessColumns(aggregate, tasks, PRODUCTION_DEFAULT_PROCESS_ORDER),
    [aggregate, tasks],
  );
  return (
    <ProductionBoardScroller>
      <div
        className="grid min-w-max grid-flow-col gap-3"
        style={{ gridTemplateColumns: columns.map(() => "16.5rem").join(" ") }}
        data-testid="production-process-board"
      >
        {columns.map((column, index) => {
          const label = productionProcessLabel(aggregate, column.key, bt);
          const full = column.wipLimit !== null && column.wip >= column.wipLimit;
          return (
            <section
              key={column.key}
              aria-label={bt(`${label} 공정 열`, `${label} column`)}
              className={cn("min-h-64 rounded-2xl border p-3", full ? "border-warn/50 bg-warn/5" : "border-line bg-raised/50")}
            >
              <header className="mb-3 flex min-h-11 items-center justify-between gap-2">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold text-fg">
                  <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-accent-soft text-[0.6875rem] font-black text-accent">{index + 1}</span>
                  <span className="truncate">{label}</span>
                </h3>
                <span className="rounded-lg bg-card px-2 py-1 text-xs font-bold tabular-nums text-fg-2">{column.tasks.length}</span>
              </header>
              <p
                className={cn("mb-3 flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[0.6875rem]", full ? "border-warn/40 text-warn" : "border-line text-fg-3")}
                title={bt("동시에 작업 중인 수 / 팀 한도", "In progress / team limit")}
              >
                <Gauge className="size-3.5" aria-hidden="true" />
                {column.wipLimit === null
                  ? bt(`작업 중 ${column.wip}`, `${column.wip} in progress`)
                  : bt(`작업 중 ${column.wip}/${column.wipLimit}${full ? " · 한도 도달" : ""}`, `${column.wip}/${column.wipLimit} in progress${full ? " · at limit" : ""}`)}
              </p>
              <div className="space-y-3">{column.tasks.map(renderCard)}</div>
              {column.tasks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs leading-6 text-fg-3">
                  {bt("이 공정의 작업이 없습니다", "No work in this process")}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
    </ProductionBoardScroller>
  );
}
