// 창작 갤러리 첫 화면 — 한 문장 가치 + 주요 행동 1개(+보조 1개)와 예시 아트 띠.
// 예시 아트는 브랜드 일러스트이므로 실제 게시 작품과 구분된다는 안내를 함께 둔다.
import { ArrowRight, PenLine, ShieldCheck, Trophy, Upload } from "lucide-react";

import { buildStudioHref } from "../creator-studio-links";
import { SHOWCASE_CHALLENGES_PATH, SHOWCASE_REVIEWS_PATH } from "./showcase-links";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const ART_ROOT = "/brand/illustrated-20260928";

/** 예시 아트 세 장(320·640px WebP 두 벌). 장르가 다른 표지를 나란히 두어 갤러리의 결을 보여 준다. */
const SHOWCASE_ART = [
  { id: "project-crimson", ko: "비 내리는 도시의 액션 웹툰 표지 예시", en: "Example cover of an action webtoon in a rainy city" },
  { id: "character-pink", ko: "벚꽃 속 로맨스 웹툰 주인공 예시", en: "Example heroine of a romance webtoon among cherry blossoms" },
  { id: "hero", ko: "네온 도시의 판타지 웹툰 주인공 예시", en: "Example heroine of a fantasy webtoon in a neon city" },
] as const;

const TEXT_LINK = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-fg-2 underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function ShowcaseHero() {
  const bt = useBilingual("ShowcaseHero");
  return (
    <section
      aria-labelledby="showcase-hero-title"
      className="relative isolate mb-6 overflow-hidden rounded-3xl border border-line bg-panel/60 p-5 sm:p-7 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-28 -z-10 size-80 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--color-accent) 30%, transparent), transparent 70%)" }}
      />
      <div className="min-w-0">
        <p className="eyebrow text-accent">CREATOR SHOWCASE</p>
        <h1 id="showcase-hero-title" className="mt-2 text-balance break-keep text-3xl font-black tracking-tight text-fg sm:text-4xl">
          {bt("창작 갤러리", "Creator gallery")}
        </h1>
        <p className="mt-2 max-w-xl text-pretty break-keep text-base leading-7 text-fg-2">
          {bt(
            "직접 그린 웹툰·일러스트를 공개하고, 좋아하는 작가의 다음 장면을 만나 보세요.",
            "Share the webtoons and illustrations you draw, and meet your favorite creators' next scenes.",
          )}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link href="/studio" className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5 shadow-lg shadow-accent/20" })}>
            <PenLine size={16} aria-hidden />
            {bt("웹툰 그리기", "Draw a webtoon")}
            <ArrowRight size={16} aria-hidden />
          </Link>
          <Link href={buildStudioHref({ mode: "upload" })} className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
            <Upload size={15} aria-hidden />
            {bt("작품 올리기", "Upload work")}
          </Link>
        </div>
        <nav aria-label={bt("갤러리 바로가기", "Gallery shortcuts")} className="mt-3 flex flex-wrap gap-x-4">
          <Link href={SHOWCASE_CHALLENGES_PATH} className={TEXT_LINK}>
            <Trophy size={15} aria-hidden className="text-accent" />
            {bt("창작 챌린지", "Challenges")}
          </Link>
          <Link href={SHOWCASE_REVIEWS_PATH} className={TEXT_LINK}>
            <ShieldCheck size={15} aria-hidden className="text-accent" />
            {bt("승인본 전시", "Approved showcase")}
          </Link>
        </nav>
      </div>

      <figure className="mt-5 min-w-0 lg:mt-0">
        <ul className="grid grid-cols-3 gap-2 sm:gap-3" aria-label={bt("예시 아트", "Example art")}>
          {SHOWCASE_ART.map((art, index) => (
            <li
              key={art.id}
              className={cn(
                "overflow-hidden rounded-2xl border border-line bg-canvas shadow-lg shadow-black/20",
                // 가운데 컷을 살짝 내려 세로 스크롤 웹툰의 리듬을 보여 준다.
                index === 1 ? "translate-y-2 sm:translate-y-3" : undefined,
              )}
            >
              <img
                src={`${ART_ROOT}/${art.id}-320.webp`}
                srcSet={`${ART_ROOT}/${art.id}-320.webp 320w, ${ART_ROOT}/${art.id}-640.webp 640w`}
                sizes="(min-width: 1024px) 13rem, 30vw"
                width={320}
                height={319}
                loading="lazy"
                decoding="async"
                alt={bt(art.ko, art.en)}
                className="aspect-[4/5] w-full object-cover"
              />
            </li>
          ))}
        </ul>
        <figcaption className="mt-4 text-xs leading-5 text-fg-3 sm:mt-5">
          {bt("브랜드 예시 아트 · 실제 게시 작품과 구분됩니다.", "Brand example art · not a published community work.")}
        </figcaption>
      </figure>
    </section>
  );
}
