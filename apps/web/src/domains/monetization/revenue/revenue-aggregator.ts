/**
 * revenue-aggregator.ts
 *
 * 등록된 수익원 제공자들을 모아 창작자 수익을 집계한다.
 * 정산 계산은 기존 마켓 정산기(MarketCreatorRevenueCalculator)를 재사용한다.
 */
import { MarketCreatorRevenueCalculator } from "@/domains/market/models/market-creator-revenue-calculator";

import {
  aggregateRevenue,
  type RevenuePeriod,
  type RevenueSummary,
} from "./models/revenue-model";
import { listRevenueSourceProviders } from "./revenue-registry";

export type RevenueCreatorTier = "standard-creator" | "pro-partner";

/**
 * 등록된 모든 수익원에서 기간 내 항목을 모아 집계한다.
 * 제공자가 실패하면 해당 수익원을 건너뛰고 나머지로 계속한다.
 */
export function aggregateCreatorRevenue(input: {
  readonly creatorId: string;
  readonly period: RevenuePeriod;
}): RevenueSummary {
  const entries = listRevenueSourceProviders().flatMap((provider) => {
    try {
      return provider.listEntries({
        creatorId: input.creatorId,
        from: input.period.from,
        to: input.period.to,
      });
    } catch {
      return [];
    }
  });
  return aggregateRevenue(entries, input.period);
}

/**
 * 총액 기준 정산 내역을 계산한다.
 * 기존 마켓 정산기(플랫폼 수수료·PG 수수료·원천징수)의 정책을 그대로 적용한다.
 */
export function computeSettlementBreakdown(
  grossKrw: number,
  creatorTier: RevenueCreatorTier = "standard-creator",
) {
  const calculator = new MarketCreatorRevenueCalculator();
  return calculator.calculate({ priceKrw: grossKrw, creatorTier });
}

/** 정산 최소 지급 기준액 (원). */
export const SETTLEMENT_MIN_PAYOUT_KRW = 10_000;

/** 정산 예정액을 받을 수 있는지 (최소 기준액 충족). */
export function isPayoutEligible(netKrw: number): boolean {
  return netKrw >= SETTLEMENT_MIN_PAYOUT_KRW;
}
