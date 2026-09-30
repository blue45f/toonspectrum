import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import type { WebtoonLicenseTier } from "../models/market-webtoon-licensing";
import type {
  AssetFormatId,
  PolycountGrade,
} from "../models/market-webtoon-spec-inspector";

import { cn } from "@/shared/lib/utils";

export interface MarketWebtoonSpecBadgeProps {
  readonly polycountGrade?: PolycountGrade;
  readonly format?: AssetFormatId;
  readonly hasLineExtraction?: boolean;
  readonly isNoAiProtected?: boolean;
  readonly licenseTier?: WebtoonLicenseTier;
  readonly className?: string;
}

export function MarketWebtoonSpecBadge({
  polycountGrade,
  format,
  hasLineExtraction,
  isNoAiProtected,
  licenseTier,
  className,
}: MarketWebtoonSpecBadgeProps) {
  if (
    !polycountGrade
    && !format
    && !hasLineExtraction
    && !isNoAiProtected
    && !licenseTier
  ) {
    return null;
  }

  return (
    <div
      data-testid="market-webtoon-spec-badge"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-[0.65rem] font-semibold",
        className,
      )}
    >
      {format ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-0.5 font-mono uppercase text-fg">
          <Box className="size-3 text-fg-3" aria-hidden="true" />
          <span>{format.toUpperCase()}</span>
        </span>
      ) : null}

      {polycountGrade === "ultra-light" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-good/30 bg-good/10 px-2 py-0.5 text-good">
          <CheckCircle2 className="size-3" aria-hidden="true" />
          <span>초경량 3D</span>
        </span>
      ) : null}
      {polycountGrade === "optimal-webtoon" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/15 px-2 py-0.5 text-accent">
          <Sparkles className="size-3" aria-hidden="true" />
          <span>웹툰 최적화</span>
        </span>
      ) : null}
      {polycountGrade === "mid-poly" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-fg-2">
          <AlertTriangle className="size-3" aria-hidden="true" />
          <span>중밀도 3D</span>
        </span>
      ) : null}
      {polycountGrade === "heavy-warning" ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-warn/30 bg-warn/10 px-2 py-0.5 text-warn">
          <AlertTriangle className="size-3" aria-hidden="true" />
          <span>고밀도 (LOD 권장)</span>
        </span>
      ) : null}

      {hasLineExtraction ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-fg-2">
          <span>은선 렌더링 지원</span>
        </span>
      ) : null}

      {isNoAiProtected ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-cool/30 bg-cool/10 px-2 py-0.5 text-cool">
          <ShieldCheck className="size-3" aria-hidden="true" />
          <span>AI 미사용 조건 공개</span>
        </span>
      ) : null}

      {licenseTier ? (
        <span className="inline-flex items-center rounded-md border border-line/60 bg-panel px-2 py-0.5 text-fg-3">
          {licenseTier === "solo-creator" && "1인 작가 상업"}
          {licenseTier === "studio-team" && "스튜디오 팀(5인)"}
          {licenseTier === "corporate-agency" && "에이전시 법인"}
          {licenseTier === "open-cc0" && "CC0 공개"}
        </span>
      ) : null}
    </div>
  );
}
