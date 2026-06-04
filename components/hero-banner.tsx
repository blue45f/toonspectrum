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
import { Sparkles, ChevronLeft, ChevronRight } from "lucide-react";

// 홈 상단 추천 배너 캐러셀 — embla(경량). 자동 회전 + 드래그/스와이프 + 닷 + 화살표.
// 단일 스포트라이트를 여러 추천작 회전 배너로 고도화. 마우스 올리면 자동회전 일시정지.
export function HeroBanner({ items }: { items: Title[] }) {
  const slides = items.slice(0, 6);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start", duration: 28 }, [
    Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true }),
  ]);
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (slides.length === 0) return null;

  return (
    <div
      className="relative"
      style={{ animation: "fade-up 0.7s var(--ease-out-expo) 0.1s both" }}
      aria-roledescription="carousel"
      aria-label="이 주의 추천 작품"
    >
      <div className="absolute -top-3 left-4 z-10">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-wide text-on-accent shadow-[0_6px_20px_-4px_oklch(0.7_0.19_45/0.55)] ring-2 ring-canvas">
          <Sparkles size={13} className="shrink-0" /> 이 주의 발견
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-card surface-hl" ref={emblaRef}>
        <div className="flex">
          {slides.map((t) => (
            <div key={t.id} className="min-w-0 flex-[0_0_100%]" aria-roledescription="slide">
              <Link href={`/title/${t.slug}`} className="group block">
                <div className="grid grid-cols-[1.1fr_1fr]">
                  <div className="overflow-hidden transition-transform duration-500 ease-out-expo group-hover:scale-[1.03]">
                    <TitlePoster title={t} size="lg" className="rounded-none border-0" priority titleAs="div" />
                  </div>
                  <div className="flex flex-col gap-3 p-5">
                    <div className="flex flex-wrap gap-1.5">
                      {t.genres.slice(0, 2).map((genre) => (
                        <GenreChip key={genre} genre={genre} size="sm" />
                      ))}
                    </div>
                    <h2 className="text-pretty text-xl font-bold leading-tight">{t.title}</h2>
                    <RatingInline
                      value={t.stats.ratingAvg}
                      count={t.stats.ratingCount}
                      estimated={statsAreEstimated(t)}
                      size="sm"
                    />
                    <p className="line-clamp-3 font-serif text-sm italic leading-relaxed text-fg-2">
                      {t.editorNote ?? t.synopsis}
                    </p>
                    <div className="mt-auto flex items-center justify-between border-t border-line pt-3">
                      <AvailabilityDots availability={t.availability} max={4} />
                      <span className="text-xs font-medium text-accent">
                        {formatCount(t.stats.views)} 조회
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <>
          {/* 화살표 (sm+) */}
          <button
            type="button"
            aria-label="이전 추천작"
            onClick={() => emblaApi?.scrollPrev()}
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full border border-line bg-panel/80 p-1.5 text-fg-2 backdrop-blur transition-colors hover:bg-panel hover:text-fg sm:grid"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="다음 추천작"
            onClick={() => emblaApi?.scrollNext()}
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full border border-line bg-panel/80 p-1.5 text-fg-2 backdrop-blur transition-colors hover:bg-panel hover:text-fg sm:grid"
          >
            <ChevronRight size={18} />
          </button>
          {/* 닷 */}
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {slides.map((t, i) => (
              <button
                key={t.id}
                type="button"
                aria-label={`${i + 1}번째 추천작 보기`}
                aria-current={i === selected}
                onClick={() => emblaApi?.scrollTo(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === selected ? "w-5 bg-accent" : "w-1.5 bg-line-strong hover:bg-fg-3"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
