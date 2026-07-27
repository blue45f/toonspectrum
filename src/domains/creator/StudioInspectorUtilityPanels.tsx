import {
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  MousePointer2,
  Pipette,
} from "lucide-react";
import { Suspense, type RefObject } from "react";

import { DRAW_COLOR_SWATCHES } from "./studio-draw-color-swatches";
import { StudioPageGradePanel } from "./studio-page-lazy-ui";
import { StudioActiveBrushSummary } from "./StudioActiveBrushSummary";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";

import type { StudioInspectorInteractionGate } from "./studio-inspector-interaction-policy";
import type { PageGrade } from "./studio-page-grade";
import type { StudioStabilizerMode } from "./studio-stroke-stabilizer";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

export function StudioInspectorDisabledReasons({
  reasons,
}: {
  reasons: readonly string[];
}) {
  if (reasons.length === 0) return null;

  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-[0.64rem] leading-relaxed text-bad"
    >
      <p className="font-semibold">우측 메뉴가 잠긴 이유</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </section>
  );
}

export function StudioInspectorCurrentBrushSummary({
  brushId,
  brushName,
  color,
  opacity,
  stabilizer,
  stabilizerMode,
  strokeWidth,
  tipAngle,
  tipRoundness,
  onOpenBrushCatalog,
}: {
  brushId: string;
  brushName: string;
  color: string;
  opacity: number;
  stabilizer: number;
  stabilizerMode: StudioStabilizerMode;
  strokeWidth: number;
  tipAngle: number;
  tipRoundness: number;
  onOpenBrushCatalog?: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <section
      aria-label="현재 기본 프리셋 요약"
      data-studio-inspector-brush-summary="true"
      className="space-y-1.5"
    >
      <StudioActiveBrushSummary
        brushId={brushId}
        brushName={brushName}
        color={color}
        opacity={opacity}
        stabilizer={stabilizer}
        stabilizerMode={stabilizerMode}
        strokeWidth={strokeWidth}
        tipAngle={tipAngle}
        tipRoundness={tipRoundness}
        label="현재 기본 프리셋"
      />
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="min-w-0 text-[0.62rem] leading-relaxed text-fg-3">
          하단 빠른 바와 같은 브러시 목록을 사용합니다.
        </p>
        {onOpenBrushCatalog ? (
          <button
            type="button"
            onClick={(event) => onOpenBrushCatalog(event.currentTarget)}
            aria-haspopup="dialog"
            className="hidden min-h-9 shrink-0 items-center gap-1 rounded-md border border-line bg-card px-2 text-[0.62rem] font-semibold text-fg-2 transition-colors hover:border-accent/40 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:inline-flex"
          >
            <LayoutGrid size={13} aria-hidden />
            기본 브러시
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function StudioInspectorBrushCatalogButton({
  onOpen,
}: {
  onOpen: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(event) => onOpen(event.currentTarget)}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <LayoutGrid size={14} aria-hidden />
      브러시 목록
    </button>
  );
}

export function StudioInspectorDrawColorControls({
  color,
  eyedropperActive,
  onColorChange,
  onEyedropperToggle,
}: {
  color: string;
  eyedropperActive: boolean;
  onColorChange: (color: string) => void;
  onEyedropperToggle: () => void;
}) {
  return (
    <div className="space-y-1.5 border-t border-line/35 pt-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-medium text-fg-3">색상</p>
        <button
          type="button"
          onClick={onEyedropperToggle}
          aria-pressed={eyedropperActive}
          aria-label={
            eyedropperActive
              ? "스포이드 끄기"
              : "스포이드로 캔버스 색상 선택"
          }
          title="스포이드 — 캔버스를 클릭해 그 지점의 색을 그대로 가져와요 (펜 도구 중엔 Alt+클릭으로도 가능)"
          className={cn(
            "grid size-11 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:size-5 lg:rounded",
            eyedropperActive
              ? "border-accent bg-accent/15 text-accent"
              : "border-line text-fg-3 hover:bg-raised"
          )}
        >
          <Pipette className="size-3" aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {DRAW_COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => onColorChange(swatch)}
            aria-pressed={color.toLowerCase() === swatch.toLowerCase()}
            className="group grid size-11 place-items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:size-5 lg:rounded"
            title={swatch}
            aria-label={`${swatch} 색상 선택`}
          >
            <span
              aria-hidden
              className={cn(
                "block size-5 rounded border transition-transform group-hover:scale-110",
                color.toLowerCase() === swatch.toLowerCase()
                  ? "ring-2 ring-accent ring-offset-1 ring-offset-panel"
                  : "border-line/60"
              )}
              style={{ background: swatch }}
            />
          </button>
        ))}
        <label
          className="relative grid size-11 cursor-pointer place-items-center rounded-lg focus-within:ring-2 focus-within:ring-accent lg:size-5 lg:rounded"
          title="사용자 정의 색상"
        >
          <input
            type="color"
            value={color}
            onChange={(event) => onColorChange(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label="사용자 정의 색상 선택"
          />
          <span
            aria-hidden
            className="grid size-5 select-none place-items-center overflow-hidden rounded border border-line text-[8px] font-bold text-white shadow-sm"
            style={{ background: color }}
          >
            <span className="mix-blend-difference">C</span>
          </span>
        </label>
      </div>
    </div>
  );
}

export function StudioInspectorMutationLockNotice({
  gate,
  hasActiveSession,
  onExit,
}: {
  gate: StudioInspectorInteractionGate;
  hasActiveSession: boolean;
  onExit: () => void;
}) {
  if (!gate.disabled || !hasActiveSession) return null;

  return (
    <div
      role="status"
      className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/35 bg-warn/10 px-2.5 py-2 text-[0.66rem] text-fg-2"
    >
      <span className="min-w-0 flex-1">{gate.reason}</span>
      <button
        type="button"
        data-studio-inspector-emergency-exit="true"
        onClick={onExit}
        className={buttonClass({
          size: "sm",
          variant: "quiet",
          className: "shrink-0",
        })}
      >
        활성 도구 종료
      </button>
    </div>
  );
}

export function StudioInspectorPageGradeSurface({
  active,
  expanded,
  grade,
  gradeActive,
  gate,
  onApplyPreset,
  onExpandedChange,
  onPatch,
  onReset,
}: {
  active: boolean;
  expanded: boolean;
  grade: PageGrade;
  gradeActive: boolean;
  gate: StudioInspectorInteractionGate;
  onApplyPreset: (grade: PageGrade) => void;
  onExpandedChange: (expanded: boolean) => void;
  onPatch: (patch: Partial<PageGrade>) => void;
  onReset: () => void;
}) {
  return (
    <div
      role="tabpanel"
      aria-label="페이지 색보정"
      hidden={!active}
      className="rounded-xl border border-line bg-panel/40 p-3"
    >
      {expanded ? (
        <>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => onExpandedChange(false)}
              className="inline-flex items-center gap-0.5 rounded text-[0.68rem] text-fg-3 transition-colors hover:text-fg"
              title="색보정 패널 접기"
            >
              접기 <ChevronUp size={13} />
            </button>
          </div>
          <Suspense fallback={<StudioPanelLoading label="색보정 패널을 여는 중..." />}>
            <fieldset
              disabled={gate.disabled}
              aria-disabled={gate.disabled}
              title={gate.reason}
              className="m-0 min-w-0 border-0 p-0 disabled:[&_button]:cursor-not-allowed disabled:[&_button]:opacity-50 disabled:[&_input]:cursor-not-allowed disabled:[&_input]:opacity-55"
            >
              <legend className="sr-only">페이지 색보정 설정</legend>
              <StudioPageGradePanel
                grade={grade}
                onPatch={onPatch}
                onApplyPreset={onApplyPreset}
                onReset={onReset}
              />
            </fieldset>
          </Suspense>
        </>
      ) : (
        <button
          type="button"
          onClick={() => onExpandedChange(true)}
          aria-expanded={false}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-line/70 bg-card/65 px-3 py-2 text-left transition-colors hover:bg-raised"
        >
          <span className="min-w-0">
            <span className="block text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
              페이지 색보정
            </span>
            <span className="mt-0.5 block text-xs text-fg-2">
              {gradeActive ? "보정 적용됨" : "무드 프리셋·밝기·대비"}
            </span>
          </span>
          <ChevronDown size={14} className="shrink-0 text-fg-3" />
        </button>
      )}
    </div>
  );
}

export function StudioInspectorEmptySelection({
  visible,
}: {
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div
      role="tabpanel"
      aria-label="선택 요소 속성"
      className="rounded-xl border border-line bg-panel/40 px-4 py-8 text-center"
    >
      <div className="mx-auto mb-2 grid size-11 place-items-center rounded-xl border border-line bg-card text-fg-3">
        <MousePointer2 size={20} aria-hidden />
      </div>
      <p className="text-pretty text-xs font-semibold text-fg-2">
        편집할 요소를 선택하세요
      </p>
      <p className="mx-auto mt-1.5 max-w-[30ch] text-pretty text-[0.68rem] leading-relaxed text-fg-3">
        캔버스에서 프레임·말풍선·획을 고르면 여기에 기본·전문 설정이 나타납니다. 펜 도구(B)로
        바로 그릴 수도 있어요.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[0.62rem] text-fg-3">
        <span className="rounded-full border border-line bg-card px-2 py-1 font-semibold">
          레이어 탭 · 순서
        </span>
        <span className="rounded-full border border-line bg-card px-2 py-1 font-semibold">
          검색 · 채우기/마스크
        </span>
        <span className="rounded-full border border-line bg-card px-2 py-1 font-semibold">
          게시 · 내보내기
        </span>
      </div>
    </div>
  );
}

export function StudioInspectorPublishPanel({
  active,
  description,
  readOnly,
  tags,
  title,
  titleInputRef,
  onDescriptionChange,
  onTagsChange,
  onTitleChange,
}: {
  active: boolean;
  description: string;
  readOnly: boolean;
  tags: string;
  title: string;
  titleInputRef: RefObject<HTMLInputElement | null>;
  onDescriptionChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onTitleChange: (value: string) => void;
}) {
  return (
    <div
      role="tabpanel"
      aria-label="게시 정보"
      hidden={!active}
      className="rounded-xl border border-line bg-panel/40 p-3"
    >
      <p className="mb-2 text-xs font-semibold text-fg-3">게시 정보</p>
      <input
        ref={titleInputRef}
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        aria-label="게시 제목 (필수)"
        placeholder="제목 *"
        maxLength={80}
        spellCheck
        readOnly={readOnly}
        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent read-only:cursor-default read-only:text-fg-2"
      />
      <textarea
        value={description}
        onChange={(event) => onDescriptionChange(event.target.value)}
        aria-label="게시 설명 (선택)"
        placeholder="설명 (선택)"
        spellCheck
        rows={2}
        readOnly={readOnly}
        className="mt-2 w-full resize-none rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent read-only:cursor-default read-only:text-fg-2"
      />
      <input
        value={tags}
        onChange={(event) => onTagsChange(event.target.value)}
        aria-label="게시 태그 (쉼표로 구분, 선택)"
        placeholder="태그 (쉼표로 구분)"
        readOnly={readOnly}
        className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent read-only:cursor-default read-only:text-fg-2"
      />
    </div>
  );
}
