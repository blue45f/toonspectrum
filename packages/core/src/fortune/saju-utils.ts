import { Solar } from "lunar-typescript";

import { resolveFortuneBirth, solarTermsForYear, shiftFortuneDate } from "./fortune-calendar";

export interface SajuPillar {
  kan: string;
  ji: string;
  kanKorean: string;
  jiKorean: string;
  elementKan: string;
  elementJi: string;
}
export interface SajuResult {
  yearPillar: SajuPillar;
  monthPillar: SajuPillar;
  dayPillar: SajuPillar;
  /** Empty sentinel for old consumers; excluded from calculations when time is unknown. */
  hourPillar: SajuPillar;
  birthTimeKnown?: boolean;
  calculationNotes?: string[];
  elementsRatio: { wood: number; fire: number; earth: number; metal: number; water: number };
}
export const SAJU_STEMS = "甲乙丙丁戊己庚辛壬癸";
export const SAJU_BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const STEM_KO = "갑을병정무기경신임계";
const BRANCH_KO = "자축인묘진사오미신유술해";
const STEM_ELEMENTS = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];
const BRANCH_ELEMENTS = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];
const ELEMENTS = ["목", "화", "토", "금", "수"];
const EN_ELEMENTS = ["wood", "fire", "earth", "metal", "water"] as const;
const mod = (v: number, n: number) => ((v % n) + n) % n;
export function sajuPillarAt(stem: number, branch: number): SajuPillar {
  const s = mod(stem, 10), b = mod(branch, 12);
  return { kan: SAJU_STEMS[s], ji: SAJU_BRANCHES[b], kanKorean: STEM_KO[s], jiKorean: BRANCH_KO[b], elementKan: STEM_ELEMENTS[s], elementJi: BRANCH_ELEMENTS[b] };
}
export function calculateSaju(birthDateStr: string, birthTimeStr?: string, options: { dayBoundary?: "midnight" | "zi" } = {}): SajuResult {
  const birth = resolveFortuneBirth({ date: birthDateStr, time: birthTimeStr });
  const [year, month, day] = birth.solarDate.split("-").map(Number);
  const [hour, minute] = (birth.time ?? "12:00").split(":").map(Number);
  const instant = Date.UTC(year, month - 1, day, hour - 9, minute);
  // Only year/month use the real solar-term instant. Never shift the local day/hour pillars to China time.
  const termWall = new Date(instant + 8 * 3_600_000);
  const termLunar = Solar.fromYmdHms(termWall.getUTCFullYear(), termWall.getUTCMonth() + 1, termWall.getUTCDate(), termWall.getUTCHours(), termWall.getUTCMinutes(), 0).getLunar();
  const fromText = (text: string) => sajuPillarAt(SAJU_STEMS.indexOf(text[0]), SAJU_BRANCHES.indexOf(text[1]));
  const yearPillar = fromText(termLunar.getYearInGanZhiExact());
  const monthPillar = fromText(termLunar.getMonthInGanZhiExact());
  const dayDate = options.dayBoundary === "zi" && hour >= 23 && birth.timeKnown ? shiftFortuneDate(birth.solarDate, 1) : birth.solarDate;
  const [dy, dm, dd] = dayDate.split("-").map(Number);
  const dayPillar = fromText(Solar.fromYmdHms(dy, dm, dd, 12, 0, 0).getLunar().getDayInGanZhiExact2());
  const hourBranch = Math.floor((hour * 60 + minute + 60) / 120) % 12;
  const hourPillar = birth.timeKnown
    ? sajuPillarAt((SAJU_STEMS.indexOf(dayPillar.kan) % 5) * 2 + hourBranch, hourBranch)
    : { kan: "", ji: "", kanKorean: "미", jiKorean: "상", elementKan: "", elementJi: "" };
  const pillars = [yearPillar, monthPillar, dayPillar, ...(birth.timeKnown ? [hourPillar] : [])];
  const counts = ELEMENTS.map((el) => pillars.reduce((n, p) => n + Number(p.elementKan === el) + Number(p.elementJi === el), 0));
  const raw = counts.map((n) => n * 100 / (pillars.length * 2));
  const rounded = raw.map(Math.floor);
  const rank = raw.map((v, i) => ({ i, remainder: v - rounded[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let n = 100 - rounded.reduce((a, b) => a + b, 0), i = 0; n > 0; n--, i++) rounded[rank[i].i]++;
  const elementsRatio = Object.fromEntries(EN_ELEMENTS.map((key, i) => [key, rounded[i]])) as SajuResult["elementsRatio"];
  const calculationNotes = ["한국 표준시(UTC+09:00) · 입춘/절입 시각으로 연주·월주 계산", `${options.dayBoundary === "zi" ? "23시 자시" : "0시 자정"} 일자 변경 · 진태양시·역사적 서머타임 보정 미적용`, "오행 비율은 겉글자 동등 집계이며 정밀한 신강·용신 판정이 아닙니다."];
  if (!birth.timeKnown) {
    calculationNotes.push("출생시간 미상: 시주를 만들지 않고 6글자만 집계합니다.");
    if (solarTermsForYear(year).some((t) => t.isMonthBoundary && t.atKst.startsWith(birth.solarDate))) calculationNotes.push("절입 당일이라 출생시간에 따라 연주·월주가 달라질 수 있습니다. 현재는 정오 기준 참고값입니다.");
  }
  return { yearPillar, monthPillar, dayPillar, hourPillar, birthTimeKnown: birth.timeKnown, calculationNotes, elementsRatio };
}
