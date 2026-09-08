import { CheckCircle2, CircleAlert, ShieldX } from "lucide-react";

import { useMarketProductionProfile } from "../hooks/use-market-production-profile";
import { evaluateMarketProductionFit } from "../models/market-production-fit";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { cn } from "@/shared/lib/utils";

interface MarketProductionFitBadgeProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly className?: string;
  readonly showCounts?: boolean;
}

const STATUS_META = {
  ready: {
    label: "제작 조건 일치",
    icon: CheckCircle2,
    className: "border-good/35 bg-good/10 text-good",
  },
  review: {
    label: "적용 전 확인",
    icon: CircleAlert,
    className: "border-warn/40 bg-warn/10 text-warn",
  },
  blocked: {
    label: "현재 조건 차단",
    icon: ShieldX,
    className: "border-danger/35 bg-danger/10 text-danger",
  },
} as const;

export function MarketProductionFitBadge({
  record,
  className,
  showCounts = false,
}: MarketProductionFitBadgeProps) {
  const { profile } = useMarketProductionProfile();
  const evaluation = evaluateMarketProductionFit(record, profile);
  const meta = STATUS_META[evaluation.status];
  const Icon = meta.icon;
  const issueSummary = evaluation.checks
    .filter((check) => check.status !== "pass")
    .map((check) => `${check.label}: ${check.summary}`)
    .join(" · ");
  const title = issueSummary || "선택한 제작 조건을 manifest 기준으로 통과했습니다.";

  return (
    <span
      title={title}
      aria-label={`${meta.label}. 충족 ${evaluation.passCount}개, 확인 ${evaluation.reviewCount}개, 차단 ${evaluation.blockCount}개`}
      className={cn(
        "inline-flex min-h-6 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold",
        meta.className,
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{meta.label}</span>
      {showCounts ? (
        <span className="numeral tnum shrink-0 opacity-80">
          {evaluation.passCount}/{evaluation.checks.length}
        </span>
      ) : null}
    </span>
  );
}
