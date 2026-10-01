/**
 * MyMembershipCard.tsx
 *
 * 팬이 가입 중인 멤버십을 관리하는 카드 (다음 결제일·해지).
 * 해지는 기간 말까지 혜택을 유지한다.
 */
import { Crown } from "lucide-react";
import { useState } from "react";

import { useT, getLang } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";

import {
  formatMembershipKrw,
  isSubscriptionActive,
  type MembershipSubscription,
  type MembershipTier,
} from "../models/membership-model";
import { cancelSubscription, getTier } from "../models/membership-store";

interface MyMembershipCardProps {
  readonly subscription: MembershipSubscription;
  readonly onChanged: () => void;
}

function formatDate(iso: string, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function MyMembershipCard({ subscription, onChanged }: MyMembershipCardProps) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const tier: MembershipTier | null = getTier(subscription.tierId);
  const active = isSubscriptionActive(subscription);

  const handleCancel = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    cancelSubscription(subscription.id);
    setConfirming(false);
    onChanged();
  };

  return (
    <div className="rounded-2xl border border-line p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
            <Crown className="h-5 w-5 text-accent" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-bold text-fg">{tier?.name ?? t("membership.my.unknownTier")}</p>
            <p className="text-xs tabular-nums text-muted">
              {t("membership.my.price", { amount: formatMembershipKrw(subscription.monthlyPriceKrw) })}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            active ? "bg-good/15 text-good" : "bg-fg/10 text-muted",
          )}
        >
          {active ? t("membership.my.statusActive") : t("membership.my.statusEnded")}
        </span>
      </div>

      <p className="mt-3 text-xs text-muted">
        {subscription.status === "cancelled"
          ? t("membership.my.untilDate", { date: formatDate(subscription.currentPeriodEnd, getLang()) })
          : t("membership.my.nextBilling", { date: formatDate(subscription.currentPeriodEnd, getLang()) })}
      </p>

      {active && subscription.status === "active" && (
        <div className="mt-3">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-xs text-muted">{t("membership.my.cancelConfirm")}</p>
              <button
                type="button"
                onClick={handleCancel}
                className={cn(buttonClass({ variant: "secondary", size: "sm" }), "text-bad")}
              >
                {t("membership.my.cancelYes")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                {t("membership.my.cancelNo")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCancel}
              className={cn(buttonClass({ variant: "secondary", size: "sm" }), "text-muted")}
            >
              {t("membership.my.cancel")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
