import { Brush, Check, Eye, EyeOff, History, MessageSquare, Redo2, Undo2 } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import {
  STUDIO_COMPANION_BRUSH_SIZE_MAX,
  STUDIO_COMPANION_BRUSH_SIZE_MIN,
  type StudioCompanionBrushPatch,
  type StudioCompanionReviewProjection,
} from "./studio-companion-review-projection";

import { cn } from "@/lib/utils";

type ReviewSection = "layers" | "history" | "comments";

export interface StudioCompanionReviewConsoleProps {
  projection: StudioCompanionReviewProjection | null;
  connected: boolean;
  presentationSafe: boolean;
  onPresentationSafeChange: (enabled: boolean) => void;
  onSelectLayer: (layerId: string) => void;
  onHistory: (action: "undo" | "redo") => void;
  onCommentFocus: (threadId: string) => void;
  onBrushPatch: (patch: StudioCompanionBrushPatch) => void;
}

const sectionButtonClass =
  "min-h-11 flex-1 rounded-lg px-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/35";

export function StudioCompanionReviewConsole({
  projection,
  connected,
  presentationSafe,
  onPresentationSafeChange,
  onSelectLayer,
  onHistory,
  onCommentFocus,
  onBrushPatch,
}: StudioCompanionReviewConsoleProps) {
  const [section, setSection] = useState<ReviewSection>("layers");
  const controlsReady = connected && projection !== null && !presentationSafe;

  if (!projection) {
    return (
      <section aria-label="검수 Console" className="grid min-h-72 place-items-center rounded-xl border border-line bg-card px-6 text-center">
        <span>
          <History className="mx-auto size-6 text-fg-3" aria-hidden />
          <strong className="mt-3 block text-sm font-semibold text-fg-2">검수 정보를 기다리는 중</strong>
          <span className="mt-1 block text-xs leading-relaxed text-fg-3">
            기본 스튜디오가 연결되면 레이어·히스토리·댓글 요약이 표시됩니다.
          </span>
        </span>
      </section>
    );
  }

  const sections = ["layers", "history", "comments"] as const;
  function handleSectionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % sections.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + sections.length) % sections.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = sections.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = sections[nextIndex];
    if (!next) return;
    setSection(next);
    globalThis.requestAnimationFrame?.(() => {
      document.getElementById(`companion-review-tab-${next}`)?.focus();
    });
  }

  return (
    <section aria-labelledby="companion-review-title" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="companion-review-title" className="text-sm font-semibold text-fg">검수 Console</h2>
          <p className="mt-0.5 truncate text-xs text-fg-3">
            {presentationSafe
              ? "발표 안전 · 문서 정보 숨김"
              : `${projection.pageLabel} · ${projection.selectionLabel ?? "선택 없음"}`}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={presentationSafe}
          onClick={() => onPresentationSafeChange(!presentationSafe)}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/35",
            presentationSafe
              ? "border-good/45 bg-good/10 text-good"
              : "border-line bg-card text-fg-2 hover:bg-raised"
          )}
        >
          <Eye className="size-3.5" aria-hidden />
          발표 안전
        </button>
      </div>

      {presentationSafe ? (
        <div role="status" className="rounded-xl border border-good/35 bg-good/10 px-3 py-2.5 text-xs leading-relaxed text-good">
          발표 안전 모드입니다. 댓글 본문과 원격 실행 컨트롤을 숨겼습니다.
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-2">
              <Brush className="size-3.5" aria-hidden /> 브러시 원격 제어
            </span>
            <span className="text-[0.65rem] tabular-nums text-fg-3">
              {projection.brush.size}px · {Math.round(projection.brush.opacity * 100)}%
            </span>
          </div>
          <label className="block text-[0.68rem] font-medium text-fg-3">
            브러시
            <select
              aria-label="원격 브러시"
              value={projection.brush.id}
              disabled={!controlsReady}
              onChange={(event) => onBrushPatch({ id: event.target.value })}
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-raised px-2 text-xs text-fg outline-none focus:border-accent disabled:opacity-50"
            >
              {projection.brush.choices.map((choice) => (
                <option key={choice.id} value={choice.id}>{choice.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-[0.68rem] font-medium text-fg-3">
            크기 {projection.brush.size}px
            <input
              type="range"
              aria-label="원격 브러시 크기"
              min={STUDIO_COMPANION_BRUSH_SIZE_MIN}
              max={STUDIO_COMPANION_BRUSH_SIZE_MAX}
              value={projection.brush.size}
              disabled={!controlsReady}
              onChange={(event) => onBrushPatch({ size: Number(event.target.value) })}
              className="mt-1 h-11 w-full accent-accent disabled:opacity-50"
            />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-end gap-3">
            <label className="block text-[0.68rem] font-medium text-fg-3">
              불투명도 {Math.round(projection.brush.opacity * 100)}%
              <input
                type="range"
                aria-label="원격 브러시 불투명도"
                min={0}
                max={100}
                value={Math.round(projection.brush.opacity * 100)}
                disabled={!controlsReady}
                onChange={(event) => onBrushPatch({ opacity: Number(event.target.value) / 100 })}
                className="mt-1 h-11 w-full accent-accent disabled:opacity-50"
              />
            </label>
            <label className="grid min-h-11 cursor-pointer place-items-center rounded-lg border border-line bg-raised" title="브러시 색상">
              <span className="sr-only">원격 브러시 색상</span>
              <input
                type="color"
                aria-label="원격 브러시 색상"
                value={projection.brush.color}
                disabled={!controlsReady}
                onChange={(event) => onBrushPatch({ color: event.target.value })}
                className="size-8 cursor-pointer border-0 bg-transparent p-0 disabled:opacity-50"
              />
            </label>
          </div>
        </div>
      )}

      <div className="flex rounded-xl border border-line bg-card p-1" role="tablist" aria-label="검수 정보">
        {([
          ["layers", `레이어 ${projection.layers.length}`],
          ["history", `기록 ${projection.history.length}`],
          ["comments", `댓글 ${projection.comments.length}`],
        ] as const).map(([id, label], index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`companion-review-tab-${id}`}
            aria-selected={section === id}
            aria-controls={`companion-review-panel-${id}`}
            tabIndex={section === id ? 0 : -1}
            onClick={() => setSection(id)}
            onKeyDown={(event) => handleSectionKeyDown(event, index)}
            className={cn(
              sectionButtonClass,
              section === id ? "bg-raised text-fg" : "text-fg-3 hover:text-fg-2"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
          role="tabpanel"
          id="companion-review-panel-layers"
          aria-labelledby="companion-review-tab-layers"
          hidden={section !== "layers"}
          className="max-h-72 space-y-1 overflow-y-auto pr-0.5"
        >
          {projection.layers.map((layer, index) => (
            <button
              key={layer.id}
              type="button"
              aria-pressed={presentationSafe ? false : layer.selected}
              disabled={!controlsReady}
              onClick={() => onSelectLayer(layer.id)}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-lg border px-2.5 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-default",
                layer.selected && !presentationSafe
                  ? "border-accent/45 bg-accent-soft text-fg"
                  : "border-line/70 bg-card text-fg-2 hover:bg-raised"
              )}
            >
              {layer.visible ? <Eye className="size-3.5 shrink-0" aria-hidden /> : <EyeOff className="size-3.5 shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">
                {presentationSafe ? `레이어 ${index + 1}` : layer.label}
              </span>
              <span className="max-w-16 truncate text-[0.62rem] text-fg-3">
                {presentationSafe ? "항목" : layer.kind}
              </span>
              {layer.selected && !presentationSafe ? <Check className="size-3.5 text-accent" aria-hidden /> : null}
            </button>
          ))}
          {projection.layers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-fg-3">
              표시할 레이어가 없습니다.
            </p>
          ) : null}
          {projection.truncated.layers > 0 ? (
            <p className="py-1 text-center text-[0.65rem] text-fg-3">외 {projection.truncated.layers}개 레이어</p>
          ) : null}
      </div>

      <div
          role="tabpanel"
          id="companion-review-panel-history"
          aria-labelledby="companion-review-tab-history"
          hidden={section !== "history"}
          className="space-y-2"
        >
          {!presentationSafe ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!controlsReady || !projection.canUndo}
                onClick={() => onHistory("undo")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-card text-xs font-semibold text-fg-2 outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Undo2 className="size-3.5" aria-hidden /> 실행 취소
              </button>
              <button
                type="button"
                disabled={!controlsReady || !projection.canRedo}
                onClick={() => onHistory("redo")}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-card text-xs font-semibold text-fg-2 outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Redo2 className="size-3.5" aria-hidden /> 다시 실행
              </button>
            </div>
          ) : null}
          <ol className="max-h-64 space-y-1 overflow-y-auto">
            {projection.history.map((entry, index) => (
              <li key={entry.index} className={cn(
                "flex min-h-9 items-center gap-2 rounded-lg border px-2.5 text-xs",
                entry.current ? "border-accent/40 bg-accent-soft text-fg" : "border-line/60 bg-card text-fg-3"
              )}>
                <History className="size-3.5" aria-hidden />
                <span className="flex-1">
                  {presentationSafe ? `작업 기록 ${index + 1}` : entry.label}
                </span>
                {entry.current ? <span className="text-[0.62rem] font-semibold text-accent">현재</span> : null}
              </li>
            ))}
          </ol>
          {projection.history.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-fg-3">
              아직 작업 기록이 없습니다.
            </p>
          ) : null}
      </div>

      <div
          role="tabpanel"
          id="companion-review-panel-comments"
          aria-labelledby="companion-review-tab-comments"
          hidden={section !== "comments"}
          className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5"
        >
          {projection.comments.map((comment) => (
            <button
              key={comment.id}
              type="button"
              disabled={!controlsReady}
              onClick={() => onCommentFocus(comment.id)}
              className="flex min-h-11 w-full items-start gap-2 rounded-lg border border-line bg-card px-2.5 py-2 text-left outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-default"
            >
              <MessageSquare className={cn("mt-0.5 size-3.5 shrink-0", comment.unread ? "text-accent" : "text-fg-3")} aria-hidden />
              <span className="min-w-0 flex-1">
                {presentationSafe ? (
                  <span className="block text-xs text-fg-3">검수 의견 {comment.resolved ? "완료" : "열림"}</span>
                ) : (
                  <>
                    <span className="block truncate text-[0.68rem] font-semibold text-fg-2">{comment.author}</span>
                    <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-fg-3">{comment.excerpt}</span>
                  </>
                )}
              </span>
            </button>
          ))}
          {projection.comments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-fg-3">표시할 댓글이 없습니다.</p>
          ) : null}
          {projection.truncated.comments > 0 ? (
            <p className="py-1 text-center text-[0.65rem] text-fg-3">외 {projection.truncated.comments}개 댓글</p>
          ) : null}
      </div>
    </section>
  );
}

export default StudioCompanionReviewConsole;
