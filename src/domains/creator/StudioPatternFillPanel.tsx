/**
 * Studio Pattern Fill Panel
 * 도형 채우기 패턴 인스펙터 — 패턴 스와치 12종 그리드(실제 타일 미리보기) +
 * 전경/배경색 + 배율 슬라이더 + 해제. studio-pattern-fill의 순수 헬퍼로만 스펙을
 * 만들어 onChange로 돌려주는 상태 없는(fully-controlled) 프레젠테이션 컴포넌트.
 * value=null이면 미적용 상태. 우선순위 규약: 패턴 > 그라데이션 > 단색 채우기.
 */
import { RotateCcw } from "lucide-react";

import { PANEL_LABEL_ROW, StudioSliderRow } from "./studio-panel-ui";
import {
  DEFAULT_PATTERN_SPEC,
  PATTERN_SCALE_RANGE,
  STUDIO_PATTERNS,
  normalizePatternSpec,
  patternPreviewCss,
  setPatternBg,
  setPatternFg,
  setPatternId,
  setPatternScale,
  type StudioPatternSpec,
} from "./studio-pattern-fill";

import type { ReactElement } from "react";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

export type StudioPatternFillPanelProps = {
  /** 현재 요소의 패턴 스펙 — null이면 미적용(그라데이션/단색 채우기). */
  value: StudioPatternSpec | null;
  /** 스펙 변경/적용 콜백 — null은 해제(그라데이션/단색 복귀). */
  onChange: (spec: StudioPatternSpec | null) => void;
  /** 섹션 제목 — 기본 "패턴 채우기". */
  title?: string;
};

/**
 * 패턴 스와치 그리드 — 각 칸이 실제 타일(data URL)을 반복 렌더한 실미리보기.
 * 적용 중이면 현재 전경/배경색을 스와치에도 반영해 "내 색으로 보이는" 스와치가 된다.
 */
function PatternSwatchGrid({
  current,
  onChange,
}: {
  current: StudioPatternSpec | null;
  onChange: (spec: StudioPatternSpec) => void;
}): ReactElement {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {STUDIO_PATTERNS.map((def) => {
        const active = current?.patternId === def.id;
        // 스와치 미리보기는 판독성을 위해 배율 1 고정(배율은 아래 슬라이더가 담당).
        const preview = normalizePatternSpec({
          ...(current ?? DEFAULT_PATTERN_SPEC),
          patternId: def.id,
          scale: 1,
        });
        return (
          <button
            key={def.id}
            type="button"
            title={def.tip}
            aria-pressed={active}
            onClick={() => onChange(setPatternId(current ?? DEFAULT_PATTERN_SPEC, def.id))}
            className={cn(
              "group flex flex-col gap-1 rounded-lg border border-line bg-card p-1.5 text-left transition-colors hover:bg-raised",
              active && "border-accent bg-raised"
            )}
          >
            <span aria-hidden className="h-6 w-full rounded-md border border-line/60" style={patternPreviewCss(preview)} />
            <span className={cn("truncate text-[0.72rem] text-fg-2 group-hover:text-fg", active && "text-fg")}>
              {def.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function StudioPatternFillPanel({
  value,
  onChange,
  title = "패턴 채우기",
}: StudioPatternFillPanelProps): ReactElement {
  // 문서(localStorage)에서 온 값일 수 있으므로 항상 정규화해 다룬다 — 컨트롤이 안전한 값만 본다.
  const current = value == null ? null : normalizePatternSpec(value);

  return (
    <div className="space-y-2">
      {/* 헤더 + 해제(그라데이션/단색 복귀) */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.72rem] font-semibold text-fg-3 uppercase tracking-wider">{title}</p>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={current == null}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="패턴을 제거합니다 — 그라데이션이 있으면 그라데이션, 없으면 단색 채우기로 돌아갑니다."
        >
          <RotateCcw className="size-3.5" />
          패턴 해제
        </button>
      </div>

      {/* 우선순위 규약 힌트 — 패턴 > 그라데이션 > 단색 */}
      <p className="text-[0.72rem] text-fg-3">
        {current == null
          ? "스와치를 고르면 적용됩니다. 패턴은 그라데이션·단색보다 우선해요."
          : "패턴이 그라데이션·단색 채우기보다 우선 적용되고 있어요."}
      </p>

      {current != null && (
        <>
          {/* 라이브 미리보기 — 캔버스와 동일 타일·동일 배율(background-size) */}
          <div aria-hidden className="h-8 w-full rounded-lg border border-line/60" style={patternPreviewCss(current)} />

          {/* 전경(잉크)색 */}
          <label className={PANEL_LABEL_ROW}>
            무늬 색상
            <input
              type="color"
              value={current.fg}
              onChange={(e) => onChange(setPatternFg(current, e.target.value))}
              className="h-7 w-7 cursor-pointer rounded border border-line bg-card"
            />
          </label>

          {/* 배경 — 투명(아래 요소가 비침) 또는 불투명 단색 */}
          <label className={PANEL_LABEL_ROW}>
            배경 투명
            <input
              type="checkbox"
              checked={current.bg == null}
              onChange={(e) => onChange(setPatternBg(current, e.target.checked ? null : "#ffffff"))}
              className="size-4 accent-accent cursor-pointer"
            />
          </label>
          {current.bg != null && (
            <label className={PANEL_LABEL_ROW}>
              배경 색상
              <input
                type="color"
                value={current.bg}
                onChange={(e) => onChange(setPatternBg(current, e.target.value))}
                className="h-7 w-7 cursor-pointer rounded border border-line bg-card"
              />
            </label>
          )}

          {/* 배율 — 타일 크기(무늬 밀도). 25%면 촘촘, 400%면 성김. */}
          <StudioSliderRow
            label="배율"
            min={PATTERN_SCALE_RANGE.min}
            max={PATTERN_SCALE_RANGE.max}
            step={PATTERN_SCALE_RANGE.step}
            value={current.scale}
            onChange={(next) => onChange(setPatternScale(current, next))}
            readout={`${Math.round(current.scale * 100)}%`}
          />
        </>
      )}

      {/* 스와치 12종 — 미적용/적용 상태 양쪽에서 재사용(적용 중엔 종류만 교체) */}
      <PatternSwatchGrid current={current} onChange={onChange} />
    </div>
  );
}
