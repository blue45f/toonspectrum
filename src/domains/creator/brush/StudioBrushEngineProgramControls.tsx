/**
 * 엔진 조합 편집기 — 획을 "칠해지는 순서대로 쌓인 패스"로 보여준다.
 *
 * 클립스튜디오의 보조 도구 상세는 수십 개의 수치 슬라이더를 한 목록에 늘어놓는다. 강력하지만,
 * 각 항목이 붓자국의 무엇을 바꾸는지는 이름만 봐서는 알 수 없다. 여기서는 세 가지를 다르게 한다.
 *
 * 1. 파라미터 이름이 아니라 물리 현상으로 쓴다. `bristlePhysics` 가 아니라 "붓털이 눌리며 벌어짐".
 * 2. 칠해지는 순서를 그대로 보여준다 — 붓자국이 어떻게 조립되는지가 곧 그 브러시가 무엇인지다.
 * 3. 프리셋과 무엇이 다른지 항상 표시한다. 되돌릴 지점을 모르면 실험을 못 한다.
 *
 * 그리고 정직하게 적는다: 조합이 출하된 프리셋 중 어느 것과도 같지 않으면 "커스텀 조합"이라고
 * 말한다. 이름 없는 조합에 이름이 있는 척하지 않는다.
 */
import { Layers, RotateCcw } from "lucide-react";

import { resolveStudioBrushRenderFamily } from "../studio-brush";

import {
  STUDIO_BRUSH_OIL_PROGRAM_KEYS,
  studioBrushEngineProgramSetFromOil,
  studioOilProgramSetForBrush,
  type StudioBrushEngineProgramSet,
  type StudioBrushOilProgramKey,
  type StudioBrushOilProgramSet,
} from "./studio-brush-engine-program-set";

import { cn } from "@/lib/utils";

/**
 * 페인트 순서대로 나열한다. 이 순서는 장식이 아니라 캐리어가 실제로 칠하는 순서다 — 강모 시뮬은
 * 레인의 경로를 정하므로 침착보다 먼저 오고, 릴리프는 이미 놓인 능선 위에 얹히므로 마지막이다.
 */
const OIL_PROGRAM_ROWS: readonly {
  key: StudioBrushOilProgramKey;
  label: string;
  physical: string;
}[] = [
  {
    key: "bristlePhysics",
    label: "붓털 물리",
    physical: "필압에 눌린 붓털이 벌어지고 뭉치면서 결의 경로 자체가 달라집니다.",
  },
  {
    key: "bristleLoadDynamics",
    label: "물감 소모",
    physical: "그을수록 물감이 마르며 획 뒤쪽이 갈필로 끊깁니다.",
  },
  {
    key: "impastoRelief",
    label: "임파스토 릴리프",
    physical: "쌓인 물감 능선에 빛과 그림자를 얹어 두께가 보이게 합니다.",
  },
];

/** 편집 중인 조합이 어떤 출하 프리셋과 같은지 — 같은 게 없으면 null. */
const OIL_PRESET_NAMES: Readonly<Record<string, string>> = {
  "brush--bristle-physics": "유화 · 물리 강모 갈필",
  "brush--bristle-depletion": "갈필",
  "brush--impasto-relief": "임파스토 릴리프",
  "oil--filbert-ribbon": "유화 · 필버트 리본",
  "oil--impasto-ribbon": "유화 · 임파스토(소모 없음)",
  "brush--oil-lanes": "유화 · 기본 레인",
};

function matchingPresetName(programs: StudioBrushOilProgramSet): string | null {
  for (const [id, name] of Object.entries(OIL_PRESET_NAMES)) {
    const baseline = studioOilProgramSetForBrush(id);
    if (STUDIO_BRUSH_OIL_PROGRAM_KEYS.every((key) => baseline[key] === programs[key])) {
      return name;
    }
  }
  return null;
}

export interface StudioBrushEngineProgramControlsProps {
  brushId: string;
  /** 스트로크/저장 브러시가 실은 조합. 없으면 브러시 id 에서 유도한 기본 조합을 편집한다. */
  programSet: StudioBrushEngineProgramSet | null | undefined;
  onChange: (next: StudioBrushEngineProgramSet | null) => void;
}

export function StudioBrushEngineProgramControls({
  brushId,
  programSet,
  onChange,
}: StudioBrushEngineProgramControlsProps) {
  const family = resolveStudioBrushRenderFamily(brushId);
  if (family !== "oil") {
    return (
      <div
        className="rounded-xl border border-line bg-bg-2/60 p-4 text-xs leading-relaxed text-fg-2"
        role="status"
        aria-live="polite"
      >
        <p className="font-semibold text-fg">이 브러시는 아직 조합할 엔진이 없습니다</p>
        <p className="mt-1 text-fg-3 text-pretty">
          지금은 유화·아크릴 캐리어만 프로그램을 조합할 수 있습니다. 유화 계열 브러시를 고르면
          붓털 물리·물감 소모·임파스토를 원하는 대로 켜고 끌 수 있습니다.
        </p>
      </div>
    );
  }

  const baseline = studioOilProgramSetForBrush(brushId);
  const current = programSet?.oil ?? baseline;
  const changed = STUDIO_BRUSH_OIL_PROGRAM_KEYS.some((key) => current[key] !== baseline[key]);
  const presetName = matchingPresetName(current);
  const activeCount = STUDIO_BRUSH_OIL_PROGRAM_KEYS.filter((key) => current[key]).length;

  const toggle = (key: StudioBrushOilProgramKey) => {
    const next = { ...current, [key]: !current[key] } satisfies StudioBrushOilProgramSet;
    const matchesBaseline = STUDIO_BRUSH_OIL_PROGRAM_KEYS
      .every((entry) => next[entry] === baseline[entry]);
    // 기본값으로 되돌아오면 세트를 실어 보내지 않는다. 프리셋과 같은 획은 프리셋과 바이트 단위로
    // 같은 플랜이어야 하고, 그 계약은 '세트 없음' 경로에 쓰여 있다.
    onChange(matchesBaseline ? null : studioBrushEngineProgramSetFromOil(next));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-xl border border-line bg-bg-2/60 px-3 py-2.5">
        <Layers aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-3" />
        <div className="min-w-0 text-xs leading-relaxed">
          <p className="font-semibold text-fg">
            {presetName ? `${presetName}와 같은 조합` : "커스텀 조합"}
          </p>
          <p className="mt-0.5 text-fg-3 text-pretty">
            아래 순서대로 칠해집니다. 켠 패스 {activeCount}개
            {presetName ? "" : " — 이 조합과 같은 프리셋은 없습니다"}
          </p>
        </div>
        {changed ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-fg-2 transition hover:bg-bg-3"
          >
            <RotateCcw aria-hidden className="size-3" />
            프리셋으로
          </button>
        ) : null}
      </div>

      <ol className="flex flex-col gap-2">
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
                  "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition",
                  on
                    ? "border-accent/45 bg-accent-soft/25"
                    : "border-line bg-bg-2/40 hover:bg-bg-3/60",
                )}
              >
                <span className="mt-0.5 tabular-nums text-[11px] text-fg-4">{index + 2}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("text-xs font-semibold", on ? "text-fg" : "text-fg-3")}>
                      {row.label}
                    </span>
                    {differs ? (
                      <span className="rounded bg-accent-soft px-1 py-px text-[10px] font-medium text-accent">
                        변경됨
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-3 text-pretty">
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
    </div>
  );
}
