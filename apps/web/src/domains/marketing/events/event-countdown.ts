/**
 * 마케팅 이벤트 마감 카운트다운 계산 — 순수 함수.
 *
 * D-day 표기는 한국식 관례(마감 당일 = D-day, 전날 = D-1)를 따른다.
 */
export interface EventCountdown {
  /** 마감까지 남은 일수 (마감 당일 = 0). */
  readonly daysLeft: number;
  /** 마감 임박 여부 (D-3 이하). */
  readonly urgent: boolean;
  /** 마감 당일 여부. */
  readonly isToday: boolean;
}

/** 마감 임박으로 간주하는 남은 일수 기준. */
export const EVENT_COUNTDOWN_URGENT_DAYS = 3;

const MS_PER_DAY = 86_400_000;

/**
 * endsAt(ISO 문자열) 기준 카운트다운을 계산한다.
 * endsAt이 없거나, 파싱 불가하거나, 이미 지난 경우 null을 반환한다.
 */
export function getEventCountdown(
  endsAt: string | null | undefined,
  now: Date = new Date(),
): EventCountdown | null {
  if (!endsAt) return null;
  const endsMs = new Date(endsAt).getTime();
  if (Number.isNaN(endsMs)) return null;
  const diffMs = endsMs - now.getTime();
  if (diffMs < 0) return null;
  const daysLeft = Math.floor(diffMs / MS_PER_DAY);
  return {
    daysLeft,
    urgent: daysLeft <= EVENT_COUNTDOWN_URGENT_DAYS,
    isToday: daysLeft === 0,
  };
}
