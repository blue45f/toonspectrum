/**
 * 운세 페이지 데이터 계약 — 운세 결과·사주·타로 타입과 탭 메타, 오행 표시 상수.
 * (2026-10-03 파일 크기 래칫 해소로 FortunePage에서 추출 — 동작 변경 없음.)
 */

import type { TarotSpreadId } from "@toonstudio/core/fortune";

import type { FortunePanel } from "./fortune-types";
import type { Title } from "@/shared/lib/types";

export interface Character {
  id: string;
  name: string;
  origin: string;
  greeting: string;
  avatarUrl: string;
}

export interface SajuPillar {
  kan: string;
  ji: string;
  kanKorean: string;
  jiKorean: string;
  elementKan: string;
  elementJi: string;
}

export interface SajuData {
  birthTimeKnown?: boolean;
  calculationNotes?: string[];
  yearPillar: SajuPillar;
  monthPillar: SajuPillar;
  dayPillar: SajuPillar;
  hourPillar: SajuPillar;
  elementsRatio: {
    wood: number;
    fire: number;
    earth: number;
    metal: number;
    water: number;
  };
}

export interface TarotCardData {
  id: number;
  name: string;
  nameEn: string;
  type: "upright" | "reversed";
  keywords: string[];
  description: string;
  positionMeaningKo?: string;
}

export interface TodayFortuneData {
  score: number;
  color: string;
  direction: string;
  time: string;
  luckyNumber: number;
}

// 백엔드 명리 분석(사주/오늘 일진/궁합) — 응답에 포함, 공유 카드·표시에 사용
export interface SajuAnalysisData {
  dayMasterKan: string;
  dayMasterElement: string;
  yinYang: string;
  strength: string;
  dominantTenGod: string;
  usefulElement: string;
  usefulElementEn: string;
  personality: string;
  summary: string;
}
export interface IljinData {
  todayPillar: string;
  relationTenGod: string;
  themeName: string;
  themeFocus: string;
  score: number;
}
export interface CompatData {
  score: number;
  grade: string;
  factors: string[];
  positives?: string[];
  cautions?: string[];
  elementComplement?: number;
}
export interface ZodiacData {
  id: string;
  ko: string;
  en: string;
  glyph: string;
  element: string;
  dateRange: string;
  traits: string[];
  ruling: string;
  score: number;
  luckyColor: string;
  luckyNumber: number;
}

export interface YearLuckData {
  year: number;
  kanji: string;
  relationTenGod: string;
  themeName: string;
  themeFocus: string;
  score: number;
}

export interface FortuneResult {
  interpretation: string;
  panels?: FortunePanel[];
  saju?: SajuData;
  yearLuck?: { thisYear: YearLuckData; nextYear: YearLuckData };
  mySaju?: SajuData;
  partnerSaju?: SajuData;
  card?: TarotCardData;
  cards?: (TarotCardData & { position?: string })[];
  spread?: TarotSpreadId;
  today?: TodayFortuneData;
  analysis?: SajuAnalysisData | null;
  iljin?: IljinData | null;
  categories?: { love: number; money: number; work: number; health: number } | null;
  compat?: CompatData;
  zodiac?: ZodiacData;
  luckyElement?: string | null;
  score?: number;
  query?: string;
  recommendations: Title[];
}

export type FortuneTab = "today" | "monthly" | "yearly" | "saju" | "compatibility" | "tarot" | "prescription" | "zodiac";

// 탭 메타데이터 단일 소스 — 라벨·히어로 영문·태그라인을 한 곳에서 관리.
// (기존 TAB_LABEL_KO + 탭 배열 + 헤더 삼항 체인을 대체)
export const FORTUNE_TAB_META: Record<FortuneTab, { labelKo: string; heroEn: string; taglineKo: string }> = {
  today: { labelKo: "오늘의 운세", heroEn: "TODAY'S ORACLE", taglineKo: "오늘 하루의 종합 운세 기운" },
  monthly: { labelKo: "월간 운세", heroEn: "MONTHLY ORACLE", taglineKo: "이번 달의 흐름과 테마" },
  yearly: { labelKo: "연간 운세", heroEn: "YEARLY ORACLE", taglineKo: "올해의 큰 흐름과 월별 운세" },
  zodiac: { labelKo: "별자리", heroEn: "ZODIAC HOROSCOPE", taglineKo: "생일로 보는 별자리 오늘의 운세" },
  saju: { labelKo: "사주팔자", heroEn: "SAJU MANSE", taglineKo: "생년월일 오행 밸런스 결과" },
  compatibility: { labelKo: "인연 궁합", heroEn: "RELATION COMPATIBILITY", taglineKo: "두 사람의 기운 융합 및 매칭 스코어" },
  prescription: { labelKo: "독서 처방", heroEn: "READING PRESCRIPTION", taglineKo: "당신의 고민을 위로해 줄 맞춤 추천 책장" },
  tarot: { labelKo: "타로 리딩", heroEn: "TAROT READING", taglineKo: "선택한 카드의 오늘 기운" },
};
export const FORTUNE_TAB_ORDER: FortuneTab[] = ["today", "monthly", "yearly", "zodiac", "saju", "compatibility", "prescription", "tarot"];

// 보관함 표시용 짧은 요약
export function fortuneSummary(tab: FortuneTab, r: FortuneResult): string {
  if (tab === "today" && r.today) return `오늘의 운세 ${r.today.score}점`;
  if (tab === "monthly") return "월간 운세";
  if (tab === "yearly") return "연간 운세";
  if (tab === "zodiac" && r.zodiac) return `${r.zodiac.ko} ${r.zodiac.score}점`;
  if (tab === "saju" && r.saju) return `사주 ${r.saju.dayPillar.kanKorean}${r.saju.dayPillar.jiKorean}일주`;
  if (tab === "compatibility" && r.compat) return `궁합 ${r.compat.score}%`;
  if (tab === "tarot" && r.card) return `타로 ${r.card.name}`;
  if (tab === "prescription") return "독서 처방";
  return "운세 결과";
}

// FORTUNE_TAB_META.labelKo로 대체됨 (단일 소스)

// 오행 영문키 → 한글 (오늘의 운세 개인화 표시용)
export const ELEMENT_KO: Record<string, string> = {
  wood: "목(木)", fire: "화(火)", earth: "토(土)", metal: "금(金)", water: "수(水)",
};

// 오행 색상 매핑 (ToonStudio 디자인 토큰을 활용한 프리미엄 컬러 세트)
export const ELEMENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "목": { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-500" },
  "화": { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-500" },
  "토": { bg: "bg-amber-600/10", text: "text-amber-500", dot: "bg-amber-600" },
  "금": { bg: "bg-slate-300/10", text: "text-slate-200", dot: "bg-slate-300" },
  "수": { bg: "bg-sky-500/10", text: "text-sky-400", dot: "bg-sky-500" },
};

// KST 기준 오늘 날짜 문자열 — 이벤트 핸들러에서만 호출 (렌더 경로 아님)
export function kstDateString(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
