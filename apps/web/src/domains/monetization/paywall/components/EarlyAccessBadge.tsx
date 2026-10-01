/**
 * EarlyAccessBadge.tsx
 *
 * "서포터 선공개 중 · N일 후 무료" 배지.
 */
import { Zap } from "lucide-react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import type { SupporterEvidence } from "../models/paywall-model";
import { useEpisodeAccess } from "../hooks/use-episode-access";

interface EarlyAccessBadgeProps {
  readonly titleId: string;
  readonly publishedAt: string;
  readonly evidence?: SupporterEvidence;
  readonly className?: string;
}

/** 얼리 액세스 중이 아니면 아무것도 렌더하지 않는다. */
export function EarlyAccessBadge({
  titleId,
  publishedAt,
  evidence,
  className,
}: EarlyAccessBadgeProps) {
  const t = useT();
  const access = useEpisodeAccess({ titleId, publishedAt, evidence });

  if (access.reason === "open" || access.daysUntilFree === null) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent",
        className,
      )}
    >
      <Zap className="h-3.5 w-3.5" aria-hidden />
      {t("paywall.badge.earlyAccess", { days: access.daysUntilFree })}
    </span>
  );
}
