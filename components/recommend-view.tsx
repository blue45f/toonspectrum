"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp, useHydrated } from "@/lib/store";
import { GENRES } from "@/lib/taxonomy";
import type { Title } from "@/lib/types";
import { TitleCard } from "./title-card";
import { MiniPoster } from "./rank-row";
import { Section, Rail } from "./section";
import { genreColor } from "@/lib/genre-color";
import { cn } from "@/lib/utils";
import { Sparkles, Wand2, Shuffle } from "lucide-react";

interface RecommendPayload {
  pickedRecs: Title[];
  pickedLabelGenres: string[];
  tasteRecs: { title: Title; reason: string }[];
  popular: Title[];
  seed: Title | null;
  similar: Title[];
  profile: {
    ratedCount: number;
    readCount: number;
    topGenres: { name: string; weight: number }[];
  };
}

export function RecommendView({ initialGenres = [] }: { initialGenres?: string[] }) {
  const hydrated = useHydrated();
  const ratings = useApp((s) => s.ratings);
  const reads = useApp((s) => s.reads);

  const [picked, setPicked] = useState<string[]>(initialGenres);
  const [seedId, setSeedId] = useState<string | null>(null);
  const [data, setData] = useState<RecommendPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const requestBody = useMemo(
    () => JSON.stringify({ picked, seedId, ratings, reads }),
    [picked, seedId, ratings, reads]
  );

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch("/api/recommend", {
      method: "POST",
      body: requestBody,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("recommend failed");
        return res.json() as Promise<RecommendPayload>;
      })
      .then((payload) => {
        if (alive) setData(payload);
      })
      .catch((e) => {
        if (alive && (e as Error)?.name !== "AbortError") {
          setData(null);
          setError(true);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [requestBody, reloadKey]);

  const pickedRecs = data?.pickedRecs ?? [];
  const pickedLabelGenres = data?.pickedLabelGenres ?? picked;
  const tasteRecs = data?.tasteRecs ?? [];
  const popular = data?.popular ?? [];
  const seed = data?.seed ?? null;
  const similar = data?.similar ?? [];
  const hasTaste = hydrated && !!data && data.profile.ratedCount + data.profile.readCount > 0;

  return (
    <div className="flex flex-col gap-16">
      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warn/40 bg-[oklch(0.82_0.15_80/0.08)] p-5 text-sm text-fg-2">
          <Sparkles size={18} className="shrink-0 text-warn" />
          <p className="flex-1">추천을 불러오지 못했어요. 장르 선택은 그대로 두고 다시 시도할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            다시 시도
          </button>
        </div>
      )}
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
            <span className="numeral text-fg">{loading ? "..." : pickedRecs.length}</span>편
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
          desc={`평가 ${data.profile.ratedCount}편, 관심 ${data.profile.readCount}편을 분석했어요`}
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
