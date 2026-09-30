import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { resolveProductionSurfaceTarget } from "./production-project-dashboard-model";
import { productionSurfaceDefinition, type ProductionProjectSurface } from "./production-project-surfaces";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 각 화면 맨 위: 무엇을 하는 화면인지 한 줄로 설명하고, 이어서 할 행동 하나를 제시한다. */
export function ProductionSurfaceHeader({
  aggregate,
  surface,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly surface: ProductionProjectSurface;
}) {
  const bt = useBilingual("ProductionSurfaceHeader");
  const definition = productionSurfaceDefinition(surface);
  const Icon = definition.icon;
  const nextHref = useMemo(
    () => resolveProductionSurfaceTarget(aggregate, definition.next.target, new Date()),
    [aggregate, definition.next.target],
  );
  return (
    <header
      data-production-surface-header={surface}
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card/80 px-4 py-3 shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-tight text-fg">{bt(definition.label.ko, definition.label.en)}</h2>
          <p className="text-xs leading-5 text-fg-2">{bt(definition.description.ko, definition.description.en)}</p>
        </div>
      </div>
      <Link className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5" })} to={nextHref}>
        <span className="sr-only">{bt("다음 단계:", "Next step:")} </span>
        {bt(definition.next.label.ko, definition.next.label.en)}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </header>
  );
}
