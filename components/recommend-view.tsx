"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp, useHydrated, useSavedTitleIds } from "@/lib/store";
import { GENRES } from "@/lib/taxonomy";
import type { PlatformId, Title } from "@/lib/types";
import { TitleCard } from "./title-card";
import { MiniPoster } from "./rank-row";
import { Section, Rail } from "./section";
import { TitleFilterPanel } from "@/components/title-filter-panel";
import { useRememberedFilters } from "@/lib/use-remembered-filters";
import { applyTitleFilters, countActiveTitleFilters } from "@/lib/title-filters";
import { genreColor } from "@/lib/genre-color";
import { cn } from "@/lib/utils";
import { Sparkles, Wand2, Shuffle, SlidersHorizontal } from "lucide-react";

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

const ONBOARDING_GENRES = ["판타지", "로판", "현판", "무협", "로맨스", "액션", "스릴러", "드라마", "학원", "SF", "코미디", "게임판타지"];

export function RecommendView({ initialGenres = [] }: { initialGenres?: string[] }) {
  const hydrated = useHydrated();
  const ratings = useApp((s) => s.ratings);
  const reads = useApp((s) => s.reads);
  const setRating = useApp((s) => s.setRating);
  const setRead = useApp((s) => s.setRead);

  const savedIds = useSavedTitleIds();

  const [picked, setPicked] = useState<string[]>(initialGenres);
  const [seedId, setSeedId] = useState<string | null>(null);
  const [data, setData] = useState<RecommendPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { filters, setFilters, remember, toggleRemember } = useRememberedFilters("recommend");
  const [showFilters, setShowFilters] = useState(false);

  // 온보딩 취향 테스트 관련 상태
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<"all" | "webtoon" | "webnovel">("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "ongoing" | "completed">("all");

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

  const pickedRecsRaw = data?.pickedRecs ?? [];
  const pickedLabelGenres = data?.pickedLabelGenres ?? picked;
  const tasteRecsRaw = data?.tasteRecs ?? [];
  const popular = data?.popular ?? [];
  const seed = data?.seed ?? null;
  const similarRaw = data?.similar ?? [];
  const hasTaste = hydrated && !!data && data.profile.ratedCount + data.profile.readCount > 0;

  // 클라이언트 측 필터 적용 — 추천 결과 목록에만 반영(원작 추천 'picked' 동작은 그대로 유지).
  // 'popular' 레일은 비슷한 작품 탐색의 시드 선택기이므로 필터하지 않는다.
  const pickedRecs = applyTitleFilters(pickedRecsRaw, filters, savedIds);
  const tasteRecs = tasteRecsRaw.filter((r) =>
    applyTitleFilters([r.title], filters, savedIds).length > 0
  );
  const similar = applyTitleFilters(similarRaw, filters, savedIds);

  // 데이터에 실제로 존재하는 플랫폼만 facet에 노출(빈 플랫폼 숨김).
  const platformOptions = Array.from(
    new Set(
      [...pickedRecsRaw, ...tasteRecsRaw.map((r) => r.title), ...similarRaw, ...popular].flatMap((t) =>
        t.availability.map((a) => a.platformId)
      )
    )
  ) as PlatformId[];

  const activeFilters = countActiveTitleFilters(filters);

  const handleOnboardingComplete = () => {
    // 1. 선호 장르 설정
    setPicked(selectedGenres);

    // 2. 선택 작품 5.0 평점 및 읽음 처리 적용
    selectedTitles.forEach((id) => {
      setRating(id, 5.0);
      setRead(id, "done");
    });

    // 3. 선호 포맷 및 상태 필터 적용 (배열 형태로 변환)
    setFilters((prev) => ({
      ...prev,
      types: selectedFormat === "all" ? [] : [selectedFormat],
      status: selectedStatus === "all" ? [] : [selectedStatus],
    }));

    setShowOnboarding(false);
  };

  // 온보딩 진행 화면 렌더링
  if (showOnboarding && !loading) {
    const onboardingTitles = popular.slice(0, 12);

    return (
      <div className="rounded-2xl border border-line bg-panel/75 p-6 sm:p-8 max-w-2xl mx-auto my-6 space-y-6 shadow-xl relative overflow-hidden backdrop-blur-md animate-fade-in">
        {/* Progress Bar */}
        <div className="flex items-center justify-between text-xs text-fg-3">
          <span className="font-semibold text-accent flex items-center gap-1">
            <Sparkles size={13} />
            10초 취향 온보딩 테스트
          </span>
          <span>Step {onboardingStep} of 3</span>
        </div>
        <div className="h-1.5 w-full bg-line/40 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${(onboardingStep / 3) * 100}%` }}
          />
        </div>

        {onboardingStep === 1 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight">좋아하는 장르를 2개 이상 선택해주세요 📚</h2>
              <p className="text-xs text-fg-3">선호도에 맞게 맞춤 명작을 다이나믹하게 매핑하여 골라 드립니다.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ONBOARDING_GENRES.map((g) => {
                const selected = selectedGenres.includes(g);
                const color = genreColor(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setSelectedGenres((prev) =>
                        prev.includes(g) ? prev.filter((item) => item !== g) : [...prev, g]
                      );
                    }}
                    style={{
                      borderColor: selected ? color : undefined,
                      backgroundColor: selected ? `${color}18` : undefined,
                      boxShadow: selected ? `0 0 12px -3px ${color}40` : undefined,
                    }}
                    className={cn(
                      "rounded-xl border border-line bg-card p-3 text-sm font-semibold transition-all hover:bg-raised/85 cursor-pointer flex items-center justify-center h-12",
                      selected ? "text-fg font-bold" : "text-fg-2 hover:border-line-strong"
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
                      {g}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-4 border-t border-line/45">
              <button
                type="button"
                disabled={selectedGenres.length < 2}
                onClick={() => setOnboardingStep(2)}
                className="inline-flex items-center justify-center rounded-xl bg-accent px-6 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                다음 단계로
              </button>
            </div>
          </div>
        )}

        {onboardingStep === 2 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight">재미있게 보았거나 좋아하는 작품을 골라주세요 🌟</h2>
              <p className="text-xs text-fg-3">선택한 명작과 유사한 결의 숨겨진 작품들이 가중 추천됩니다. (없으면 바로 넘어가실 수 있습니다)</p>
            </div>
            
            {onboardingTitles.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 max-h-[300px] overflow-y-auto pr-1">
                {onboardingTitles.map((t) => {
                  const selected = selectedTitles.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSelectedTitles((prev) =>
                          prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                        );
                      }}
                      className={cn(
                        "relative flex flex-col items-center p-2 rounded-xl border bg-card transition-all hover:scale-[1.02] cursor-pointer",
                        selected
                          ? "border-accent bg-accent-soft/30 ring-2 ring-accent/10"
                          : "border-line"
                      )}
                    >
                      <MiniPoster title={t} className="w-14 aspect-[3/4] rounded shadow-sm" />
                      <span className="mt-1.5 block text-[0.65rem] font-semibold text-fg text-center line-clamp-1 w-full px-1">
                        {t.title}
                      </span>
                      {selected && (
                        <span className="absolute top-1.5 right-1.5 bg-accent text-white rounded-full size-4 flex items-center justify-center text-[10px] font-bold shadow">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-fg-3 py-10 text-center">선택 가능한 작품 데이터를 조회하고 있습니다...</p>
            )}

            <div className="flex justify-between pt-4 border-t border-line/45">
              <button
                type="button"
                onClick={() => setOnboardingStep(1)}
                className="inline-flex items-center justify-center rounded-xl border border-line bg-card px-5 py-2.5 text-xs font-semibold text-fg-2 hover:bg-raised cursor-pointer transition-all"
              >
                이전으로
              </button>
              <button
                type="button"
                onClick={() => setOnboardingStep(3)}
                className="inline-flex items-center justify-center rounded-xl bg-accent px-6 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-accent/90 cursor-pointer transition-all"
              >
                {selectedTitles.length > 0 ? "다음 단계로" : "선택 없이 건너뛰기"}
              </button>
            </div>
          </div>
        )}

        {onboardingStep === 3 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight">마지막으로, 감상 취향을 입력해주세요 ⚙️</h2>
              <p className="text-xs text-fg-3">원하는 형식과 연재 형태를 조율하여 정밀한 리스트를 완성합니다.</p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-fg-3">선호 포맷</span>
                <div className="flex gap-2">
                  {[
                    { value: "all", label: "웹툰 & 웹소설" },
                    { value: "webtoon", label: "웹툰만" },
                    { value: "webnovel", label: "웹소설만" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedFormat(opt.value as any)}
                      className={cn(
                        "flex-1 rounded-xl border p-3 text-xs font-semibold transition-all cursor-pointer",
                        selectedFormat === opt.value
                          ? "border-accent bg-accent-soft/30 text-accent shadow-sm"
                          : "border-line bg-card text-fg-2 hover:bg-raised"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-fg-3">선호 상태</span>
                <div className="flex gap-2">
                  {[
                    { value: "all", label: "전체 상태" },
                    { value: "completed", label: "정주행 완결작" },
                    { value: "ongoing", label: "실시간 연재작" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedStatus(opt.value as any)}
                      className={cn(
                        "flex-1 rounded-xl border p-3 text-xs font-semibold transition-all cursor-pointer",
                        selectedStatus === opt.value
                          ? "border-accent bg-accent-soft/30 text-accent shadow-sm"
                          : "border-line bg-card text-fg-2 hover:bg-raised"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-line/45">
              <button
                type="button"
                onClick={() => setOnboardingStep(2)}
                className="inline-flex items-center justify-center rounded-xl border border-line bg-card px-5 py-2.5 text-xs font-semibold text-fg-2 hover:bg-raised cursor-pointer transition-all"
              >
                이전으로
              </button>
              <button
                type="button"
                onClick={handleOnboardingComplete}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-6 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-accent/90 cursor-pointer transition-all animate-pulse-soft"
              >
                <Wand2 size={13} />
                취향 분석 완료 및 추천받기
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-16 animate-fade-in">
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

      {/* 추천 결과 필터 — '필터' 토글 뒤에 패널을 둠 */}
      <div className="-mb-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            showFilters || activeFilters > 0
              ? "border-accent/60 bg-accent-soft/60 text-fg"
              : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
          )}
        >
          <SlidersHorizontal size={15} className="text-accent" /> 필터
          {activeFilters > 0 && (
            <span className="rounded-full bg-accent/15 px-1.5 text-[0.68rem] text-accent">
              {activeFilters}
            </span>
          )}
        </button>
        {showFilters && (
          <TitleFilterPanel
            value={filters}
            onChange={setFilters}
            facets={[
              "saved",
              "type",
              "genre",
              "status",
              "platform",
              "age",
              "pricing",
              "minRating",
              "year",
              "tag",
            ]}
            platformOptions={platformOptions}
            savedCount={savedIds.size}
            remember={remember}
            onToggleRemember={toggleRemember}
          />
        )}
      </div>

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

      {/* 내 평가 기반 (평가가 없을 땐 취향 온보딩 테스트 카드 노출) */}
      {hasTaste ? (
        tasteRecs.length > 0 && (
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
        )
      ) : (
        <div className="rounded-2xl border border-line bg-panel/35 p-6 sm:p-8 flex flex-col items-center text-center space-y-4 max-w-xl mx-auto my-4 shadow-md">
          <div className="size-12 rounded-full bg-accent-soft/30 flex items-center justify-center text-accent">
            <Sparkles size={22} className="animate-pulse-soft" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-fg">나를 위한 개인화 추천 받기</h3>
            <p className="text-xs text-fg-3 max-w-sm leading-relaxed">
              인생작 몇 편과 선호하는 장르를 선택해주시면, 툰스펙트럼의 다축 AI 엔진이 전 플랫폼을 가로질러 맞춤 작품을 즉시 제안해 드립니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedGenres(picked);
              setShowOnboarding(true);
              setOnboardingStep(1);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 text-xs font-semibold text-white hover:bg-accent/90 transition-all cursor-pointer shadow-md"
          >
            <Wand2 size={13} />
            10초 취향 테스트 시작
          </button>
        </div>
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
    </div>
  );
}
