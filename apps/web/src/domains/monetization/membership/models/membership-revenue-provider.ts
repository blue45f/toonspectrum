/**
 * membership-revenue-provider.ts
 *
 * 멤버십 구독 내역을 수익원 제공자로 노출한다.
 */
import type { RevenueSourceProvider } from "../../revenue/models/revenue-model";
import { getTier, listSubscriptionsByCreator } from "./membership-store";

export const membershipRevenueProvider: RevenueSourceProvider = {
  sourceId: "membership",
  listEntries({ creatorId, from, to }) {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    return listSubscriptionsByCreator(creatorId)
      .filter((subscription) => {
        const occurred = new Date(subscription.startedAt).getTime();
        return Number.isFinite(occurred) && occurred >= fromMs && occurred < toMs;
      })
      .map((subscription) => ({
        id: subscription.id,
        sourceId: "membership" as const,
        sourceLabel: "멤버십",
        amount: subscription.monthlyPriceKrw,
        occurredAt: subscription.startedAt,
        titleName: getTier(subscription.tierId)?.name,
      }));
  },
};
