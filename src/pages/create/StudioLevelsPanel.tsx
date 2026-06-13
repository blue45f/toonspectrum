/**
 * Studio Levels Panel
 * 선택된 이미지의 레벨(Levels) 보정 인스펙터 — 원클릭 톤 프리셋 + 입력/감마/출력 슬라이더.
 * studio-levels 엔진의 LevelsParams를 props로 읽고 onPatch/onApplyPreset/onReset으로만 쓴다.
 * StudioPage에서 분리한 순수 프레젠테이션 컴포넌트(상태 없음).
 */
import { RotateCcw } from "lucide-react";

import { buttonClass } from "@/components/ui/button";

import { StudioPanelChip, StudioSliderRow } from "./studio-panel-ui";
import {
  DEFAULT_LEVELS,
  isIdentityLevels,
  LEVELS_PRESETS,
  LEVELS_RANGES,
  type LevelsParams,
} from "./studio-levels";

// 슬라이더 정의 — 표시 순서·한글 라벨·readout 포맷(감마만 소수 2자리, 나머지는 정수).
const LEVELS_SLIDERS: { key: keyof LevelsParams; label: string; gamma?: boolean }[] = [
  { key: "blackPoint", label: "입력 검정" },
  { key: "whitePoint", label: "입력 흰색" },
  { key: "gamma", label: "감마 (중간톤)", gamma: true },
  { key: "outBlack", label: "출력 검정" },
  { key: "outWhite", label: "출력 흰색" },
];

export function StudioLevelsPanel({
  value,
  onPatch,
  onApplyPreset,
  onReset,
}: {
  value: LevelsParams;
  onPatch: (patch: Partial<LevelsParams>) => void;
  onApplyPreset: (params: LevelsParams) => void;
  onReset: () => void;
}): React.ReactElement {
  // 항등(보정 없음)이면 리셋 비활성 + "기본" 프리셋 칩을 활성으로 표시.
  const isIdentity = isIdentityLevels(value);

  return (
    <div className="space-y-2">
      {/* 헤더 + 항등 복귀 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">레벨 보정 (Levels)</p>
        <button
          type="button"
          onClick={onReset}
          disabled={isIdentity}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="레벨 보정을 제거하고 원본 톤으로 되돌립니다."
        >
          <RotateCcw className="size-3.5" />
          원본으로
        </button>
      </div>

      {/* 원클릭 톤 프리셋 칩 — 절대값으로 덮어쓴다(누적 아님). */}
      <div className="flex flex-wrap gap-1.5">
        {LEVELS_PRESETS.map((preset) => (
          <StudioPanelChip
            key={preset.id}
            active={preset.id === "identity" && isIdentity}
            onClick={() => onApplyPreset(preset.params)}
            title={preset.tip}
          >
            {preset.label}
          </StudioPanelChip>
        ))}
      </div>

      {/* 입력 검정/흰점 · 중간톤 감마 · 출력 하한/상한 슬라이더 — 범위는 LEVELS_RANGES에서. */}
      <div className="space-y-2">
        {LEVELS_SLIDERS.map(({ key, label, gamma }) => {
          const range = LEVELS_RANGES[key];
          const current = value[key] ?? DEFAULT_LEVELS[key];
          return (
            <StudioSliderRow
              key={key}
              label={label}
              min={range.min}
              max={range.max}
              step={range.step}
              value={current}
              onChange={(n) => onPatch({ [key]: n })}
              readout={gamma ? current.toFixed(2) : current}
            />
          );
        })}
      </div>
    </div>
  );
}
