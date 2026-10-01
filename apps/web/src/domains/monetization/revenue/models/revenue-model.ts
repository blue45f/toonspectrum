/**
 * revenue-model.ts
 *
 * 수익 대시보드·정산 도메인 모델.
 * 수익원은 플러그인 인터페이스(RevenueSourceProvider)로 추상화하고,
 * 정산 계산은 기존 MarketCreatorRevenueCalculator에 위임한다
 * (revenue-aggregator.ts 참고).
 */

/** 수익원 식별자. */
export type RevenueSourceId = "tips" | "membership" | "early-access" | "market" | "custom";

/** 단일 수익 항목 (원화 기준). */
export interface RevenueEntry {
  readonly id: string;
  readonly sourceId: RevenueSourceId;
  /** 표시용 라벨 (제공자가 생성 시점에 결정). */
  readonly sourceLabel: string;
  /** 총액 (원, 정산 전). */
  readonly amount: number;
  readonly occurredAt: string;
  readonly titleName?: string;
  readonly memo?: string;
}

/**
 * 수익원 제공자 플러그인 인터페이스.
 * 각 트랙(후원·멤버십·…)은 이 인터페이스를 구현해
 * revenue-registry에 등록한다 — 트랙 간 직접 import 없이 확장.
 */
export interface RevenueSourceProvider {
  readonly sourceId: RevenueSourceId;
  listEntries(input: {
    readonly creatorId: string;
    readonly from: string;
    readonly to: string;
  }): readonly RevenueEntry[];
}

export interface RevenueSourceSummary {
  readonly sourceId: RevenueSourceId;
  readonly label: string;
  readonly amount: number;
  readonly count: number;
}

export interface RevenuePeriod {
  readonly from: string;
  readonly to: string;
}

export interface RevenueSummary {
  readonly totalAmount: number;
  readonly entryCount: number;
  readonly bySource: readonly RevenueSourceSummary[];
  readonly entries: readonly RevenueEntry[];
  readonly period: RevenuePeriod;
}

export interface MonthlyRevenue {
  readonly month: string; // "2026-10"
  readonly amount: number;
}

/** 금액이 0보다 큰 유효한 항목인지. */
function isValidEntry(entry: RevenueEntry, fromMs: number, toMs: number): boolean {
  const occurred = new Date(entry.occurredAt).getTime();
  return (
    Number.isFinite(entry.amount) &&
    entry.amount > 0 &&
    Number.isFinite(occurred) &&
    occurred >= fromMs &&
    occurred < toMs
  );
}

/** 항목들을 집계한다. */
export function aggregateRevenue(
  entries: readonly RevenueEntry[],
  period: RevenuePeriod,
): RevenueSummary {
  const fromMs = new Date(period.from).getTime();
  const toMs = new Date(period.to).getTime();
  const valid = entries.filter((entry) => isValidEntry(entry, fromMs, toMs));

  const bySource = new Map<RevenueSourceId, { label: string; amount: number; count: number }>();
  for (const entry of valid) {
    const bucket = bySource.get(entry.sourceId) ?? { label: entry.sourceLabel, amount: 0, count: 0 };
    bucket.amount += Math.round(entry.amount);
    bucket.count += 1;
    bySource.set(entry.sourceId, bucket);
  }

  const sortedEntries = [...valid].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );

  return {
    totalAmount: valid.reduce((sum, entry) => sum + Math.round(entry.amount), 0),
    entryCount: valid.length,
    bySource: [...bySource.entries()]
      .map(([sourceId, bucket]) => ({ sourceId, ...bucket }))
      .sort((a, b) => b.amount - a.amount),
    entries: sortedEntries,
    period,
  };
}

/** 항목들을 월별로 묶는다 (차트용). */
export function groupEntriesByMonth(
  entries: readonly RevenueEntry[],
  months: readonly string[],
): readonly MonthlyRevenue[] {
  const buckets = new Map(months.map((month) => [month, 0]));
  for (const entry of entries) {
    const month = entry.occurredAt.slice(0, 7);
    if (buckets.has(month)) {
      buckets.set(month, (buckets.get(month) ?? 0) + Math.round(entry.amount));
    }
  }
  return months.map((month) => ({ month, amount: buckets.get(month) ?? 0 }));
}

/** 최근 N개월의 "YYYY-MM" 키 목록 (오름차순). */
export function lastNMonths(count: number, now: Date = new Date()): readonly string[] {
  const months: string[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 0; i < count; i += 1) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    months.unshift(`${year}-${month}`);
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

/** 월 경계 [from, to) ISO 문자열. */
export function monthRange(month: string): RevenuePeriod {
  const [year, mon] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, mon - 1, 1));
  const to = new Date(Date.UTC(year, mon, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}
