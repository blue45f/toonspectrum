import {
  Check,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Images,
  Lock,
  PanelRightOpen,
  RefreshCw,
  Trash2,
  Unlock,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
  StudioDrawingPracticeDocument,
  StudioDrawingPracticeView,
} from "./studio-drawing-practice-document";

export type StudioDrawingPracticeSourceState = "loading" | "ready" | "missing";

export interface StudioDrawingPracticeBarProps {
  document: StudioDrawingPracticeDocument;
  sourceState: StudioDrawingPracticeSourceState;
  compareActive: boolean;
  disabled?: boolean;
  onPreviewView: (patch: Partial<StudioDrawingPracticeView>) => void;
  onCommitView: (patch: Partial<StudioDrawingPracticeView>) => void;
  onCancelPreview: () => void;
  onCompareChange: (active: boolean) => void;
  onOpenReferencePanel: () => void;
  onFinish: () => void;
  onRetry: () => void;
  onRemove: () => void;
}

const buttonClass =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

function toggleLabel(active: boolean, on: string, off: string): string {
  return active ? on : off;
}

export function StudioDrawingPracticeBar({
  document,
  sourceState,
  compareActive,
  disabled = false,
  onPreviewView,
  onCommitView,
  onCancelPreview,
  onCompareChange,
  onOpenReferencePanel,
  onFinish,
  onRetry,
  onRemove,
}: StudioDrawingPracticeBarProps) {
  const [opacityDraft, setOpacityDraft] = useState(document.view.opacity);
  const opacityDraftRef = useRef(document.view.opacity);
  const editingOpacityRef = useRef(false);

  useEffect(() => {
    if (editingOpacityRef.current) return;
    opacityDraftRef.current = document.view.opacity;
    setOpacityDraft(document.view.opacity);
  }, [document.view.opacity]);

  if (sourceState === "missing") {
    return (
      <div
        role="alert"
        data-studio-drawing-practice-bar="missing"
        className="pointer-events-auto absolute left-1/2 top-3 z-40 flex w-[min(92vw,680px)] -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/40 bg-panel/95 px-3 py-2 shadow-xl backdrop-blur"
      >
        <div className="min-w-0">
          <p className="text-xs font-bold text-fg">따라 그리기 원본을 찾지 못했어요</p>
          <p className="text-[0.7rem] text-fg-3">내 그림은 그대로 유지됩니다. 같은 원본을 다시 가져오세요.</p>
        </div>
        <button type="button" className={buttonClass} onClick={onOpenReferencePanel}>
          <Images size={14} aria-hidden /> 레퍼런스 열기
        </button>
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="따라 그리기 조작"
      data-studio-drawing-practice-bar={document.status}
      className="pointer-events-auto absolute left-1/2 top-3 z-40 flex w-[min(96vw,980px)] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-panel/95 p-2 shadow-xl backdrop-blur"
    >
      <span className="mr-1 max-w-40 truncate px-1 text-xs font-bold text-fg" title={document.source.name}>
        따라 그리기 {document.attemptIndex}회차
      </span>

      <button
        type="button"
        className={buttonClass}
        aria-pressed={document.view.mode === "reference-window"}
        disabled={disabled || sourceState === "loading"}
        onClick={() => onCommitView({
          mode: document.view.mode === "overlay" ? "reference-window" : "overlay",
        })}
      >
        <PanelRightOpen size={14} aria-hidden />
        {document.view.mode === "overlay" ? "옆에 보기" : "겹쳐 보기"}
      </button>

      <button
        type="button"
        className={buttonClass}
        aria-pressed={!document.view.visible}
        disabled={disabled}
        onClick={() => onCommitView({ visible: !document.view.visible })}
      >
        {document.view.visible ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
        {toggleLabel(document.view.visible, "원본 숨기기", "원본 보이기")}
      </button>

      <button
        type="button"
        className={buttonClass}
        aria-pressed={!document.view.locked}
        disabled={disabled || document.view.mode !== "overlay"}
        onClick={() => onCommitView({ locked: !document.view.locked })}
      >
        {document.view.locked ? <Lock size={14} aria-hidden /> : <Unlock size={14} aria-hidden />}
        {toggleLabel(document.view.locked, "배치 잠금", "배치 편집")}
      </button>

      <label className="flex min-h-9 items-center gap-2 rounded-lg border border-line bg-card px-2.5 text-[0.7rem] font-semibold text-fg-2">
        투명도
        <input
          aria-label="따라 그리기 원본 투명도"
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={opacityDraft}
          disabled={disabled}
          className="w-20 accent-accent sm:w-28"
          onPointerDown={() => { editingOpacityRef.current = true; }}
          onChange={(event) => {
            const opacity = Number(event.target.value);
            editingOpacityRef.current = true;
            opacityDraftRef.current = opacity;
            setOpacityDraft(opacity);
            onPreviewView({ opacity });
          }}
          onPointerUp={() => {
            editingOpacityRef.current = false;
            onCommitView({ opacity: opacityDraftRef.current });
          }}
          onPointerCancel={() => {
            editingOpacityRef.current = false;
            opacityDraftRef.current = document.view.opacity;
            setOpacityDraft(document.view.opacity);
            onCancelPreview();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            editingOpacityRef.current = false;
            opacityDraftRef.current = document.view.opacity;
            setOpacityDraft(document.view.opacity);
            onCancelPreview();
          }}
          onBlur={() => {
            if (!editingOpacityRef.current) return;
            editingOpacityRef.current = false;
            onCommitView({ opacity: opacityDraftRef.current });
          }}
        />
        <output className="w-8 text-right tabular-nums">{Math.round(opacityDraft * 100)}%</output>
      </label>

      <button
        type="button"
        className={buttonClass}
        aria-pressed={document.view.grayscale}
        disabled={disabled}
        onClick={() => onCommitView({ grayscale: !document.view.grayscale })}
      >
        흑백
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label="따라 그리기 원본 좌우 반전"
        aria-pressed={document.view.flipX}
        disabled={disabled}
        onClick={() => onCommitView({ flipX: !document.view.flipX })}
      >
        <FlipHorizontal2 size={14} aria-hidden /> 좌우
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label="따라 그리기 원본 상하 반전"
        aria-pressed={document.view.flipY}
        disabled={disabled}
        onClick={() => onCommitView({ flipY: !document.view.flipY })}
      >
        <FlipVertical2 size={14} aria-hidden /> 상하
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={disabled}
        onClick={() => onCommitView({
          placement: document.view.placement === "above-artwork" ? "below-artwork" : "above-artwork",
        })}
      >
        {document.view.placement === "above-artwork" ? "그림 위" : "그림 아래"}
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-pressed={compareActive}
        disabled={disabled || sourceState !== "ready"}
        onClick={() => onCompareChange(!compareActive)}
      >
        비교
      </button>
      <button type="button" className={buttonClass} disabled={disabled} onClick={onRetry}>
        <RefreshCw size={14} aria-hidden /> 다시 연습
      </button>
      <button type="button" className={buttonClass} disabled={disabled} onClick={onFinish}>
        <Check size={14} aria-hidden /> {document.status === "completed" ? "완료됨" : "연습 마치기"}
      </button>
      <button type="button" className={buttonClass} disabled={disabled} onClick={onRemove}>
        <Trash2 size={14} aria-hidden /> 가이드 제거
      </button>
    </div>
  );
}
