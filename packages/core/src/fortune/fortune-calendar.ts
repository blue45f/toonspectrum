import KoreanLunarCalendar from "korean-lunar-calendar";
import { Solar } from "lunar-typescript";

/** All wall-clock arithmetic is explicit UTC+09:00, independent of the host timezone.
 * Chinese-library values are used ONLY for solar terms, never for Korean lunar dates.
 * Sources and conventions: docs/fortune-observatory.md.
 */
export const FORTUNE_MIN_YEAR = 1900;
export const FORTUNE_MAX_YEAR = 2050;
export const FORTUNE_DAY_MS = 86_400_000;
export type CalendarKind = "solar" | "lunar";
export interface FortuneBirthInput {
  date: string;
  time?: string;
  calendar?: CalendarKind;
  leapMonth?: boolean;
  dayBoundary?: "midnight" | "zi";
}
export interface FortuneSolarTerm {
  name: string;
  chinese: string;
  atKst: string;
  timestamp: number;
  isMonthBoundary: boolean;
}
const TERMS: ReadonlyArray<readonly [string, string]> = [
  ["小寒", "소한"], ["大寒", "대한"], ["立春", "입춘"], ["雨水", "우수"],
  ["惊蛰", "경칩"], ["春分", "춘분"], ["清明", "청명"], ["谷雨", "곡우"],
  ["立夏", "입하"], ["小满", "소만"], ["芒种", "망종"], ["夏至", "하지"],
  ["小暑", "소서"], ["大暑", "대서"], ["立秋", "입추"], ["处暑", "처서"],
  ["白露", "백로"], ["秋分", "추분"], ["寒露", "한로"], ["霜降", "상강"],
  ["立冬", "입동"], ["小雪", "소설"], ["大雪", "대설"], ["冬至", "동지"],
];
const termCache = new Map<number, readonly FortuneSolarTerm[]>();
export function fortuneKstDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}
export function parseFortuneDate(value: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error("날짜를 YYYY-MM-DD 형식으로 입력해 주세요.");
  const [year, month, day] = value.split("-").map(Number);
  if (year < FORTUNE_MIN_YEAR || year > FORTUNE_MAX_YEAR || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("1900~2050년 범위의 올바른 날짜를 입력해 주세요.");
  }
  return [year, month, day];
}
export function validateFortuneTime(value?: string): string | undefined {
  if (!value) return undefined;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)) throw new Error("출생시간을 00:00~23:59로 입력해 주세요.");
  return value;
}
export function resolveFortuneBirth(input: FortuneBirthInput) {
  const [year, month, day] = parseFortuneDate(input.date);
  const time = validateFortuneTime(input.time);
  const converter = new KoreanLunarCalendar();
  const valid = input.calendar === "lunar"
    ? converter.setLunarDate(year, month, day, input.leapMonth === true)
    : converter.setSolarDate(year, month, day);
  if (!valid) throw new Error(input.calendar === "lunar"
    ? "존재하지 않는 음력 날짜 또는 윤달입니다. 평달·윤달과 날짜를 확인해 주세요."
    : "존재하지 않는 양력 날짜입니다. 윤년과 월별 일수를 확인해 주세요.");
  const solar = converter.getSolarCalendar();
  if (solar.year < FORTUNE_MIN_YEAR || solar.year > FORTUNE_MAX_YEAR) throw new Error("변환한 양력 날짜가 지원 범위(1900~2050년)를 벗어났어요.");
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    solarDate: `${solar.year}-${pad(solar.month)}-${pad(solar.day)}`,
    lunar: converter.getLunarCalendar(),
    time,
    timeKnown: time !== undefined,
    dayBoundary: input.dayBoundary ?? "midnight",
  };
}
export function shiftFortuneDate(date: string, days: number): string {
  const [y, m, d] = parseFortuneDate(date);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  if (dateObj.getUTCMonth() !== m - 1 || dateObj.getUTCDate() !== d || !Number.isInteger(days)) throw new Error("올바른 날짜와 일수를 입력해 주세요.");
  return new Date(dateObj.getTime() + days * FORTUNE_DAY_MS).toISOString().slice(0, 10);
}
export function solarTermsForYear(year: number): readonly FortuneSolarTerm[] {
  if (!Number.isInteger(year) || year < FORTUNE_MIN_YEAR - 1 || year > FORTUNE_MAX_YEAR + 1) throw new Error("절기를 계산할 연도를 확인해 주세요.");
  const cached = termCache.get(year);
  if (cached) return cached;
  // A July lunar-year table contains this year's 24 terms, plus adjacent winter terms.
  const tables = [Solar.fromYmd(year, 7, 1).getLunar().getJieQiTable(), Solar.fromYmd(year + 1, 7, 1).getLunar().getJieQiTable()];
  const results: FortuneSolarTerm[] = [];
  for (const [index, [chinese, name]] of TERMS.entries()) {
    const solar = tables.map((t) => t[chinese]).find((v) => v?.getYear() === year);
    if (!solar) throw new Error(`${year}년 ${name} 절기 데이터를 계산하지 못했어요.`);
    // The library's astronomical term wall clock is UTC+08:00. Convert to an instant, then KST.
    const timestamp = Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay(), solar.getHour() - 8, solar.getMinute(), solar.getSecond());
    results.push(Object.freeze({ name, chinese, timestamp, atKst: new Date(timestamp + 9 * 3_600_000).toISOString().slice(0, 19).replace("T", " "), isMonthBoundary: index % 2 === 0 }));
  }
  if (termCache.size >= 16) termCache.delete(termCache.keys().next().value!);
  const frozen = Object.freeze(results.sort((a, b) => a.timestamp - b.timestamp));
  termCache.set(year, frozen);
  return frozen;
}
export function fortuneMonthDays(month: string) {
  if (!/^\d{4}-\d{2}$/u.test(month)) throw new Error("달력의 연월을 확인해 주세요.");
  const resolved = resolveFortuneBirth({ date: `${month}-01` });
  const [y, m] = resolved.solarDate.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const terms = solarTermsForYear(y);
  return Array.from({ length: count }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    const c = new KoreanLunarCalendar();
    if (!c.setSolarDate(y, m, i + 1)) throw new Error("달력 변환 범위를 벗어났어요.");
    return { date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), lunar: c.getLunarCalendar(), gapja: c.getKoreanGapja().day, terms: terms.filter((t) => t.atKst.startsWith(date)) };
  });
}
