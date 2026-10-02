import { Activity, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import {
  buildProductionActivityEntries,
  filterProductionActivityEntries,
  shortenProductionActivityId,
  type ProductionActivityFilter,
} from "./production-activity-model";
import { productionActivityLabel } from "./production-labels";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const PAGE_SIZE = 30;

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : value;
}

/**
 * 프로젝트 활동 전체 기록. 원천은 서버가 변경마다 강제 기록하는 auditEvents이며,
 * 여기서는 행위자·대상 이름을 해석해 "누가 언제 무엇을"으로 읽히게 한다.
 * 상태 전/후 값은 원천이 digest만 갖고 있어 표시하지 않는다.
 */
export function ProductionActivityWorkspace({
  aggregate,
  viewerUserId,
  viewerAssignmentIds,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly viewerUserId: string | null;
  readonly viewerAssignmentIds: readonly string[];
}) {
  const bt = useBilingual("ProductionActivityWorkspace");
  const [filter, setFilter] = useState<ProductionActivityFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const entries = useMemo(
    () => buildProductionActivityEntries(aggregate, { userId: viewerUserId, assignmentIds: viewerAssignmentIds }),
    [aggregate, viewerUserId, viewerAssignmentIds],
  );
  const mineCount = useMemo(() => entries.filter((entry) => entry.relatedToViewer).length, [entries]);
  const filtered = useMemo(() => filterProductionActivityEntries(entries, filter), [entries, filter]);
  const visible = filtered.slice(0, visibleCount);

  const filters: readonly { readonly id: ProductionActivityFilter; readonly label: string; readonly count: number }[] = [
    { id: "all", label: bt("전체", "All"), count: entries.length },
    { id: "mine", label: bt("내 관련", "Related to me"), count: mineCount },
  ];

  return (
    <section aria-label={bt("프로젝트 활동", "Project activity")} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={bt("활동 범위 선택", "Choose activity scope")}>
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              className={buttonClass({ variant: filter === item.id ? "solid" : "outline", className: "min-h-11" })}
              onClick={() => {
                setFilter(item.id);
                setVisibleCount(PAGE_SIZE);
              }}
            >
              {item.label}
              <span className={cn("ml-1.5 text-xs", filter === item.id ? "text-current/70" : "text-fg-3")}>{item.count}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-3">
          {bt(
            `총 ${entries.length}건의 변경이 기록돼 있습니다.`,
            `${entries.length} changes recorded.`,
          )}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center">
          <Sparkles className="mx-auto size-6 text-fg-3" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-fg">
            {filter === "mine"
              ? bt("나와 관련된 활동이 아직 없습니다", "No activity related to you yet")
              : bt("기록된 활동이 없습니다", "No recorded activity")}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-fg-3">
            {filter === "mine"
              ? bt("내가 바꾸거나, 나에게 배정된 작업·회차에서 일어난 변경이 여기에 모입니다.", "Changes you made, or changes on tasks and episodes assigned to you, collect here.")
              : bt("프로젝트에서 일어나는 변경은 빠짐없이 여기에 쌓입니다.", "Every change in this project is recorded here.")}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((entry) => {
              const { event } = entry;
              return (
                <li
                  key={event.id}
                  className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-raised text-fg-3">
                    <Activity className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-5 text-fg">
                      <span className="font-bold">{entry.actorName ?? bt("시스템", "System")}</span>
                      {entry.actorIsViewer ? (
                        <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.625rem] font-bold text-accent">
                          {bt("나", "You")}
                        </span>
                      ) : null}
                      <span className="text-fg-2"> · {productionActivityLabel(event.action, bt)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[0.6875rem] text-fg-3">
                      {bt(entry.targetKindLabel.ko, entry.targetKindLabel.en)}
                      {" · "}
                      {entry.targetTitle ?? shortenProductionActivityId(event.targetId)}
                    </p>
                    {event.reason ? (
                      <p className="mt-1 text-[0.6875rem] leading-4 text-fg-2">{event.reason}</p>
                    ) : null}
                    <p className="mt-1 text-[0.625rem] text-fg-3">
                      {bt(`${event.aggregateRevision}번째 변경`, `Change #${event.aggregateRevision}`)}
                      {" · "}
                      {formatDateTime(event.occurredAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-fg-3">
              {bt(`${filtered.length}건 중 ${visible.length}건 표시`, `Showing ${visible.length} of ${filtered.length}`)}
            </p>
            {visibleCount < filtered.length ? (
              <button
                type="button"
                className={buttonClass({ variant: "outline", className: "min-h-11" })}
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                {bt("더 보기", "Show more")}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
