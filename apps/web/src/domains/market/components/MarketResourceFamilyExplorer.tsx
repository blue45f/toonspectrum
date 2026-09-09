import { ArrowRight, Sparkles } from "lucide-react";

import {
  MARKET_RESOURCE_FAMILIES,
  marketResourceBrowseHref,
} from "../models/market-resource-taxonomy";

import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";

interface MarketResourceFamilyExplorerProps {
  readonly className?: string;
  readonly compact?: boolean;
}

export function MarketResourceFamilyExplorer({
  className,
  compact = false,
}: MarketResourceFamilyExplorerProps) {
  return (
    <section className={cn("min-w-0", className)} aria-labelledby="market-resource-family-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">Resource Library</p>
          <h2 id="market-resource-family-title" className="mt-1 text-xl font-bold text-fg sm:text-2xl">
            만들고 싶은 것에서 시작하세요
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-fg-3 sm:text-sm sm:leading-6">
            파일 형식이나 내부 엔진 이름을 몰라도 됩니다. 템플릿·배경·브러시처럼 지금 필요한 결과를 고르면 맞는 리소스만 보여줍니다.
          </p>
        </div>
        <Link href="/market/browse" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-accent hover:text-accent-2">
          전체 리소스 보기 <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className={cn("mt-5 grid gap-3", compact ? "lg:grid-cols-5" : "md:grid-cols-2 xl:grid-cols-5")}>
        {MARKET_RESOURCE_FAMILIES.map((family, familyIndex) => {
          const Icon = family.icon;
          const first = family.subcategories[0];
          return (
            <article
              key={family.id}
              className="group relative overflow-hidden rounded-2xl border border-line bg-card p-4 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full opacity-20 blur-3xl transition-transform duration-500 group-hover:scale-125"
                style={{ background: `oklch(0.72 0.15 ${family.accentHue})` }}
              />
              <div className="relative flex items-start justify-between gap-3">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl border bg-panel"
                  style={{ color: `oklch(0.76 0.13 ${family.accentHue})` }}
                >
                  <Icon className="size-5" strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="rounded-full border border-line bg-panel/80 px-2 py-1 text-[0.6rem] font-black tracking-[0.12em] text-fg-3">
                  {String(familyIndex + 1).padStart(2, "0")}
                </span>
              </div>

              <h3 className="relative mt-4 text-base font-bold text-fg">{family.label}</h3>
              <p className="relative mt-1 text-[0.68rem] font-bold tracking-[0.12em] text-fg-3">{family.english}</p>
              <p className="relative mt-2 min-h-12 text-xs leading-5 text-fg-3">{family.description}</p>

              <div className="relative mt-4 grid gap-1.5">
                {family.subcategories.map((subcategory) => (
                  <Link
                    key={subcategory.id}
                    href={marketResourceBrowseHref(subcategory)}
                    className="group/sub flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line/70 bg-panel/55 px-2.5 text-left transition-colors hover:border-accent/35 hover:bg-raised"
                  >
                    <span className="min-w-0">
                      <strong className="block truncate text-[0.72rem] text-fg group-hover/sub:text-accent">{subcategory.label}</strong>
                      {!compact ? <span className="mt-0.5 block truncate text-[0.62rem] text-fg-3">{subcategory.description}</span> : null}
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-fg-3 transition-transform group-hover/sub:translate-x-0.5 group-hover/sub:text-accent" aria-hidden="true" />
                  </Link>
                ))}
              </div>

              <Link
                href={marketResourceBrowseHref(first)}
                className="relative mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-accent-soft px-3 text-xs font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent"
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                {family.label} 둘러보기
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
