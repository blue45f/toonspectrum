import { apiFetch } from "@/platform/api";
import { ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";

import type { ContentIntensity } from "./engagement-model";
import { useEngagement } from "./engagement-store";

import type { Title } from "@/shared/lib/types";

import { RecommendOnboarding } from "@/shared/components/recommend-view-onboarding";
import { Container } from "@/shared/components/section";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { PageIntro } from "@/shared/components/page-intro";
import { useDocumentTitle, useMetaRobots } from "@/shared/seo/use-document-title";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";

const AVOID_TAGS = ["폭력", "피폐", "고어", "공포", "괴롭힘", "자해", "성적폭력", "집착"] as const;

const INTENSITY: readonly {
  value: ContentIntensity;
  label: string;
  description: string;
}[] = [
  { value: "gentle", label: "편안하게", description: "전체·12세 작품을 우선합니다." },
  { value: "balanced", label: "균형 있게", description: "19세 작품은 추천에서 제외합니다." },
  { value: "unrestricted", label: "제한 없음", description: "연령 필터는 적용하지 않습니다." },
];

/**
 * engagement 스토어는 IndexedDB 비동기 persist라, 복원이 끝나기 전에는
 * tastePreferences가 초기값이라 저장된 취향이 없는 것처럼 보인다.
 * 복원 완료를 구독해 폼 초기값 동기화 시점으로 쓴다.
 */
function useEngagementHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useEngagement.persist.onFinishHydration(cb),
    () => useEngagement.persist.hasHydrated(),
    () => false,
  );
}

export function TasteOnboardingPage() {
  useDocumentTitle("취향 스펙트럼 만들기");
  useMetaRobots(NOINDEX_PRIVATE_ROBOTS);
  const navigate = useNavigate();
  const setRating = useApp((state) => state.setRating);
  const setRead = useApp((state) => state.setRead);
  const existing = useEngagement((state) => state.tastePreferences);
  const setTastePreferences = useEngagement((state) => state.setTastePreferences);
  const hydrated = useEngagementHydrated();
  const [popular, setPopular] = useState<Title[]>([]);
  const [avoidTags, setAvoidTags] = useState<string[]>([...(existing?.avoidTags ?? [])]);
  const [contentIntensity, setContentIntensity] = useState<ContentIntensity>(
    existing?.contentIntensity ?? "balanced",
  );
  // 복원이 끝나면 저장돼 있던 취향을 폼에 반영한다. 단, 사용자가 이미 손댄 뒤에는
  // 복원값으로 되돌리지 않는다. 이 동기화가 없으면 재방문자가 기본값 폼을 그대로
  // 완료해 저장된 회피 태그·감상 강도가 조용히 사라진다.
  const formTouchedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || formTouchedRef.current || !existing) return;
    setAvoidTags([...existing.avoidTags]);
    setContentIntensity(existing.contentIntensity);
  }, [hydrated, existing]);
  const [error, setError] = useState(false);
  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/api/titles?sort=popular&limit=12", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("popular titles unavailable");
        const payload = await response.json() as { items?: Title[] };
        setPopular(Array.isArray(payload.items) ? payload.items : []);
        setError(false);
      })
      .catch((cause: unknown) => {
        if ((cause as Error)?.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [loadTick]);

  const complete = (
    selectedGenres: string[],
    selectedTitles: string[],
    selectedFormat: "all" | "webtoon" | "webnovel",
    selectedStatus: "all" | "ongoing" | "completed",
  ) => {
    for (const titleId of selectedTitles) {
      setRating(titleId, 5);
      setRead(titleId, "done");
    }
    setTastePreferences({
      genres: selectedGenres,
      selectedTitleIds: selectedTitles,
      format: selectedFormat,
      status: selectedStatus,
      avoidTags,
      contentIntensity,
      completedAt: new Date().toISOString(),
    });
    const query = new URLSearchParams();
    if (selectedGenres.length > 0) query.set("taste", selectedGenres.join(","));
    if (selectedFormat !== "all") query.set("types", selectedFormat);
    if (selectedStatus !== "all") query.set("status", selectedStatus);
    navigate(`/recommend${query.size > 0 ? `?${query.toString()}` : ""}`, { replace: true });
  };

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <img
        src="/images/hero-main.webp"
        alt=""
        loading="lazy"
        decoding="async"
        className="mb-8 h-36 w-full rounded-3xl object-cover sm:h-44"
      />
      <PageIntro variant="unfold">
      <header className="mx-auto max-w-3xl text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Sparkles size={22} aria-hidden="true" />
        </span>
        <p className="eyebrow mt-4 text-accent">TASTE ONBOARDING</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">나의 취향 스펙트럼 만들기</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-fg-2">
          장르와 좋아한 작품을 고르면 추천의 시작점을 만듭니다. 아래 회피 태그는 카탈로그에
          같은 태그가 명시된 작품에만 적용하며, 공식 콘텐츠 경고를 대신하지 않습니다.
        </p>
      </header>

      <section className="mx-auto mt-8 max-w-3xl rounded-3xl border border-line bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-good/10 text-good">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-black text-fg">감상 강도와 회피 태그</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">언제든 다시 바꿀 수 있으며, 선택 내용은 현재 브라우저의 추천 화면에 사용됩니다.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {INTENSITY.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={contentIntensity === option.value}
              onClick={() => { formTouchedRef.current = true; setContentIntensity(option.value); }}
              className={cn(
                "min-h-20 rounded-2xl border p-3 text-left transition-colors",
                contentIntensity === option.value
                  ? "border-accent bg-accent-soft/40"
                  : "border-line bg-panel hover:border-line-strong",
              )}
            >
              <strong className="text-sm text-fg">{option.label}</strong>
              <span className="mt-1 block text-xs leading-5 text-fg-3">{option.description}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {AVOID_TAGS.map((tag) => {
            const selected = avoidTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selected}
                onClick={() => { formTouchedRef.current = true; setAvoidTags((current) => selected
                  ? current.filter((value) => value !== tag)
                  : [...current, tag]); }}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-bold transition-colors",
                  "pointer-coarse:min-h-11",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  selected
                    ? "border-warn/45 bg-warn/10 text-warn"
                    : "border-line bg-panel text-fg-2 hover:border-line-strong",
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </section>

      {error ? (
        <ErrorState
          className="mx-auto mt-5 max-w-2xl"
          title="인기 작품 목록을 불러오지 못했습니다"
          message="장르와 형식만 선택해도 취향 설정을 완료할 수 있습니다."
          onRetry={() => setLoadTick((tick) => tick + 1)}
        />
      ) : null}

      <RecommendOnboarding
        initialGenres={[...(existing?.genres ?? [])]}
        popular={popular}
        onComplete={complete}
        onCancel={() => navigate("/recommend")}
      />
      </PageIntro>
    </Container>
  );
}
