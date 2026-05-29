"use client";

import { useMemo, useState } from "react";
import { TITLES, getTitle } from "@/lib/data";
import { buildTasteProfile, recommendForTaste, similarTitles } from "@/lib/recommend";
import { useApp, useHydrated } from "@/lib/store";
import { GENRES } from "@/lib/taxonomy";
import { TitleCard } from "./title-card";
import { MiniPoster } from "./rank-row";
import { Section, Rail } from "./section";
import { genreColor } from "@/lib/genre-color";
import { cn } from "@/lib/utils";
import { Sparkles, Wand2, Shuffle } from "lucide-react";

// 베이즈 보정 평점 (적은 표본 방지)
function bayes(t: (typeof TITLES)[number]) {
  return (4 * 800 + t.stats.ratingAvg * t.stats.ratingCount) / (800 + t.stats.ratingCount);
}

export function RecommendView({ initialGenres = [] }: { initialGenres?: string[] }) {
  const hydrated = useHydrated();
  const ratings = useApp((s) => s.ratings);
  const reads = useApp((s) => s.reads);

  const [picked, setPicked] = useState<string[]>(initialGenres);
  const [seedId, setSeedId] = useState<string | null>(null);

  const seen = useMemo(
    () => new Set([...Object.keys(ratings), ...Object.keys(reads)]),
    [ratings, reads]
  );
  const profile = useMemo(
    () => buildTasteProfile(TITLES, ratings, reads),
    [ratings, reads]
  );

  // 선택 장르 기반 즉시 추천 (콜드스타트: 저장된 취향 없어도 작동)
  const pickedRecs = useMemo(() => {
    const genres = picked.length
      ? picked
      : profile.topGenres.slice(0, 3).map((g) => g.name);
    if (!genres.length) {
      return TITLES.filter((t) => t.featured).slice(0, 12);
    }
    return TITLES.filter((t) => t.genres.some((g) => genres.includes(g)) && !seen.has(t.id))
      .sort((a, b) => bayes(b) - bayes(a))
      .slice(0, 15);
  }, [picked, profile.topGenres, seen]);

  const pickedLabelGenres = picked.length
    ? picked
    : profile.topGenres.slice(0, 3).map((g) => g.name);

  // 내 평가 기반 추천
  const tasteRecs = useMemo(
    () => recommendForTaste(TITLES, profile, seen, 12),
    [profile, seen]
  );

  // 비슷한 작품
  const popular = useMemo(
    () => [...TITLES].sort((a, b) => b.stats.views - a.stats.views).slice(0, 12),
    []
  );
  const seed = (seedId && getTitle(seedId)) || popular[0];
  const similar = useMemo(() => (seed ? similarTitles(TITLES, seed, 12) : []), [seed]);

  const hasTaste = hydrated && profile.ratedCount + Object.keys(reads).length > 0;

  return (
    <div className="flex flex-col gap-16">
      {/* 취향 픽 — 콜드스타트 친화 */}
      <section>
        <div className="mb-5 flex items-center gap-2">
          <Wand2 size={18} className="text-accent" />
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">어떤 결이 끌리나요?</h2>
        </div>
        <p className="mb-4 max-w-xl text-sm text-fg-3">
          끌리는 장르를 고르면 즉시 추천이 갱신됩니다. 평가 이력이 있다면 그것까지 함께 반영해요.
        </p>
        <div className="mb-7 flex flex-wrap gap-2">
          {GENRES.map((g) => {
            const on = picked.includes(g);
            return (
              <button
                key={g}
                onClick={() =>
                  setPicked((p) => (p.includes(g) ? p.filter((x) => x !== g) : [...p, g]))
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-transform duration-150 hover:scale-105",
                  on && "ring-1"
                )}
                style={{
                  color: genreColor(g, on ? 0.92 : 0.82),
                  backgroundColor: `color-mix(in oklch, ${genreColor(g, 0.6)} ${on ? 26 : 12}%, transparent)`,
                  borderColor: `color-mix(in oklch, ${genreColor(g, 0.6)} ${on ? 60 : 28}%, transparent)`,
                }}
              >
                {g}
              </button>
            );
          })}
          {picked.length > 0 && (
            <button
              onClick={() => setPicked([])}
              className="rounded-full border border-line px-3 py-1.5 text-sm text-fg-3 hover:text-fg"
            >
              초기화
            </button>
          )}
        </div>

        {pickedLabelGenres.length > 0 && (
          <p className="mb-4 text-sm text-fg-2">
            <span className="text-accent">{pickedLabelGenres.join(" · ")}</span> 취향으로 고른{" "}
            <span className="numeral text-fg">{pickedRecs.length}</span>편
          </p>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {pickedRecs.map((t) => (
            <TitleCard key={t.id} title={t} size="sm" />
          ))}
        </div>
      </section>

      {/* 내 평가 기반 */}
      {hasTaste && tasteRecs.length > 0 && (
        <Section
          eyebrow="FOR YOU"
          title="당신의 평가가 가리키는 다음 작품"
          desc={`평가 ${profile.ratedCount}편, 관심 ${Object.keys(reads).length}편을 분석했어요`}
          action={{ label: "취향 분석", href: "/library?tab=taste" }}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
            {tasteRecs.map(({ title, reason }) => (
              <div key={title.id} className="flex flex-col gap-1.5">
                <TitleCard title={title} size="sm" />
                <p className="text-[0.7rem] leading-snug text-accent">{reason}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 비슷한 작품 찾기 */}
      <section>
        <div className="mb-5 flex items-center gap-2">
          <Shuffle size={18} className="text-accent" />
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">이 작품과 비슷한</h2>
        </div>
        <p className="mb-4 text-sm text-fg-3">기준 작품을 고르면 장르·태그·어댑테이션으로 닮은 작품을 찾아줍니다.</p>
        <Rail itemClassName="w-14">
          {popular.map((t) => (
            <button
              key={t.id}
              onClick={() => setSeedId(t.id)}
              className={cn(
                "block w-14 rounded-md transition-transform hover:scale-105",
                seed?.id === t.id && "ring-2 ring-accent ring-offset-2 ring-offset-canvas"
              )}
              title={t.title}
            >
              <MiniPoster title={t} className="w-full" />
            </button>
          ))}
        </Rail>
        {seed && (
          <div className="mt-6">
            <p className="mb-4 text-sm text-fg-2">
              <span className="font-semibold text-fg">{seed.title}</span>
              <span className="text-fg-3">와 비슷한 작품</span>
            </p>
            <Rail>
              {similar.map((t) => (
                <TitleCard key={t.id} title={t} />
              ))}
            </Rail>
          </div>
        )}
      </section>

      {!hasTaste && (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-5 text-sm text-fg-2">
          <Sparkles size={18} className="shrink-0 text-accent" />
          <p>
            작품을 평가하거나 서재에 담으면 추천이 훨씬 정교해집니다.{" "}
            <a href="/ranking" className="text-accent hover:underline">
              랭킹에서 평가 시작하기 →
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
