import { fortuneMonthDays, resolveFortuneBirth, shiftFortuneDate } from "./fortune-calendar";
import { seededRandom } from "./fortune-engine";

export const FORTUNE_CONTENT_REVISION = "fortune-editorial-20260920";
export const FORTUNE_ZODIAC_IDS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"] as const;
export type FortuneZodiacId = typeof FORTUNE_ZODIAC_IDS[number];
export type FortunePeriod = "daily" | "weekly" | "monthly";
export type FortuneEnrichmentStatus = "local" | "external" | "external-cache" | "local-fallback";
export type FortuneUnavailableReason = "not-configured" | "rights-pending" | "coordination-unavailable" | "budget-exhausted" | "provider-unavailable" | "historical-request";
export interface FortuneReadingContext {
  referenceDate: string;
  timeZone: "Asia/Seoul";
  engineRevision: string;
  contentRevision: string;
  tarotDeck?: "major-22" | "full-78";
}
export interface FortuneCalendarCheck {
  date: string;
  matches: boolean;
  fields: ("lunar-date" | "leap-month" | "weekday")[];
}
export interface FortuneCalendarEnrichment {
  kind: "calendar";
  month: string;
  status: FortuneEnrichmentStatus;
  reason?: FortuneUnavailableReason;
  checkedAt?: string;
  checks: FortuneCalendarCheck[];
  source: "local" | "kasi";
  policyRevision: string;
}
export interface FortuneHoroscopeEnrichment {
  kind: "horoscope";
  sign: FortuneZodiacId;
  period: FortunePeriod;
  referenceDate: string;
  periodStart: string;
  periodEndExclusive: string;
  status: FortuneEnrichmentStatus;
  reason?: FortuneUnavailableReason;
  text: string;
  language: "ko" | "en";
  source: "local" | "free-horoscope";
  sourceDate?: string;
  checkedAt?: string;
  policyRevision: string;
}
export function fortunePeriodWindow(date: string, period: FortunePeriod) {
  const valid = resolveFortuneBirth({ date }).solarDate;
  if (period === "daily") return { periodStart: valid, periodEndExclusive: shiftFortuneDate(valid, 1) };
  if (period === "monthly") {
    const days = fortuneMonthDays(valid.slice(0, 7));
    return { periodStart: days[0].date, periodEndExclusive: shiftFortuneDate(days[days.length - 1].date, 1) };
  }
  if (period !== "weekly") throw new Error("지원하지 않는 조회 기간입니다.");
  const offset = (new Date(`${valid}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = shiftFortuneDate(valid, -offset);
  return { periodStart: start, periodEndExclusive: shiftFortuneDate(valid, 7 - offset) };
}
const QUESTIONS = [
  "아직 말로 표현하지 못한 마음을 한 줄의 대사로 써 보세요.",
  "익숙한 배경에서 평소 보지 못했던 작은 소품을 찾아보세요.",
  "완벽한 결과보다 오늘 마무리할 수 있는 작은 장면을 골라 보세요.",
  "같은 장면을 다른 인물의 시점에서 다시 구성해 보세요.",
  "혼자 몰두할 시간과 함께 의견을 나눌 시간을 구분해 보세요.",
  "최근 즐거웠던 순간의 색과 소리를 기록해 보세요.",
];
const MOTIFS = ["첫걸음", "꾸준함", "호기심", "다정함", "표현", "관찰", "균형", "집중", "탐험", "완성", "새로운 관점", "상상"];
export function localFortuneHoroscope(sign: FortuneZodiacId, period: FortunePeriod, date: string): FortuneHoroscopeEnrichment {
  const index = FORTUNE_ZODIAC_IDS.indexOf(sign);
  if (index < 0) throw new Error("별자리를 확인해 주세요.");
  const window = fortunePeriodWindow(date, period);
  const random = seededRandom(`${FORTUNE_CONTENT_REVISION}:${sign}:${period}:${window.periodStart}`);
  return { kind: "horoscope", sign, period, referenceDate: date, ...window, status: "local", source: "local", language: "ko",
    text: `${MOTIFS[index]}을 창작의 질문으로 읽어 보세요. ${QUESTIONS[Math.floor(random() * QUESTIONS.length)]} 별자리 상징에서 출발한 자체 편집 콘텐츠이며 미래를 예측하지 않습니다.`,
    policyRevision: FORTUNE_CONTENT_REVISION };
}
