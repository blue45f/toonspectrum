/**
 * Studio Halftone Panel
 * 선택된 이미지의 컬러 하프톤(Halftone) 인스펙터 — 원클릭 코믹 프리셋 +
 * CMYK 컬러/흑백 모드 토글 + 점 크기/각도/세기 슬라이더.
 * studio-halftone 엔진의 Halftone을 props로 읽고 onPatch/onApplyPreset/onReset으로만 쓴다.
 * StudioPage에서 분리한 순수 프레젠테이션 컴포넌트(상태 없음).
 */
import { RotateCcw } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  HALFTONE_ANGLE_RANGE,
  HALFTONE_DOT_RANGE,
  HALFTONE_PRESETS,
  HALFTONE_STRENGTH_RANGE,
  isIdentityHalftone,
  type Halftone,
} from "./studio-halftone";

// 공용 라벨 + 슬라이더 한 줄. 우측 readout은 항상 같은 폭으로 정렬한다.
const LABEL_ROW = "flex items-center justify-between gap-2 text-xs text-fg-2";
const RANGE_CLASS = "w-24 accent-accent cursor-pointer";
const READOUT_CLASS = "w-8 text-right text-[10px] tabular-nums text-fg-3";
const CHIP_CLASS =
  "rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg";

// 모드 토글 정의 — CMYK 4채널 컬러 망점 / 휘도 단일 흑색 망점.
const HALFTONE_MODE_OPTIONS: { mode: Halftone["mode"]; label: string; tip: string }[] = [
  { mode: "cmyk", label: "CMYK 컬러", tip: "C·M·Y·K 네 채널을 각도별 망점으로 찍어 컬러 인쇄 질감을 냅니다." },
  { mode: "mono", label: "흑백", tip: "휘도를 단일 흑색 망점으로 바꿔 흑백 스크린톤 느낌을 냅니다." },
];

// 슬라이더 정의 — 표시 순서·한글 라벨·범위·readout 단위("px"는 망점 격자, "°"는 각도, "%"는 블렌드).
const HALFTONE_SLIDERS: {
  key: keyof Halftone;
  label: string;
  range: { min: number; max: number; step: number };
  unit: string;
}[] = [
  { key: "dotSize", label: "점 크기", range: HALFTONE_DOT_RANGE, unit: "px" },
  { key: "angle", label: "각도", range: HALFTONE_ANGLE_RANGE, unit: "°" },
  { key: "strength", label: "세기", range: HALFTONE_STRENGTH_RANGE, unit: "%" },
];

export function StudioHalftonePanel({
  value,
  onPatch,
  onApplyPreset,
  onReset,
}: {
  value: Halftone;
  onPatch: (patch: Partial<Halftone>) => void;
  onApplyPreset: (v: Halftone) => void;
  onReset: () => void;
}): React.ReactElement {
  // 항등(strength 0)이면 리셋 비활성 + 어떤 프리셋 칩도 활성으로 보이지 않는다(전부 strength>0).
  const isIdentity = isIdentityHalftone(value);

  return (
    <div className="space-y-2">
      {/* 헤더 + 항등 복귀 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">하프톤 (Halftone)</p>
        <button
          type="button"
          onClick={onReset}
          disabled={isIdentity}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="하프톤을 제거하고 원본으로 되돌립니다."
        >
          <RotateCcw className="size-3.5" />
          원본으로
        </button>
      </div>

      {/* 원클릭 코믹 프리셋 칩 — 절대값으로 덮어쓴다(누적 아님). 항등 프리셋이 없어 항등 상태엔 활성 칩 없음. */}
      <div className="flex flex-wrap gap-1.5">
        {HALFTONE_PRESETS.map((preset) => (
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

      {/* 망점 모드 — CMYK 컬러 / 흑백 토글. 현재 모드 칩을 활성으로 표시. */}
      <label className={LABEL_ROW}>
        모드
        <span className="flex items-center gap-1.5">
          {HALFTONE_MODE_OPTIONS.map(({ mode, label, tip }) => {
            const active = value.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onPatch({ mode })}
                aria-pressed={active}
                title={tip}
                className={cn(CHIP_CLASS, active && "border-accent bg-raised text-fg")}
              >
                {label}
              </button>
            );
          })}
        </span>
      </label>

      {/* 점 크기·각도·세기 슬라이더 — 범위는 HALFTONE_*_RANGE에서. */}
      <div className="space-y-2">
        {HALFTONE_SLIDERS.map(({ key, label, range, unit }) => (
          <label key={key} className={LABEL_ROW}>
            {label}
            <span className="flex items-center gap-1.5">
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={range.step}
                value={value[key] as number}
                onChange={(e) => onPatch({ [key]: Number(e.target.value) })}
                className={RANGE_CLASS}
              />
              <span className={READOUT_CLASS}>
                {value[key]}
                {unit}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
