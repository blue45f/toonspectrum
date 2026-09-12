/** Universal BrushGraph composition editor used by every brush family. */

import { Layers, RotateCcw, TriangleAlert } from "lucide-react";
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
import {
  constrainStudioBrushCompositionToRuntime,
  isStudioBrushCompositionRuntimeSelectable,
  planStudioBrushCompositionRuntime,
} from "./studio-brush-composition-runtime";

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
  const runtimePlan = planStudioBrushCompositionRuntime(family, plan.composition);
  const recipes = STUDIO_BRUSH_COMPOSITION_RECIPES
    .filter((recipe) => recipe.families.includes(family))
    .map((recipe) => ({
      recipe,
      available: STUDIO_BRUSH_COMPOSITION_SLOT_IDS.some((slot) => {
        const nodeId = recipe.composition[slot];
        return Boolean(nodeId && isStudioBrushCompositionRuntimeSelectable(family, slot, nodeId));
      }),
    }));

  function applyComposition(composition: CompleteStudioBrushComposition) {
    const constrained = constrainStudioBrushCompositionToRuntime({
      family,
      current: plan.composition,
      requested: composition,
    });
    onChange(compileStudioBrushCompositionProgramSet({
      brushId,
      family,
      current: programSet,
      composition: constrained,
    }));
  }

  function updateSlot(slot: StudioBrushCompositionSlotId, value: string) {
    if (!isStudioBrushCompositionRuntimeSelectable(family, slot, value)) return;
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
            추천 조합에서 시작하거나 아래 엔진을 직접 바꿔 손맛·촉·종이·물성·색·출력을 원하는 만큼 조합하세요. 모든 설정은 하나의 커스텀 브러시로 저장할 수 있습니다.
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
          {recipes.map(({ recipe, available }) => (
            <button
              key={recipe.id}
              type="button"
              disabled={!available}
              onClick={() => {
                if (available) applyComposition(recipe.composition);
              }}
              className="min-h-16 rounded-xl border border-line bg-card px-2.5 py-2 text-left transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line disabled:hover:bg-card"
            >
              <span className="block text-[0.68rem] font-bold text-fg">{recipe.name}</span>
              <span className="mt-0.5 block text-[0.58rem] leading-relaxed text-fg-3">
                {recipe.description}
                {!available ? " · 현재 출력 미연결" : ""}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-bg-2/55 px-2.5 py-2">
          <span className="block text-[0.58rem] font-semibold text-fg-3">실행 부담</span>
          <strong className="mt-0.5 block text-xs text-fg">
            {COMPLEXITY_LABELS[plan.complexity]} · {plan.costScore}
          </strong>
        </div>
        <div className="rounded-xl border border-line bg-bg-2/55 px-2.5 py-2">
          <span className="block text-[0.58rem] font-semibold text-fg-3">즉시 적용 가능</span>
          <strong className="mt-0.5 block text-xs tabular-nums text-fg">
            {runtimePlan.connectedSelections.length}/{STUDIO_BRUSH_COMPOSITION_SLOT_IDS.length}
          </strong>
        </div>
        <div className="rounded-xl border border-line bg-bg-2/55 px-2.5 py-2">
          <span className="block text-[0.58rem] font-semibold text-fg-3">사용 조건</span>
          <strong className="mt-0.5 block text-xs text-fg">{plan.rights.label}</strong>
        </div>
        <div className="rounded-xl border border-line bg-bg-2/55 px-2.5 py-2">
          <span className="block text-[0.58rem] font-semibold text-fg-3">조합 상태</span>
          <strong className={cn("mt-0.5 block text-xs", plan.canSave ? "text-good" : "text-bad")}>
            {plan.canSave ? "저장 가능" : "수정 필요"}
          </strong>
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {COMPOSITION_GROUPS.map((group) => (
          <section key={group.id} className="rounded-xl border border-line bg-bg-2/35 p-2.5">
            <h4 className="text-[0.7rem] font-bold text-fg-2">{group.title}</h4>
            <p className="mt-0.5 text-[0.58rem] leading-relaxed text-fg-3">{group.description}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {group.slots.map((slot) => {
                const selectedId = plan.composition[slot];
                const options = listStudioBrushCompositionNodesForSlot(slot);
                const selected = options.find((entry) => entry.id === selectedId) ?? null;
                const runtimeSelectable = selected
                  ? isStudioBrushCompositionRuntimeSelectable(family, slot, selected.id)
                  : false;
                return (
                  <label key={slot} className="rounded-lg border border-line bg-card/70 p-2">
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
                          {runtimeSelectable
                            ? "바로 적용"
                            : `${INTEGRATION_LABELS[selected.integration]} · 출력 미연결`}
                        </span>
                      ) : null}
                    </span>
                    <select
                      aria-label={`${STUDIO_BRUSH_COMPOSITION_SLOT_LABELS[slot]} 선택`}
                      value={selectedId}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => updateSlot(slot, event.currentTarget.value)}
                      className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-bg px-2 text-[0.66rem] font-semibold text-fg outline-none focus:border-accent"
                    >
                      {options.map((option) => {
                        const available = isStudioBrushCompositionRuntimeSelectable(
                          family,
                          slot,
                          option.id,
                        );
                        return (
                          <option key={option.id} value={option.id} disabled={!available}>
                            {option.label} · {available ? "바로 적용" : "현재 출력 미연결"}
                          </option>
                        );
                      })}
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

      {runtimePlan.unavailableSelections.length > 0 ? (
        <p
          className="mt-3 rounded-lg border border-line bg-bg-2/45 px-2.5 py-2 text-[0.62rem] leading-relaxed text-fg-3"
          data-studio-brush-runtime-unavailable="true"
        >
          현재 렌더러가 직접 소비하지 않는 {runtimePlan.unavailableSelections.length}개 슬롯은
          읽기 전용입니다. 선택 가능한 항목만 실제 획·정착·내보내기에 반영됩니다.
        </p>
      ) : null}

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
    </section>
  );
}
