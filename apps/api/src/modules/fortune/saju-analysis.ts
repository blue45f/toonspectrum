// apps/api/src/modules/fortune/saju-analysis.ts
//
// 사주(명리) 해석 로직. calculateSaju가 뽑은 사주 원국(8글자)을 바탕으로
// 일간(日干) 중심의 십성(十星)·신강신약·용신·성격, 그리고 오늘의 일진(日辰)
// 대비 운세, 두 사람의 궁합(일간 합충·지지 합충·오행 상생상극)을 계산한다.
// 난수가 아니라 명리 규칙에 기반하므로 같은 입력은 항상 같은 해석을 돌려준다.

import { calculateSaju, SajuResult } from "./saju-utils";

// 오행 한글
type Element = "목" | "화" | "토" | "금" | "수";

// 상생(생): 목→화→토→금→수→목
const SHENG: Record<Element, Element> = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
// 상극(극): 목→토, 토→수, 수→화, 화→금, 금→목
const KE: Record<Element, Element> = { 목: "토", 토: "수", 수: "화", 화: "금", 금: "목" };
// 나를 생하는 오행(인성) = SHENG의 역
const SHENG_INV: Record<Element, Element> = { 화: "목", 토: "화", 금: "토", 수: "금", 목: "수" };

const ELEMENT_EN: Record<Element, "wood" | "fire" | "earth" | "metal" | "water"> = {
  목: "wood", 화: "fire", 토: "earth", 금: "metal", 수: "water",
};

// 천간 음양 (양간 / 음간)
const YANG_KAN = new Set(["갑", "병", "무", "경", "임"]);

// 일간(천간) 성격 키워드
const DAY_MASTER_TRAIT: Record<string, string> = {
  갑: "곧고 진취적인 큰 나무. 리더십과 추진력이 강하고 명분을 중시한다",
  을: "유연하고 섬세한 화초. 적응력과 부드러운 끈기로 사람을 끌어안는다",
  병: "밝고 정열적인 태양. 표현력이 풍부하고 화통하며 주변을 밝힌다",
  정: "따뜻하고 은은한 촛불. 헌신적이고 세심하며 속정이 깊다",
  무: "듬직한 큰 산. 포용력과 신뢰가 두텁고 중심을 잡아준다",
  기: "자상한 기름진 땅. 실속 있고 다재다능하며 살림이 야무지다",
  경: "강직한 무쇠. 결단력과 의리가 있고 추진력이 시원하다",
  신: "예리한 보석. 세련되고 완벽주의이며 감각이 빼어나다",
  임: "지혜로운 큰 물. 그릇이 크고 포용적이며 유유히 흐른다",
  계: "총명한 이슬비. 직관과 감수성이 풍부하고 스며들 듯 영민하다",
};

export type TenGod = "비겁" | "식상" | "재성" | "관성" | "인성";

function tenGod(day: Element, other: Element): TenGod {
  if (other === day) return "비겁";
  if (SHENG[day] === other) return "식상"; // 일간이 생함
  if (KE[day] === other) return "재성"; // 일간이 극함
  if (KE[other] === day) return "관성"; // 타가 일간을 극함
  if (SHENG[other] === day) return "인성"; // 타가 일간을 생함
  return "비겁";
}

export interface SajuAnalysis {
  dayMasterKan: string; // 일간 천간(한글)
  dayMasterElement: Element; // 일간 오행
  yinYang: "양" | "음";
  tenGodCounts: Record<TenGod, number>;
  dominantTenGod: TenGod;
  strength: "신강" | "중화" | "신약";
  usefulElement: Element; // 용신(보완하면 좋은 오행)
  usefulElementEn: "wood" | "fire" | "earth" | "metal" | "water";
  personality: string;
  summary: string;
}

function allElements(saju: SajuResult): Element[] {
  const pillars = [saju.yearPillar, saju.monthPillar, saju.dayPillar, saju.hourPillar];
  const els: Element[] = [];
  for (const p of pillars) {
    els.push(p.elementKan as Element, p.elementJi as Element);
  }
  return els;
}

export function analyzeSaju(saju: SajuResult): SajuAnalysis {
  const dayKan = saju.dayPillar.kanKorean;
  const dayEl = saju.dayPillar.elementKan as Element;
  const yinYang: "양" | "음" = YANG_KAN.has(dayKan) ? "양" : "음";

  const counts: Record<TenGod, number> = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  for (const el of allElements(saju)) counts[tenGod(dayEl, el)] += 1;

  // 신강/신약: 아군(비겁+인성) 비율
  const ally = counts.비겁 + counts.인성; // 8글자 중
  const strength: SajuAnalysis["strength"] = ally >= 5 ? "신강" : ally <= 3 ? "신약" : "중화";

  // 용신: 신강이면 기운을 빼는 식상, 신약이면 북돋는 인성, 중화면 가장 약한 오행
  let useful: Element;
  if (strength === "신강") useful = SHENG[dayEl];
  else if (strength === "신약") useful = SHENG_INV[dayEl];
  else {
    const r = saju.elementsRatio;
    const entries: Array<[Element, number]> = [
      ["목", r.wood], ["화", r.fire], ["토", r.earth], ["금", r.metal], ["수", r.water],
    ];
    useful = entries.reduce((a, b) => (b[1] < a[1] ? b : a), entries[0])[0];
  }

  const tenGodKeys = Object.keys(counts) as TenGod[];
  const dominantTenGod = tenGodKeys.reduce((a, b) => (counts[b] > counts[a] ? b : a), tenGodKeys[0]);

  const personality = DAY_MASTER_TRAIT[dayKan] ?? "고유한 기운을 지닌 일간";
  const summary =
    `일간 ${dayKan}(${dayEl}·${yinYang}), ${strength} 사주. ` +
    `${dominantTenGod}이 두드러지고, 보완하면 좋은 기운은 ${useful}(${ELEMENT_EN[useful]})입니다.`;

  return {
    dayMasterKan: dayKan,
    dayMasterElement: dayEl,
    yinYang,
    tenGodCounts: counts,
    dominantTenGod,
    strength,
    usefulElement: useful,
    usefulElementEn: ELEMENT_EN[useful],
    personality,
    summary,
  };
}

// ── 오늘의 운세: 내 일간 vs 오늘의 일진 ──────────────────────────────
const TODAY_THEME: Record<TenGod, { name: string; focus: string }> = {
  비겁: { name: "동료·경쟁운", focus: "협력과 경쟁이 교차하는 날. 큰 지출과 구설은 한 박자 늦추세요." },
  식상: { name: "표현·활동운", focus: "재능과 표현이 빛나는 날. 새 시도·창작·즐거운 만남에 길합니다." },
  재성: { name: "재물·애정운", focus: "재물과 인연의 기운이 드는 날. 거래·만남·고백에 좋은 흐름." },
  관성: { name: "직장·명예운", focus: "책임과 평가의 날. 시험·면접·승진 등 공적인 일에 집중하세요." },
  인성: { name: "학업·귀인운", focus: "배움과 문서, 귀인의 도움이 드는 날. 계약·공부·상담에 길합니다." },
};

export interface TodayIljinAnalysis {
  todayPillar: string; // 오늘 일주(간지) 한글
  relationTenGod: TenGod;
  themeName: string;
  themeFocus: string;
  score: number; // 명리 기반 점수(55~98)
}

// KST 기준 오늘 날짜 (YYYY-MM-DD)
function todayKstDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function analyzeTodayByIljin(analysis: SajuAnalysis): TodayIljinAnalysis {
  const todaySaju = calculateSaju(todayKstDateString());
  const todayEl = todaySaju.dayPillar.elementKan as Element;
  const god = tenGod(analysis.dayMasterElement, todayEl);

  let score = 72;
  if (god === "인성") score += 10;
  else if (god === "재성") score += 8;
  else if (god === "식상") score += 4;
  else if (god === "관성") score -= 6;

  if (analysis.strength === "신약" && (god === "인성" || god === "비겁")) score += 8;
  if (analysis.strength === "신강" && (god === "식상" || god === "재성" || god === "관성")) score += 8;
  if (analysis.strength === "신약" && (god === "식상" || god === "재성" || god === "관성")) score -= 4;
  if (analysis.strength === "신강" && (god === "비겁" || god === "인성")) score -= 4;

  score = Math.max(55, Math.min(98, score));
  const theme = TODAY_THEME[god];

  return {
    todayPillar: `${todaySaju.dayPillar.kanKorean}${todaySaju.dayPillar.jiKorean}`,
    relationTenGod: god,
    themeName: theme.name,
    themeFocus: theme.focus,
    score,
  };
}

// 오늘의 세부운(애정·금전·직장·건강) — 일진 십성 기반 가중 + 약간의 시드 변주.
// 명리적으로 재성=재물·애정, 관성=직장, 인성=건강·회복에 영향.
export interface TodayCategoryScores {
  love: number;
  money: number;
  work: number;
  health: number;
}

export function todayCategoryScores(
  iljin: TodayIljinAnalysis,
  rand: () => number
): TodayCategoryScores {
  const base = iljin.score;
  const g = iljin.relationTenGod;
  const jitter = () => Math.round((rand() - 0.5) * 10); // ±5
  const clamp = (n: number) => Math.max(55, Math.min(98, Math.round(n)));
  return {
    love: clamp(base + (g === "재성" ? 8 : g === "비겁" ? 5 : g === "관성" ? -3 : 0) + jitter()),
    money: clamp(base + (g === "재성" ? 10 : g === "식상" ? 4 : g === "비겁" ? -4 : 0) + jitter()),
    work: clamp(base + (g === "관성" ? 9 : g === "인성" ? 4 : g === "식상" ? -2 : 0) + jitter()),
    health: clamp(base + (g === "인성" ? 8 : g === "비겁" ? 4 : g === "관성" ? -5 : 0) + jitter()),
  };
}

// ── 세운(歲運): 그 해 간지 vs 내 일간 — 올해/내년의 운세 ────────────────
const YEAR_KANS_KO = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const YEAR_JIS_KO = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
const YEAR_KAN_EL: Record<string, Element> = {
  갑: "목", 을: "목", 병: "화", 정: "화", 무: "토", 기: "토", 경: "금", 신: "금", 임: "수", 계: "수",
};
const YEAR_THEME: Record<TenGod, { name: string; focus: string }> = {
  비겁: { name: "독립·동료의 해", focus: "내 힘으로 밀어붙이는 한 해. 동업·협력과 지출 관리가 관건이에요." },
  식상: { name: "표현·결실의 해", focus: "재능과 활동이 꽃피는 해. 새 도전·창작에 좋은 흐름이에요." },
  재성: { name: "재물·인연의 해", focus: "재물과 인연이 넓어지는 해. 거래·연애·결혼에 길합니다." },
  관성: { name: "성취·명예의 해", focus: "승진·시험·자리가 오르는 해. 책임과 평판 관리가 중요해요." },
  인성: { name: "배움·귀인의 해", focus: "공부·자격·문서, 귀인의 도움이 드는 해입니다." },
};

export interface YearLuck {
  year: number;
  kanji: string;
  relationTenGod: TenGod;
  themeName: string;
  themeFocus: string;
  score: number;
}

export function analyzeYearLuck(analysis: SajuAnalysis, year: number): YearLuck {
  const ki = (((year - 4) % 10) + 10) % 10;
  const ji = (((year - 4) % 12) + 12) % 12;
  const kanKo = YEAR_KANS_KO[ki];
  const jiKo = YEAR_JIS_KO[ji];
  const god = tenGod(analysis.dayMasterElement, YEAR_KAN_EL[kanKo]);

  let score = 72;
  if (god === "인성") score += 9;
  else if (god === "재성") score += 8;
  else if (god === "식상") score += 4;
  else if (god === "관성") score += 2;
  if (analysis.strength === "신약" && (god === "인성" || god === "비겁")) score += 7;
  if (analysis.strength === "신강" && (god === "식상" || god === "재성" || god === "관성")) score += 7;
  score = Math.max(58, Math.min(96, score));

  const t = YEAR_THEME[god];
  return { year, kanji: `${kanKo}${jiKo}`, relationTenGod: god, themeName: t.name, themeFocus: t.focus, score };
}

// ── 궁합: 일간 합충 · 지지 합충 · 오행 상생상극 ──────────────────────
const KAN_HE: Record<string, string> = {
  갑: "기", 기: "갑", 을: "경", 경: "을", 병: "신", 신: "병", 정: "임", 임: "정", 무: "계", 계: "무",
};
const KAN_CHUNG: Record<string, string> = {
  갑: "경", 경: "갑", 을: "신", 신: "을", 병: "임", 임: "병", 정: "계", 계: "정",
};
const JI_LIUHE: Record<string, string> = {
  자: "축", 축: "자", 인: "해", 해: "인", 묘: "술", 술: "묘", 진: "유", 유: "진", 사: "신", 신: "사", 오: "미", 미: "오",
};
const JI_CHUNG: Record<string, string> = {
  자: "오", 오: "자", 축: "미", 미: "축", 인: "신", 신: "인", 묘: "유", 유: "묘", 진: "술", 술: "진", 사: "해", 해: "사",
};
const SANHE_GROUPS = [
  ["신", "자", "진"], // 水
  ["인", "오", "술"], // 火
  ["사", "유", "축"], // 金
  ["해", "묘", "미"], // 木
];
const XING_GROUPS = [
  ["인", "사", "신"], // 삼형
  ["축", "술", "미"], // 삼형
  ["자", "묘"], // 무례지형
];

function inSameGroup(groups: string[][], a: string, b: string): boolean {
  return groups.some((g) => g.includes(a) && g.includes(b));
}

export interface CompatibilityAnalysis {
  score: number;
  grade: string;
  factors: string[]; // 긍정+주의 통합(하위호환)
  positives: string[]; // 잘 맞는 점
  cautions: string[]; // 조율이 필요한 점
  elementComplement: number; // 오행 보완 점수(0~100): 서로의 약한 오행을 채워주는 정도
}

// 지지 한 쌍의 관계 → 점수 가감 + 한 줄 근거(긍정/주의)
function jiRelation(x: string, y: string, label: string): { delta: number; positive?: string; caution?: string } {
  if (x === y) return { delta: 2, positive: `${label} ${x}·${y} 동일 — 비슷한 결` };
  if (JI_LIUHE[x] === y) return { delta: 9, positive: `${label} ${x}·${y} 육합(六合) — 편안한 결합` };
  if (inSameGroup(SANHE_GROUPS, x, y)) return { delta: 7, positive: `${label} 삼합(三合) — 뜻이 잘 맞는 인연` };
  if (JI_CHUNG[x] === y) return { delta: -7, caution: `${label} 충(沖) — 변화·이동수, 속도 조율` };
  if (inSameGroup(XING_GROUPS, x, y)) return { delta: -4, caution: `${label} 형(刑) — 사소한 마찰, 배려 필요` };
  return { delta: 0 };
}

export function analyzeCompatibility(mine: SajuResult, partner: SajuResult): CompatibilityAnalysis {
  const a = mine.dayPillar;
  const b = partner.dayPillar;
  let score = 60;
  const positives: string[] = [];
  const cautions: string[] = [];

  // 일간 합/충
  if (KAN_HE[a.kanKorean] === b.kanKorean) {
    score += 14;
    positives.push(`일간 ${a.kanKorean}·${b.kanKorean} 천간합(天干合) — 끌림과 보완의 인연`);
  } else if (KAN_CHUNG[a.kanKorean] === b.kanKorean) {
    score -= 8;
    cautions.push(`일간 천간충(天干沖) — 강한 자극과 긴장, 조율 필요`);
  }

  // 일지(배우자궁) + 연지(띠) 합충
  for (const rel of [
    jiRelation(a.jiKorean, b.jiKorean, "일지(궁합궁)"),
    jiRelation(mine.yearPillar.jiKorean, partner.yearPillar.jiKorean, "띠(연지)"),
  ]) {
    score += rel.delta;
    if (rel.positive) positives.push(rel.positive);
    if (rel.caution) cautions.push(rel.caution);
  }

  // 일간 오행 상생상극
  const ea = a.elementKan as Element;
  const eb = b.elementKan as Element;
  if (ea === eb) {
    score += 4;
    positives.push(`같은 ${ea} 오행 — 결이 닮아 편안함`);
  } else if (SHENG[ea] === eb || SHENG[eb] === ea) {
    score += 8;
    positives.push(`오행 상생(相生) — 서로를 북돋아 주는 기운`);
  } else if (KE[ea] === eb || KE[eb] === ea) {
    score -= 4;
    cautions.push(`오행 상극(相剋) — 끌리지만 자기주장 조율 필요`);
  }

  // 오행 보완 — 서로의 약한 오행(20% 미만)을 상대가 강하게(25% 이상) 채워주는 정도
  const elements: Array<keyof SajuResult["elementsRatio"]> = ["wood", "fire", "earth", "metal", "water"];
  let complementHits = 0;
  for (const el of elements) {
    if (mine.elementsRatio[el] < 20 && partner.elementsRatio[el] >= 25) complementHits += 1;
    if (partner.elementsRatio[el] < 20 && mine.elementsRatio[el] >= 25) complementHits += 1;
  }
  const elementComplement = Math.min(100, 40 + complementHits * 14);
  score += complementHits * 3;
  if (complementHits >= 2) positives.push(`오행 보완 — 서로의 부족한 기운을 ${complementHits}곳에서 채워줌`);

  score = Math.max(45, Math.min(98, Math.round(score)));
  const grade =
    score >= 90 ? "천생연분" :
    score >= 80 ? "찰떡궁합" :
    score >= 70 ? "서로 채워주는 좋은 인연" :
    score >= 60 ? "노력으로 빛나는 인연" :
    "유연한 소통이 필요한 인연";

  if (positives.length === 0) positives.push("무난하고 담백한 거리감의 인연");

  return { score, grade, factors: [...positives, ...cautions], positives, cautions, elementComplement };
}
