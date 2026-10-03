import { productionProcessWip } from "@toonstudio/contracts/production-workflow";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { ChevronDown, Plus, Settings2, Workflow } from "lucide-react";

import { productionText, useProductionCopy } from "../production-workboard-copy";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly canEdit: boolean;
  readonly canManage: boolean;
  readonly busy: boolean;
  readonly completedCount: number;
  readonly activeCount: number;
  readonly processFilter: string;
  readonly onProcessFilter: (key: string) => void;
  readonly onCreate: () => void;
  readonly onOpenWorkflow: () => void;
  readonly onOpenGeneration: () => void;
}

/**
 * 보드 맨 위 한 줄: 진행률과 주요 행동(작업 만들기·공정 설정·회차 공정 만들기).
 * 공정별 동시 작업 한도는 접어 두었다가, 한도에 닿은 공정이 있으면 자동으로 펼친다.
 */
export function BoardHeader({
  aggregate,
  canEdit,
  canManage,
  busy,
  completedCount,
  activeCount,
  processFilter,
  onProcessFilter,
  onCreate,
  onOpenWorkflow,
  onOpenGeneration,
}: Props) {
  useProductionCopy();
  const bt = useBilingual("ProductionBoardHeader");
  const total = activeCount + completedCount;
  const completion = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const profile = aggregate.workflowProfile;
  const steps = (profile?.steps ?? []).map((step) => {
    const count = productionProcessWip(aggregate.tasks, step.key);
    return { step, count, full: step.wipLimit !== null && count >= step.wipLimit };
  });
  const fullCount = steps.filter((entry) => entry.full).length;
  return (
    <div className="space-y-3">
      <header className="production-board-head flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-card px-4 py-3">
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex items-baseline gap-2">
            <p className="text-xs font-semibold text-fg-2">{productionText("승인·완료")}</p>
            <p className="text-xl font-black tabular-nums text-fg">
              {completedCount}
              <span className="ml-1 text-sm font-normal text-fg-3">
                / {total}
                {productionText("개")}
              </span>
            </p>
            <p className="text-xs text-fg-3">{total ? bt(`${completion}% 완료 · 보관 제외`, `${completion}% done · excl. archived`) : bt("아직 진행할 작업이 없습니다", "Nothing in progress yet")}</p>
          </div>
          <progress
            aria-label={productionText("작업 완료율")}
            max={100}
            value={completion}
            className="mt-2 h-1.5 w-full max-w-md accent-[var(--color-accent)]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!canEdit || busy} className={cn(buttonClass(), "min-h-11")} onClick={onCreate}>
            <Plus size={17} aria-hidden="true" />
            {productionText("작업 만들기")}
          </button>
          <button
            type="button"
            className={cn(buttonClass({ variant: "outline" }), "min-h-11 bg-card")}
            disabled={busy}
            onClick={onOpenWorkflow}
          >
            <Settings2 size={16} aria-hidden="true" />
            {canManage ? productionText("공정 설정") : productionText("공정 보기")}
          </button>
          <button
            type="button"
            disabled={!canEdit || busy || !profile || aggregate.episodes.length === 0}
            className={cn(buttonClass({ variant: "outline" }), "min-h-11 bg-card")}
            onClick={onOpenGeneration}
          >
            <Workflow size={16} aria-hidden="true" />
            {productionText("회차 공정 만들기")}
          </button>
        </div>
        {!profile ? (
          <p className="w-full text-xs leading-5 text-fg-2">
            {productionText(
              "공정 설정을 저장하면 회차별 작업 자동 구성과 동시 진행 제한을 사용할 수 있습니다. 기존 작업은 그대로 유지됩니다.",
            )}
          </p>
        ) : null}
      </header>
      {profile ? (
        <details
          aria-label={productionText("우리 팀 공정 현황")}
          open={fullCount > 0 || undefined}
          className="group/wip rounded-2xl border border-line bg-card"
        >
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Workflow size={16} className="text-accent" aria-hidden="true" />
              {profile.name}
            </h3>
            <span className="flex items-center gap-2 text-xs text-fg-3">
              v{profile.revision} {productionText("· 동시 진행 작업 수")}
              {fullCount > 0 ? (
                <span className="rounded-full bg-warn/15 px-2 py-0.5 font-bold text-warn">
                  {bt(`한도 도달 ${fullCount}`, `${fullCount} at limit`)}
                </span>
              ) : null}
              <ChevronDown size={15} aria-hidden="true" className="transition-transform group-open/wip:rotate-180 motion-reduce:transition-none" />
            </span>
          </summary>
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {steps.map(({ step, count, full }, index) => (
              <button
                type="button"
                key={step.key}
                aria-pressed={processFilter === step.key}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs focus-visible:ring-2 focus-visible:ring-accent",
                  processFilter === step.key
                    ? "border-accent bg-accent-soft text-accent"
                    : full
                      ? "border-warn/40 bg-warn/10 text-fg"
                      : "border-line bg-canvas text-fg-2",
                )}
                onClick={() => onProcessFilter(processFilter === step.key ? "" : step.key)}
              >
                <span className="text-fg-3">{index + 1}</span>
                <span>{step.name}</span>
                <span className="rounded-md bg-card px-1.5 py-1 font-bold tabular-nums">
                  {count}/{step.wipLimit ?? "∞"}
                </span>
                {full ? <span>{productionText("한도 도달")}</span> : null}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
