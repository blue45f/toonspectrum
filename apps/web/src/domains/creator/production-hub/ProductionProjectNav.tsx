import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  PRODUCTION_CORE_SURFACES,
  PRODUCTION_MORE_SURFACES,
  productionSurfacePath,
  type ProductionProjectSurface,
  type ProductionSurfaceDefinition,
} from "./production-project-surfaces";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

function SurfaceLink({
  projectId,
  definition,
  active,
  compact,
}: {
  readonly projectId: string;
  readonly definition: ProductionSurfaceDefinition;
  readonly active: boolean;
  readonly compact: boolean;
}) {
  const bt = useBilingual("ProductionProjectNav");
  const Icon = definition.icon;
  const label = bt(definition.label.ko, definition.label.en);
  const description = bt(definition.description.ko, definition.description.en);
  return (
    <Link
      to={productionSurfacePath(projectId, definition.id)}
      aria-current={active ? "page" : undefined}
      title={`${label} · ${description}`}
      className={cn(
        "group flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
        !compact && "lg:min-h-[3.5rem]",
        active
          ? "bg-accent-soft text-accent shadow-[inset_3px_0_0_var(--color-accent)]"
          : "text-fg-2 hover:bg-raised hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block whitespace-nowrap">{label}</span>
        {!compact ? (
          <span className="mt-0.5 hidden max-w-[11rem] truncate text-[0.6875rem] font-normal text-fg-3 lg:block">{description}</span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * 프로젝트 메뉴. 핵심 다섯 화면은 항상 보이고, 나머지 일곱 화면은 "더보기"에 접는다.
 * 현재 화면이 더보기 안에 있으면 그룹을 펼친 상태로 유지한다.
 */
export function ProductionProjectNav({
  projectId,
  surface,
}: {
  readonly projectId: string;
  readonly surface: ProductionProjectSurface | null;
}) {
  const bt = useBilingual("ProductionProjectNav");
  const moreActive = PRODUCTION_MORE_SURFACES.some((definition) => definition.id === surface);
  const [moreOpen, setMoreOpen] = useState(moreActive);
  const open = moreOpen || moreActive;
  return (
    <nav
      aria-label={bt("프로젝트 메뉴", "Project menu")}
      className="creator-workflow-nav border-b border-line bg-panel lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-r"
    >
      <p className="hidden px-5 pt-4 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-fg-3 lg:block">
        {bt("자주 쓰는 화면", "Main")}
      </p>
      <div className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible lg:p-3">
        {PRODUCTION_CORE_SURFACES.map((definition) => (
          <SurfaceLink
            key={definition.id}
            projectId={projectId}
            definition={definition}
            active={surface === definition.id}
            compact={false}
          />
        ))}
      </div>
      <details
        open={open}
        onToggle={(event) => setMoreOpen(event.currentTarget.open)}
        className="group/more border-t border-line px-2 pb-2 lg:px-3"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 text-xs font-bold text-fg-2 outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span>
            {bt("더보기", "More")}
            <span className="ml-1.5 font-normal text-fg-3">
              {PRODUCTION_MORE_SURFACES.map((definition) => bt(definition.label.ko, definition.label.en)).slice(0, 3).join("·")}…
            </span>
          </span>
          <ChevronDown className="size-4 transition-transform group-open/more:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="grid grid-cols-2 gap-1 pt-1 sm:grid-cols-3 lg:grid-cols-1">
          {PRODUCTION_MORE_SURFACES.map((definition) => (
            <SurfaceLink
              key={definition.id}
              projectId={projectId}
              definition={definition}
              active={surface === definition.id}
              compact
            />
          ))}
        </div>
      </details>
    </nav>
  );
}
