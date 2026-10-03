/**
 * 에셋 포인트(스튜디오 포인트) 정책 — 활동 보상형 포인트의 단일 기준표.
 *
 * 설계 원칙 (platform-advancement-design-2026-10-02.md 6.1-1, 5장 4번):
 * - 포인트는 현금으로 충전할 수 없고, 환전·양도도 안 된다. 오직 활동 보상으로만 쌓인다.
 * - 그래서 이 모듈에는 "포인트 구매" 규칙 자체가 존재하지 않는다.
 * - 서버 멤버십 지갑(`@toonstudio/core/membership-wallet`)의 활동 포인트와 별개로,
 *   서버가 아직 모르는 로컬 활동(로그인 보너스·컷츠 게시 등)을 이 표가 다룬다.
 *   서버 카탈로그 키가 생기면 규칙을 그쪽으로 승격하고 여기는 지운다.
 */

/** 포인트 유효기간 (일). 멤버십 정책 페이지의 "지급일로부터 365일"과 맞춘다. */
export const ASSET_POINT_EXPIRY_DAYS = 365;

/** 만료 임박으로 안내할 기간 (일). */
export const ASSET_POINT_EXPIRY_NOTICE_DAYS = 30;

/** 포인트 가격 환산: 100원 = 1P. 서버 견적(KRW)을 포인트 가격으로 바꿀 때만 쓴다. */
export const KRW_PER_POINT = 100;

/** 유료 에셋의 최소 포인트 가격. */
export const MIN_POINT_PRICE = 10;

export type AssetPointEarnRuleStatus =
  /** 트리거가 실제로 연결돼 지금 적립되는 규칙. */
  | "live"
  /** 규칙만 확정했고 트리거 연결이 후속인 규칙 (계약 지점). */
  | "planned";

export interface AssetPointEarnRule {
  readonly key: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly points: number;
  /** 하루(로컬 날짜) 기준 최대 적립 횟수. */
  readonly dailyLimit: number;
  readonly status: AssetPointEarnRuleStatus;
}

/**
 * 로컬 적립 규칙. 키는 서버 활동 키 표기법(도메인.대상.동작)을 따른다.
 * `catalog.episode.completed`는 완독 판정 지점이 catalog 도메인에 있어
 * 트리거 연결이 후속이라 planned로 둔다 — 규칙과 상한은 여기서 먼저 확정한다.
 */
export const ASSET_POINT_EARN_RULES: Readonly<Record<string, AssetPointEarnRule>> = Object.freeze({
  "auth.login.daily": {
    key: "auth.login.daily",
    labelKo: "하루 첫 로그인 보너스",
    labelEn: "Daily login bonus",
    points: 10,
    dailyLimit: 1,
    status: "live",
  },
  "cuts.clip.published": {
    key: "cuts.clip.published",
    labelKo: "컷츠 클립 게시",
    labelEn: "Publish a Cuts clip",
    points: 30,
    dailyLimit: 2,
    status: "live",
  },
  "catalog.episode.completed": {
    key: "catalog.episode.completed",
    labelKo: "회차 완독",
    labelEn: "Finish an episode",
    points: 5,
    dailyLimit: 5,
    status: "planned",
  },
});

export function assetPointEarnRule(key: string): AssetPointEarnRule | null {
  return ASSET_POINT_EARN_RULES[key] ?? null;
}

/**
 * KRW 견적을 포인트 가격으로 환산한다.
 * 무료(0원 이하)는 0P, 유료는 100원당 1P로 올림하고 최소 가격을 보장한다.
 */
export function pointPriceForKrw(amountKrw: number): number {
  if (!Number.isFinite(amountKrw) || amountKrw <= 0) return 0;
  return Math.max(MIN_POINT_PRICE, Math.ceil(amountKrw / KRW_PER_POINT));
}
