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

import { cn } from "@/shared/lib/utils";

const INTEGRATION_LABELS: Readonly<Record<StudioBrushCompositionIntegration, string>> = {
  connected: "제품 경로",
  "adapter-ready": "어댑터",
  lab: "Lab",
};

const COMPLEXITY_LABELS = {
  light: "경량",
  balanced: "균형",
  intensive: "고부하",
} as const;

const COMPOSITION_GROUPS: readonly {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly slots: readonly StudioBrushCompositionSlotId[];
}[] = Object.freeze([
  Object.freeze({ id: "gesture", title: "필기감 · 획", description: "입력 추종, 캐리어와 실제 접촉 촉을 조합합니다.", slots: Object.freeze(["motion", "carrier", "tip"]) as readonly StudioBrushCompositionSlotId[] }),
  Object.freeze({ id: "material", title: "표면 · 재료 · 물리", description: "종이, 도포, pickup과 시간 변화 authority를 고릅니다.", slots: Object.freeze(["surface", "deposition", "pickup", "physics"]) as readonly StudioBrushCompositionSlotId[] }),
  Object.freeze({ id: "style", title: "안료 · 문양 · 출력", description: "색상 모델, 반복 문법, 피드백과 저장 형식을 고릅니다.", slots: Object.freeze(["pigment", "pattern", "feedback", "output"]) as readonly StudioBrushCompositionSlotId[] }),
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
            범용 BrushGraph 컴포저
          </h3>
          <p className="mt-0.5 text-[0.65rem] leading-relaxed text-fg-3">
            필기감·엔진·물리·안료·패턴을 한 조합으로 저장합니다. 연결된 유화·수채 프로그램은 즉시 실제 렌더 경로에 반영됩니다.
          </p>
        </div>
        {customized ? (
          <button
            type="button"
            onClick={() => onChange(resetStudioBrushCompositionProgramSet({ family, current: programSet }))}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-line px-2 text-[0.65rem] font-semibold text-fg-2 transition hover:bg-raised"
          >
            <RotateCcw size={12} aria-hidden />
            기본 조합
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-bg-2/55 px-2.5 py-2">
          <span className="block text-[0.58rem] font-semibold text-fg-3">복잡도</span>
          <strong className="mt-0.5 block text-xs text-fg">
            {COMPLEXITY_LABELS[plan.complexity]} · {plan.costScore}
          </strong>
        </div>
        <div className="rounded-xl border border-line bg-bg-2/55 px-2.5 py-2">
          <span className="block text-[0.58rem] font-semibold text-fg-3">제품 경로</span>
          <strong className="mt-0.5 block text-xs tabular-nums text-fg">
            {plan.integrationCounts.connected}/{STUDIO_BRUSH_COMPOSITION_SLOT_IDS.length}
          </strong>
        </div>
        <div className="rounded-xl border border-line bg-bg-2/55 px-2.5 py-2">
          <span className="block text-[0.58rem] font-semibold text-fg-3">권리</span>
          <strong className="mt-0.5 block text-xs text-fg">{plan.rights.label}</strong>
        </div>
        <div className="rounded-xl border border-line bg-bg-2/55 px-2.5 py-2">
          <span className="block text-[0.58rem] font-semibold text-fg-3">검증</span>
          <strong className={cn("mt-0.5 block text-xs", plan.canSave ? "text-good" : "text-bad")}>
            {plan.canSave ? "조합 유효" : "조합 수정 필요"}
          </strong>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[0.68rem] font-bold text-fg-2">개성 조합 시작점</span>
          <span className="text-[0.58rem] text-fg-3">선택 후 각 슬롯을 세부 조정</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {STUDIO_BRUSH_COMPOSITION_RECIPES.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => applyComposition(recipe.composition)}
              className="min-h-14 rounded-xl border border-line bg-card px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-raised"
            >
              <span className="block text-[0.68rem] font-bold text-fg">{recipe.name}</span>
              <span className="mt-0.5 block text-[0.58rem] leading-relaxed text-fg-3">
                {recipe.description}
              </span>
            </button>
          ))}
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
        <ul className="mt-3 space-y-1.5" aria-label="BrushGraph 조합 진단">
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
          authority 충돌 없이 컴파일 가능한 조합입니다.
        </p>
      )}
    </section>
  );
}
