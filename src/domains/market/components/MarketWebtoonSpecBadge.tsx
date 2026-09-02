import { ShieldCheck, Sparkles, Box, CheckCircle2, AlertTriangle } from "lucide-react";

import { type WebtoonLicenseTier } from "../models/market-webtoon-licensing";
import {
  type PolycountGrade,
  type AssetFormatId,
} from "../models/market-webtoon-spec-inspector";

import { cn } from "@/lib/utils";

export interface MarketWebtoonSpecBadgeProps {
  readonly polycountGrade?: PolycountGrade;
  readonly format?: AssetFormatId;
  readonly hasLineExtraction?: boolean;
  readonly isNoAiProtected?: boolean;
  readonly licenseTier?: WebtoonLicenseTier;
  readonly className?: string;
}

export function MarketWebtoonSpecBadge({
  polycountGrade = "optimal-webtoon",
  format = "glb",
  hasLineExtraction = true,
  isNoAiProtected = true,
  licenseTier = "solo-creator",
  className,
}: MarketWebtoonSpecBadgeProps) {
  return (
    <div
      data-testid="market-webtoon-spec-badge"
      className={cn("flex flex-wrap items-center gap-1.5 text-[0.65rem] font-semibold", className)}
    >
      {/* Format Chip */}
      <span className="inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-0.5 text-fg font-mono uppercase">
        <Box className="size-3 text-fg-3" />
        <span>{format.toUpperCase()}</span>
      </span>

      {/* Polycount Grade */}
      {polycountGrade === "ultra-light" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-emerald-500">
          <CheckCircle2 className="size-3" />
          <span>초경량 3D</span>
        </span>
      )}
      {polycountGrade === "optimal-webtoon" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 border border-accent/30 px-2 py-0.5 text-accent">
          <Sparkles className="size-3" />
          <span>웹툰 최적화</span>
        </span>
      )}
      {polycountGrade === "heavy-warning" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-amber-500">
          <AlertTriangle className="size-3" />
          <span>고밀도 (LOD 권장)</span>
        </span>
      )}

      {/* Line Art Feature */}
      {hasLineExtraction && (
        <span className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-fg-2">
          <span>은선 렌더링 지원</span>
        </span>
      )}

      {/* NoAI Protection */}
      {isNoAiProtected && (
        <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-purple-500">
          <ShieldCheck className="size-3" />
          <span>NoAI 안심</span>
        </span>
      )}

      {/* License Tier */}
      <span className="inline-flex items-center rounded-md border border-line/60 bg-panel px-2 py-0.5 text-fg-3">
        {licenseTier === "solo-creator" && "1인 작가 상업"}
        {licenseTier === "studio-team" && "스튜디오 팀(5인)"}
        {licenseTier === "corporate-agency" && "에이전시 법인"}
        {licenseTier === "open-cc0" && "CC0 공개"}
      </span>
    </div>
  );
}
