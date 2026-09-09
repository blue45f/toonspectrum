import { useMemo, useState } from "react";

import {
  applyStudioStrokeProposalReview,
  createStudioStrokeProposalReview,
  planStudioStrokeGhostPreview,
  selectStudioStrokeProposalVariant,
  setStudioStrokeProposalSelection,
  type StudioStrokeGhostTransform,
  type StudioStrokeProposalResponse,
  type StudioStrokeProposalTransaction,
} from "./studio-stroke-proposal";

export interface StudioStrokeProposalReviewPanelProps {
  readonly proposal: StudioStrokeProposalResponse | null;
  readonly transform: StudioStrokeGhostTransform;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly activePointerStroke: boolean;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly onRequestProposal: () => void;
  readonly onApplyTransaction: (transaction: StudioStrokeProposalTransaction) => void;
  readonly onCancel: () => void;
}

export function StudioStrokeProposalReviewPanel({
  proposal,
  transform,
  documentId,
  documentGeneration,
  activePointerStroke,
  busy = false,
  error,
  onRequestProposal,
  onApplyTransaction,
  onCancel,
}: StudioStrokeProposalReviewPanelProps) {
  const [review, setReview] = useState(() => (proposal ? createStudioStrokeProposalReview(proposal) : null));
  const currentReview = review?.proposal === proposal
    ? review
    : proposal
      ? createStudioStrokeProposalReview(proposal)
      : null;
  const variant = currentReview?.proposal.variants.find(
    (item) => item.id === currentReview.selectedVariantId,
  );
  const ghostPaths = useMemo(
    () => (variant ? planStudioStrokeGhostPreview(variant, transform) : []),
    [transform, variant],
  );
  const stale = Boolean(
    currentReview &&
      (currentReview.proposal.documentId !== documentId ||
        currentReview.proposal.documentGeneration !== documentGeneration),
  );
  const applyDisabled =
    busy ||
    activePointerStroke ||
    stale ||
    !currentReview ||
    currentReview.selectedStrokeIds.size === 0;

  return (
    <section
      aria-label="AI 획 제안 검토"
      className="flex min-h-0 flex-col gap-3 rounded-xl border border-line bg-card p-3 text-fg"
      data-studio-stroke-proposal-panel="true"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">획 단위 공동 창작 제안</h3>
          <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
            원본은 바꾸지 않고 최근 획과 선택 영역을 읽어 검토 가능한 ghost 획만 제안합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onRequestProposal}
          disabled={busy || activePointerStroke}
          className="min-h-11 shrink-0 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent disabled:opacity-50"
        >
          {busy ? "제안 생성 중…" : proposal ? "다시 생성" : "획 제안 받기"}
        </button>
      </header>

      {activePointerStroke ? (
        <p role="status" className="rounded-lg border border-warn/35 bg-warn/10 p-2 text-xs text-warn">
          진행 중인 획을 마친 뒤 제안을 실행하거나 적용할 수 있습니다.
        </p>
      ) : null}
      {stale ? (
        <p role="alert" className="rounded-lg border border-warn/35 bg-warn/10 p-2 text-xs text-warn">
          문서가 변경되어 이 제안은 적용할 수 없습니다. 다시 생성해 주세요.
        </p>
      ) : null}
      {error ? <p role="alert" className="text-xs text-bad">{error}</p> : null}

      {currentReview && variant ? (
        <>
          <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="획 제안 후보">
            {currentReview.proposal.variants.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === currentReview.selectedVariantId}
                onClick={() => setReview(selectStudioStrokeProposalVariant(currentReview, item.id))}
                className="min-h-11 shrink-0 rounded-full border border-line px-3 text-xs aria-selected:border-accent aria-selected:bg-accent/10"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="relative min-h-48 overflow-hidden rounded-xl border border-line bg-panel" aria-label="ghost 획 미리보기">
            <svg
              viewBox={`0 0 ${transform.viewportWidthCss} ${transform.viewportHeightCss}`}
              className="absolute inset-0 size-full"
              role="img"
              aria-label={`${variant.strokes.length}개 제안 획 미리보기`}
            >
              {ghostPaths.map((path) => (
                <polyline
                  key={path.strokeId}
                  points={path.points.map((point) => `${point.x},${point.y}`).join(" ")}
                  fill="none"
                  stroke={path.color}
                  strokeWidth={path.widthCss}
                  strokeOpacity={Math.min(0.78, path.opacity)}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          </div>

          <fieldset className="grid gap-1.5">
            <legend className="text-xs font-bold">적용할 획</legend>
            {variant.strokes.map((stroke, index) => (
              <label key={stroke.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-2 text-xs">
                <input
                  type="checkbox"
                  checked={currentReview.selectedStrokeIds.has(stroke.id)}
                  onChange={(event) => {
                    const selected = new Set(currentReview.selectedStrokeIds);
                    if (event.currentTarget.checked) selected.add(stroke.id);
                    else selected.delete(stroke.id);
                    setReview(setStudioStrokeProposalSelection(currentReview, [...selected]));
                  }}
                />
                <span>획 {index + 1}</span>
                <span className="text-fg-3">{stroke.brushId} · {stroke.points.length}점</span>
              </label>
            ))}
          </fieldset>

          <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
            <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-line px-4 text-xs font-bold">
              취소
            </button>
            <button
              type="button"
              disabled={applyDisabled}
              onClick={() => {
                if (!currentReview) return;
                const result = applyStudioStrokeProposalReview(currentReview, {
                  documentId,
                  documentGeneration,
                  activePointerStroke,
                  transactionId: `stroke-proposal-${Date.now()}`,
                });
                setReview(result.review);
                onApplyTransaction(result.transaction);
              }}
              className="min-h-11 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent disabled:opacity-50"
            >
              선택 획 적용
            </button>
          </footer>
        </>
      ) : (
        <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-3">
          선택 영역 또는 현재 보기를 정한 뒤 획 제안을 생성하세요.
        </div>
      )}
    </section>
  );
}
