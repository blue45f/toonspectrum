/**
 * Studio Layer Style Panel
 * 선택된 이미지의 레이어 스타일 인스펙터 — 원클릭 그림자/모서리 프리셋 +
 * 그림자 색 + 번짐/오프셋/농도/모서리 슬라이더.
 * StudioPage에서 분리한 순수 프레젠테이션 컴포넌트(상태 없음, props만 읽고 onPatch로 쓴다).
 */
import { RotateCcw } from "lucide-react";

import {
  LAYER_STYLE_PRESETS,
  LAYER_STYLE_RANGES,
  layerStyleResetPatch,
  type LayerStylePatch,
} from "./studio-layer-styles";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";


// input[type=color]는 빈 값 불가 — 그림자 색 미지정 시 보여줄 폴백(검정).
const SHADOW_FALLBACK_COLOR = "#000000";

// 공용 라벨 + 슬라이더 한 줄. 우측 readout은 항상 같은 폭으로 정렬한다.
const LABEL_ROW = "flex items-center justify-between gap-2 text-xs text-fg-2";
const RANGE_CLASS = "w-24 accent-accent cursor-pointer";
const READOUT_CLASS = "w-8 text-right text-[10px] tabular-nums text-fg-3";
const CHIP_CLASS =
  "rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg";

export function StudioLayerStylePanel({
  values,
  onPatch,
}: {
  values: LayerStylePatch;
  onPatch: (patch: LayerStylePatch) => void;
}): React.ReactElement {
  // 레이어 스타일이 하나도 없으면 "기본" 프리셋을 활성으로 표시(LayerStylePatch는 string|number만).
  const isPristine = Object.values(values).every((v) => v === undefined);

  return (
    <div className="space-y-2">
      {/* 헤더 + 원본 복귀 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">
          레이어 스타일 (그림자·모서리)
        </p>
        <button
          type="button"
          onClick={() => onPatch(layerStyleResetPatch())}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="모든 레이어 스타일을 제거하고 원본으로 되돌립니다."
        >
          <RotateCcw className="size-3.5" />
          원본으로
        </button>
      </div>

      {/* 원클릭 프리셋 칩 — reset 후 적용해 절대값으로 덮어쓴다(누적 아님). */}
      <div className="flex flex-wrap gap-1.5">
        {LAYER_STYLE_PRESETS.map((preset) => {
          const active = preset.id === "none" && isPristine;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPatch({ ...layerStyleResetPatch(), ...preset.patch })}
              title={preset.tip}
              className={cn(CHIP_CLASS, active && "border-accent bg-raised text-fg")}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* 그림자 색 — input[type=color]는 빈 값 불가라 미지정 시 검정 폴백. */}
      <label className="flex items-center gap-2 text-xs text-fg-2">
        그림자 색
        <input
          type="color"
          value={values.shadowColor ?? SHADOW_FALLBACK_COLOR}
          onChange={(e) => onPatch({ shadowColor: e.target.value })}
          className="h-7 w-7 cursor-pointer rounded border border-line bg-card"
        />
      </label>

      {/* 그림자/모서리 슬라이더 — 범위는 LAYER_STYLE_RANGES에서 가져온다. */}
      <label className={LABEL_ROW}>
        그림자 번짐
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={LAYER_STYLE_RANGES.shadowBlur.min}
            max={LAYER_STYLE_RANGES.shadowBlur.max}
            step={LAYER_STYLE_RANGES.shadowBlur.step}
            value={values.shadowBlur ?? 0}
            onChange={(e) => onPatch({ shadowBlur: Number(e.target.value) })}
            className={RANGE_CLASS}
          />
          <span className={READOUT_CLASS}>{values.shadowBlur ?? 0}px</span>
        </span>
      </label>

      <label className={LABEL_ROW}>
        가로 오프셋
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={LAYER_STYLE_RANGES.shadowOffsetX.min}
            max={LAYER_STYLE_RANGES.shadowOffsetX.max}
            step={LAYER_STYLE_RANGES.shadowOffsetX.step}
            value={values.shadowOffsetX ?? 0}
            onChange={(e) => onPatch({ shadowOffsetX: Number(e.target.value) })}
            className={RANGE_CLASS}
          />
          <span className={READOUT_CLASS}>{values.shadowOffsetX ?? 0}px</span>
        </span>
      </label>

      <label className={LABEL_ROW}>
        세로 오프셋
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={LAYER_STYLE_RANGES.shadowOffsetY.min}
            max={LAYER_STYLE_RANGES.shadowOffsetY.max}
            step={LAYER_STYLE_RANGES.shadowOffsetY.step}
            value={values.shadowOffsetY ?? 0}
            onChange={(e) => onPatch({ shadowOffsetY: Number(e.target.value) })}
            className={RANGE_CLASS}
          />
          <span className={READOUT_CLASS}>{values.shadowOffsetY ?? 0}px</span>
        </span>
      </label>

      <label className={LABEL_ROW}>
        그림자 농도
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={LAYER_STYLE_RANGES.shadowOpacity.min}
            max={LAYER_STYLE_RANGES.shadowOpacity.max}
            step={LAYER_STYLE_RANGES.shadowOpacity.step}
            value={values.shadowOpacity ?? 0}
            onChange={(e) => onPatch({ shadowOpacity: Number(e.target.value) })}
            className={RANGE_CLASS}
          />
          <span className={READOUT_CLASS}>{Math.round((values.shadowOpacity ?? 0) * 100)}</span>
        </span>
      </label>

      <label className={LABEL_ROW}>
        모서리 둥글기
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={LAYER_STYLE_RANGES.cornerRadius.min}
            max={LAYER_STYLE_RANGES.cornerRadius.max}
            step={LAYER_STYLE_RANGES.cornerRadius.step}
            value={values.cornerRadius ?? 0}
            onChange={(e) => onPatch({ cornerRadius: Number(e.target.value) })}
            className={RANGE_CLASS}
          />
          <span className={READOUT_CLASS}>{values.cornerRadius ?? 0}px</span>
        </span>
      </label>
    </div>
  );
}
