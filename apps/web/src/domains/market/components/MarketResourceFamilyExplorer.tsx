import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";

import {
  MARKET_RESOURCE_FAMILIES,
  marketResourceBrowseHref,
  type MarketResourceFamily,
} from "../models/market-resource-taxonomy";

import { SiteRail } from "@/domains/legal/public/site-rail";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

interface MarketResourceFamilyExplorerProps {
  readonly className?: string;
  readonly compact?: boolean;
}

const FAMILY_STUDIES = {
  template: { image: "/brand/atelier-process.webp", position: "12% 45%", label: ["컷의 시작 · 구도와 이야기", "Where a panel starts · composition and story"] },
  "2d": { image: "/assets/studio/cc0-20260906/assets/polyhaven-background-wooden-lounge/background.webp", position: "50% 50%", label: ["장면의 재료 · 배경과 소품", "Scene materials · backgrounds and props"] },
  "3d": { image: "/assets/3d/environments/refined-v6/thumbnails/classroom_art_studio.png", position: "50% 55%", label: ["공간의 기준 · 구도와 투시", "Space as reference · composition and perspective"] },
  brush: { image: "/brand/atelier-materials.webp", position: "5% 40%", label: ["선의 표정 · 필치와 질감", "Expressive lines · strokes and texture"] },
  look: { image: "/brand/atelier-world.webp", position: "20% 20%", label: ["장면의 온도 · 색과 빛", "Scene temperature · color and light"] },
} as const satisfies Record<MarketResourceFamily["id"], { readonly image: string; readonly position: string; readonly label: readonly [string, string] }>;

function FamilyCard({
  family,
  featured = false,
  compact = false,
}: {
  readonly family: MarketResourceFamily;
  readonly featured?: boolean;
  readonly compact?: boolean;
}) {
  const bt = useBilingual("MarketResourceFamilyExplorer");
  const Icon = family.icon;
  const primary = family.subcategories.slice(0, 3);
  const rest = family.subcategories.slice(3);
  const first = family.subcategories[0];
  const study = FAMILY_STUDIES[family.id];

  return (
    <article
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border border-line bg-card p-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong motion-reduce:transform-none motion-reduce:transition-none",
        featured && "sm:p-5",
      )}
    >
      {!compact ? <figure className="relative mb-4 overflow-hidden rounded-lg border border-line"><img src={study.image} alt="" loading="lazy" width={640} height={360} className="h-32 w-full object-cover sm:h-36" style={{ objectPosition: study.position }} /><figcaption className="absolute inset-x-0 bottom-0 bg-panel/90 px-3 py-2 text-xs text-fg-2">{bt(study.label[0], study.label[1])} · {bt("탐색 예시", "example")}</figcaption></figure> : null}
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-xl border bg-panel",
            featured ? "size-12" : "size-10",
          )}
          style={{ color: `oklch(0.76 0.13 ${family.accentHue})` }}
        >
          <Icon className={featured ? "size-6" : "size-5"} strokeWidth={1.7} aria-hidden="true" />
        </span>
        {featured ? (
          <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-xs font-black text-accent">
            {bt("제작 시작 추천", "Good place to start")}
          </span>
        ) : null}
      </div>

      <h3 className="relative mt-4 text-lg font-bold text-fg">{family.label}</h3>
      <p className="relative mt-1 text-xs font-bold tracking-[0.12em] text-fg-2">{family.english}</p>
      <p className="relative mt-2 break-keep text-sm leading-6 text-fg-2">
        {bt(family.description, family.descriptionEn)}
      </p>

      <div className="relative mt-4 grid gap-1.5">
        {primary.map((subcategory) => (
          <Link
            key={subcategory.id}
            href={marketResourceBrowseHref(subcategory)}
            className="group/sub flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line/70 bg-panel/55 px-3 text-left transition-colors hover:border-accent/35 hover:bg-raised"
          >
            <span className="min-w-0">
              <strong className="block truncate text-sm text-fg group-hover/sub:text-accent">{bt(subcategory.label, subcategory.labelEn)}</strong>
              {!compact ? <span className="mt-0.5 block truncate text-xs text-fg-2">{bt(subcategory.description, subcategory.descriptionEn)}</span> : null}
            </span>
            <ArrowRight className="size-3.5 shrink-0 text-fg-3 transition-transform group-hover/sub:translate-x-0.5 group-hover/sub:text-accent" aria-hidden="true" />
          </Link>
        ))}
      </div>

      {rest.length > 0 ? (
        <details className="relative mt-2 group/more">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-fg-2 hover:bg-raised hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 transition-transform group-open/more:rotate-180" aria-hidden="true" />
            {bt(`카테고리 ${rest.length}개 더 보기`, `${rest.length} more categories`)}
          </summary>
          <div className="mt-1.5 grid gap-1.5">
            {rest.map((subcategory) => (
              <Link
                key={subcategory.id}
                href={marketResourceBrowseHref(subcategory)}
                className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line/60 bg-panel/40 px-3 text-sm font-semibold text-fg-2 hover:border-accent/30 hover:text-accent"
              >
                {bt(subcategory.label, subcategory.labelEn)}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </details>
      ) : null}

      <Link
        href={marketResourceBrowseHref(first)}
        className="relative mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-accent-soft px-3 text-sm font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent"
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        {bt(`${family.label} 둘러보기`, `Browse ${family.labelEn}`)}
      </Link>
    </article>
  );
}

export function MarketResourceFamilyExplorer({ className, compact = false }: MarketResourceFamilyExplorerProps) {
  const bt = useBilingual("MarketResourceFamilyExplorer");

  return (
    <section className={cn("min-w-0", className)} aria-labelledby="market-resource-family-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">Resource Library</p>
          <h2 id="market-resource-family-title" className="mt-1 text-xl font-bold text-fg sm:text-2xl">{bt("장면을 만들 순서대로 고르세요", "Pick in the order you build a scene")}</h2>
          <p className="mt-1.5 max-w-3xl break-keep text-sm leading-6 text-fg-2">
            {bt(
              "템플릿으로 컷과 대사 흐름을 시작하고, 2D 에셋으로 채운 뒤, 필요할 때 3D·브러시·색보정으로 깊이를 더합니다.",
              "Start with a template, fill the scene with 2D assets, then add depth with 3D, brushes and color when needed.",
            )}
          </p>
        </div>
        <Link href="/market/browse" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent hover:text-accent-2">
          {bt("전체 리소스 보기", "View all resources")} <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {/* 휴대폰은 옆으로 넘기는 한 줄(작업군 5장), 넓은 화면은 격자 — 제작 순서(템플릿 → 2D → 3D → 브러시 → 색·보정)를 유지한다. */}
      <SiteRail
        label={bt("리소스 작업군", "Resource families")}
        ordered
        className="mt-5 gap-3"
        columns="sm:grid-cols-2 xl:grid-cols-3"
        itemClassName="w-[min(82vw,20rem)]"
      >
        {MARKET_RESOURCE_FAMILIES.map((family) => (
          <FamilyCard key={family.id} family={family} featured={family.id === "template" || family.id === "2d"} compact={compact} />
        ))}
      </SiteRail>
    </section>
  );
}
