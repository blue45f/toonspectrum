import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";

import {
  MARKET_RESOURCE_FAMILIES,
  marketResourceBrowseHref,
  type MarketResourceFamily,
} from "../models/market-resource-taxonomy";

import { cn } from "@/shared/lib/utils";
import Link from "@/compat/router-link";

interface MarketResourceFamilyExplorerProps {
  readonly className?: string;
  readonly compact?: boolean;
}

const FAMILY_STUDIES = {
  template: { image: "/brand/atelier-process.webp", position: "12% 45%", label: "컷의 시작 · 구도와 이야기" },
  "2d": { image: "/assets/studio/backgrounds/webtoon_classroom.jpg", position: "50% 50%", label: "장면의 재료 · 배경과 소품" },
  "3d": { image: "/assets/3d/environments/refined-v6/thumbnails/classroom_art_studio.png", position: "50% 55%", label: "공간의 기준 · 구도와 투시" },
  brush: { image: "/brand/atelier-materials.webp", position: "5% 40%", label: "선의 표정 · 필치와 질감" },
  look: { image: "/brand/atelier-world.webp", position: "20% 20%", label: "장면의 온도 · 색과 빛" },
} as const;

function FamilyCard({
  family,
  featured = false,
  compact = false,
}: {
  readonly family: MarketResourceFamily;
  readonly featured?: boolean;
  readonly compact?: boolean;
}) {
  const Icon = family.icon;
  const primary = family.subcategories.slice(0, 3);
  const rest = family.subcategories.slice(3);
  const first = family.subcategories[0];
  const study = FAMILY_STUDIES[family.id];

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-line bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong motion-reduce:transform-none motion-reduce:transition-none",
        featured ? "p-5 sm:p-6" : "p-4",
      )}
    >
      {!compact ? <figure className="relative mb-5 overflow-hidden rounded-lg border border-line"><img src={study.image} alt="" loading="lazy" width={640} height={360} className={cn("w-full object-cover", featured ? "h-40 sm:h-48" : "h-36")} style={{ objectPosition: study.position }} /><figcaption className="absolute inset-x-0 bottom-0 bg-panel/90 px-3 py-2 text-[0.65rem] text-fg-2">{study.label} · 탐색 예시</figcaption></figure> : null}
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
          <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-[0.62rem] font-black text-accent">
            제작 시작 추천
          </span>
        ) : null}
      </div>

      <h3 className={cn("relative font-bold text-fg", featured ? "mt-5 text-lg" : "mt-4 text-base")}>{family.label}</h3>
      <p className="relative mt-1 text-[0.68rem] font-bold tracking-[0.12em] text-fg-3">{family.english}</p>
      <p className={cn("relative mt-2 text-xs leading-5 text-fg-3", featured && "max-w-xl sm:text-sm sm:leading-6")}>
        {family.description}
      </p>

      <div className={cn("relative mt-4 grid gap-1.5", featured && "sm:grid-cols-3")}>
        {primary.map((subcategory) => (
          <Link
            key={subcategory.id}
            href={marketResourceBrowseHref(subcategory)}
            className="group/sub flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line/70 bg-panel/55 px-3 text-left transition-colors hover:border-accent/35 hover:bg-raised"
          >
            <span className="min-w-0">
              <strong className="block truncate text-[0.74rem] text-fg group-hover/sub:text-accent">{subcategory.label}</strong>
              {!compact ? <span className="mt-0.5 block truncate text-[0.63rem] text-fg-3">{subcategory.description}</span> : null}
            </span>
            <ArrowRight className="size-3.5 shrink-0 text-fg-3 transition-transform group-hover/sub:translate-x-0.5 group-hover/sub:text-accent" aria-hidden="true" />
          </Link>
        ))}
      </div>

      {rest.length > 0 ? (
        <details className="relative mt-2 group/more">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-fg-3 hover:bg-raised hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-3.5 transition-transform group-open/more:rotate-180" aria-hidden="true" />
            카테고리 {rest.length}개 더 보기
          </summary>
          <div className={cn("mt-1.5 grid gap-1.5", featured && "sm:grid-cols-3")}>
            {rest.map((subcategory) => (
              <Link
                key={subcategory.id}
                href={marketResourceBrowseHref(subcategory)}
                className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line/60 bg-panel/40 px-3 text-xs font-semibold text-fg-2 hover:border-accent/30 hover:text-accent"
              >
                {subcategory.label}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </details>
      ) : null}

      <Link
        href={marketResourceBrowseHref(first)}
        className="relative mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-accent-soft px-3 text-xs font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent"
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        {family.label} 둘러보기
      </Link>
    </article>
  );
}

export function MarketResourceFamilyExplorer({ className, compact = false }: MarketResourceFamilyExplorerProps) {
  const featured = MARKET_RESOURCE_FAMILIES.filter((family) => family.id === "template" || family.id === "2d");
  const specialist = MARKET_RESOURCE_FAMILIES.filter((family) => family.id !== "template" && family.id !== "2d");

  return (
    <section className={cn("min-w-0", className)} aria-labelledby="market-resource-family-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">Resource Library</p>
          <h2 id="market-resource-family-title" className="mt-1 text-xl font-bold text-fg sm:text-2xl">장면을 만들 순서대로 고르세요</h2>
          <p className="mt-1.5 max-w-3xl text-xs leading-5 text-fg-3 sm:text-sm sm:leading-6">
            템플릿으로 컷과 대사 흐름을 시작하고 2D 에셋으로 장면을 채운 뒤, 필요할 때 3D·브러시·색보정으로 깊이를 더합니다. 파일 형식이나 엔진 이름을 먼저 알 필요가 없습니다.
          </p>
        </div>
        <Link href="/market/browse" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-accent hover:text-accent-2">
          전체 리소스 보기 <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {featured.map((family) => <FamilyCard key={family.id} family={family} featured compact={compact} />)}
      </div>

      <div className="mt-7 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-fg">더 정교하게 만들기</h3>
          <p className="mt-1 text-xs text-fg-3">구도·선화·채색·마감이 필요할 때 전문 리소스를 추가하세요.</p>
        </div>
      </div>
      <div className={cn("mt-3 grid gap-3", compact ? "lg:grid-cols-3" : "md:grid-cols-3")}>
        {specialist.map((family) => <FamilyCard key={family.id} family={family} compact={compact} />)}
      </div>
    </section>
  );
}
