/** Connected oil matrix plus the universal BrushGraph wrapper. */

import { ChevronDown, Gauge, Layers, RotateCcw, Sparkles } from "lucide-react";

import { resolveStudioBrushRenderFamily } from "../studio-brush";
import type { StudioBrushRenderFamily } from "../studio-brush";
import { StudioBrushCompositionComposer } from "./StudioBrushCompositionComposer";
import {
  STUDIO_BRUSH_OIL_PROGRAM_KEYS,
  STUDIO_OIL_PROGRAM_MATRIX_BRUSH_IDS,
  studioBrushEngineProgramSetWithOil,
  studioBrushEngineProgramSetWithoutOil,
  studioOilProgramSetForBrush,
  type StudioBrushEngineProgramSet,
  type StudioBrushOilProgramKey,
  type StudioBrushOilProgramSet,
} from "./studio-brush-engine-program-set";
import { studioBrushPresetById } from "./studio-draw-ux";

import { cn } from "@/shared/lib/utils";

const ENGINE_FAMILY_GUIDE: Readonly<Record<StudioBrushRenderFamily, {
  readonly label: string;
  readonly result: string;
  readonly order: readonly string[];
}>> = Object.freeze({
  pen: { label: "펜·잉크", result: "깨끗하고 예측 가능한 선", order: ["펜촉", "필압 반응", "입력 보정"] },
  gpen: { label: "G펜", result: "필압에 따라 강약이 살아나는 만화 선", order: ["필압 반응", "펜촉", "입력 보정"] },
  calligraphy: { label: "캘리그래피", result: "촉 각도와 기울기가 보이는 리본형 선", order: ["펜촉", "기울기·회전", "필압 반응"] },
  perfect: { label: "매끈한 잉크", result: "떨림을 줄인 정돈된 외곽선", order: ["입력 보정", "필압 반응", "펜촉"] },
  marker: { label: "마커", result: "넓고 안정적인 면 채색", order: ["도포량", "펜촉", "도장 간격"] },
  highlighter: { label: "형광펜", result: "겹쳐 칠하기 쉬운 반투명 획", order: ["불투명도", "펜촉", "입력 보정"] },
  neon: { label: "네온", result: "빛나는 중심선과 발광 효과", order: ["펜촉", "도장", "필압 반응"] },
  glow: { label: "글로우", result: "부드러운 빛 번짐", order: ["도장", "도포량", "펜촉"] },
  glitter: { label: "글리터", result: "반짝이는 입자와 장식 질감", order: ["도장", "펜촉", "산포"] },
  brush: { label: "붓", result: "붓 결이 살아 있는 자연스러운 획", order: ["펜촉", "필압 반응", "도장"] },
  watercolor: { label: "수채", result: "번짐·젖은 가장자리·안료 흐름", order: ["수채 물리", "재질", "도포량"] },
  oil: { label: "유화·아크릴", result: "강모·물감 소모·두께가 느껴지는 획", order: ["유화 질감", "펜촉", "필압 반응"] },
  pastel: { label: "파스텔", result: "거친 재질과 부드러운 색 축적", order: ["펜촉", "도장", "도포량"] },
  "ink-particle": { label: "입자 잉크", result: "산포와 질감이 풍부한 표현형 획", order: ["도장·산포", "펜촉", "필압 반응"] },
  airbrush: { label: "에어브러시", result: "부드러운 그라데이션과 분사", order: ["도포량", "산포", "펜촉"] },
  "dry-media": { label: "건식 재료", result: "종이 결을 타는 목탄·크레용 질감", order: ["펜촉", "표면 질감", "도포량"] },
  pencil: { label: "연필", result: "압력과 종이 결이 느껴지는 스케치", order: ["펜촉", "필압 반응", "표면 질감"] },
  screentone: { label: "스크린톤", result: "반복 가능한 점·해칭 패턴", order: ["패턴", "도장 간격", "펜촉"] },
  stamp: { label: "스탬프", result: "촉 모양을 반복 배치하는 장식 획", order: ["펜촉", "도장 간격", "산포"] },
  pixel: { label: "픽셀", result: "경계가 선명한 픽셀 단위 획", order: ["펜촉", "입력 보정", "도장 간격"] },
});

const OIL_PROGRAM_ROWS: readonly {
  readonly key: StudioBrushOilProgramKey;
  readonly label: string;
  readonly shortLabel: string;
  readonly physical: string;
  readonly cost: "낮음" | "중간";
}[] = Object.freeze([
  Object.freeze({
    key: "bristlePhysics",
    label: "붓털 물리",
    shortLabel: "강모",
    physical: "필압에 눌린 붓털이 벌어지고 다시 뭉치며 결의 경로 자체를 만듭니다.",
    cost: "중간",
  }),
  Object.freeze({
    key: "bristleLoadDynamics",
    label: "물감 소모",
    shortLabel: "소모",
    physical: "획을 이어 갈수록 적재된 물감이 줄어 자연스러운 갈필과 재충전 리듬을 만듭니다.",
    cost: "낮음",
  }),
  Object.freeze({
    key: "impastoRelief",
    label: "임파스토 릴리프",
    shortLabel: "두께",
    physical: "이미 쌓인 능선 위에 하이라이트와 그림자를 합성해 실제 물감 두께를 드러냅니다.",
    cost: "중간",
  }),
]);

const OIL_PRESET_NAME_OVERRIDES: Readonly<Record<string, string>> = Object.freeze({
  "brush--bristle-physics": "유화 · 물리 강모 갈필",
  "brush--bristle-depletion": "갈필",
  "brush--impasto-relief": "임파스토 릴리프",
  "oil--filbert-ribbon": "유화 · 필버트 리본",
  "oil--impasto-ribbon": "유화 · 임파스토(소모 없음)",
  "brush--oil-lanes": "유화 · 기본 레인",
});

const OIL_PRESET_CANDIDATE_IDS: readonly string[] = Object.freeze([
  ...STUDIO_OIL_PROGRAM_MATRIX_BRUSH_IDS,
  "brush--oil-lanes",
]);

interface OilCombinationRecipe {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly programs: StudioBrushOilProgramSet;
}

const OIL_COMBINATION_RECIPES: readonly OilCombinationRecipe[] = Object.freeze([
  { id: "body-only", name: "기본 본체", description: "매끈하고 빠른 평면 도포", programs: Object.freeze({ bristlePhysics: false, bristleLoadDynamics: false, impastoRelief: false }) },
  { id: "bristle-only", name: "부드러운 강모", description: "결이 벌어지는 깨끗한 리본", programs: Object.freeze({ bristlePhysics: true, bristleLoadDynamics: false, impastoRelief: false }) },
  { id: "depletion-only", name: "마른 획", description: "진행할수록 끊기는 갈필", programs: Object.freeze({ bristlePhysics: false, bristleLoadDynamics: true, impastoRelief: false }) },
  { id: "relief-only", name: "두꺼운 능선", description: "평면 경로 위의 입체 표면", programs: Object.freeze({ bristlePhysics: false, bristleLoadDynamics: false, impastoRelief: true }) },
  { id: "natural-bristle", name: "자연 강모", description: "벌어짐과 소모가 함께 변화", programs: Object.freeze({ bristlePhysics: true, bristleLoadDynamics: true, impastoRelief: false }) },
  { id: "bristle-relief", name: "강모 임파스토", description: "움직이는 결 위에 두께 표현", programs: Object.freeze({ bristlePhysics: true, bristleLoadDynamics: false, impastoRelief: true }) },
  { id: "dry-relief", name: "건조 임파스토", description: "갈필과 능선의 강한 대비", programs: Object.freeze({ bristlePhysics: false, bristleLoadDynamics: true, impastoRelief: true }) },
  { id: "full-physics", name: "풀 피직스", description: "강모·소모·두께를 모두 사용", programs: Object.freeze({ bristlePhysics: true, bristleLoadDynamics: true, impastoRelief: true }) },
]);

function oilPresetName(id: string): string | null {
  return OIL_PRESET_NAME_OVERRIDES[id] ?? studioBrushPresetById(id)?.name ?? null;
}

function oilProgramsEqual(
  left: StudioBrushOilProgramSet,
  right: StudioBrushOilProgramSet,
): boolean {
  return STUDIO_BRUSH_OIL_PROGRAM_KEYS.every((key) => left[key] === right[key]);
}

function matchingPresetName(programs: StudioBrushOilProgramSet, brushId: string): string | null {
  for (const id of [brushId, ...OIL_PRESET_CANDIDATE_IDS]) {
    const name = oilPresetName(id);
    if (name && oilProgramsEqual(studioOilProgramSetForBrush(id), programs)) return name;
  }
  return null;
}

function combinationComplexity(activeCount: number): {
  readonly label: "경량" | "균형" | "고품질";
  readonly description: string;
} {
  if (activeCount <= 0) return { label: "경량", description: "본체 패스만 실행" };
  if (activeCount <= 2) return { label: "균형", description: `${activeCount + 1}개 패스를 순차 실행` };
  return { label: "고품질", description: "4개 패스를 모두 실행" };
}

export interface StudioBrushEngineProgramControlsProps {
  readonly brushId: string;
  readonly programSet: StudioBrushEngineProgramSet | null | undefined;
  readonly onChange: (next: StudioBrushEngineProgramSet | null) => void;
}

function StudioOilProgramMatrix({
  brushId,
  programSet,
  onChange,
}: StudioBrushEngineProgramControlsProps) {
  const baseline = studioOilProgramSetForBrush(brushId);
  const current = programSet?.oil ?? baseline;
  const changed = !oilProgramsEqual(current, baseline);
  const presetName = matchingPresetName(current, brushId);
  const activeCount = STUDIO_BRUSH_OIL_PROGRAM_KEYS.filter((key) => current[key]).length;
  const complexity = combinationComplexity(activeCount);

  function emit(next: StudioBrushOilProgramSet) {
    onChange(
      oilProgramsEqual(next, baseline)
        ? studioBrushEngineProgramSetWithoutOil(programSet)
        : studioBrushEngineProgramSetWithOil(programSet, next),
    );
  }

  function toggle(key: StudioBrushOilProgramKey) {
    emit({ ...current, [key]: !current[key] });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card/35 p-3" aria-labelledby="oil-matrix-heading">
      <div className="flex items-start gap-2 rounded-xl border border-line bg-bg-2/60 px-3 py-2.5">
        <Layers aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-3" />
        <div className="min-w-0 text-xs leading-relaxed">
          <p className="font-semibold text-fg">
            {presetName ? `${presetName}와 같은 조합` : "커스텀 조합"}
          </p>
          <p className="mt-0.5 text-pretty text-fg-3">
            실제 유화 획에 적용되는 강모·소모·두께 구성입니다. 현재 효과 {activeCount}개
            {presetName ? "" : " — 같은 기본 프리셋은 없습니다"}
          </p>
        </div>
        {changed ? (
          <button
            type="button"
            onClick={() => onChange(studioBrushEngineProgramSetWithoutOil(programSet))}
            className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-fg-2 transition hover:bg-bg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:min-h-11"
          >
            <RotateCcw aria-hidden className="size-3" />
            기본값
          </button>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="oil-matrix-heading" className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Sparkles aria-hidden className="size-3.5 text-accent" />
            원하는 질감으로 고르기
          </h3>
          <p className="mt-0.5 text-[0.65rem] leading-relaxed text-fg-3">
            내부 엔진 이름을 몰라도 됩니다. 원하는 결과를 고르면 관련 물리 설정을 함께 바꿉니다.
          </p>
        </div>
        <span className="rounded-lg border border-line bg-raised px-2 py-1 text-[0.65rem] font-semibold text-fg-2">
          8가지
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {OIL_COMBINATION_RECIPES.map((recipe) => {
          const selected = oilProgramsEqual(current, recipe.programs);
          return (
            <button
              key={recipe.id}
              type="button"
              aria-label={`유화 조합: ${recipe.name}`}
              aria-pressed={selected}
              onClick={() => emit(recipe.programs)}
              className={cn(
                "min-h-20 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                selected
                  ? "border-accent/55 bg-accent-soft/35"
                  : "border-line bg-card hover:border-line-strong hover:bg-raised",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[0.7rem] font-bold text-fg">{recipe.name}</span>
                <span className="text-[0.6rem] tabular-nums text-fg-3">
                  {STUDIO_BRUSH_OIL_PROGRAM_KEYS.filter((key) => recipe.programs[key]).length}/3
                </span>
              </span>
              <span className="mt-0.5 block text-[0.61rem] leading-relaxed text-fg-3">
                {recipe.description}
              </span>
              <span className="mt-1.5 flex flex-wrap gap-1" aria-hidden>
                {OIL_PROGRAM_ROWS.map((row) => (
                  <span
                    key={row.key}
                    className={cn(
                      "rounded px-1 py-px text-[0.56rem] font-semibold",
                      recipe.programs[row.key]
                        ? "bg-accent-soft text-accent"
                        : "bg-bg-2 text-fg-4",
                    )}
                  >
                    {row.shortLabel}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card/45 px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-2">
          <Gauge aria-hidden className="size-3.5 text-accent" />
          성능 부담
        </span>
        <span className="text-right">
          <span className="block text-[0.68rem] font-bold text-fg">{complexity.label}</span>
          <span className="block text-[0.6rem] text-fg-3">{complexity.description}</span>
        </span>
      </div>

      <details className="rounded-xl border border-line bg-bg-2/35 p-2.5">
        <summary className="flex min-h-9 cursor-pointer items-center justify-between gap-2 text-[0.68rem] font-bold text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:min-h-11">
          각 물리 효과를 직접 켜고 끄기
          <ChevronDown size={14} aria-hidden className="text-fg-3" />
        </summary>
        <ol className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
          <li className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-fg-3">
            <span className="tabular-nums text-fg-4">1</span>
            <span className="font-medium text-fg-2">물감 본체</span>
            <span className="text-fg-4">항상 칠해집니다</span>
          </li>
          {OIL_PROGRAM_ROWS.map((row, index) => {
            const on = current[row.key];
            const differs = current[row.key] !== baseline[row.key];
            return (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => toggle(row.key)}
                  aria-pressed={on}
                  className={cn(
                    "flex min-h-11 w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                    on
                      ? "border-accent/45 bg-accent-soft/25"
                      : "border-line bg-bg-2/40 hover:bg-bg-3/60",
                  )}
                >
                  <span className="mt-0.5 tabular-nums text-[11px] text-fg-4">{index + 2}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("text-xs font-semibold", on ? "text-fg" : "text-fg-3")}>
                        {row.label}
                      </span>
                      {differs ? (
                        <span className="rounded bg-accent-soft px-1 py-px text-[10px] font-medium text-accent">
                          변경됨
                        </span>
                      ) : null}
                      <span className="rounded bg-bg-2 px-1 py-px text-[10px] font-medium text-fg-4">
                        비용 {row.cost}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-pretty text-[11px] leading-relaxed text-fg-3">
                      {row.physical}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 h-4 w-7 shrink-0 rounded-full border transition",
                      on ? "border-accent bg-accent" : "border-line bg-bg-3",
                    )}
                  >
                    <span
                      className={cn(
                        "block size-3 translate-y-px rounded-full bg-bg transition",
                        on ? "translate-x-3.5" : "translate-x-0.5",
                      )}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}

export function StudioBrushEngineProgramControls({
  brushId,
  programSet,
  onChange,
}: StudioBrushEngineProgramControlsProps) {
  const family = resolveStudioBrushRenderFamily(brushId);
  const guide = ENGINE_FAMILY_GUIDE[family];
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-accent/30 bg-accent-soft/15 p-3" aria-label="브러시 엔진 안내">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Sparkles size={16} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold text-accent">현재 브러시 계열</p>
            <h3 className="mt-0.5 text-sm font-bold text-fg">{guide.label}</h3>
            <p className="mt-1 text-xs leading-5 text-fg-2">목표 결과: {guide.result}</p>
            <p className="mt-2 text-[0.65rem] leading-5 text-fg-3">
              처음에는 아래 순서만 조절해도 충분합니다. 결과가 더 필요할 때만 전문 엔진 그래프를 여세요.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="권장 조절 순서">
              {guide.order.map((label, index) => (
                <span key={label} className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2 py-1 text-[0.62rem] font-semibold text-fg-2">
                  <span className="text-accent">{index + 1}</span>{label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {family === "oil" ? (
        <StudioOilProgramMatrix brushId={brushId} programSet={programSet} onChange={onChange} />
      ) : null}

      <details
        className="rounded-2xl border border-line bg-card/35 p-3"
        data-studio-brush-expert-engine-details="true"
        open={Boolean(programSet?.composition)}
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
          <span>
            <span className="block text-xs font-bold text-fg">전문 엔진 그래프</span>
            <span className="mt-0.5 block text-[0.62rem] leading-5 text-fg-3">
              필기감·캐리어·촉·표면·안료·물리·패턴·출력 엔진을 슬롯별로 직접 조합합니다.
            </span>
          </span>
          <ChevronDown size={16} className="shrink-0 text-fg-3" aria-hidden />
        </summary>
        <div className="mt-3 border-t border-line pt-3">
          <StudioBrushCompositionComposer
            brushId={brushId}
            family={family}
            programSet={programSet}
            onChange={onChange}
          />
          {family !== "oil" ? (
            <p className="mt-3 rounded-xl border border-line bg-bg-2/60 p-3 text-[0.65rem] leading-relaxed text-fg-3">
              현재 제품 경로에 연결된 노드는 즉시 적용됩니다. 실험·어댑터 노드는 저장 전에 상태와 호환성을 확인하세요.
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
