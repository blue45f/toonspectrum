/**
 * Studio Stylize Panel
 * 선택된 이미지의 스타일라이즈(Stylize) 인스펙터 — 원클릭 스타일 프리셋 +
 * 효과 종류(엠보스/외곽선/솔라리제이션/유화) 선택 + 세기·디테일 슬라이더.
 * studio-stylize 엔진의 Stylize를 props로 읽고 onPatch/onApplyPreset/onReset으로만 쓴다.
 * StudioPage에서 분리한 순수 프레젠테이션 컴포넌트(상태 없음).
 */
import { RotateCcw } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  STYLIZE_DETAIL_RANGE,
  STYLIZE_PRESETS,
  STYLIZE_STRENGTH_RANGE,
  STYLIZE_TYPES,
  isIdentityStylize,
  type Stylize,
  type StylizeType,
} from "./studio-stylize";

// 공용 라벨 + 슬라이더 한 줄. 우측 readout은 항상 같은 폭으로 정렬한다(세기 0..100·디테일 1..10 정수 수용).
const LABEL_ROW = "flex items-center justify-between gap-2 text-xs text-fg-2";
const RANGE_CLASS = "w-24 accent-accent cursor-pointer";
const READOUT_CLASS = "w-8 text-right text-[10px] tabular-nums text-fg-3";
const CHIP_CLASS =
  "rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg";

// 세기·디테일 슬라이더 정의 — 표시 순서·한글 라벨·범위(세기는 strength, 디테일은 detail).
const STYLIZE_SLIDERS: {
  key: "strength" | "detail";
  label: string;
  range: { min: number; max: number; step: number };
}[] = [
  { key: "strength", label: "세기", range: STYLIZE_STRENGTH_RANGE },
  { key: "detail", label: "디테일", range: STYLIZE_DETAIL_RANGE },
];

export function StudioStylizePanel({
  value,
  onPatch,
  onApplyPreset,
  onReset,
}: {
  value: Stylize;
  onPatch: (patch: Partial<Stylize>) => void;
  onApplyPreset: (v: Stylize) => void;
  onReset: () => void;
}): React.ReactElement {
  // 항등(세기 0)이면 리셋 비활성 + 어떤 프리셋 칩도 활성으로 표시하지 않는다(빈 프리셋 없음).
  const isIdentity = isIdentityStylize(value);

  return (
    <div className="space-y-2">
      {/* 헤더 + 항등 복귀 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">스타일라이즈 (Stylize)</p>
        <button
          type="button"
          onClick={onReset}
          disabled={isIdentity}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="스타일 효과를 제거하고 원본으로 되돌립니다."
        >
          <RotateCcw className="size-3.5" />
          원본으로
        </button>
      </div>

      {/* 원클릭 스타일 프리셋 칩 — 절대값으로 덮어쓴다(누적 아님). 항등일 땐 활성 칩 없음. */}
      <div className="flex flex-wrap gap-1.5">
        {STYLIZE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApplyPreset(preset.value)}
            title={preset.tip}
            className={CHIP_CLASS}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* 효과 종류 선택 — 현재 종류를 활성으로 강조, 누르면 type만 패치(세기·디테일 유지). */}
      <div className="flex flex-wrap gap-1.5">
        {STYLIZE_TYPES.map((t) => {
          const active = t.id === value.type;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPatch({ type: t.id as StylizeType })}
              title={`효과를 "${t.label}"로 바꿉니다.`}
              className={cn(CHIP_CLASS, active && "border-accent bg-raised text-fg")}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 세기·디테일 슬라이더 — 범위는 STYLIZE_STRENGTH_RANGE·STYLIZE_DETAIL_RANGE에서. */}
      <div className="space-y-2">
        {STYLIZE_SLIDERS.map(({ key, label, range }) => {
          const current = value[key];
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
