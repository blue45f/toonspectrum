/**
 * Recipe browser and deterministic render-load diagnostics for the canonical smart-filter stack.
 */

import { useId, useMemo, useState } from "react";

import {
  STUDIO_EFFECT_RECIPE_CATEGORY_ORDER,
  STUDIO_EFFECT_RECIPES,
  applyStudioEffectRecipe,
  diagnoseStudioEffectStack,
  estimateStudioEffectRecipeCost,
  searchStudioEffectRecipes,
  studioEffectCostTierLabel,
  studioEffectRecipeCategoryLabel,
  type StudioEffectRecipeApplyMode,
  type StudioEffectRecipeCategory,
} from "./studio-effects-workspace";

import {
  createEmptyStudioAdjustmentStack,
  type StudioAdjustmentStack,
} from "./studio-adjustment-stack";

export interface StudioEffectsWorkspacePanelProps {
  readonly stack: StudioAdjustmentStack;
  readonly onChange: (next: StudioAdjustmentStack) => void;
}

const MODE_LABEL: Readonly<Record<StudioEffectRecipeApplyMode, string>> = {
  append: "현재 스택에 추가",
  replace: "현재 스택 교체",
};

type StudioEffectAnnouncement = Readonly<{
  message: string;
  tone: "info" | "success" | "warning" | "error";
}>;

function announcementTone(tone: StudioEffectAnnouncement["tone"]): string {
  switch (tone) {
    case "info": return "border-line bg-card/60 text-fg-2";
    case "success": return "border-good/35 bg-good/10 text-good";
    case "warning": return "border-warn/35 bg-warn/10 text-warn";
    case "error": return "border-bad/35 bg-bad/10 text-bad";
  }
}

function diagnosticTone(tier: ReturnType<typeof diagnoseStudioEffectStack>["tier"]): string {
  switch (tier) {
    case "light": return "border-good/45 bg-good/10 text-good";
    case "balanced": return "border-warn/45 bg-warn/10 text-warn";
    case "heavy": return "border-bad/45 bg-bad/10 text-bad";
  }
}

export function StudioEffectsWorkspacePanel({
  stack,
  onChange,
}: StudioEffectsWorkspacePanelProps): React.ReactElement {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StudioEffectRecipeCategory | "all">("all");
  const [mode, setMode] = useState<StudioEffectRecipeApplyMode>("append");
  const [showAll, setShowAll] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [announcement, setAnnouncement] = useState<StudioEffectAnnouncement | null>(null);

  const diagnostics = useMemo(() => diagnoseStudioEffectStack(stack), [stack]);
  const matchingRecipes = useMemo(
    () => searchStudioEffectRecipes(query, category),
    [category, query],
  );
  const compactCatalog = !query.trim() && category === "all" && !showAll;
  const visibleRecipes = compactCatalog
    ? matchingRecipes.filter((recipe) => recipe.featured)
    : matchingRecipes;

  function applyRecipe(recipeId: string): void {
    setClearArmed(false);
    const receipt = applyStudioEffectRecipe(stack, recipeId, mode);
    if (receipt.status !== "accepted" || !receipt.recipe) {
      setAnnouncement({
        message: receipt.status === "serialized-byte-budget-exceeded"
          ? "효과 스택 저장 예산을 초과해 기존 스택을 유지했습니다."
          : "레시피를 적용하지 못했습니다.",
        tone: "error",
      });
      return;
    }
    onChange(receipt.stack);
    setAnnouncement({
      message: mode === "replace"
        ? `${receipt.recipe.title} 레시피로 교체했습니다. 기존 ${receipt.replacedCount}개 효과는 이 변경에서 제거되었습니다.`
        : `${receipt.recipe.title} 레시피 ${receipt.addedCount}개 효과를 현재 스택 뒤에 추가했습니다.`,
      tone: "success",
    });
  }

  return (
    <section
      data-studio-effects-workspace="true"
      aria-labelledby={`${searchId}-title`}
      className="space-y-3 rounded-xl border border-accent/25 bg-accent-soft/10 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-accent">
            효과 작업공간
          </p>
          <h3 id={`${searchId}-title`} className="mt-0.5 text-sm font-bold text-fg">
            웹툰 레시피 · 렌더 진단
          </h3>
          <p className="mt-1 max-w-2xl text-[0.63rem] leading-relaxed text-fg-3">
            현재 스마트 필터 엔진만 조합합니다. 원본·Undo·필터 마스크·내보내기 경로는 그대로 유지됩니다.
            부하 점수는 기기 시간이 아닌 상대적 휴리스틱입니다.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <span
            className={`rounded-full border px-2 py-1 text-[0.6rem] font-bold ${diagnosticTone(diagnostics.tier)}`}
          >
            {studioEffectCostTierLabel(diagnostics.tier)} · {diagnostics.costPoints}점
          </span>
          {diagnostics.entryCount > 0 ? (
            <button
              type="button"
              aria-label={clearArmed ? "전체 효과 제거 확인" : "전체 효과 제거"}
              onBlur={() => {
                if (!clearArmed) return;
                setClearArmed(false);
                setAnnouncement({
                  message: "전체 효과 제거를 취소했습니다.",
                  tone: "info",
                });
              }}
              onClick={() => {
                if (!clearArmed) {
                  setClearArmed(true);
                  setAnnouncement({
                    message: "전체 효과를 제거하려면 같은 버튼을 한 번 더 누르세요. 이 변경은 Undo할 수 있습니다.",
                    tone: "warning",
                  });
                  return;
                }
                onChange(createEmptyStudioAdjustmentStack());
                setClearArmed(false);
                setAnnouncement({
                  message: "스마트 필터 스택의 모든 효과를 제거했습니다.",
                  tone: "success",
                });
              }}
              className={
                clearArmed
                  ? "min-h-9 rounded-full border border-bad/50 bg-bad/10 px-2.5 text-[0.6rem] font-bold text-bad pointer-coarse:min-h-11"
                  : "min-h-9 rounded-full border border-line bg-card/70 px-2.5 text-[0.6rem] font-semibold text-fg-3 hover:border-bad/40 hover:text-bad pointer-coarse:min-h-11"
              }
            >
              {clearArmed ? "한 번 더 눌러 제거" : "전체 제거"}
            </button>
          ) : null}
        </div>
      </div>

      <div
        role="group"
        aria-label="효과 스택 진단 요약"
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
      >
        <div className="rounded-lg border border-line/70 bg-card/60 px-2 py-2">
          <p className="text-[0.56rem] font-semibold text-fg-3">활성 효과</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-fg">{diagnostics.activeCount}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-card/60 px-2 py-2">
          <p className="text-[0.56rem] font-semibold text-fg-3">꺼짐 / 0%</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-fg">
            {diagnostics.disabledCount} / {diagnostics.zeroOpacityCount}
          </p>
        </div>
        <div className="rounded-lg border border-line/70 bg-card/60 px-2 py-2">
          <p className="text-[0.56rem] font-semibold text-fg-3">고비용 효과</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-fg">{diagnostics.expensiveEngineCount}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-card/60 px-2 py-2">
          <p className="text-[0.56rem] font-semibold text-fg-3">권장 미리보기</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-fg">
            {Math.round(diagnostics.recommendedPreviewScale * 100)}%
          </p>
        </div>
      </div>

      {diagnostics.messages.length > 0 ? (
        <ul className="space-y-1" aria-label="효과 스택 진단">
          {diagnostics.messages.slice(0, 4).map((message) => (
            <li
              key={message.id}
              className={
                message.severity === "warning"
                  ? "rounded-lg border border-warn/35 bg-warn/10 px-2.5 py-2"
                  : "rounded-lg border border-line/70 bg-card/45 px-2.5 py-2"
              }
            >
              <p className="text-[0.62rem] font-bold text-fg-2">{message.title}</p>
              <p className="mt-0.5 text-[0.6rem] leading-relaxed text-fg-3">{message.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2 rounded-xl border border-line/70 bg-card/45 p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <fieldset className="flex min-w-0 flex-wrap items-center gap-1" aria-label="레시피 적용 방식">
            <legend className="sr-only">레시피 적용 방식</legend>
            {(["append", "replace"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={mode === candidate}
                onClick={() => setMode(candidate)}
                className={
                  mode === candidate
                    ? "min-h-10 rounded-lg border border-accent bg-accent-soft px-2.5 text-[0.62rem] font-bold text-accent pointer-coarse:min-h-11"
                    : "min-h-10 rounded-lg border border-line bg-canvas/60 px-2.5 text-[0.62rem] font-semibold text-fg-3 hover:border-accent/45 hover:text-fg pointer-coarse:min-h-11"
                }
              >
                {MODE_LABEL[candidate]}
              </button>
            ))}
          </fieldset>
          <span className="text-[0.58rem] text-fg-3">
            {matchingRecipes.length} / {STUDIO_EFFECT_RECIPES.length}개 조합
          </span>
        </div>

        <label htmlFor={searchId} className="block">
          <span className="sr-only">효과 레시피 검색</span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="장면·재질·효과 검색: 선화, 야간, 인쇄…"
            className="min-h-11 w-full rounded-lg border border-line bg-canvas px-3 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent pointer-coarse:min-h-11"
          />
        </label>

        <div
          role="group"
          aria-label="레시피 분류"
          className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]"
        >
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
            className={
              category === "all"
                ? "min-h-9 shrink-0 rounded-full border border-accent bg-accent-soft px-2.5 text-[0.6rem] font-bold text-accent pointer-coarse:min-h-11"
                : "min-h-9 shrink-0 rounded-full border border-line bg-canvas/60 px-2.5 text-[0.6rem] font-semibold text-fg-3 hover:text-fg pointer-coarse:min-h-11"
            }
          >
            전체
          </button>
          {STUDIO_EFFECT_RECIPE_CATEGORY_ORDER.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className={
                category === item
                  ? "min-h-9 shrink-0 rounded-full border border-accent bg-accent-soft px-2.5 text-[0.6rem] font-bold text-accent pointer-coarse:min-h-11"
                  : "min-h-9 shrink-0 rounded-full border border-line bg-canvas/60 px-2.5 text-[0.6rem] font-semibold text-fg-3 hover:text-fg pointer-coarse:min-h-11"
              }
            >
              {studioEffectRecipeCategoryLabel(item)}
            </button>
          ))}
        </div>

        {visibleRecipes.length > 0 ? (
          <div className="grid max-h-[32rem] gap-2 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin] sm:grid-cols-2">
            {visibleRecipes.map((recipe) => {
              const estimate = estimateStudioEffectRecipeCost(recipe);
              return (
                <article key={recipe.id} className="flex min-w-0 flex-col rounded-xl border border-line/70 bg-canvas/55 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.57rem] font-bold uppercase tracking-wider text-accent">
                        {studioEffectRecipeCategoryLabel(recipe.category)}
                      </p>
                      <h4 className="mt-0.5 text-xs font-bold text-fg">{recipe.title}</h4>
                    </div>
                    <span className="shrink-0 rounded-md border border-line bg-card px-1.5 py-0.5 text-[0.55rem] tabular-nums text-fg-3">
                      {recipe.entries.length}단계 · {estimate.costPoints}점 · {studioEffectCostTierLabel(estimate.tier)}
                    </span>
                  </div>
                  <p className="mt-1.5 flex-1 text-[0.61rem] leading-relaxed text-fg-3">
                    {recipe.description}
                  </p>
                  <div
                    role="group"
                    aria-label={`${recipe.title} 검색 태그`}
                    className="mt-2 flex flex-wrap gap-1"
                  >
                    {recipe.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="rounded-full bg-raised px-1.5 py-0.5 text-[0.53rem] text-fg-3">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => applyRecipe(recipe.id)}
                    aria-label={`${recipe.title} 레시피 ${MODE_LABEL[mode]}`}
                    className="mt-2 min-h-10 rounded-lg border border-accent/40 bg-accent-soft px-2.5 text-[0.63rem] font-bold text-accent hover:border-accent hover:bg-accent-soft/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
                  >
                    {MODE_LABEL[mode]}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line px-3 py-5 text-center">
            <p className="text-xs font-semibold text-fg-2">일치하는 레시피가 없습니다</p>
            <p className="mt-1 text-[0.61rem] text-fg-3">검색어를 줄이거나 다른 제작 목적을 선택하세요.</p>
          </div>
        )}

        {compactCatalog && matchingRecipes.length > visibleRecipes.length ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="min-h-10 w-full rounded-lg border border-line bg-canvas/50 px-3 text-[0.63rem] font-bold text-fg-2 hover:border-accent/45 hover:text-fg pointer-coarse:min-h-11"
          >
            전체 {matchingRecipes.length}개 레시피 보기
          </button>
        ) : null}
      </div>

      <p
        role="status"
        aria-live="polite"
        className={
          announcement
            ? `rounded-lg border px-2.5 py-2 text-[0.62rem] font-semibold ${announcementTone(announcement.tone)}`
            : "sr-only"
        }
      >
        {announcement?.message ?? ""}
      </p>
    </section>
  );
}
