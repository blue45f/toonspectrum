/**
 * tip-model.ts
 *
 * 에피소드 후원(팁/슈퍼라이크) 도메인 모델.
 * 회차별 1회성 후원을 기록하고 회차별 후원 집계를 제공한다.
 * 벤치마크: WEBTOON Super Likes, Tapas Ink 팁.
 */

/** 후원 금액 티어 (원) — 독자가 고르는 빠른 선택지. */
export const TIP_AMOUNT_TIERS_KRW = [1_000, 5_000, 10_000, 50_000] as const;

/** 후원 1회에 허용되는 최소/최대 금액 (원). */
export const TIP_AMOUNT_MIN_KRW = 100;
export const TIP_AMOUNT_MAX_KRW = 1_000_000;

/** 후원 메시지 최대 길이. */
export const TIP_MESSAGE_MAX_LENGTH = 140;

export type TipStatus = "completed" | "pending" | "failed";

/**
 * 한 건의 후원 기록.
 * 결제는 기존 커머스 인프라(`/commerce/tips`)로 처리하고,
 * 이 레코드는 클라이언트 집계·랭킹의 원천이다.
 */
export interface TipRecord {
  readonly id: string;
  /** 회차 식별자 (예: "title-slug:episode-12"). */
  readonly episodeId: string;
  readonly titleId: string;
  readonly creatorId: string;
  /** 후원자 사용자 id. 결제 시점에 로그인을 유도하므로 완료된 후원은 항상 존재한다. */
  readonly tipperId: string;
  readonly tipperName: string;
  readonly amountKrw: number;
  readonly message: string | null;
  readonly status: TipStatus;
  /** 커머스 주문 id (결제 인프라와 대조용). */
  readonly orderId: string | null;
  readonly createdAt: string;
}

export interface NewTipInput {
  readonly episodeId: string;
  readonly titleId: string;
  readonly creatorId: string;
  readonly tipperId: string;
  readonly tipperName: string;
  readonly amountKrw: number;
  readonly message?: string;
  readonly orderId?: string;
}

/** 회차별 후원 집계. */
export interface EpisodeTipSummary {
  readonly episodeId: string;
  readonly totalKrw: number;
  readonly tipCount: number;
  readonly supporterCount: number;
  readonly topAmountKrw: number;
}

/** 창작자 기준 회차별 후원 랭킹 항목. */
export interface EpisodeTipRankingEntry extends EpisodeTipSummary {
  readonly titleId: string;
  readonly rank: number;
}

/** 후원 금액이 유효한지 검사한다. */
export function isValidTipAmount(amountKrw: number): boolean {
  return (
    Number.isInteger(amountKrw) &&
    amountKrw >= TIP_AMOUNT_MIN_KRW &&
    amountKrw <= TIP_AMOUNT_MAX_KRW
  );
}

/** 후원 메시지를 저장 가능한 형태로 다듬는다. */
export function sanitizeTipMessage(message: string | undefined): string | null {
  if (message === undefined) return null;
  const trimmed = message.trim().slice(0, TIP_MESSAGE_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/** 팁 레코드 목록에서 회차별 집계를 만든다. */
export function summarizeEpisodeTips(
  episodeId: string,
  tips: readonly TipRecord[],
): EpisodeTipSummary {
  const completed = tips.filter(
    (tip) => tip.episodeId === episodeId && tip.status === "completed",
  );
  const supporters = new Set(completed.map((tip) => tip.tipperId));
  return {
    episodeId,
    totalKrw: completed.reduce((sum, tip) => sum + tip.amountKrw, 0),
    tipCount: completed.length,
    supporterCount: supporters.size,
    topAmountKrw: completed.reduce((max, tip) => Math.max(max, tip.amountKrw), 0),
  };
}

/** 창작자의 회차별 후원 랭킹을 만든다 (후원 총액 내림차순). */
export function rankEpisodesByTips(
  creatorId: string,
  tips: readonly TipRecord[],
): EpisodeTipRankingEntry[] {
  const byEpisode = new Map<string, TipRecord[]>();
  for (const tip of tips) {
    if (tip.creatorId !== creatorId || tip.status !== "completed") continue;
    const list = byEpisode.get(tip.episodeId);
    if (list) list.push(tip);
    else byEpisode.set(tip.episodeId, [tip]);
  }
  return [...byEpisode.entries()]
    .map(([episodeId, episodeTips]) => {
      const summary = summarizeEpisodeTips(episodeId, episodeTips);
      return {
        ...summary,
        titleId: episodeTips[0]?.titleId ?? "",
        rank: 0,
      };
    })
    .sort((a, b) => b.totalKrw - a.totalKrw || b.tipCount - a.tipCount)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** KRW 표기. */
export function formatTipKrw(amountKrw: number): string {
  return `${amountKrw.toLocaleString("ko-KR")}원`;
}
