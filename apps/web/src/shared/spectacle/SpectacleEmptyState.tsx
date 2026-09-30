import type { ReactNode } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { getSpectacleLabels, type SpectacleEmptyKind } from "./spectacle-labels";
import { useSpectacle } from "./useSpectacle";

import "./spectacle-effects.css";

/** 종류별 SVG 일러스트 (단순·매력적, 현재 색상 기반). */
function EmptyFigure({ kind }: { kind: SpectacleEmptyKind }) {
  const common = "spectacle-empty-figure";
  switch (kind) {
    case "empty":
      return (
        <svg viewBox="0 0 148 148" className={common} aria-hidden="true">
          <g className="spectacle-empty-float">
            <rect x="34" y="52" width="80" height="64" rx="10" fill="currentColor" opacity="0.14" />
            <rect x="34" y="52" width="80" height="64" rx="10" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.5" />
            <line x1="48" y1="72" x2="100" y2="72" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
            <line x1="48" y1="86" x2="84" y2="86" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.25" />
          </g>
          <g className="spectacle-empty-twinkle">
            <path d="M118 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="currentColor" opacity="0.7" />
          </g>
          <g className="spectacle-empty-float-delayed">
            <circle cx="30" cy="112" r="5" fill="currentColor" opacity="0.4" />
            <circle cx="120" cy="104" r="3.5" fill="currentColor" opacity="0.4" />
          </g>
        </svg>
      );
    case "error":
      return (
        <svg viewBox="0 0 148 148" className={common} aria-hidden="true">
          <g className="spectacle-empty-float">
            <circle cx="74" cy="74" r="40" fill="currentColor" opacity="0.12" />
            <circle cx="74" cy="74" r="40" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.5" />
            <line x1="62" y1="62" x2="86" y2="86" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
            <line x1="86" y1="62" x2="62" y2="86" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.7" />
          </g>
          <g className="spectacle-empty-twinkle">
            <path d="M112 34l2.5 7 7 2.5-7 2.5-2.5 7-2.5-7-7-2.5 7-2.5z" fill="currentColor" opacity="0.6" />
          </g>
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 148 148" className={common} aria-hidden="true">
          <g className="spectacle-empty-float">
            <circle cx="66" cy="66" r="30" fill="none" stroke="currentColor" strokeWidth="5" opacity="0.55" />
            <line x1="88" y1="88" x2="110" y2="110" stroke="currentColor" strokeWidth="7" strokeLinecap="round" opacity="0.55" />
            <text x="66" y="78" textAnchor="middle" fontSize="30" fill="currentColor" opacity="0.5">?</text>
          </g>
          <g className="spectacle-empty-float-delayed">
            <circle cx="112" cy="40" r="4" fill="currentColor" opacity="0.4" />
            <circle cx="34" cy="108" r="3" fill="currentColor" opacity="0.4" />
          </g>
        </svg>
      );
    case "offline":
      return (
        <svg viewBox="0 0 148 148" className={common} aria-hidden="true">
          <g className="spectacle-empty-float" stroke="currentColor" fill="none" strokeWidth="5" strokeLinecap="round" opacity="0.55">
            <path d="M30 66a62 62 0 0188 0" />
            <path d="M44 82a42 42 0 0160 0" />
            <circle cx="74" cy="98" r="5" fill="currentColor" stroke="none" />
            <line x1="34" y1="110" x2="114" y2="42" opacity="0.8" />
          </g>
        </svg>
      );
    case "success":
      return (
        <svg viewBox="0 0 148 148" className={common} aria-hidden="true">
          <g className="spectacle-empty-float">
            <circle cx="74" cy="74" r="40" fill="currentColor" opacity="0.14" />
            <circle cx="74" cy="74" r="40" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.5" />
            <path d="M58 74l12 12 20-24" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
          </g>
          <g className="spectacle-empty-twinkle">
            <path d="M40 34l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="currentColor" opacity="0.7" />
            <path d="M110 100l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="currentColor" opacity="0.6" />
          </g>
        </svg>
      );
  }
}

export interface SpectacleEmptyStateProps {
  kind?: SpectacleEmptyKind;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * 빈 상태 / 에러 상태 일러스트.
 *
 * - 종류별 SVG 일러스트 + 둥실 떠다니는 애니메이션
 * - 문구 미지정 시 ko/en 기본 문구 사용
 */
export function SpectacleEmptyState({
  kind = "empty",
  title,
  description,
  action,
  className,
}: SpectacleEmptyStateProps) {
  const lang = useI18n((state) => state.lang);
  const labels = getSpectacleLabels(lang);
  const { level } = useSpectacle();

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-6 py-12 text-center text-slate-500 dark:text-slate-400",
        level !== "none" && "spectacle-motion",
        className,
      )}
      role="status"
    >
      <EmptyFigure kind={kind} />
      <div className="max-w-xs">
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
          {title ?? labels.emptyTitle(kind)}
        </p>
        <p className="mt-1 text-sm">{description ?? labels.emptyDescription(kind)}</p>
      </div>
      {action}
    </div>
  );
}
