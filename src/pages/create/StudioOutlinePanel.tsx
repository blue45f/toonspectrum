/**
 * Studio Outline Panel
 * 선택된 이미지의 스티커 테두리(Outline) 인스펙터 — 원클릭 테두리 프리셋 +
 * 테두리 색 + 굵기(width) + 불투명도(opacity) 슬라이더.
 * studio-outline 엔진의 Outline을 props로 읽고 onPatch/onApplyPreset/onReset으로만 쓴다.
 * StudioPage에서 분리한 순수 프레젠테이션 컴포넌트(상태 없음).
 */
import { RotateCcw } from "lucide-react";

import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { StudioSliderRow } from "./studio-panel-ui";
import {
  isIdentityOutline,
  OUTLINE_OPACITY_RANGE,
  OUTLINE_PRESETS,
  OUTLINE_WIDTH_RANGE,
  type Outline,
} from "./studio-outline";

// 스와치(색 점)를 품는 프리셋 칩 전용 클래스 — flex 레이아웃이 필요해 공용 칩(StudioPanelChip)을 쓰지 않는다.
const CHIP_CLASS =
  "flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg";

export function StudioOutlinePanel({
  value,
  onPatch,
  onApplyPreset,
  onReset,
}: {
  value: Outline;
  onPatch: (patch: Partial<Outline>) => void;
  onApplyPreset: (v: Outline) => void;
  onReset: () => void;
}): React.ReactElement {
  // 두께 0 또는 불투명도 0(테두리 없음)이면 리셋 비활성 + "없음" 프리셋 칩을 활성으로 표시.
  const isIdentity = isIdentityOutline(value);

  return (
    <div className="space-y-2">
      {/* 헤더 + 항등 복귀 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">테두리 (Outline)</p>
        <button
          type="button"
          onClick={onReset}
          disabled={isIdentity}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="테두리를 제거하고 원본으로 되돌립니다."
        >
          <RotateCcw className="size-3.5" />
          원본으로
        </button>
      </div>

      {/* 원클릭 테두리 프리셋 칩 — 절대값으로 덮어쓴다(누적 아님). 스와치는 프리셋 색으로 칠한다. */}
      <div className="flex flex-wrap gap-1.5">
        {OUTLINE_PRESETS.map((preset) => {
          const active = preset.id === "none" && isIdentity;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyPreset(preset.value)}
              title={preset.tip}
              className={cn(CHIP_CLASS, active && "border-accent bg-raised text-fg")}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full border border-line/60"
                style={{ backgroundColor: preset.value.color }}
              />
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* 테두리 색 — input[type=color]는 빈 값 불가라 항상 #rrggbb를 들고 있다. */}
      <label className="flex items-center gap-2 text-xs text-fg-2">
        테두리 색
        <input
          type="color"
          value={value.color}
          onChange={(e) => onPatch({ color: e.target.value })}
          className="h-7 w-7 cursor-pointer rounded border border-line bg-card"
        />
      </label>

      {/* 굵기(width) 슬라이더 — 범위는 OUTLINE_WIDTH_RANGE에서. 0이면 항등. */}
      <StudioSliderRow
        label="굵기 (Width)"
        min={OUTLINE_WIDTH_RANGE.min}
        max={OUTLINE_WIDTH_RANGE.max}
        step={OUTLINE_WIDTH_RANGE.step}
        value={value.width}
        onChange={(n) => onPatch({ width: n })}
        readout={`${value.width}px`}
      />

      {/* 불투명도(opacity) 슬라이더 — 범위는 OUTLINE_OPACITY_RANGE에서. 0이면 항등. */}
      <StudioSliderRow
        label="불투명도 (Opacity)"
        min={OUTLINE_OPACITY_RANGE.min}
        max={OUTLINE_OPACITY_RANGE.max}
        step={OUTLINE_OPACITY_RANGE.step}
        value={value.opacity}
        onChange={(n) => onPatch({ opacity: n })}
        readout={`${value.opacity}%`}
      />

      {/* 안내 — 테두리는 실루엣 바깥으로 자라므로 투명 배경에서 효과가 또렷하다. */}
      <p className="text-[0.6rem] leading-relaxed text-fg-3">투명 배경 이미지(캐릭터·스티커)에서 잘 보여요.</p>
    </div>
  );
}
