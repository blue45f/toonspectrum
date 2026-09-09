/** Universal BrushGraph composition editor used by every brush family. */

import { ChevronDown, Layers, RotateCcw, TriangleAlert } from "lucide-react";
import type { ChangeEvent } from "react";

import {
  STUDIO_BRUSH_COMPOSITION_RECIPES,
  STUDIO_BRUSH_COMPOSITION_SLOT_LABELS,
  compileStudioBrushCompositionProgramSet,
  createStudioBrushCompositionBaseline,
  listStudioBrushCompositionNodesForSlot,
  planStudioBrushComposition,
  resetStudioBrushCompositionProgramSet,
  type CompleteStudioBrushComposition,
  type StudioBrushCompositionIntegration,
} from "./studio-brush-composition-catalog";
import {
  STUDIO_BRUSH_COMPOSITION_SLOT_IDS,
  type StudioBrushCompositionSlotId,
  type StudioBrushEngineProgramSet,
} from "./studio-brush-engine-program-set";

import { cn } from "@/shared/lib/utils";

const INTEGRATION_LABELS: Readonly<Record<StudioBrushCompositionIntegration, string>> = {
  connected: "바로 적용",
  "adapter-ready": "준비됨",
  lab: "실험 기능",
};

const COMPLEXITY_LABELS = {
  light: "가벼움",
  balanced: "균형",
  intensive: "무거움",
} as const;

const COMPOSITION_GROUPS: readonly {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly slots: readonly StudioBrushCompositionSlotId[];
}[] = Object.freeze([
  Object.freeze({
    id: "gesture",
    title: "손맛과 획 모양",
    description: "손의 움직임을 어떻게 따라가고 어떤 촉이 종이에 닿는지 정합니다.",
    slots: Object.freeze(["motion", "carrier", "tip"]) as readonly StudioBrushCompositionSlotId[],
  }),
  Object.freeze({
    id: "material",
    title: "종이와 재료 반응",
    description: "표면 질감, 물감이 쌓이는 방식, 번짐·마름 같은 물성을 조합합니다.",
    slots: Object.freeze(["surface", "deposition", "pickup", "physics"]) as readonly StudioBrushCompositionSlotId[],
  }),
  Object.freeze({
    id: "style",
    title: "색과 무늬, 최종 출력",
    description: "안료 변화, 반복 패턴, 피드백 효과와 저장 방식을 정합니다.",
    slots: Object.freeze(["pigment", "pattern", "feedback", "output"]) as readonly StudioBrushCompositionSlotId[],
  }),
]);

export interface StudioBrushCompositionComposerProps {
  readonly brushId: string;
  readonly family: string;
  readonly programSet: StudioBrushEngineProgramSet | null | undefined;
  readonly onChange: (next: StudioBrushEngineProgramSet | null) => void;
}

export function StudioBrushCompositionComposer({
  brushId,
  family,
  programSet,
  onChange,
}: StudioBrushCompositionComposerProps) {
  const baseline = createStudioBrushCompositionBaseline(brushId, family);
  const plan = planStudioBrushComposition({
    brushId,
    family,
    composition: programSet?.composition ?? baseline,
  });
  const customized = Boolean(programSet?.composition);

  function applyComposition(composition: CompleteStudioBrushComposition) {
    onChange(compileStudioBrushCompositionProgramSet({
      brushId,
      family,
      current: programSet,
      composition,
    }));
  }

  function updateSlot(slot: StudioBrushCompositionSlotId, value: string) {
    applyComposition(Object.freeze({ ...plan.composition, [slot]: value }));
  }

  return (
    <section
      className="rounded-2xl border border-line bg-card/45 p-3"
      aria-labelledby="brush-v5-composer-heading"
      data-studio-brush-v5-composer="true"
    >
      <div className="flex items-start gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/15">
          <Layers size={17} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="brush-v5-composer-heading" className="text-sm font-bold text-fg">
            브러시 엔진 조합
          </h3>
          <p className="mt-0.5 text-[0.65rem] leading-relaxed text-fg-3">
            원하는 느낌에 가까운 시작점을 먼저 고르세요. 더 세밀하게 만들고 싶을 때만 전문 편집을 열어 획·촉·종이·물성·색·출력을 각각 바꿀 수 있습니다.
          </p>
        </div>
        {customized ? (
          <button
            type="button"
            onClick={() => onChange(resetStudioBrushCompositionProgramSet({ family, current: programSet }))}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-line px-2 text-[0.65rem] font-semibold text-fg-2 transition hover:bg-raised"
          >
            <RotateCcw size={12} aria-hidden />
            시작 상태로
          </button>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-accent/25 bg-accent-soft/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-bold text-fg">추천 시작점</p>
            <p className="mt-0.5 text-[0.6rem] leading-relaxed text-fg-3">
              프리셋은 완성품이 아니라 출발점입니다. 선택한 뒤 촉, 필압, 입자, 듀얼 브러시, 물성 설정을 자유롭게 섞어 나만의 브러시로 저장할 수 있습니다.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-line bg-card px-2 py-1 text-[0.56rem] font-semibold text-fg-3">
            언제든 재조합
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {STUDIO_BRUSH_COMPOSITION_RECIPES.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => applyComposition(recipe.composition)}
              className="min-h-16 rounded-xl border border-line bg-card px-2.5 py-2 text-left transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <span className="block text-[0.68rem] font-bold text-fg">{recipe.name}</span>
              <span className="mt-0.5 block text-[0.58rem] leading-relaxed text-fg-3">
                {recipe.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      <details className="mt-3 rounded-xl border border-line bg-bg-2/35">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-[0.7rem] font-bold text-fg-2">전문 엔진 직접 편집</span>
            <span className="mt-0.5 block text-[0.58rem] leading-relaxed text-fg-3">
              11개 엔진 슬롯을 직접 조합합니다. 용어가 낯설다면 열지 않아도 모든 추천 조합과 일반 커스텀 기능을 사용할 수 있습니다.
            </span>
          </span>
          <ChevronDown size={15} className="shrink-0 text-fg-3" aria-hidden />
        </summary>

        <div className="border-t border-line px-3 pb-3 pt-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-card/70 px-2.5 py-2">
              <span className="block text-[0.58rem] font-semibold text-fg-3">실행 부담</span>
              <strong className="mt-0.5 block text-xs text-fg">
                {COMPLEXITY_LABELS[plan.complexity]} · {plan.costScore}
              </strong>
            </div>
            <div className="rounded-xl border border-line bg-card/70 px-2.5 py-2">
              <span className="block text-[0.58rem] font-semibold text-fg-3">즉시 적용 가능</span>
              <strong className="mt-0.5 block text-xs tabular-nums text-fg">
                {plan.integrationCounts.connected}/{STUDIO_BRUSH_COMPOSITION_SLOT_IDS.length}
              </strong>
            </div>
            <div className="rounded-xl border border-line bg-card/70 px-2.5 py-2">
              <span className="block text-[0.58rem] font-semibold text-fg-3">사용 조건</span>
              <strong className="mt-0.5 block text-xs text-fg">{plan.rights.label}</strong>
            </div>
            <div className="rounded-xl border border-line bg-card/70 px-2.5 py-2">
              <span className="block text-[0.58rem] font-semibold text-fg-3">조합 상태</span>
              <strong className={cn("mt-0.5 block text-xs", plan.canSave ? "text-good" : "text-bad")}>
                {plan.canSave ? "저장 가능" : "수정 필요"}
              </strong>
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            {COMPOSITION_GROUPS.map((group) => (
              <section key={group.id} className="rounded-xl border border-line bg-card/55 p-2.5">
                <h4 className="text-[0.7rem] font-bold text-fg-2">{group.title}</h4>
                <p className="mt-0.5 text-[0.58rem] leading-relaxed text-fg-3">{group.description}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {group.slots.map((slot) => {
                    const selectedId = plan.composition[slot];
                    const options = listStudioBrushCompositionNodesForSlot(slot);
                    const selected = options.find((entry) => entry.id === selectedId) ?? null;
                    return (
                      <label key={slot} className="rounded-lg border border-line bg-bg/70 p-2">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[0.63rem] font-bold text-fg-2">
                            {STUDIO_BRUSH_COMPOSITION_SLOT_LABELS[slot]}
                          </span>
                          {selected ? (
                            <span className={cn(
                              "rounded px-1 py-px text-[0.52rem] font-semibold",
                              selected.integration === "connected"
                                ? "bg-good/10 text-good"
                                : selected.integration === "lab"
                                  ? "bg-warn/10 text-warn"
                                  : "bg-accent-soft text-accent",
                            )}>
                              {INTEGRATION_LABELS[selected.integration]}
                            </span>
                          ) : null}
                        </span>
                        <select
                          aria-label={`${STUDIO_BRUSH_COMPOSITION_SLOT_LABELS[slot]} 선택`}
                          value={selectedId}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) => updateSlot(slot, event.currentTarget.value)}
                          className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-bg px-2 text-[0.66rem] font-semibold text-fg outline-none focus:border-accent"
                        >
                          {options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label} · {INTEGRATION_LABELS[option.integration]}
                            </option>
                          ))}
                        </select>
                        {selected ? (
                          <span className="mt-1 block text-[0.56rem] leading-relaxed text-fg-3">
                            {selected.provider} · {selected.description}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {plan.issues.length > 0 ? (
            <ul className="mt-3 space-y-1.5" aria-label="브러시 엔진 조합 진단">
              {plan.issues.slice(0, 6).map((entry) => (
                <li
                  key={entry.id}
                  className={cn(
                    "flex gap-2 rounded-lg border px-2.5 py-2 text-[0.62rem] leading-relaxed",
                    entry.severity === "error"
                      ? "border-bad/35 bg-bad/5 text-bad"
                      : entry.severity === "warning"
                        ? "border-warn/35 bg-warn/5 text-fg-2"
                        : "border-line bg-bg-2/45 text-fg-3",
                  )}
                >
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    <strong className="block text-fg-2">{entry.title}</strong>
                    {entry.description}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg border border-good/30 bg-good/10 px-2.5 py-2 text-[0.62rem] font-semibold text-good">
              충돌 없이 저장 가능한 엔진 조합입니다.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
