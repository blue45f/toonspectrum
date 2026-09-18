import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
/**
 * Selection context strip. The same bottom lane is shared with drawing controls so selection
 * replaces the current tool context instead of creating another persistent row.
 */
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Ellipsis,
  Lock,
  LockOpen,
  MessageSquareText,
  MousePointer2,
  ScanText,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import {
  studioSelectionBadgeText,
  studioSelectionCountChip,
} from "./studio-commercial-residuals";
import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { StudioToolHintTarget } from "./StudioToolHint";

import type {
  StudioToolHintPreviewKind,
  StudioToolHintPreviewVariant,
} from "./studio-tool-hint-preview-kind";
import type { StudioToolHintSpec } from "./studio-tool-hints";
import type { CSSProperties, ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export interface StudioSelectOptionsBarProps {
  selectionLabel: string | null;
  selectionCount: number;
  locked?: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
  textEditLabel?: "대사 편집" | "글자 편집" | null;
  onEditText?: () => void;
  onFitBubble?: () => void;
  onToggleLock?: () => void;
  /** Float in the shared desktop context-bar lane instead of consuming document flow. */
  docked?: boolean;
  /** Desktop chrome that the bottom context bar must not cover. */
  dockInsets?: Readonly<{ left: number; right: number }>;
  className?: string;
}

function Action({
  id,
  icon: Icon,
  label,
  description,
  preview,
  previewVariant,
  tip,
  danger,
  showLabel,
  onClick,
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
  preview: StudioToolHintPreviewKind;
  previewVariant?: StudioToolHintPreviewVariant<"bubble">;
  tip?: string;
  danger?: boolean;
  showLabel?: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <StudioToolHintTarget
      preferredSide="top"
      hint={{
        id: `selection-action-${id}`,
        title: label,
        description,
        preview,
        previewVariant,
        tip,
      } as StudioToolHintSpec}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          showLabel
            ? "inline-flex h-9 w-full items-center gap-2 rounded-lg border px-2.5"
            : "grid size-9 place-items-center rounded-lg border",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
          danger
            ? "border-bad/35 bg-bad/10 text-bad hover:bg-bad/15"
            : "border-line/70 bg-card/95 text-fg-2 hover:border-line hover:bg-raised hover:text-fg"
        )}
      >
        <Icon size={14} strokeWidth={1.75} aria-hidden />
        {showLabel ? <span className="text-[0.68rem] font-semibold">{label}</span> : null}
      </button>
    </StudioToolHintTarget>
  );
}

export function StudioSelectOptionsBar({
  selectionLabel,
  selectionCount,
  locked = false,
  onDuplicate,
  onDelete,
  onBringFront,
  onSendBack,
  textEditLabel,
  onEditText,
  onFitBubble,
  onToggleLock,
  docked = false,
  dockInsets = { left: 56, right: 56 },
  className,
}: StudioSelectOptionsBarProps): ReactElement | null {
  if (selectionCount <= 0) return null;
  const badgeText = studioSelectionBadgeText(selectionCount, selectionLabel);
  const countChip = studioSelectionCountChip(selectionCount);
  const safeDockLeft = Math.max(0, Math.round(dockInsets.left));
  const safeDockRight = Math.max(0, Math.round(dockInsets.right));
  const dockStyle: CSSProperties | undefined = docked
    ? {
        left: `clamp(10.75rem, calc(${safeDockLeft}px + (100vw - ${safeDockLeft + safeDockRight}px) / 2), calc(100vw - 10.75rem))`,
        maxWidth: `min(calc(100vw - ${safeDockLeft + safeDockRight + 24}px), calc(100vw - 1.5rem), 56rem)`,
      }
    : undefined;

  return (
    <div
      role="toolbar"
      aria-label={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "선택 옵션")}
      data-studio-select-options="true"
      data-studio-context-kind="selection"
      data-studio-context-bar="true"
      data-studio-icon-first="true"
      style={dockStyle}
      className={cn(
        "flex h-12 min-h-12 flex-nowrap items-center gap-1.5 overflow-visible px-2",
        docked
          ? "pointer-events-auto fixed bottom-3 z-[41] hidden -translate-x-1/2 rounded-xl border border-line bg-panel/95 shadow-[0_18px_48px_oklch(0.06_0.01_70/0.58)] backdrop-blur-md lg:flex"
          : "relative z-[40] shrink-0 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      <span
        data-studio-selection-badge="true"
        title={selectionCount > 1 ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "{v0}개 선택"), { v0: String(selectionCount) }) : badgeText}
        className={cn(
          "mr-0.5 inline-flex max-w-[11rem] items-center gap-1.5 truncate rounded-lg border border-accent/30",
          "bg-accent-soft/50 px-2 py-1 text-[0.68rem] font-bold tracking-tight text-fg"
        )}
      >
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-on-accent">
          {selectionCount > 1 ? (
            <span className="text-[0.58rem] font-black tabular-nums">{countChip}</span>
          ) : (
            <MousePointer2 size={12} strokeWidth={1.75} />
          )}
        </span>
        {selectionCount === 1 ? (
          <span className="min-w-0 truncate">{badgeText}</span>
        ) : (
          <span className="sr-only">{selectionCount}{translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "개 선택")}</span>
        )}
      </span>

      {textEditLabel && onEditText ? (
        <Action
          id="edit-text"
          icon={MessageSquareText}
          label={textEditLabel}
          description={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "선택한 레터링을 캔버스 위에서 바로 수정합니다.")}
          preview="text"
          tip={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "T를 눌러도 선택한 말풍선이나 글자를 즉시 편집할 수 있어요.")}
          showLabel
          onClick={onEditText}
        />
      ) : null}

      <Action
        id="duplicate"
        icon={Copy}
        label={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "복제")}
        description={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "선택한 요소를 같은 위치에 복제합니다.")}
        preview="layer-duplicate"
        onClick={onDuplicate}
      />

      {onToggleLock ? (
        <Action
          id={locked ? translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "en", "unlock") : translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "en", "lock")}
          icon={locked ? LockOpen : Lock}
          label={locked ? translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "잠금 해제") : translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "잠금")}
          description={locked ? translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "선택 요소의 잠금을 풉니다.") : translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "선택 요소를 고정해 실수 편집을 막습니다.")}
          preview="layer-lock"
          onClick={onToggleLock}
        />
      ) : null}

      <Action
        id="delete"
        icon={Trash2}
        label={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "삭제")}
        description={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "현재 선택한 요소를 제거합니다. 실행취소로 되돌릴 수 있어요.")}
        preview="layer-delete"
        danger
        onClick={onDelete}
      />

      <details className="group relative shrink-0" data-studio-selection-overflow="true">
        <summary
          aria-label={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "선택 더보기")}
          className={cn(
            "grid size-9 cursor-pointer list-none place-items-center rounded-lg border border-line bg-card text-fg-3 marker:hidden hover:bg-raised hover:text-fg",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
            "[&::-webkit-details-marker]:hidden"
          )}
        >
          <Ellipsis size={15} aria-hidden />
        </summary>
        <div
          className={cn(
            "absolute right-0 z-[60] flex w-40 flex-col gap-1 rounded-xl border border-line bg-panel/98 p-1.5 shadow-2xl backdrop-blur-md",
            docked ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]"
          )}
        >
          <Action
            id="bring-front"
            icon={ArrowUpToLine}
            label={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "맨 앞")}
            description={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "선택한 요소를 현재 페이지의 가장 앞쪽으로 올립니다.")}
            preview="layer-reorder-front"
            showLabel
            onClick={onBringFront}
          />
          <Action
            id="send-back"
            icon={ArrowDownToLine}
            label={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "맨 뒤")}
            description={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "선택한 요소를 현재 페이지의 가장 뒤쪽으로 보냅니다.")}
            preview="layer-reorder-back"
            showLabel
            onClick={onSendBack}
          />
          {onFitBubble ? (
            <Action
              id="fit-bubble"
              icon={ScanText}
              label={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "텍스트 맞춤")}
              description={translateCurrentStaticSourceText("domains.creator.StudioSelectOptionsBar", "ko", "대사 길이에 맞춰 말풍선 높이를 자동으로 조절합니다.")}
              preview="bubble"
              previewVariant="fit-text"
              showLabel
              onClick={onFitBubble}
            />
          ) : null}
        </div>
      </details>
    </div>
  );
}
