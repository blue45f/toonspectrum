/**
 * Studio Magic Resize Panel — 페이지 규격 전환(정방형/가로 썸네일/세로 스토리 등) 프리셋 그리드 +
 * 재배치 전략(재배치/맞춤 축소) 토글. 클릭 한 번으로 studio-magic-resize의 순수 계산 결과를
 * 부모(StudioPage)가 commit(nextElements, { canvasH })로 단일 undo 스텝에 커밋하는 흐름을 가정한다.
 *
 * StudioPhotoWebtoonPresetPanel/StudioQuickShapePanel과 같은 계보 — 상태를 소유하지 않는 순수
 * 프레젠테이션 컴포넌트다. "지금 어떤 프리셋이 적용된 상태인가"는 별도 필드로 저장하지 않고,
 * currentSize(현재 캔버스 크기)의 종횡비와 각 프리셋의 종횡비를 비교해 파생 판정한다 — 매직
 * 리사이즈는 페이지 종횡비를 바꾸는 동작 자체가 곧 "그 프리셋을 적용한 상태"와 동치이기 때문에
 * 별도 상태 필드를 두면 오히려 두 진실(canvasH vs 저장된 presetId)이 어긋날 위험만 생긴다.
 *
 * 무장(armed) 도구가 아니다 — 프리셋 클릭은 즉시 계산·커밋되는 단발성 동작이라 다른 픽셀 도구처럼
 * 캔버스 제스처를 가로채지 않는다(disarmAllPixelTools 훅과 무관).
 */
import { CreditCard, RectangleHorizontal, RectangleVertical, Smartphone, Square, type LucideIcon } from "lucide-react";


import {
  MAGIC_RESIZE_PRESETS,
  MAGIC_RESIZE_STRATEGIES,
  presetCanvasSize,
  type MagicResizeCanvasSize,
  type MagicResizePreset,
  type MagicResizeStrategy,
} from "./studio-magic-resize";
import { StudioToggleChip } from "./studio-panel-ui";

import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

// 프리셋 id → 대표 아이콘. 카탈로그에 없는 id가 들어와도(방어적) Square로 폴백한다.
const PRESET_ICONS: Record<string, LucideIcon> = {
  square: Square,
  "landscape-thumb": RectangleHorizontal,
  "portrait-story": Smartphone,
  "tall-cut": RectangleVertical,
  "landscape-card": CreditCard,
};

/** 두 캔버스 크기의 종횡비가 사실상 같은지(부동소수 오차 허용 0.01). */
function isSameAspect(a: MagicResizeCanvasSize, b: MagicResizeCanvasSize): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return Math.abs(a.width / a.height - b.width / b.height) < 0.01;
}

export interface StudioMagicResizePanelProps {
  /** 현재 활성 페이지 캔버스 크기 — 어느 프리셋이 이미 적용된 종횡비인지 표시용(선택). */
  currentSize?: MagicResizeCanvasSize;
  strategy: MagicResizeStrategy;
  onStrategyChange: (next: MagicResizeStrategy) => void;
  /** 프리셋 칩 클릭 시 호출 — 부모가 presetCanvasSize(preset)를 목표 크기로 computeMagicResize 실행. */
  onApplyPreset: (preset: MagicResizePreset) => void;
}

export function StudioMagicResizePanel({
  currentSize,
  strategy,
  onStrategyChange,
  onApplyPreset,
}: StudioMagicResizePanelProps): ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">매직 리사이즈 (Magic Resize)</p>
      </div>

      <p className="text-[0.68rem] text-fg-3">
        규격을 고르면 요소를 새 비율에 맞춰 자동으로 다시 배치합니다. 실행 취소(Ctrl+Z)로 되돌릴 수 있어요.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {MAGIC_RESIZE_STRATEGIES.map((s) => (
          <StudioToggleChip key={s.id} active={strategy === s.id} title={s.hint} onClick={() => onStrategyChange(s.id)}>
            {s.label}
          </StudioToggleChip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {MAGIC_RESIZE_PRESETS.map((preset) => {
          const Icon = PRESET_ICONS[preset.id] ?? Square;
          const size = presetCanvasSize(preset);
          const active = currentSize ? isSameAspect(currentSize, size) : false;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyPreset(preset)}
              title={preset.hint}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border border-line bg-card px-2 py-2 text-center transition-colors",
                "hover:bg-raised hover:text-fg",
                active ? "border-accent bg-raised text-fg" : "text-fg-2"
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className="text-[0.7rem] font-medium">{preset.label}</span>
              <span className="text-[0.62rem] tabular-nums text-fg-3">
                {size.width}×{size.height}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
