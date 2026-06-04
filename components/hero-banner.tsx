"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import Link from "@/src/compat/router-link";
import type { Title } from "@/lib/types";
import { TitlePoster } from "./title-poster";
import { GenreChip } from "./ui/chip";
import { RatingInline } from "./ui/stars";
import { AvailabilityDots } from "./availability";
import { statsAreEstimated } from "@/lib/estimate";
import { formatCount } from "@/lib/utils";
import { genreColor } from "@/lib/genre-color";
import { Sparkles, ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";

const AUTOPLAY_MS = 5500;

// 홈 '이 주의 발견' 배너 — embla 캐러셀(경량). 표지를 무대 삼은 시네마틱 배경(표지가 주인공) +
// 에디토리얼 정보(장르 스펙트럼·serif 한 줄·어디서 봐·평점) + 자동회전 진행바. 드래그/화살표/닷.
export function HeroBanner({ items }: { items: Title[] }) {
  const slides = items.slice(0, 6);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start", duration: 30 }, [
    Autoplay({ delay: AUTOPLAY_MS, stopOnInteraction: false, stopOnMouseEnter: true }),
  ]);
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect).on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect).off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (slides.length === 0) return null;

  return (
    <div
      className="group relative"
      style={{ animation: "fade-up 0.7s var(--ease-out-expo) 0.1s both" }}
      aria-roledescription="carousel"
      aria-label="이 주의 추천 작품"
    >
      <div className="absolute -top-3 left-4 z-20">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-wide text-on-accent shadow-[0_6px_20px_-4px_oklch(0.7_0.19_45/0.55)] ring-2 ring-canvas">
          <Sparkles size={13} className="shrink-0" /> 이 주의 발견
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-card surface-hl" ref={emblaRef}>
        <div className="flex">
          {slides.map((t) => {
            const hue = genreColor(t.genres[0] ?? "드라마", 0.72);
            return (
              <div key={t.id} className="min-w-0 flex-[0_0_100%]" aria-roledescription="slide">
                <Link href={`/title/${t.slug}`} className="group/slide relative block">
                  {/* 시네마틱 배경 — 표지를 무대로(표지가 주인공). warm 스크림으로 가독성 확보. */}
                  <div className="absolute inset-0" aria-hidden>
                    {t.coverImage ? (
                      <img
                        src={t.coverImage}
                        alt=""
                        loading="lazy"
                        className="size-full scale-110 object-cover opacity-[0.14] transition-transform duration-700 ease-out-expo group-hover/slide:scale-[1.16]"
                      />
                    ) : null}
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `radial-gradient(120% 120% at 84% 12%, ${genreColor(t.genres[0] ?? "드라마", 0.72)}1f, transparent 56%), linear-gradient(100deg, oklch(0.18 0.012 70 / 0.97) 34%, oklch(0.18 0.012 70 / 0.55))`,
                      }}
                    />
                  </div>

                  <div className="relative grid grid-cols-[5.5rem_1fr] items-center gap-4 p-4 sm:grid-cols-[11rem_1fr] sm:gap-6 sm:p-6">
                    <div className="overflow-hidden rounded-xl shadow-[0_20px_44px_-22px_oklch(0.1_0.02_70/0.85)] ring-1 ring-line/60 transition-transform duration-500 ease-out-expo group-hover/slide:-translate-y-0.5">
                      <TitlePoster title={t} size="lg" className="rounded-none border-0" priority titleAs="div" />
                    </div>

                    <div className="flex min-w-0 flex-col gap-2 sm:gap-3">
                      <div className="flex flex-wrap gap-1.5">
                        {t.genres.slice(0, 2).map((genre) => (
                          <GenreChip key={genre} genre={genre} size="sm" />
                        ))}
                      </div>
                      <h2 className="text-pretty text-xl font-bold leading-tight text-fg sm:text-2xl lg:text-[1.75rem]">
                        {t.title}
                      </h2>
                      <p className="truncate text-xs text-fg-3">
                        {t.author}
                        {t.artist && t.artist !== t.author ? ` · 그림 ${t.artist}` : ""}
                      </p>
                      <RatingInline
                        value={t.stats.ratingAvg}
                        count={t.stats.ratingCount}
                        estimated={statsAreEstimated(t)}
                        size="sm"
                      />
                      <p className="line-clamp-2 max-w-prose font-serif text-sm italic leading-relaxed text-fg-2">
                        {t.editorNote ?? t.synopsis}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <AvailabilityDots availability={t.availability} max={4} />
                        <span className="numeral text-[0.72rem] text-fg-3 tnum">
                          {formatCount(t.stats.views)} 조회
                        </span>
                        <span className="ml-auto inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[0.78rem] font-semibold text-on-accent transition-transform duration-150 ease-out-expo group-hover/slide:translate-x-0.5">
                          보러가기
                          <ArrowRight size={14} />
                        </span>
                      </div>
                    </div>
                  </div>
                  <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${hue}, transparent)` }} />
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            aria-label="이전 추천작"
            onClick={() => emblaApi?.scrollPrev()}
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-panel/95 p-1.5 text-fg-2 transition-colors hover:bg-raised hover:text-fg sm:grid"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="다음 추천작"
            onClick={() => emblaApi?.scrollNext()}
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-panel/95 p-1.5 text-fg-2 transition-colors hover:bg-raised hover:text-fg sm:grid"
          >
            <ChevronRight size={18} />
          </button>
          {/* 자동회전 진행바 — 슬라이드 전환마다 재시작, 호버 시 일시정지(autoplay 동기). */}
          <span
            key={selected}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left rounded-full bg-accent/75 [animation:hero-progress_5500ms_linear] group-hover:[animation-play-state:paused]"
          />
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {slides.map((t, i) => (
              <button
                key={t.id}
                type="button"
                aria-label={`${i + 1}번째 추천작 보기`}
                aria-current={i === selected}
                onClick={() => emblaApi?.scrollTo(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === selected ? "w-5 bg-accent" : "w-1.5 bg-line hover:bg-line-strong"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
