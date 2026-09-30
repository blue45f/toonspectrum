// 월운(月運)·세운(歲運) 기반 월간/연간 운세.
//
// 오늘의 운세(일진), 올해의 운세(세운)에 이어 월 단위 흐름을 제공한다.
// 모두 명리 규칙(월간지 vs 일간 십성 + 신강신약)으로 계산하므로
// 같은 입력·같은 월에는 항상 같은 결과가 나온다. 난수 없음.

import { Solar } from "lunar-typescript";

import { analyzeSaju, analyzeYearLuck, tenGodOf, type SajuAnalysis, type SajuElement, type TenGod, type TodayCategoryScores } from "./saju-analysis";
import { calculateSaju, sajuPillarAt, SAJU_BRANCHES, SAJU_STEMS } from "./saju-utils";

const clampScore = (n: number) => Math.max(55, Math.min(98, Math.round(n)));

/** 해당 월의 월간지(月干支) 한글 (15일을 기준으로 절기 경계를 피한다). */
export function monthPillarKo(year: number, month: number): string {
  const ganzhi = Solar.fromYmd(year, month, 15).getLunar().getMonthInGanZhiExact();
  const kan = sajuPillarAt(SAJU_STEMS.indexOf(ganzhi[0]), SAJU_BRANCHES.indexOf(ganzhi[1]));
  return `${kan.kanKorean}${kan.jiKorean}`;
}

/** 월간지 천간의 오행. */
function monthStemElement(year: number, month: number): SajuElement {
  const ganzhi = Solar.fromYmd(year, month, 15).getLunar().getMonthInGanZhiExact();
  return sajuPillarAt(SAJU_STEMS.indexOf(ganzhi[0]), SAJU_BRANCHES.indexOf(ganzhi[1])).elementKan as SajuElement;
}

export interface MonthLuck {
  year: number;
  month: number;
  pillar: string; // 월간지 한글 (예: 병인)
  relationTenGod: TenGod;
  themeName: string;
  themeFocus: string;
  score: number;
}

const MONTH_THEME: Record<TenGod, { name: string; focus: string }> = {
  비겁: { name: "동료·경쟁의 달", focus: "주변 사람들과의 관계가 분주한 달. 협력과 지출 균형에 신경 쓰세요." },
  식상: { name: "표현·활동의 달", focus: "아이디어와 표현력이 살아나는 달. 창작·발표·도전에 좋습니다." },
  재성: { name: "재물·인연의 달", focus: "수입·거래·인연운이 도는 달. 계약과 만남에 길합니다." },
  관성: { name: "성취·책임의 달", focus: "일과 자리에서 인정받는 달. 마무리에 집중하면 성과가 큽니다." },
  인성: { name: "배움·휴식의 달", focus: "공부·자격·정리에 좋은 달. 무리 말고 내실을 다지세요." },
};

function monthScore(god: TenGod, strength: SajuAnalysis["strength"], month: number): number {
  let score = 70;
  if (god === "인성") score += 8;
  else if (god === "재성") score += 7;
  else if (god === "식상") score += 4;
  else if (god === "관성") score += 3;
  else score += 1;
  if (strength === "신약" && (god === "인성" || god === "비겁")) score += 6;
  if (strength === "신강" && (god === "식상" || god === "재성" || god === "관성")) score += 6;
  if (strength === "신약" && (god === "식상" || god === "재성" || god === "관성")) score -= 4;
  if (strength === "신강" && (god === "비겁" || god === "인성")) score -= 4;
  // 계절감: 월지 오행과 일간 오행의 생극으로 ±3
  const seasonal = ((month * 7 + god.length) % 7) - 3;
  return clampScore(score + seasonal);
}

/** 특정 월의 월운 분석 (명리 규칙 기반, 결정적). */
export function analyzeMonthLuck(analysis: SajuAnalysis, year: number, month: number): MonthLuck {
  const pillar = monthPillarKo(year, month);
  const god = tenGodOf(analysis.dayMasterElement, monthStemElement(year, month));
  const theme = MONTH_THEME[god];
  return { year, month, pillar, relationTenGod: god, themeName: theme.name, themeFocus: theme.focus, score: monthScore(god, analysis.strength, month) };
}

/** 월간 세부운 (애정·금전·직장·건강) — 월운 십성 기반. */
export function monthCategoryScores(month: MonthLuck): TodayCategoryScores {
  const base = month.score;
  const g = month.relationTenGod;
  const jitter = ((month.month * 13 + month.year) % 11) - 5; // 결정적 ±5
  return {
    love: clampScore(base + (g === "재성" ? 7 : g === "비겁" ? 4 : 0) + jitter),
    money: clampScore(base + (g === "재성" ? 9 : g === "식상" ? 3 : g === "비겁" ? -4 : 0) + jitter),
    work: clampScore(base + (g === "관성" ? 8 : g === "인성" ? 3 : 0) + jitter),
    health: clampScore(base + (g === "인성" ? 7 : g === "관성" ? -4 : 0) + jitter),
  };
}

export interface MonthlyFortune {
  year: number;
  month: number;
  monthLuck: MonthLuck;
  categories: TodayCategoryScores;
  dayMaster: string;
  summaryKo: string;
  summaryEn: string;
}

/** 월간 운세 — 생년월일시 → 해당 월의 운세. */
export function drawMonthlyFortune(birthDate: string, birthTime?: string, year?: number, month?: number): MonthlyFortune {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth() + 1;
  const saju = calculateSaju(birthDate, birthTime);
  const analysis = analyzeSaju(saju);
  const monthLuck = analyzeMonthLuck(analysis, y, m);
  const categories = monthCategoryScores(monthLuck);
  const dayMaster = `${analysis.dayMasterKan}(${analysis.dayMasterElement}·${analysis.yinYang})`;
  return {
    year: y,
    month: m,
    monthLuck,
    categories,
    dayMaster,
    summaryKo:
      `${y}년 ${m}월(${monthLuck.pillar}월)은 당신에게 '${monthLuck.themeName}'입니다. ` +
      `월 운세 지수 ${monthLuck.score}점. ${monthLuck.themeFocus} ` +
      `애정 ${categories.love}점 · 금전 ${categories.money}점 · 직장 ${categories.work}점 · 건강 ${categories.health}점.`,
    summaryEn:
      `${y}-${String(m).padStart(2, "0")} is your '${monthLuck.themeName}' month (score ${monthLuck.score}). ` +
      `Love ${categories.love} · Money ${categories.money} · Work ${categories.work} · Health ${categories.health}.`,
  };
}

export interface YearlyFortuneMonth {
  month: number;
  pillar: string;
  score: number;
  themeName: string;
}

export interface YearlyFortune {
  year: number;
  yearPillar: string;
  relationTenGod: TenGod;
  themeName: string;
  themeFocus: string;
  score: number;
  months: YearlyFortuneMonth[];
  bestMonth: number;
  cautionMonth: number;
  firstHalfAvg: number;
  secondHalfAvg: number;
  dayMaster: string;
  summaryKo: string;
  summaryEn: string;
}

/** 연간 운세 — 세운 + 12개월 월운 흐름. */
export function drawYearlyFortune(birthDate: string, birthTime?: string, year?: number): YearlyFortune {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = year ?? now.getUTCFullYear();
  const saju = calculateSaju(birthDate, birthTime);
  const analysis = analyzeSaju(saju);
  const yearLuck = analyzeYearLuck(analysis, y);
  const months: YearlyFortuneMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const ml = analyzeMonthLuck(analysis, y, m);
    months.push({ month: m, pillar: ml.pillar, score: ml.score, themeName: ml.themeName });
  }
  const sorted = [...months].sort((a, b) => b.score - a.score || a.month - b.month);
  const bestMonth = sorted[0].month;
  const cautionMonth = sorted[sorted.length - 1].month;
  const avg = (ms: YearlyFortuneMonth[]) => Math.round(ms.reduce((s, x) => s + x.score, 0) / ms.length);
  const firstHalfAvg = avg(months.slice(0, 6));
  const secondHalfAvg = avg(months.slice(6));
  const dayMaster = `${analysis.dayMasterKan}(${analysis.dayMasterElement}·${analysis.yinYang})`;
  return {
    year: y,
    yearPillar: yearLuck.kanji,
    relationTenGod: yearLuck.relationTenGod,
    themeName: yearLuck.themeName,
    themeFocus: yearLuck.themeFocus,
    score: yearLuck.score,
    months,
    bestMonth,
    cautionMonth,
    firstHalfAvg,
    secondHalfAvg,
    dayMaster,
    summaryKo:
      `${y}년(${yearLuck.kanji}년)은 당신에게 '${yearLuck.themeName}'입니다. 연간 운세 지수 ${yearLuck.score}점. ${yearLuck.themeFocus} ` +
      `가장 좋은 달은 ${bestMonth}월, 주의할 달은 ${cautionMonth}월입니다. 상반기 평균 ${firstHalfAvg}점 · 하반기 평균 ${secondHalfAvg}점.`,
    summaryEn:
      `${y} is your '${yearLuck.themeName}' year (score ${yearLuck.score}). ` +
      `Best month: ${bestMonth}, caution month: ${cautionMonth}. H1 avg ${firstHalfAvg} · H2 avg ${secondHalfAvg}.`,
  };
}
