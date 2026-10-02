/**
 * 컷츠 리워드 펀드 — 풀 회계·유효 조회 판정·정산 배분 순수 로직.
 *
 * 광고·후원 등으로 조성된 월간 펀드를, 그 달에 유효 조회가 발생한 컷츠의
 * 작가들에게 조회 가중치만큼 나눈다. 팬 리믹스 클립의 조회는 만든 팬에게
 * 70%, 원작자에게 30%가 돌아간다 — 리믹스가 돌수록 원작도 벌리는 구조다.
 *
 * 봇성 조회를 거르는 규칙은 단순하게 유지한다:
 * 1. 클립 길이의 절반 이상을 본 조회만 센다 (최소 시청 비율).
 * 2. 같은 시청자가 같은 클립을 같은 날 여러 번 봐도 1회만 센다.
 * 3. 한 시청자가 하루에 셀 수 있는 조회는 전 클립 합쳐 100회까지다.
 *
 * 이 모듈은 순수 로직만 담는다. 화면은 CutsRewardsPage, 실제 사용자 조회
 * 이벤트 보관·서버 계약은 파일 아래쪽 "서버 계약 지점" 절을 본다.
 * 실제 송금은 여기서 하지 않는다 — 정산 확정·지급은 서버 정책 영역이다.
 */

import { isFanRemix } from "./cuts-remix";
import type { CutsClip } from "./cuts-types";

/** 유효 조회로 인정하는 최소 시청 비율 (본 길이 / 클립 길이). */
export const REWARD_MIN_WATCH_RATIO = 0.5;
/** 같은 시청자·같은 클립·같은 날에 세는 조회 상한. */
export const REWARD_VIEWER_CLIP_DAILY_CAP = 1;
/** 한 시청자가 하루에 만들 수 있는 유효 조회 총량 상한 (전 클립 합산). */
export const REWARD_VIEWER_DAILY_CAP = 100;
/** 팬 리믹스 조회 가중치 중 원작자에게 돌아가는 비율. 나머지는 리믹스를 만든 팬 몫. */
export const REMIX_ORIGINAL_AUTHOR_SHARE = 0.3;

/** 조회 이벤트 원본 — 정산의 입력. 로컬에서는 스토어와 데모 원장이 만든다. */
export interface CutsViewEvent {
  readonly clipId: string;
  /** 시청자 식별 키. 로그인 사용자는 계정 ID, 게스트·데모는 별도 접두 키. */
  readonly viewerKey: string;
  /** 실제로 본 시간 (ms). */
  readonly watchedMs: number;
  /** 클립 전체 길이 (ms). 시청 비율 판정 기준. */
  readonly durationMs: number;
  /** 조회 시각 (ISO 8601). 기간·날짜 경계 판정에 쓴다. */
  readonly viewedAt: string;
}

/** 정산 기간 — 월 단위. open은 진행 중(예상), closed는 마감(확정). */
export interface RewardPeriod {
  /** "2026-10" 형식의 월 키. */
  readonly id: string;
  /** 기간 시작 (ISO, 포함). */
  readonly startsAt: string;
  /** 기간 끝 (ISO, 제외). */
  readonly endsAt: string;
  /** 이 기간에 나눌 펀드 총액 (원). */
  readonly poolKrw: number;
  readonly status: "open" | "closed";
}

/** 정산 내역의 한 줄 — 수령자 한 명의 클립별 기여. */
export interface RewardClipBreakdown {
  readonly clipId: string;
  readonly title: string;
  readonly episodeNumber: number;
  /**
   * original: 내 작품 클립의 조회.
   * remix-original: 팬이 만든 리믹스가 내 작품을 원작으로 해서 생긴 조회.
   * remix-creator: 내가 만든 리믹스에서 생긴 조회.
   */
  readonly role: "original" | "remix-original" | "remix-creator";
  /** 가드를 통과한 유효 조회 수 (원본 카운트). */
  readonly qualifiedViews: number;
  /** 배분 가중치 — 리믹스면 역할 비율이 곱해진 값이라 소수일 수 있다. */
  readonly weight: number;
  readonly amountKrw: number;
}

/** 수령자 한 명의 기간 정산 결과. */
export interface RewardRecipientSettlement {
  /** "author:{작가명}" 또는 "creator:{계정 ID}". */
  readonly recipientKey: string;
  readonly displayName: string;
  /** 기여 클립들의 유효 조회 합 (리믹스 양쪽 수령자에게 각각 원본 카운트로 잡힌다). */
  readonly qualifiedViews: number;
  readonly weight: number;
  /** 전체 가중치 대비 비율 (0..1). */
  readonly shareRatio: number;
  readonly amountKrw: number;
  readonly clips: readonly RewardClipBreakdown[];
}

/** 기간 전체 정산 결과. entries 금액 합 + unallocatedKrw = poolKrw 가 항상 성립한다. */
export interface RewardSettlement {
  readonly period: RewardPeriod;
  /** 가드를 통과한 전체 유효 조회 수. */
  readonly totalQualifiedViews: number;
  readonly totalWeight: number;
  readonly entries: readonly RewardRecipientSettlement[];
  /** 유효 조회가 없어 아무에게도 배분되지 않은 금액. */
  readonly unallocatedKrw: number;
}

/* ── 기간 ─────────────────────────────────────────────────────────── */

/** 날짜가 속한 월 정산 기간 ID ("2026-10"). */
export function rewardPeriodIdForDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** 월 정산 기간을 만든다. now가 기간 안에 있으면 open, 지나갔으면 closed. */
export function monthlyRewardPeriod(
  year: number,
  month: number,
  poolKrw: number,
  now: Date,
): RewardPeriod {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return {
    id: rewardPeriodIdForDate(start),
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    poolKrw,
    status: now >= start && now < end ? "open" : "closed",
  };
}

/** 이벤트 시각이 기간 안에 드는지 (시작 포함·끝 제외). */
export function isWithinPeriod(viewedAt: string, period: RewardPeriod): boolean {
  return viewedAt >= period.startsAt && viewedAt < period.endsAt;
}

/* ── 유효 조회 판정 (봇 가드) ─────────────────────────────────────── */

function dayKeyOf(viewedAt: string): string {
  return viewedAt.slice(0, 10);
}

/**
 * 조회 이벤트에 가드를 적용해 클립별 유효 조회 수를 센다.
 *
 * 판정은 viewedAt 오름차순으로 한다 — "먼저 본 조회가 상한을 차지한다"가
 * 순서에 흔들리지 않게 하기 위해서다. 기간 밖 이벤트와 목록에 없는
 * 클립의 이벤트는 버린다.
 */
export function countQualifiedViews(
  events: readonly CutsViewEvent[],
  clips: readonly CutsClip[],
  period: RewardPeriod,
): ReadonlyMap<string, number> {
  const knownClipIds = new Set(clips.map((clip) => clip.id));
  const perViewerClipDay = new Map<string, number>();
  const perViewerDay = new Map<string, number>();
  const counts = new Map<string, number>();

  const ordered = events
    .filter((event) => knownClipIds.has(event.clipId) && isWithinPeriod(event.viewedAt, period))
    .slice()
    .sort((a, b) => (a.viewedAt < b.viewedAt ? -1 : a.viewedAt > b.viewedAt ? 1 : 0));

  for (const event of ordered) {
    if (event.durationMs <= 0) continue;
    if (event.watchedMs / event.durationMs < REWARD_MIN_WATCH_RATIO) continue;
    const day = dayKeyOf(event.viewedAt);
    const clipDayKey = `${event.viewerKey}|${event.clipId}|${day}`;
    if ((perViewerClipDay.get(clipDayKey) ?? 0) >= REWARD_VIEWER_CLIP_DAILY_CAP) continue;
    const dayKey = `${event.viewerKey}|${day}`;
    if ((perViewerDay.get(dayKey) ?? 0) >= REWARD_VIEWER_DAILY_CAP) continue;
    perViewerClipDay.set(clipDayKey, (perViewerClipDay.get(clipDayKey) ?? 0) + 1);
    perViewerDay.set(dayKey, (perViewerDay.get(dayKey) ?? 0) + 1);
    counts.set(event.clipId, (counts.get(event.clipId) ?? 0) + 1);
  }
  return counts;
}

/* ── 정산 ─────────────────────────────────────────────────────────── */

interface MutableBreakdown extends Omit<RewardClipBreakdown, "amountKrw"> {
  amountKrw: number;
}

interface MutableEntry {
  recipientKey: string;
  displayName: string;
  qualifiedViews: number;
  weight: number;
  clips: MutableBreakdown[];
}

/**
 * 기간 정산 — 풀을 수령자 가중치 비율로 나누되, 원 단위 절삭 잔돈은
 * 소수부가 큰 수령자부터 1원씩 채워 총합이 풀과 정확히 맞게 한다.
 */
export function settleRewardPeriod(
  period: RewardPeriod,
  clips: readonly CutsClip[],
  events: readonly CutsViewEvent[],
): RewardSettlement {
  const qualifiedByClip = countQualifiedViews(events, clips, period);
  const totalQualifiedViews = [...qualifiedByClip.values()].reduce((sum, n) => sum + n, 0);

  const entriesByKey = new Map<string, MutableEntry>();
  const ensureEntry = (recipientKey: string, displayName: string): MutableEntry => {
    const existing = entriesByKey.get(recipientKey);
    if (existing) return existing;
    const created: MutableEntry = {
      recipientKey,
      displayName,
      qualifiedViews: 0,
      weight: 0,
      clips: [],
    };
    entriesByKey.set(recipientKey, created);
    return created;
  };
  const addBreakdown = (
    recipientKey: string,
    displayName: string,
    clip: CutsClip,
    role: RewardClipBreakdown["role"],
    qualifiedViews: number,
    weight: number,
  ) => {
    const entry = ensureEntry(recipientKey, displayName);
    entry.qualifiedViews += qualifiedViews;
    entry.weight += weight;
    entry.clips.push({
      clipId: clip.id,
      title: clip.title,
      episodeNumber: clip.episodeNumber,
      role,
      qualifiedViews,
      weight,
      amountKrw: 0,
    });
  };

  for (const clip of clips) {
    const qualified = qualifiedByClip.get(clip.id) ?? 0;
    if (qualified <= 0) continue;
    if (isFanRemix(clip) && clip.remix) {
      addBreakdown(
        `author:${clip.remix.author}`,
        clip.remix.author,
        clip,
        "remix-original",
        qualified,
        qualified * REMIX_ORIGINAL_AUTHOR_SHARE,
      );
      addBreakdown(
        `creator:${clip.createdBy}`,
        clip.createdBy,
        clip,
        "remix-creator",
        qualified,
        qualified * (1 - REMIX_ORIGINAL_AUTHOR_SHARE),
      );
    } else {
      addBreakdown(`author:${clip.author}`, clip.author, clip, "original", qualified, qualified);
    }
  }

  const entries = [...entriesByKey.values()];
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0 || period.poolKrw <= 0) {
    return {
      period,
      totalQualifiedViews,
      totalWeight,
      entries: [],
      unallocatedKrw: Math.max(0, period.poolKrw),
    };
  }

  // 수령자별 금액 — 최대 잔여법(largest remainder)으로 풀 총액과 합을 맞춘다.
  const rawAmounts = entries.map((entry) => (period.poolKrw * entry.weight) / totalWeight);
  const amounts = rawAmounts.map((raw) => Math.floor(raw));
  let remainder = period.poolKrw - amounts.reduce((sum, n) => sum + n, 0);
  const byFraction = entries
    .map((entry, index) => ({ index, fraction: rawAmounts[index] - amounts[index], weight: entry.weight }))
    .sort((a, b) => b.fraction - a.fraction || b.weight - a.weight || a.index - b.index);
  for (const target of byFraction) {
    if (remainder <= 0) break;
    amounts[target.index] += 1;
    remainder -= 1;
  }

  // 클립별 금액 — 수령자 금액 안에서 같은 방식으로 가중치 배분한다.
  entries.forEach((entry, entryIndex) => {
    const entryAmount = amounts[entryIndex];
    if (entry.weight <= 0 || entryAmount <= 0) return;
    const rawShares = entry.clips.map((row) => (entryAmount * row.weight) / entry.weight);
    const shares = rawShares.map((raw) => Math.floor(raw));
    let left = entryAmount - shares.reduce((sum, n) => sum + n, 0);
    const order = entry.clips
      .map((row, index) => ({ index, fraction: rawShares[index] - shares[index] }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (const target of order) {
      if (left <= 0) break;
      shares[target.index] += 1;
      left -= 1;
    }
    entry.clips.forEach((row, index) => {
      row.amountKrw = shares[index];
    });
  });

  const settled: RewardRecipientSettlement[] = entries
    .map((entry, index) => ({
      recipientKey: entry.recipientKey,
      displayName: entry.displayName,
      qualifiedViews: entry.qualifiedViews,
      weight: entry.weight,
      shareRatio: entry.weight / totalWeight,
      amountKrw: amounts[index],
      clips: entry.clips.slice().sort((a, b) => b.weight - a.weight),
    }))
    .sort((a, b) => b.amountKrw - a.amountKrw || (a.recipientKey < b.recipientKey ? -1 : 1));

  const allocated = settled.reduce((sum, entry) => sum + entry.amountKrw, 0);
  return {
    period,
    totalQualifiedViews,
    totalWeight,
    entries: settled,
    unallocatedKrw: period.poolKrw - allocated,
  };
}

/** 정산 결과에서 수령자 한 명의 결과를 찾는다. */
export function selectRecipientSettlement(
  settlement: RewardSettlement,
  recipientKey: string,
): RewardRecipientSettlement | null {
  return settlement.entries.find((entry) => entry.recipientKey === recipientKey) ?? null;
}

/** 리워드 펀드 대상 클립인지 — 피드에 게시된 클립은 전부 대상이다. */
export function isRewardEligibleClip(clip: Pick<CutsClip, "publishedAt">): boolean {
  return typeof clip.publishedAt === "string" && clip.publishedAt.length > 0;
}

/* ── 표시용 포맷 ──────────────────────────────────────────────────── */

/** 금액을 원 단위 한글 표기로 (예: 1,234,000원). */
export function formatKrw(amount: number): string {
  if (!Number.isFinite(amount)) return "0원";
  return `${Math.max(0, Math.floor(amount)).toLocaleString("ko-KR")}원`;
}

/** 비율을 소수 1자리 퍼센트로 (예: 12.3%). */
export function formatSharePercent(shareRatio: number): string {
  if (!Number.isFinite(shareRatio) || shareRatio <= 0) return "0%";
  return `${(shareRatio * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

/* ── 데모 원장 ──────────────────────────────────────────────────────
 *
 * 서버 정산이 열리기 전까지 대시보드를 실제 계산으로 보여주기 위한
 * 로컬 원장이다. 클립의 누적 조회수를 기간 안의 시청 이벤트로 되풀어
 * 만들며, 시드가 고정돼 있어 새로고침해도 같은 숫자가 나온다.
 * 절반만 보고 나간 조회·같은 날 반복 조회도 섞어 가드가 실제로
 * 걸러내는 모습을 보여준다.
 */

function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** 데모 원장 이벤트를 만든다. scale은 지난 기간처럼 규모가 다른 기간용 배율. */
export function buildDemoViewEvents(
  clips: readonly CutsClip[],
  period: RewardPeriod,
  scale = 1,
): CutsViewEvent[] {
  const periodStartMs = Date.parse(period.startsAt);
  const periodSpanMs = Date.parse(period.endsAt) - periodStartMs;
  const events: CutsViewEvent[] = [];
  for (const clip of clips) {
    const count = Math.max(4, Math.min(36, Math.round((clip.views / 3000) * scale)));
    const viewerPool = Math.max(3, Math.floor(count * 0.6));
    const random = mulberry32(hashSeed(`${clip.id}:${period.id}`));
    for (let i = 0; i < count; i += 1) {
      const viewerKey = `demo-viewer-${1 + Math.floor(random() * viewerPool)}`;
      const watchRatio = 0.05 + random() * 0.95;
      const viewedAt = new Date(periodStartMs + Math.floor(random() * periodSpanMs));
      events.push({
        clipId: clip.id,
        viewerKey,
        watchedMs: Math.round(clip.durationMs * watchRatio),
        durationMs: clip.durationMs,
        viewedAt: viewedAt.toISOString(),
      });
    }
  }
  return events;
}

/* ── 서버 계약 지점 ─────────────────────────────────────────────────
 *
 * 정산 데이터의 출입구는 이 절 하나로 모은다. 서버가 열리면 아래
 * 인터페이스의 구현만 교체하면 되고, 페이지·순수 로직은 손대지 않는다.
 *
 * 예정 계약 (apps/api):
 * - GET  /api/cuts/rewards/periods
 *        → RewardPeriod[] (풀 총액은 운영 정책이 정한다)
 * - GET  /api/cuts/rewards/periods/{periodId}/settlement
 *        → RewardSettlement (서버가 확정한 정산. open 기간은 예상치)
 * - 조회 이벤트는 기존 POST /api/cuts/{clipId}/view 흐름에
 *   watchedMs·durationMs 필드를 더해 보낸다 (cuts-store 전송 큐).
 *   서버는 이 모듈과 같은 가드로 유효 조회를 확정한다.
 *
 * 로컬 구현은 데모 원장 + 이 브라우저에서 실제로 본 조회 이벤트를
 * 합쳐 같은 계산을 돌린다. 풀 총액도 아직 정책 확정 전이라 데모 값을 쓴다.
 */

/** 파일럿 데모 풀 — 이번 달·지난달. 실제 풀은 운영 정책 확정 후 서버가 내려준다. */
export const DEMO_REWARD_POOL_CURRENT_KRW = 1_200_000;
export const DEMO_REWARD_POOL_PREVIOUS_KRW = 1_000_000;

export interface CutsRewardsApi {
  listPeriods: () => Promise<readonly RewardPeriod[]>;
  getSettlement: (periodId: string) => Promise<RewardSettlement>;
}

export interface LocalRewardsSource {
  readonly clips: readonly CutsClip[];
  /** 이 브라우저에서 실제로 기록된 조회 이벤트 (cuts-store viewEvents). */
  readonly userEvents: readonly CutsViewEvent[];
  readonly now?: Date;
}

/** 데모 기간 목록 — 이번 달(open)과 지난달(closed). */
export function demoRewardPeriods(now: Date): RewardPeriod[] {
  const current = monthlyRewardPeriod(now.getUTCFullYear(), now.getUTCMonth() + 1, DEMO_REWARD_POOL_CURRENT_KRW, now);
  const previousDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previous = monthlyRewardPeriod(
    previousDate.getUTCFullYear(),
    previousDate.getUTCMonth() + 1,
    DEMO_REWARD_POOL_PREVIOUS_KRW,
    now,
  );
  return [current, previous];
}

export function createLocalCutsRewardsApi(source: LocalRewardsSource): CutsRewardsApi {
  const now = source.now ?? new Date();
  return {
    listPeriods: async () => demoRewardPeriods(now),
    getSettlement: async (periodId: string) => {
      const periods = demoRewardPeriods(now);
      const period = periods.find((candidate) => candidate.id === periodId);
      if (!period) throw new Error(`알 수 없는 정산 기간입니다: ${periodId}`);
      const isCurrent = period.id === periods[0].id;
      const demoEvents = buildDemoViewEvents(source.clips, period, isCurrent ? 1 : 0.65);
      return settleRewardPeriod(period, source.clips, [...demoEvents, ...source.userEvents]);
    },
  };
}
