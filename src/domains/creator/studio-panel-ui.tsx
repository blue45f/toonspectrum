/**
 * Studio Panel UI — 필터 패널들이 공유하는 프레젠테이션 프리미티브.
 * 각 Studio*Panel.tsx 가 복붙하던 공용 클래스 상수 + 라벨/슬라이더 행 + 선택 칩을
 * 한 곳으로 모아 중복(copy-paste)을 제거한다. 상태 없는 순수 프레젠테이션.
 *
 * 디자인 규범: DESIGN.md warm-ink 표면 단계, 44px 터치, accent는 활성 신호만,
 * text-white/side-stripe 금지, focus ring = accent.
 */
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

/* eslint-disable react-refresh/only-export-components -- panel tokens + class helpers shared across Studio panels */
// ── 공용 상호작용 토큰 ────────────────────────────────────────────────────
export const STUDIO_FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const STUDIO_TOUCH_TARGET =
  "min-h-11 pointer-coarse:min-h-11 max-lg:min-h-11";
export const STUDIO_EASE = "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]";

// 공용 라벨 행 + 레인지/회독(readout) 스타일. 모든 패널이 동일 폭으로 정렬한다.
// 터치 기기(S11 등 작은 폰)에서는 패널 컨트롤을 키워 thumb 로 다루기 쉽게 한다(pointer-coarse).
// 데스크톱(fine pointer)은 기존 컴팩트 사이즈 유지 — 정밀 조작·공간 효율.
export const PANEL_LABEL_ROW =
  "flex items-center justify-between gap-2 text-xs pointer-coarse:text-[0.8125rem] text-fg-2";
export const PANEL_RANGE_CLASS = "w-24 pointer-coarse:w-32 pointer-coarse:h-6 accent-accent cursor-pointer";
export const PANEL_READOUT_CLASS =
  "w-8 pointer-coarse:w-9 text-right text-[0.72rem] pointer-coarse:text-[0.75rem] tabular-nums text-fg-3";
export const PANEL_CHIP_CLASS =
  "min-h-6 rounded-md border border-line bg-card px-2 py-0.5 text-[0.72rem] text-fg-2 transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-raised hover:text-fg pointer-coarse:px-2.5 pointer-coarse:py-1.5 pointer-coarse:text-[0.75rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** 툴바 도구 버튼 — 활성은 accent soft, 비활성은 card. */
export function studioToolButtonClass(active: boolean, options?: { dense?: boolean }): string {
  return cn(
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border text-xs",
    STUDIO_EASE,
    STUDIO_FOCUS_RING,
    options?.dense
      ? "h-9 px-2.5 pointer-coarse:h-11 pointer-coarse:min-h-11 pointer-coarse:px-3 pointer-coarse:text-[0.8125rem]"
      : cn("h-9 px-2.5", STUDIO_TOUCH_TARGET, "pointer-coarse:px-3"),
    active
      ? "border-accent/55 bg-accent-soft/55 text-fg shadow-[inset_0_0_0_1px_oklch(0.72_0.185_42/0.12)]"
      : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
  );
}

/** 세그먼트/필터 칩 — 활성은 accent 면 + on-accent 글자(white 금지). */
export function studioSegmentChipClass(active: boolean): string {
  return cn(
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold",
    STUDIO_EASE,
    STUDIO_FOCUS_RING,
    "pointer-coarse:min-h-11 pointer-coarse:px-3",
    active
      ? "border-accent bg-accent text-on-accent"
      : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
  );
}

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
      aria-pressed={active}
      className={cn(PANEL_CHIP_CLASS, active && "border-accent bg-accent-soft/50 text-fg")}
    >
      {children}
    </button>
  );
}

/** 패널 섹션 제목 + 보조 설명. 인스펙터·브러시 스튜디오·레이어 공통. */
export function StudioSectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn("mb-2 flex min-w-0 items-start justify-between gap-2", className)}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-bold tracking-tight text-fg text-pretty">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-[0.7rem] leading-relaxed text-fg-3 text-pretty">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** 빈 상태를 가르치는 UI — 아이콘 + 제목 + 한 줄 안내 + 선택 액션. */
export function StudioEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-panel/40 px-4 py-8 text-center",
        className
      )}
    >
      {icon ? (
        <div className="mx-auto mb-2 grid size-11 place-items-center rounded-xl border border-line bg-card text-fg-3">
          {icon}
        </div>
      ) : null}
      <p className="text-xs font-semibold text-fg-2 text-pretty">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-[28ch] text-[0.7rem] leading-relaxed text-fg-3 text-pretty">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** 인스펙터/시트 상단 컨텍스트 칩(선택 요약). */
export function StudioContextPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "good" | "warn";
}): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums",
        tone === "accent" && "border-accent/40 bg-accent-soft text-accent",
        tone === "good" && "border-good/35 bg-good/10 text-good",
        tone === "warn" && "border-warn/40 bg-warn/10 text-warn",
        tone === "neutral" && "border-line bg-raised/80 text-fg-3"
      )}
    >
      {children}
    </span>
  );
}

// 스와치(색 점)를 품는 프리셋 칩 전용 클래스 — flex 레이아웃이 필요해 공용 칩(StudioPanelChip)을 쓰지 않는다.
export const PANEL_SWATCH_CHIP_CLASS =
  "flex min-h-6 items-center gap-1.5 rounded-md border border-line bg-card px-2 py-0.5 text-[0.72rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg pointer-coarse:px-2.5 pointer-coarse:py-1.5 pointer-coarse:text-[0.75rem]";

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
      className={cn(PANEL_CHIP_CLASS, active && "border-accent bg-accent-soft/50 text-fg")}
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
