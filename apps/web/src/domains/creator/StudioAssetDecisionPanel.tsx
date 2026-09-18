import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  GitCompareArrows,
  Image as ImageIcon,
  Layers3,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { svgToDataUrl } from "./studio-characters";
import { buildStudioAssetApplyPlan } from "./studio-asset-workspace-decision";

import type {
  StudioInsertHubAssetEntry,
  StudioInsertPlacementMode,
} from "./studio-insert-hub-model";

import { cn } from "@/shared/lib/utils";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-panel";

export interface StudioAssetDecisionPanelProps {
  readonly selected: StudioInsertHubAssetEntry | null;
  readonly comparisonEntries: readonly StudioInsertHubAssetEntry[];
  readonly placementMode: StudioInsertPlacementMode;
  readonly selectionPlacementAvailable: boolean;
  readonly pending: boolean;
  readonly onConfirm: (entry: StudioInsertHubAssetEntry) => void;
  readonly onClose: () => void;
  readonly onToggleComparison: (id: string) => void;
  readonly onSelectComparison: (id: string) => void;
  readonly onRemoveComparison: (id: string) => void;
  readonly onClearComparison: () => void;
}

function AssetPreview({ entry }: { readonly entry: StudioInsertHubAssetEntry }) {
  if (entry.preview.kind === "image") {
    return (
      <img
        src={entry.preview.src}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-contain"
      />
    );
  }
  if (entry.preview.kind === "svg") {
    return (
      <img
        src={svgToDataUrl(entry.preview.svg)}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-contain"
      />
    );
  }
  return <ImageIcon size={24} className="text-fg-3" aria-hidden />;
}

function ComparisonTray({
  entries,
  placementMode,
  selectionPlacementAvailable,
  onSelect,
  onRemove,
  onClear,
}: {
  readonly entries: readonly StudioInsertHubAssetEntry[];
  readonly placementMode: StudioInsertPlacementMode;
  readonly selectionPlacementAvailable: boolean;
  readonly onSelect: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onClear: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section
      aria-label="에셋 비교함"
      className="rounded-xl border border-line bg-card p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-black text-fg">
          <GitCompareArrows size={14} className="text-accent" aria-hidden />
          비교함 {entries.length}/3
        </p>
        <button
          type="button"
          onClick={onClear}
          className={cn(
            "min-h-9 px-1 text-[0.62rem] font-semibold text-fg-3 underline pointer-coarse:min-h-11",
            FOCUS,
          )}
        >
          모두 비우기
        </button>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {entries.map((entry) => {
          const plan = buildStudioAssetApplyPlan(
            entry.item,
            placementMode,
            selectionPlacementAvailable,
          );
          return (
            <article
              key={entry.id}
              className="min-w-0 rounded-lg border border-line bg-panel p-2"
            >
              <div className="flex items-start justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  className={cn(
                    "min-h-10 min-w-0 flex-1 text-left text-[0.62rem] font-black text-fg hover:text-accent",
                    FOCUS,
                  )}
                >
                  <span className="line-clamp-2">{entry.title}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(entry.id)}
                  aria-label={`${entry.title} 비교 제거`}
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-bad pointer-coarse:size-11",
                    FOCUS,
                  )}
                >
                  <X size={13} aria-hidden />
                </button>
              </div>
              <dl className="mt-1.5 space-y-1 text-[0.54rem] text-fg-3">
                <div className="flex justify-between gap-2">
                  <dt>형식</dt>
                  <dd className="font-semibold text-fg-2">{plan.formatLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>편집</dt>
                  <dd className="font-semibold text-fg-2">{plan.editabilityLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>성능</dt>
                  <dd className="font-semibold text-fg-2">{plan.performanceLabel}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function StudioAssetDecisionPanel({
  selected,
  comparisonEntries,
  placementMode,
  selectionPlacementAvailable,
  pending,
  onConfirm,
  onClose,
  onToggleComparison,
  onSelectComparison,
  onRemoveComparison,
  onClearComparison,
}: StudioAssetDecisionPanelProps) {
  const [acknowledgedItemId, setAcknowledgedItemId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setAcknowledgedItemId(null);
  }, [selected?.id]);

  const plan = selected
    ? buildStudioAssetApplyPlan(
        selected.item,
        placementMode,
        selectionPlacementAvailable,
      )
    : null;
  const compared = selected
    ? comparisonEntries.some((entry) => entry.id === selected.id)
    : false;
  const rightsAcknowledged =
    selected !== null && acknowledgedItemId === selected.id;

  return (
    <div className="space-y-2.5">
      <ComparisonTray
        entries={comparisonEntries}
        placementMode={placementMode}
        selectionPlacementAvailable={selectionPlacementAvailable}
        onSelect={onSelectComparison}
        onRemove={onRemoveComparison}
        onClear={onClearComparison}
      />

      {selected && plan ? (
        <section
          aria-label={`${selected.title} 적용 전 검토`}
          data-studio-asset-decision={selected.id}
          className="overflow-hidden rounded-xl border border-accent/35 bg-card shadow-sm"
        >
          <header className="flex items-start gap-2.5 border-b border-line bg-accent-soft/30 p-3">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-panel p-1.5">
              <AssetPreview entry={selected} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.58rem] font-bold uppercase tracking-wide text-accent">
                적용 전 검토
              </p>
              <h3 className="mt-0.5 line-clamp-2 text-sm font-black text-fg">
                {selected.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-[0.62rem] leading-relaxed text-fg-3">
                {selected.description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="적용 전 검토 닫기"
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg",
                FOCUS,
              )}
            >
              <X size={15} aria-hidden />
            </button>
          </header>

          <div className="space-y-3 p-3">
            <dl className="grid grid-cols-2 gap-1.5 text-[0.58rem]">
              <div className="rounded-lg border border-line bg-panel p-2">
                <dt className="text-fg-3">형식</dt>
                <dd className="mt-0.5 font-bold text-fg">{plan.formatLabel}</dd>
              </div>
              <div className="rounded-lg border border-line bg-panel p-2">
                <dt className="text-fg-3">편집 가능성</dt>
                <dd className="mt-0.5 font-bold text-fg">{plan.editabilityLabel}</dd>
              </div>
              <div className="rounded-lg border border-line bg-panel p-2">
                <dt className="text-fg-3">권리 상태</dt>
                <dd className={cn(
                  "mt-0.5 font-bold",
                  plan.rights === "review" ? "text-warn" : "text-fg",
                )}>
                  {plan.rightsLabel}
                </dd>
              </div>
              <div className="rounded-lg border border-line bg-panel p-2">
                <dt className="text-fg-3">예상 부하</dt>
                <dd className="mt-0.5 font-bold text-fg">{plan.performanceLabel}</dd>
              </div>
            </dl>

            <div className="rounded-lg border border-line bg-panel p-2.5">
              <p className="inline-flex items-center gap-1 text-[0.62rem] font-black text-fg">
                <CheckCircle2 size={13} className="text-good" aria-hidden />
                예상 작업
              </p>
              <ol className="mt-1.5 space-y-1 pl-4 text-[0.58rem] leading-relaxed text-fg-3">
                {plan.steps.map((step) => (
                  <li key={step} className="list-decimal">{step}</li>
                ))}
              </ol>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[0.58rem]">
              <p className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-panel px-2 text-fg-2">
                <ShieldCheck size={13} className="text-accent" aria-hidden />
                {plan.compatibilityLabel}
              </p>
              <p className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-panel px-2 text-fg-2">
                <Gauge size={13} className="text-accent" aria-hidden />
                {plan.placementLabel} 배치
              </p>
            </div>

            {plan.warnings.length > 0 ? (
              <div
                role={plan.requiresExplicitConfirmation ? "alert" : "status"}
                className="rounded-lg border border-warn/35 bg-warn/10 p-2.5"
              >
                <p className="inline-flex items-center gap-1 text-[0.62rem] font-black text-warn">
                  <AlertTriangle size={13} aria-hidden />
                  적용 전 확인
                </p>
                <ul className="mt-1.5 space-y-1 text-[0.58rem] leading-relaxed text-fg-2">
                  {plan.warnings.map((warning) => (
                    <li key={warning}>• {warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {plan.requiresExplicitConfirmation ? (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-warn/35 bg-panel px-2.5 text-[0.62rem] font-semibold text-fg-2">
                <input
                  type="checkbox"
                  checked={rightsAcknowledged}
                  onChange={(event) =>
                    setAcknowledgedItemId(
                      event.target.checked ? selected.id : null,
                    )
                  }
                  className="size-4 accent-[var(--accent)]"
                />
                라이선스와 원본 출처를 확인했습니다.
              </label>
            ) : null}

            <div className="grid gap-1.5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <button
                type="button"
                onClick={() => onToggleComparison(selected.id)}
                aria-pressed={compared}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-2 text-[0.62rem] font-bold text-fg-2 hover:border-accent/50 hover:text-accent",
                  compared && "border-accent/50 bg-accent-soft text-accent",
                  FOCUS,
                )}
              >
                <GitCompareArrows size={14} aria-hidden />
                {compared ? "비교함에서 제거" : "비교함에 추가"}
              </button>
              <button
                type="button"
                disabled={
                  pending
                  || (plan.requiresExplicitConfirmation && !rightsAcknowledged)
                }
                onClick={() => onConfirm(selected)}
                aria-label={`${selected.title} ${selected.useLabel} 확정`}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-[0.66rem] font-black text-on-accent hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-45",
                  FOCUS,
                )}
              >
                <Layers3 size={14} aria-hidden />
                {pending ? "처리 중…" : `현재 설정으로 ${selected.useLabel}`}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
