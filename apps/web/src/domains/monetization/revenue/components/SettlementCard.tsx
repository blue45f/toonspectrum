/**
 * SettlementCard.tsx
 *
 * 정산 예정액 카드: 총액 → 수수료·세금 → 실수령 내역.
 */
import { Wallet } from "lucide-react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";

import {
  computeSettlementBreakdown,
  isPayoutEligible,
  SETTLEMENT_MIN_PAYOUT_KRW,
  type RevenueCreatorTier,
} from "../revenue-aggregator";

interface SettlementCardProps {
  readonly grossKrw: number;
  readonly creatorTier?: RevenueCreatorTier;
  readonly onPayoutClick?: () => void;
  readonly className?: string;
}

export function formatKrw(amount: number): string {
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

export function SettlementCard({
  grossKrw,
  creatorTier = "standard-creator",
  onPayoutClick,
  className,
}: SettlementCardProps) {
  const t = useT();
  const breakdown = computeSettlementBreakdown(grossKrw, creatorTier);
  const eligible = isPayoutEligible(breakdown.netCreatorPayoutKrw);

  const rows: ReadonlyArray<{ label: string; value: string; tone?: "minus" | "net" }> = [
    { label: t("revenue.settlement.gross"), value: formatKrw(breakdown.grossPriceKrw) },
    {
      label: t("revenue.settlement.platformFee", { rate: breakdown.platformFeeRatePercent }),
      value: `−${formatKrw(breakdown.platformFeeKrw)}`,
      tone: "minus",
    },
    { label: t("revenue.settlement.pgFee"), value: `−${formatKrw(breakdown.pgFeeKrw)}`, tone: "minus" },
    {
      label: t("revenue.settlement.withholdingTax"),
      value: `−${formatKrw(breakdown.withholdingTaxKrw)}`,
      tone: "minus",
    },
  ];

  return (
    <section
      aria-label={t("revenue.settlement.title")}
      className={cn("rounded-2xl border border-line bg-panel/50 p-4 sm:p-6", className)}
    >
      <h2 className="flex items-center gap-2 text-base font-bold text-fg">
        <Wallet className="h-5 w-5 text-accent" aria-hidden />
        {t("revenue.settlement.title")}
      </h2>

      <dl className="mt-4 space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <dt className="text-muted">{row.label}</dt>
            <dd className={cn("tabular-nums", row.tone === "minus" && "text-bad")}>
              {row.value}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-line pt-3">
          <dt className="font-semibold text-fg">{t("revenue.settlement.net")}</dt>
          <dd className="text-lg font-bold tabular-nums text-fg">
            {formatKrw(breakdown.netCreatorPayoutKrw)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        {t("revenue.settlement.policyNote", {
          min: formatKrw(SETTLEMENT_MIN_PAYOUT_KRW),
          rate: breakdown.creatorEffectiveTakeRatePercent,
        })}
      </p>

      {onPayoutClick && (
        <button
          type="button"
          onClick={onPayoutClick}
          disabled={!eligible}
          className={cn(buttonClass({ variant: "solid" }), "mt-4 w-full")}
        >
          {eligible
            ? t("revenue.settlement.requestPayout")
            : t("revenue.settlement.belowMinimum", { min: formatKrw(SETTLEMENT_MIN_PAYOUT_KRW) })}
        </button>
      )}
    </section>
  );
}
