/**
 * Studio Panel UI — 필터 패널들이 공유하는 프레젠테이션 프리미티브.
 * 각 Studio*Panel.tsx 가 복붙하던 공용 클래스 상수 + 라벨/슬라이더 행 + 선택 칩을
 * 한 곳으로 모아 중복(copy-paste)을 제거한다. 상태 없는 순수 프레젠테이션.
 */
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

// 공용 라벨 행 + 레인지/회독(readout) 스타일. 모든 패널이 동일 폭으로 정렬한다.
// 터치 기기(S11 등 작은 폰)에서는 패널 컨트롤을 키워 thumb 로 다루기 쉽게 한다(pointer-coarse).
// 데스크톱(fine pointer)은 기존 컴팩트 사이즈 유지 — 정밀 조작·공간 효율.
export const PANEL_LABEL_ROW =
  "flex items-center justify-between gap-2 text-xs pointer-coarse:text-[0.8125rem] text-fg-2";
export const PANEL_RANGE_CLASS = "w-24 pointer-coarse:w-32 pointer-coarse:h-5 accent-accent cursor-pointer";
export const PANEL_READOUT_CLASS =
  "w-8 pointer-coarse:w-9 text-right text-[10px] pointer-coarse:text-[11px] tabular-nums text-fg-3";
export const PANEL_CHIP_CLASS =
  "rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg pointer-coarse:px-2.5 pointer-coarse:py-1.5 pointer-coarse:text-[0.7rem]";

// 프리셋/종류 선택 칩. active 면 강조 테두리(현재 선택)로 표시한다.
export function StudioPanelChip({
  active = false,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(PANEL_CHIP_CLASS, active && "border-accent bg-raised text-fg")}
    >
      {children}
    </button>
  );
}

// 스와치(색 점)를 품는 프리셋 칩 전용 클래스 — flex 레이아웃이 필요해 공용 칩(StudioPanelChip)을 쓰지 않는다.
export const PANEL_SWATCH_CHIP_CLASS =
  "flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-0.5 text-[0.6rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg pointer-coarse:px-2.5 pointer-coarse:py-1.5 pointer-coarse:text-[0.7rem]";

// 색 스와치 + 라벨을 한 칩에 담는 프리셋 칩. swatch 는 color 로 칠하고, active 면 강조 테두리로 표시한다.
export function StudioSwatchChip({
  color,
  label,
  active = false,
  title,
  onClick,
}: {
  color: string;
  label: ReactNode;
  active?: boolean;
  title?: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(PANEL_SWATCH_CHIP_CLASS, active && "border-accent bg-raised text-fg")}
    >
      <span aria-hidden className="size-2.5 rounded-full border border-line/60" style={{ backgroundColor: color }} />
      {label}
    </button>
  );
}

// aria-pressed 를 가진 토글/세그먼트 칩 한 개. 단일 on/off(글로우 원색) 또는 다중 모드 선택(하프톤)에 모두 쓴다.
export function StudioToggleChip({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(PANEL_CHIP_CLASS, active && "border-accent bg-raised text-fg")}
    >
      {children}
    </button>
  );
}

// 라벨 + 레인지 슬라이더 + 우측 readout 한 줄. readout 미지정 시 value 를 그대로 표시한다.
export function StudioSliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  readout,
}: {
  label: ReactNode;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
  readout?: ReactNode;
}): ReactElement {
  return (
    <label className={PANEL_LABEL_ROW}>
      {label}
      <span className="flex items-center gap-1.5">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={PANEL_RANGE_CLASS}
        />
        <span className={PANEL_READOUT_CLASS}>{readout ?? value}</span>
      </span>
    </label>
  );
}
