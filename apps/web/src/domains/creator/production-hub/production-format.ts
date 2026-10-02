/**
 * 제작 관리 화면의 날짜·이름 표시 규칙(React 비의존).
 */

/** 사람 이름에서 아바타 이니셜을 만든다. 한글은 첫 글자, 영문은 단어 첫 글자 두 개. */
export function productionInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/u).filter(Boolean);
  const first = words[0] ?? trimmed;
  if (/^[A-Za-z]/u.test(first)) {
    const second = words[1];
    return `${first.charAt(0)}${second ? second.charAt(0) : ""}`.toUpperCase();
  }
  return Array.from(first)[0] ?? "?";
}

const DATE_ONLY = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" });

/** 날짜만 짧게. 값이 없거나 잘못되면 대체 문구를 쓴다. */
export function formatProductionDay(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_ONLY.format(date) : fallback;
}

const DAY_MS = 86_400_000;

/** 오늘 기준 남은 날짜(달력일). 과거면 음수. */
export function productionDaysUntil(value: string | null | undefined, now: number): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const target = new Date(time);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - startOfToday.getTime()) / DAY_MS);
}

/** D-day 표기: D-3, 오늘, 2일 지남. 지난 마감은 카드 마감 배지와 같은 "N일 지남" 문법을 쓴다. */
export function formatProductionDday(days: number | null, localize: (ko: string, en: string) => string): string {
  if (days === null) return localize("마감 미정", "No due date");
  if (days === 0) return localize("오늘", "Today");
  if (days > 0) return `D-${days}`;
  const overdueDays = Math.abs(days);
  return localize(`${overdueDays}일 지남`, `${overdueDays}d overdue`);
}

/** 최근 기록 시각을 "3시간 전"처럼 짧게. 미래 시각이나 잘못된 값은 날짜로 보여 준다. */
export function formatProductionRelative(value: string, now: number, localize: (ko: string, en: string) => string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 0) return formatProductionDay(value, value);
  if (minutes < 1) return localize("방금", "Just now");
  if (minutes < 60) return localize(`${minutes}분 전`, `${minutes} min ago`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return localize(`${hours}시간 전`, `${hours}h ago`);
  const days = Math.floor(hours / 24);
  if (days < 7) return localize(`${days}일 전`, `${days}d ago`);
  return formatProductionDay(value, value);
}
