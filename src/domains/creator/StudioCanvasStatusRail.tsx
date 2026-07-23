import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Combine,
  FolderPlus,
  Loader2,
  PaintBucket,
} from "lucide-react";

import { StudioToolHintTarget } from "./StudioToolHint";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const SELECTION_LAYOUT_HINTS = {
  group: {
    id: "selection-layout-group",
    title: "선택 요소 그룹화",
    description: "선택한 요소 2개 이상을 새 레이어 그룹으로 묶고 현재 선택을 해제합니다.",
    preview: "selection-layout",
    previewVariant: "group",
    tip: "그룹은 레이어 패널에서 이름을 바꾸거나 다시 해제할 수 있어요.",
  },
  left: {
    id: "selection-layout-align-left",
    title: "왼쪽 정렬",
    description:
      "하나만 선택하면 포함 패널(없으면 캔버스)의 왼쪽에, 여러 개면 선택 범위의 왼쪽 끝에 맞춥니다.",
    preview: "selection-layout",
    previewVariant: "align-left",
  },
  hcenter: {
    id: "selection-layout-align-hcenter",
    title: "가로 가운데 정렬",
    description:
      "하나만 선택하면 포함 패널(없으면 캔버스)의 가로 중앙에, 여러 개면 선택 범위의 가로 중앙에 맞춥니다.",
    preview: "selection-layout",
    previewVariant: "align-hcenter",
  },
  right: {
    id: "selection-layout-align-right",
    title: "오른쪽 정렬",
    description:
      "하나만 선택하면 포함 패널(없으면 캔버스)의 오른쪽에, 여러 개면 선택 범위의 오른쪽 끝에 맞춥니다.",
    preview: "selection-layout",
    previewVariant: "align-right",
  },
  top: {
    id: "selection-layout-align-top",
    title: "위쪽 정렬",
    description:
      "하나만 선택하면 포함 패널(없으면 캔버스)의 위쪽에, 여러 개면 선택 범위의 위쪽 끝에 맞춥니다.",
    preview: "selection-layout",
    previewVariant: "align-top",
  },
  vcenter: {
    id: "selection-layout-align-vcenter",
    title: "세로 가운데 정렬",
    description:
      "하나만 선택하면 포함 패널(없으면 캔버스)의 세로 중앙에, 여러 개면 선택 범위의 세로 중앙에 맞춥니다.",
    preview: "selection-layout",
    previewVariant: "align-vcenter",
  },
  bottom: {
    id: "selection-layout-align-bottom",
    title: "아래쪽 정렬",
    description:
      "하나만 선택하면 포함 패널(없으면 캔버스)의 아래쪽에, 여러 개면 선택 범위의 아래쪽 끝에 맞춥니다.",
    preview: "selection-layout",
    previewVariant: "align-bottom",
  },
  distributeH: {
    id: "selection-layout-distribute-horizontal",
    title: "가로 균등 분배",
    description:
      "3개 이상 선택했을 때 양 끝 요소의 중심은 고정하고, 사이 요소의 중심을 같은 가로 간격으로 배치합니다.",
    preview: "selection-layout",
    previewVariant: "distribute-horizontal",
  },
  distributeV: {
    id: "selection-layout-distribute-vertical",
    title: "세로 균등 분배",
    description:
      "3개 이상 선택했을 때 위·아래 끝 요소의 중심은 고정하고, 사이 요소의 중심을 같은 세로 간격으로 배치합니다.",
    preview: "selection-layout",
    previewVariant: "distribute-vertical",
  },
} as const;

export type StudioCanvasSelectionAlignment =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vcenter"
  | "bottom"
  | "distributeH"
  | "distributeV";

type SelectionLayoutHint = (typeof SELECTION_LAYOUT_HINTS)[keyof typeof SELECTION_LAYOUT_HINTS];

const HORIZONTAL_ALIGNMENT_ACTIONS = [
  ["left", "선택 요소 왼쪽 정렬", SELECTION_LAYOUT_HINTS.left, AlignLeft],
  ["hcenter", "선택 요소 가로 가운데 정렬", SELECTION_LAYOUT_HINTS.hcenter, AlignCenter],
  ["right", "선택 요소 오른쪽 정렬", SELECTION_LAYOUT_HINTS.right, AlignRight],
] as const;

const VERTICAL_ALIGNMENT_ACTIONS = [
  ["top", "선택 요소 위쪽 정렬", SELECTION_LAYOUT_HINTS.top, "상"],
  ["vcenter", "선택 요소 세로 가운데 정렬", SELECTION_LAYOUT_HINTS.vcenter, "중"],
  ["bottom", "선택 요소 아래쪽 정렬", SELECTION_LAYOUT_HINTS.bottom, "하"],
] as const;

const DISTRIBUTION_ACTIONS = [
  ["distributeH", "선택 요소 가로 균등 분배", SELECTION_LAYOUT_HINTS.distributeH, "가로 분배"],
  ["distributeV", "선택 요소 세로 균등 분배", SELECTION_LAYOUT_HINTS.distributeV, "세로 분배"],
] as const;

function SelectionLayoutAction({
  hint,
  label,
  onClick,
  className,
  children,
}: {
  hint: SelectionLayoutHint;
  label: string;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <StudioToolHintTarget hint={hint} preferredSide="top">
      <button type="button" onClick={onClick} className={className} aria-label={label}>
        {children}
      </button>
    </StudioToolHintTarget>
  );
}

export interface StudioCanvasStatusRailProps {
  mobileImmersive: boolean;
  hasAutosave: boolean;
  autosaveRestoreBlockedReason:
    | "legacy-unversioned"
    | "work-mismatch"
    | "revision-mismatch"
    | null;
  selectionCount: number;
  advancedFillBusy: boolean;
  advancedFillPreviewMessage: string | null;
  advancedFillActive: boolean;
  onDownloadAutosaveBackup: () => void;
  onRestoreAutosave: () => void | Promise<void>;
  onClearAutosave: () => void;
  onGroupSelection: () => void;
  onAlignSelection: (alignment: StudioCanvasSelectionAlignment) => void;
  /** 다중 선택에 병합 가능한 말풍선(2개 이상)이 있어 "말풍선 병합" 액션을 노출할지. */
  showBubbleMerge?: boolean;
  /** 병합 비활성 사유(null이면 활성) — 혼합 선택·개수 범위 초과 시 툴팁으로 안내. */
  bubbleMergeDisabledReason?: string | null;
  onMergeBubbles?: () => void;
  onDuplicateSelection: () => void;
  onRemoveSelection: () => void;
  onClearSelection: () => void;
  onCancelAdvancedFillPreview: () => void;
  onApplyAdvancedFillPreview: () => void;
  onCancelAdvancedFillCalculation: () => void;
}

export function StudioCanvasStatusRail({
  mobileImmersive,
  hasAutosave,
  autosaveRestoreBlockedReason,
  selectionCount,
  advancedFillBusy,
  advancedFillPreviewMessage,
  advancedFillActive,
  onDownloadAutosaveBackup,
  onRestoreAutosave,
  onClearAutosave,
  onGroupSelection,
  onAlignSelection,
  showBubbleMerge = false,
  bubbleMergeDisabledReason = null,
  onMergeBubbles,
  onDuplicateSelection,
  onRemoveSelection,
  onClearSelection,
  onCancelAdvancedFillPreview,
  onApplyAdvancedFillPreview,
  onCancelAdvancedFillCalculation,
}: StudioCanvasStatusRailProps) {
  const hasAdvancedFillPreview = advancedFillPreviewMessage !== null;

  return (
    <div
      data-studio-canvas-status-rail
      className={cn(
        mobileImmersive
          ? "max-h-[min(30dvh,12rem)] shrink-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
          : "contents"
      )}
    >
      {hasAutosave && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning-soft/20 p-2.5 text-xs text-warning">
          <span className="min-w-0 flex-1 font-medium leading-relaxed">
            {autosaveRestoreBlockedReason
              ? autosaveRestoreBlockedReason === "revision-mismatch"
                ? "⚠️ 임시저장본이 현재 서버 revision과 달라 자동 복구를 차단했습니다. JSON으로 백업해 수동 병합해 주세요."
                : "⚠️ 출처 revision을 확인할 수 없는 공동 임시저장본입니다. 자동 복구하지 않고 원본을 보존합니다."
              : "⚠️ 이전에 작성 중이던 임시저장 데이터가 있습니다."}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {autosaveRestoreBlockedReason ? (
              <button
                type="button"
                onClick={onDownloadAutosaveBackup}
                className="min-h-11 rounded-lg bg-accent/20 px-3 py-2 font-bold text-accent hover:bg-accent/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                JSON 백업
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onRestoreAutosave()}
                className="min-h-11 rounded-lg bg-accent/20 px-3 py-2 font-bold text-accent hover:bg-accent/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                복구하기
              </button>
            )}
            <button
              type="button"
              onClick={onClearAutosave}
              className="min-h-11 rounded-lg bg-line px-3 py-2 font-medium text-fg-3 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              비우기
            </button>
          </div>
        </div>
      )}

      {selectionCount > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft/30 px-3 py-1.5 text-xs">
          <span className="font-semibold text-accent">{selectionCount}개 선택됨</span>
          <span className="text-fg-3">· 방향키로 이동 · 모서리로 크기·회전</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {selectionCount >= 2 && (
              <SelectionLayoutAction
                hint={SELECTION_LAYOUT_HINTS.group}
                label="선택 요소 그룹화"
                onClick={onGroupSelection}
                className="flex cursor-pointer items-center gap-1 rounded-md border border-line bg-card px-2 py-1 font-semibold text-fg-2 transition-colors hover:bg-raised"
              >
                <FolderPlus size={13} aria-hidden />
                <span>그룹화</span>
              </SelectionLayoutAction>
            )}
            {showBubbleMerge && onMergeBubbles && (
              <button
                type="button"
                onClick={onMergeBubbles}
                disabled={bubbleMergeDisabledReason !== null}
                aria-label="선택한 말풍선 병합"
                title={
                  bubbleMergeDisabledReason ??
                  "겹친 말풍선을 하나의 외곽선으로 병합합니다(실행취소 1회)."
                }
                className="flex items-center gap-1 rounded-md border border-line bg-card px-2 py-1 font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-card"
              >
                <Combine size={13} aria-hidden />
                <span>말풍선 병합</span>
              </button>
            )}
            <div className="mx-1 h-4 w-px bg-line/60" />
            <div
              className="inline-flex gap-0.5 rounded-md border border-line bg-card/50 p-0.5"
              role="group"
              aria-label="가로 정렬"
            >
              {HORIZONTAL_ALIGNMENT_ACTIONS.map(([mode, label, hint, Icon]) => (
                <SelectionLayoutAction
                  key={mode}
                  hint={hint}
                  label={label}
                  onClick={() => onAlignSelection(mode)}
                  className="cursor-pointer rounded p-1 text-fg-3 hover:bg-raised hover:text-fg"
                >
                  <Icon size={13} aria-hidden />
                </SelectionLayoutAction>
              ))}
            </div>
            <div
              className="inline-flex gap-0.5 rounded-md border border-line bg-card/50 p-0.5"
              role="group"
              aria-label="세로 정렬"
            >
              {VERTICAL_ALIGNMENT_ACTIONS.map(([mode, label, hint, text]) => (
                <SelectionLayoutAction
                  key={mode}
                  hint={hint}
                  label={label}
                  onClick={() => onAlignSelection(mode)}
                  className="cursor-pointer rounded px-1.5 py-0.5 text-[0.66rem] font-bold text-fg-3 hover:bg-raised hover:text-fg"
                >
                  {text}
                </SelectionLayoutAction>
              ))}
            </div>
            {selectionCount >= 3 && (
              <div
                className="inline-flex gap-0.5 rounded-md border border-line bg-card/50 p-0.5"
                role="group"
                aria-label="균등 분배"
              >
                {DISTRIBUTION_ACTIONS.map(([mode, label, hint, text]) => (
                  <SelectionLayoutAction
                    key={mode}
                    hint={hint}
                    label={label}
                    onClick={() => onAlignSelection(mode)}
                    className="cursor-pointer rounded px-1.5 py-0.5 text-[0.66rem] font-bold text-fg-3 hover:bg-raised hover:text-fg"
                  >
                    {text}
                  </SelectionLayoutAction>
                ))}
              </div>
            )}
            <div className="mx-1 h-4 w-px bg-line/60" />
            <button
              type="button"
              onClick={onDuplicateSelection}
              className="cursor-pointer rounded-md border border-line bg-card px-2 py-1 font-semibold text-fg-2 transition-colors hover:bg-raised"
            >
              복제
            </button>
            <button
              type="button"
              onClick={onRemoveSelection}
              className="cursor-pointer rounded-md border border-line bg-card px-2 py-1 font-semibold text-bad transition-colors hover:bg-raised"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="cursor-pointer rounded-md border border-line bg-card px-2 py-1 font-semibold text-fg-2 transition-colors hover:bg-raised"
            >
              해제
            </button>
          </div>
        </div>
      )}

      {(advancedFillBusy || hasAdvancedFillPreview) && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "mb-2 flex min-h-12 flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm",
            hasAdvancedFillPreview
              ? "border-good/35 bg-good-soft/20 text-fg"
              : "border-accent/35 bg-accent-soft/25 text-fg"
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-panel/80 text-accent">
            {advancedFillBusy ? (
              <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <PaintBucket size={16} aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1 leading-relaxed">
            <strong className="block font-bold">
              {advancedFillBusy ? "고급 채우기 분석 중" : "채우기 미리보기"}
            </strong>
            <span className="text-fg-3">
              {advancedFillBusy
                ? "참조 경계와 누수 가능성을 확인하고 있어요."
                : `${advancedFillPreviewMessage ?? ""}${advancedFillActive ? " · 다른 영역을 탭해 한 번의 적용으로 누적할 수 있어요." : ""}`}
            </span>
          </span>
          {hasAdvancedFillPreview && !advancedFillBusy && (
            <span className="ml-auto flex min-w-full gap-2 sm:min-w-0">
              <button
                type="button"
                onClick={onCancelAdvancedFillPreview}
                className="min-h-11 flex-1 rounded-lg border border-line bg-card px-3 font-semibold text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-none"
              >
                취소
              </button>
              <button
                type="button"
                onClick={onApplyAdvancedFillPreview}
                className="min-h-11 flex-1 rounded-lg bg-accent px-4 font-bold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-none"
              >
                적용 · 실행취소 1회
              </button>
            </span>
          )}
          {advancedFillBusy && (
            <button
              type="button"
              onClick={onCancelAdvancedFillCalculation}
              className="ml-auto min-h-11 min-w-24 rounded-lg border border-accent/35 bg-card px-3 font-bold text-accent transition-colors hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              계산 취소
            </button>
          )}
        </div>
      )}
    </div>
  );
}
