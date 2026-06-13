/**
 * Studio Clarity Panel
 * 선택된 이미지의 선명도·안개 제거(Clarity/Dehaze) 보정 인스펙터 — 원클릭 선명도 프리셋 +
 * 선명도/안개 제거 슬라이더.
 * studio-clarity 엔진의 Clarity를 props로 읽고 onPatch/onApplyPreset/onReset으로만 쓴다.
 * StudioPage에서 분리한 순수 프레젠테이션 컴포넌트(상태 없음).
 */
import { RotateCcw } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  CLARITY_PRESETS,
  CLARITY_RANGE,
  DEHAZE_RANGE,
  isIdentityClarity,
  type Clarity,
} from "./studio-clarity";

// 공용 라벨 + 슬라이더 한 줄. 우측 readout은 항상 같은 폭으로 정렬한다(-100..100 수용).
const LABEL_ROW = "flex items-center justify-between gap-2 text-xs text-fg-2";
const RANGE_CLASS = "w-24 accent-accent cursor-pointer";
const READOUT_CLASS = "w-8 text-right text-[10px] tabular-nums text-fg-3";
const CHIP_CLASS =
  "rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg";

// 슬라이더 정의 — 표시 순서·한글 라벨·범위. 키마다 범위가 달라(clarity -100..100, dehaze 0..100)
// 각 행이 자기 range를 들고 다닌다. readout은 둘 다 정수.
const CLARITY_SLIDERS: { key: keyof Clarity; label: string; range: { min: number; max: number; step: number } }[] = [
  { key: "clarity", label: "선명도", range: CLARITY_RANGE },
  { key: "dehaze", label: "안개 제거", range: DEHAZE_RANGE },
];

export function StudioClarityPanel({
  value,
  onPatch,
  onApplyPreset,
  onReset,
}: {
  value: Clarity;
  onPatch: (patch: Partial<Clarity>) => void;
  onApplyPreset: (v: Clarity) => void;
  onReset: () => void;
}): React.ReactElement {
  // 두 값 모두 0(보정 없음)이면 리셋 비활성 + "기본" 프리셋 칩을 활성으로 표시.
  const isIdentity = isIdentityClarity(value);

  return (
    <div className="space-y-2">
      {/* 헤더 + 항등 복귀 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">선명도/디테일 (Clarity)</p>
        <button
          type="button"
          onClick={onReset}
          disabled={isIdentity}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="선명도 보정을 제거하고 원본 디테일로 되돌립니다."
        >
          <RotateCcw className="size-3.5" />
          원본으로
        </button>
      </div>

      {/* 원클릭 선명도 프리셋 칩 — 절대값으로 덮어쓴다(누적 아님). */}
      <div className="flex flex-wrap gap-1.5">
        {CLARITY_PRESETS.map((preset) => {
          const active = preset.id === "neutral" && isIdentity;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyPreset(preset.value)}
              title={preset.tip}
              className={cn(CHIP_CLASS, active && "border-accent bg-raised text-fg")}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* 선명도·안개 제거 슬라이더 — 범위는 각 행의 range에서, readout은 정수. */}
      <div className="space-y-2">
        {CLARITY_SLIDERS.map(({ key, label, range }) => {
          const current = value[key] ?? 0;
          return (
            <label key={key} className={LABEL_ROW}>
              {label}
              <span className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={current}
                  onChange={(e) => onPatch({ [key]: Number(e.target.value) })}
                  className={RANGE_CLASS}
                />
                <span className={READOUT_CLASS}>{current}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
