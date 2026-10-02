/**
 * tip-revenue-provider.ts
 *
 * 후원 내역을 수익원 제공자로 노출한다.
 */
import type { RevenueSourceProvider } from "../../revenue/models/revenue-model";
import { listTipsByCreator } from "./tip-store";

export const tipRevenueProvider: RevenueSourceProvider = {
  sourceId: "tips",
  listEntries({ creatorId, from, to }) {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    return listTipsByCreator(creatorId)
      .filter((record) => {
        const occurred = new Date(record.createdAt).getTime();
        return Number.isFinite(occurred) && occurred >= fromMs && occurred < toMs;
      })
      .map((record) => ({
        id: record.id,
        sourceId: "tips" as const,
        sourceLabel: "후원",
        amount: record.amountKrw,
        occurredAt: record.createdAt,
        memo: record.episodeId,
      }));
  },
};
