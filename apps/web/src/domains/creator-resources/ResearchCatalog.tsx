import { ArrowRight, ChevronDown, Info } from "lucide-react";
import { Link } from "react-router-dom";

import { RESOURCE_MENU_GROUPS, resourceMenuGroupPages } from "./navigation";
import {
  RESEARCH_CATEGORIES,
  RESEARCH_RECIPES,
  RESEARCH_USAGE_HINTS,
  RESEARCH_USAGE_LABELS,
  savedCountForCategory,
  type ResearchUsage,
} from "./research-catalog";
import type { ResearchWorkspaceSummary } from "./research-dashboard";

import { SiteRail } from "@/domains/legal/public/site-rail";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const USAGE_TONE: Readonly<Record<ResearchUsage, string>> = {
  cc0: "border-good/40 text-good",
  attribution: "border-cool/40 text-cool",
  reference: "border-line-strong text-fg-2",
  metadata: "border-line-strong text-fg-2",
  mixed: "border-accent/40 text-accent",
};

const TOTAL_TOOL_COUNT = RESOURCE_MENU_GROUPS.reduce((sum, group) => sum + group.paths.length, 0);

/**
 * "무엇을 찾을 수 있나요" — 리서치 데스크 첫 화면의 범주 타일.
 * 아이콘·이름·한 줄 설명·실제 제공처 수·이용 조건을 한 장에 담고, 이 브라우저에 저장한 자료가
 * 있으면 개수를 함께 보여 준다. 모든 목적지는 아래 "모든 리서치 도구"에서 묶음별로 다시 찾을 수 있다.
 */
export function ResearchCategoryTiles({ summary }: { summary: ResearchWorkspaceSummary }) {
  const bt = useBilingual("ResearchCategoryTiles");
  return <section id="research-categories" className="scroll-mt-24 space-y-4" aria-labelledby="research-categories-title">
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow text-accent">WHAT YOU CAN FIND</p>
        <h2 id="research-categories-title" className="mt-1 text-xl font-bold sm:text-2xl">{bt("무엇을 찾을 수 있나요", "What you can find")}</h2>
      </div>
      <p className="flex max-w-xl items-start gap-2 text-sm leading-6 text-fg-2 break-keep" data-research-license-line="">
        <Info size={16} aria-hidden="true" className="mt-1 shrink-0 text-cool" />
        <span>
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", USAGE_TONE.cc0)}>{bt(...RESEARCH_USAGE_LABELS.cc0)}</span>{" "}
          {bt(...RESEARCH_USAGE_HINTS.cc0)} ·{" "}
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", USAGE_TONE.reference)}>{bt(...RESEARCH_USAGE_LABELS.reference)}</span>{" "}
          {bt(...RESEARCH_USAGE_HINTS.reference)}. {bt("저장하면 출처·조건이 함께 남아요.", "Saving keeps the source and terms.")}
          {" "}
          <Link to="/about/data" className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-4 hover:underline sm:min-h-0">{bt("이용 조건 기준", "How terms work")}</Link>
        </span>
      </p>
    </header>
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4" aria-label={bt("리서치 자료 범주", "Research categories")}>
      {RESEARCH_CATEGORIES.map((category) => {
        const Icon = category.icon;
        const saved = savedCountForCategory(category, summary.providerBreakdown);
        return <li key={category.id} className="min-w-0">
          <Link
            to={category.href}
            data-research-category={category.id}
            className="group flex h-full flex-col rounded-2xl border border-line bg-panel p-3 transition-[border-color,background-color,transform] duration-200 hover:border-accent/50 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-safe:hover:-translate-y-0.5 sm:p-4"
          >
            <span className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent sm:size-10">
                <Icon size={18} aria-hidden="true" />
              </span>
              <strong className="min-w-0 text-sm font-bold leading-5 text-fg break-keep sm:text-base">{bt(...category.title)}</strong>
            </span>
            <span className="mt-2 flex-1 text-sm leading-normal text-fg-2 break-keep">{bt(...category.description)}</span>
            <span className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold">
              <span className={cn("rounded-full border px-2 py-0.5", USAGE_TONE[category.usage])}>{bt(...RESEARCH_USAGE_LABELS[category.usage])}</span>
              <span className="text-fg-2">{formatI18nTemplate(bt("출처 {v0}곳", "{v0} sources"), { v0: category.providers.length })}</span>
              {saved > 0 ? <span className="rounded-full bg-accent px-2 py-0.5 text-on-accent">{formatI18nTemplate(bt("저장 {v0}", "{v0} saved"), { v0: saved })}</span> : null}
            </span>
          </Link>
        </li>;
      })}
    </ul>
    <details className="group rounded-2xl border border-line bg-panel">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
        {formatI18nTemplate(bt("모든 리서치 도구 {v0}개 보기", "All {v0} research tools"), { v0: TOTAL_TOOL_COUNT })}
        <ChevronDown size={18} aria-hidden="true" className="text-accent transition-transform group-open:rotate-180" />
      </summary>
      <nav aria-label={bt("리서치 도구 전체 목록", "All research tools")} className="grid gap-4 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-5">
        {RESOURCE_MENU_GROUPS.map((group) => <div key={group.id} className="min-w-0">
          <p className="text-xs font-bold text-fg-2">{bt(...group.title)}</p>
          <ul className="mt-1.5 grid gap-1">
            {resourceMenuGroupPages(group).map((page) => <li key={page.path}>
              <Link to={page.path} className="flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-fg hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{page.title}</Link>
            </li>)}
          </ul>
        </div>)}
      </nav>
    </details>
  </section>;
}

/**
 * 작업별 추천 조합 — 만들려는 결과물에서 출발해 필요한 자료를 순서대로 열고 제작 화면으로 이어진다.
 * 모바일에서는 가로로 넘기는 카드 줄, 넓은 화면에서는 격자.
 */
export function ResearchRecipeRail() {
  const bt = useBilingual("ResearchRecipeRail");
  return <section id="research-recipes" className="scroll-mt-24 space-y-4" aria-labelledby="research-recipes-title">
    <header>
      <p className="eyebrow text-accent">RECIPES</p>
      <h2 id="research-recipes-title" className="mt-1 text-xl font-bold sm:text-2xl">{bt("작업별 추천 조합", "Recipes by task")}</h2>
      <p className="mt-1 text-sm text-fg-2 break-keep">{bt("만들 장면을 고르면 필요한 자료를 순서대로 열고 바로 제작으로 넘어갑니다.", "Pick a scene, open the sources in order, then jump straight into making it.")}</p>
    </header>
    <SiteRail label={bt("작업별 추천 조합", "Recipes by task")} columns="sm:grid-cols-2 xl:grid-cols-4">
      {RESEARCH_RECIPES.map((recipe) => <article key={recipe.id} className="flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel" aria-labelledby={`research-recipe-${recipe.id}`}>
        <div className="relative aspect-[2/1] overflow-hidden border-b border-line bg-raised">
          <img src={recipe.art} alt="" loading="lazy" decoding="async" width={320} height={180} className="h-full w-full object-cover" />
          <span className="absolute left-2 top-2 rounded-full bg-canvas/85 px-2 py-0.5 text-xs font-semibold text-fg-2">{bt("예시 일러스트", "Sample art")}</span>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h3 id={`research-recipe-${recipe.id}`} className="font-bold break-keep">{bt(...recipe.title)}</h3>
          <p className="mt-1 text-sm leading-6 text-fg-2 break-keep">{bt(...recipe.outcome)}</p>
          <ol className="mt-3 flex flex-wrap gap-1.5" aria-label={bt("필요한 자료 순서", "Sources in order")}>
            {recipe.steps.map((step, index) => <li key={step.href}>
              <Link to={step.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-canvas px-3 text-xs font-semibold text-fg hover:border-accent/50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{index + 1}</span>
                {bt(...step.label)}
              </Link>
            </li>)}
          </ol>
          <a href={recipe.finish.href} className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-3 text-sm font-bold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
            {bt(...recipe.finish.label)}<ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </article>)}
    </SiteRail>
  </section>;
}
