import { fortuneKstDate, fortuneMonthDays, resolveFortuneBirth, shiftFortuneDate, solarTermsForYear } from "./fortune-calendar";
import { drawTarot, drawZodiac, seededRandom } from "./fortune-engine";
import { FORTUNE_EXPERIENCES, FORTUNE_DISCLAIMER, FORTUNE_ELEMENT_NAMES as ELEMENTS, FORTUNE_ELEMENT_TEXT as ELEMENT_TEXT, FORTUNE_ELEMENT_KEYS as ELEMENT_KEYS } from "./fortune-experiences";
import { fortuneTenGod, fortunePillarDetails, matchFortuneDream, fortuneLifeNumber, FORTUNE_PALETTES, FORTUNE_COOKIE_LINES } from "./fortune-symbols";
import { analyzeCompatibility, analyzeSaju } from "./saju-analysis";
import { calculateSaju, sajuPillarAt, SAJU_STEMS, SAJU_BRANCHES } from "./saju-utils";

import type { FortuneBirthInput } from "./fortune-calendar";
import type { FortuneSection } from "./fortune-symbols";
import type { SajuResult } from "./saju-utils";

export interface FortuneTrend { label: string; value: number; keyword: string; detail: string }
export interface FortuneReading {
  id: string; title: string; eyebrow: string; summary: string; generatedFor: string;
  sections: FortuneSection[]; notes: string[]; chart?: SajuResult; partnerChart?: SajuResult;
  score?: number; trend?: FortuneTrend[]; colors?: { name: string; hex: string }[];
  cards?: Awaited<ReturnType<typeof drawTarot>>["cards"];
  calendar?: ReturnType<typeof fortuneMonthDays>; terms?: ReturnType<typeof solarTermsForYear>;
}
export interface FortuneReadingInput {
  birth?: FortuneBirthInput; partner?: FortuneBirthInput; date?: string; month?: string;
  year?: number; question?: string; pick?: number; cycleDirection?: "forward" | "reverse";
}
function chartFrom(input?: FortuneBirthInput) {
  if (!input) throw new Error("생년월일을 입력해 주세요.");
  const resolved = resolveFortuneBirth(input);
  if (resolved.solarDate > fortuneKstDate()) throw new Error("출생일은 오늘 이후일 수 없어요.");
  return { ...resolved, chart: calculateSaju(resolved.solarDate, resolved.time, { dayBoundary: resolved.dayBoundary }) };
}
function dailyTheme(chart: SajuResult, date: string, salt = "") {
  const day = calculateSaju(date), god = fortuneTenGod(chart.dayPillar.kan, day.dayPillar.kan);
  const theme = ELEMENT_TEXT[ELEMENTS.indexOf(day.dayPillar.elementKan)];
  const rand = seededRandom(`${chart.dayPillar.kan}${chart.dayPillar.ji}:${date}:${salt}`);
  return { label: date.slice(5), value: 55 + Math.floor(rand() * 41), keyword: `${god} · ${theme.motif.split("·")[0]}`, detail: `${day.dayPillar.kanKorean}${day.dayPillar.jiKorean}일 · ${theme.action}` };
}
const DAILY_ACTIONS: Record<string, FortuneSection> = {
  romance: { title: "마음을 전하는 실천", body: "상대의 마음을 예측하기보다 대화할 수 있는 여지를 만들어 보세요.", items: ["고마웠던 장면을 구체적으로 한 가지 말하기", "답장을 재촉하지 않고 각자의 속도 존중하기"] },
  money: { title: "내 소비를 관찰하기", body: "가격·수익·당첨을 예측하지 않습니다. 재물운을 소비 습관을 돌아보는 질문으로 바꿔 보세요.", items: ["최근 결제 중 만족했던 항목 하나 기록하기", "예정에 없던 구매는 필요와 예산부터 확인하기"] },
  career: { title: "오늘의 업무 한 칸", body: "합격·승진·성과는 운세로 판정할 수 없어요. 실행할 수 있는 준비에 집중해 보세요.", items: ["가장 중요한 작업 한 개를 명확하게 정의하기", "도움이 필요한 지점을 동료에게 구체적으로 설명하기"] },
  study: { title: "배움의 작은 반복", body: "점수 예측 대신 오늘 배운 내용을 내 말로 정리해 보세요.", items: ["새로 배운 개념을 세 문장으로 설명하기", "이해하지 못한 지점에 질문 하나 남기기"] },
  creative: { title: "오늘 그릴 한 컷", body: "오행 키워드를 캐릭터·배경·대사 중 하나에 적용해 보세요.", items: ["대사 없이 감정이 전달되는 네모 한 칸 그리기", "같은 장소를 서로 다른 두 인물의 시선으로 그리기"] },
};
const MATCH_ACTIONS: Record<string, FortuneSection> = {
  "love-match": { title: "두 사람의 대화", body: "잘 맞는 정도가 관계의 미래를 정하지는 않아요. 점수보다 실제로 나누는 대화가 중요합니다.", items: ["연락 빈도와 혼자 있는 시간에 대한 기대 말하기", "갈등할 때 쉬어 가는 신호 함께 정하기"] },
  "friend-match": { title: "우정을 오래 이어 가는 약속", body: "취향이 달라도 함께 즐거울 수 있어요. 차이를 서열로 바꾸지 마세요.", items: ["번갈아 좋아하는 활동 제안하기", "거절해도 부담 없는 초대 방식 정하기"] },
  "family-match": { title: "가까울수록 지켜 주는 경계", body: "가족이라는 이유로 성향이나 역할을 단정하지 않습니다.", items: ["서로에게 필요한 휴식과 사생활 물어보기", "도움을 주기 전에 어떤 도움이 필요한지 확인하기"] },
  "team-match": { title: "창작 파트너의 협업 약속", body: "채용이나 팀 배정을 위한 검사가 아닙니다. 작업 방식에 관한 대화 카드로 활용하세요.", items: ["초안·검토·완료의 기준을 함께 적기", "피드백 시점과 파일 관리 규칙 합의하기"] },
};
export async function buildFortuneReading(id: string, input: FortuneReadingInput = {}): Promise<FortuneReading> {
  const experience = FORTUNE_EXPERIENCES.find((item) => item.id === id);
  if (!experience) throw new Error("지원하지 않는 운세 콘텐츠입니다.");
  const date = resolveFortuneBirth({ date: input.date ?? fortuneKstDate() }).solarDate;
  const year = input.year ?? Number(date.slice(0, 4)), pick = input.pick ?? 0;
  if (!Number.isInteger(year) || year < 1900 || year > 2050) throw new Error("조회 연도는 1900~2050년입니다.");
  if (!Number.isInteger(pick) || pick < 0 || pick > 21) throw new Error("카드 선택을 확인해 주세요.");
  const reading: FortuneReading = { id, title: experience.title, eyebrow: experience.tag, generatedFor: date, summary: "", sections: [], notes: [FORTUNE_DISCLAIMER] };
  if (experience.input === "calendar") {
    const month = input.month ?? date.slice(0, 7);
    reading.summary = id === "almanac" ? "날짜를 누르면 음력·일진·절기 정보를 자세히 볼 수 있어요." : "절기는 달력 날짜가 아닌 태양의 위치를 기준으로 구분한 계절의 경계입니다.";
    if (id === "almanac") reading.calendar = fortuneMonthDays(month);
    reading.terms = solarTermsForYear(id === "almanac" ? Number(month.slice(0, 4)) : year);
    reading.notes.push("한국 음력과 절기 천문 계산은 별도 엔진을 사용합니다. 표시는 한국 표준시(UTC+09:00), 공휴일 달력은 아닙니다."); return reading;
  }
  if (id === "dream") {
    reading.summary = "길몽·흉몽을 판정하는 대신, 기억에 남은 장면을 창작과 자기성찰의 소재로 읽어 보세요.";
    reading.sections = matchFortuneDream(input.question ?? "");
    reading.notes.push("입력 문장은 서버로 전송하지 않습니다. 상징별 편집 콘텐츠이며 꿈의 원인·정신건강을 진단하지 않습니다."); return reading;
  }
  if (id.startsWith("tarot")) {
    const result = await drawTarot([], "leona", pick, id === "tarot-three" ? "three" : "one");
    reading.cards = result.cards;
    reading.summary = id === "tarot-three" ? "세 장의 상징을 연결해 나만의 이야기를 만들어 보세요." : "직접 고른 카드의 상징에서 오늘 생각해 볼 질문을 찾아보세요.";
    reading.sections = result.cards.map((card) => ({ title: `${card.position} · ${card.name}`, body: card.description, items: [...card.keywords, card.type === "upright" ? "정방향: 익숙한 강점을 떠올려 보세요." : "역방향: 다른 관점에서 다시 읽어 보세요."] }));
    reading.notes.push("22장 메이저 아르카나의 상징 해석입니다. 같은 날·같은 선택은 같은 결과이며 세 장은 중복되지 않습니다. 미래 카드도 실제 예언이 아닙니다."); return reading;
  }
  if (experience.input === "none") {
    const rand = seededRandom(`${id}:${date}:${pick}`);
    reading.summary = FORTUNE_COOKIE_LINES[Math.floor(rand() * FORTUNE_COOKIE_LINES.length)];
    if (id === "lucky") {
      reading.colors = FORTUNE_PALETTES[Math.floor(rand() * FORTUNE_PALETTES.length)];
      reading.summary = "오늘의 창작 팔레트. 색에 정해진 운명은 없지만, 새로운 조합은 장면의 분위기를 바꿔 줍니다.";
      reading.sections.push({ title: `오늘의 상징 숫자 · ${1 + Math.floor(rand() * 9)}`, body: "이 숫자만큼 작은 사물을 그려 보세요. 복권·당첨 번호가 아닙니다." });
    } else reading.sections.push({ title: id === "rest" ? "잠깐의 쉼표" : "오늘의 작은 도전", body: id === "rest" ? "지금 느끼는 감정을 한 단어로 적고, 당장 하지 않아도 되는 일 하나를 골라 보세요." : "주변의 사물 하나를 골라 이름과 한 줄의 이야기를 붙여 보세요." });
    return reading;
  }
  const own = chartFrom(input.birth), chart = own.chart;
  reading.chart = chart; reading.notes.push(...(chart.calculationNotes ?? []));
  reading.eyebrow = `${chart.dayPillar.kanKorean}${chart.dayPillar.jiKorean}일주 · ${chart.birthTimeKnown ? "8글자" : "6글자·시간 미상"}`;
  const analysis = analyzeSaju(chart);
  if (experience.input === "pair") {
    const partner = chartFrom(input.partner); reading.partnerChart = partner.chart;
    const compat = analyzeCompatibility(chart, partner.chart);
    reading.score = compat.score; reading.summary = "서로의 비슷한 결을 발견하고, 다른 점은 대화의 주제로 바꿔 보세요.";
    reading.sections = [{ title: "함께 살펴볼 연결점", body: "일간·일지·연지·겉글자 오행의 전통적 관계를 비교합니다.", items: compat.positives }, { title: "조율의 힌트", body: "상극·충은 불행이나 관계 실패를 뜻하지 않습니다.", items: compat.cautions.length ? compat.cautions : ["상대가 중요하게 여기는 것을 먼저 물어보세요."] }, MATCH_ACTIONS[id]];
    reading.notes.push(...(partner.chart.calculationNotes ?? []).map((note) => `상대: ${note}`), "지수는 단순 규칙으로 만든 참고값이며 실제 궁합의 확률이나 정확도를 뜻하지 않습니다."); return reading;
  }
  if (["saju", "elements", "ten-gods"].includes(id)) {
    reading.summary = analysis.personality;
    reading.sections = fortunePillarDetails(chart).filter((p) => p.pillar.kan).map((p) => ({ title: `${p.label} · ${p.pillar.kan}${p.pillar.ji} · ${p.tenGod}`, body: `${p.pillar.elementKan}의 천간과 ${p.pillar.elementJi}의 지지.`, items: [`지장간 참고: ${p.hidden}`] }));
    reading.sections.push({ title: "오행을 창작 언어로 바꾸기", body: "오행은 많고 적음의 우열이 아니라 서로 다른 이미지의 어휘로 읽어 보세요.", items: ELEMENT_KEYS.map((key, i) => `${ELEMENTS[i]} ${chart.elementsRatio[key]}% · ${ELEMENT_TEXT[i].motif} — ${ELEMENT_TEXT[i].action}`) });
    reading.notes.push("십성은 일간 대비 천간의 오행·음양으로 계산합니다. 지장간은 일반적인 배열의 한 가지이며 시간 가중·조후·격국·신살·용신 확정은 제공하지 않습니다."); return reading;
  }
  if (id === "cycles") {
    const direction = input.cycleDirection ?? "forward";
    if (!["forward", "reverse"].includes(direction)) throw new Error("대운 순행·역행을 선택해 주세요.");
    const born = new Date(`${own.solarDate}T${own.time ?? "12:00"}:00+09:00`).getTime(), y = Number(own.solarDate.slice(0, 4));
    const terms = [y - 1, y, y + 1].flatMap((v) => [...solarTermsForYear(v)]).filter((t) => t.isMonthBoundary);
    const term = direction === "forward" ? terms.find((t) => t.timestamp >= born) : terms.filter((t) => t.timestamp <= born).at(-1);
    if (!term) throw new Error("대운 시작 절기를 계산하지 못했어요.");
    const startAge = Math.round(Math.abs(term.timestamp - born) / 86_400_000 / 3 * 10) / 10, sign = direction === "forward" ? 1 : -1;
    const stem = SAJU_STEMS.indexOf(chart.monthPillar.kan), branch = SAJU_BRANCHES.indexOf(chart.monthPillar.ji);
    reading.summary = `${direction === "forward" ? "순행" : "역행"} · ${term.name}까지의 간격을 3일=1년으로 환산한 시작 나이 약 ${startAge}세.`;
    reading.sections = Array.from({ length: 8 }, (_, i) => { const pillar = sajuPillarAt(stem + sign * (i + 1), branch + sign * (i + 1)); return { title: `약 ${(startAge + i * 10).toFixed(1)}~${(startAge + (i + 1) * 10).toFixed(1)}세 · ${pillar.kan}${pillar.ji}`, body: `${pillar.kanKorean}${pillar.jiKorean} 대운 · ${fortuneTenGod(chart.dayPillar.kan, pillar.kan)}의 상징`, items: [ELEMENT_TEXT[ELEMENTS.indexOf(pillar.elementKan)].action] }; });
    reading.notes.push("성별을 수집·추정하지 않고 순행·역행을 직접 선택합니다. 방향을 자동 판정한 결과가 아닙니다. 절기 간격 환산의 근사 나이이며 실제 사건을 예측하지 않습니다."); return reading;
  }
  if (id === "numerology") {
    const n = fortuneLifeNumber(own.solarDate);
    const names: Record<number, string> = { 1: "시작과 독립", 2: "조화와 동행", 3: "표현과 놀이", 4: "기반과 성실", 5: "탐험과 변화", 6: "돌봄과 책임", 7: "탐구와 사색", 8: "조율과 실행", 9: "공감과 나눔", 11: "영감과 감수성", 22: "구상과 실현", 33: "배려와 표현" };
    reading.summary = `라이프 패스 ${n.number} · ${names[n.number]}`;
    reading.sections = [{ title: "계산을 따라가기", body: "양력 생일의 모든 숫자를 더하고 한 자리 또는 11·22·33이 될 때까지 줄입니다.", items: n.steps }, { title: "나에게 던지는 질문", body: `오늘의 일상에서 '${names[n.number]}'을 떠올리게 한 장면이 있었나요?` }];
    reading.notes.push("수비학은 상징 놀이이며 능력·성격·운명을 판정하는 검사가 아닙니다."); return reading;
  }
  if (id === "animal") {
    const animals = ["쥐", "소", "호랑이", "토끼", "용", "뱀", "말", "양", "원숭이", "닭", "개", "돼지"], idx = SAJU_BRANCHES.indexOf(chart.yearPillar.ji);
    reading.summary = `${animals[idx]}띠 · ${chart.yearPillar.kan}${chart.yearPillar.ji}년의 상징`;
    reading.sections = [{ title: "띠를 읽는 기준", body: "입춘 절입 시각을 사용합니다. 음력 설날이나 양력 1월 1일 기준의 생활 띠와 다를 수 있어요." }, { title: "캐릭터로 상상하기", body: `${animals[idx]}의 움직임을 관찰하고 '${ELEMENT_TEXT[ELEMENTS.indexOf(chart.yearPillar.elementKan)].motif}' 중 하나를 성격 키워드로 붙여 보세요.` }]; return reading;
  }
  if (id === "zodiac") {
    const [, month, day] = own.solarDate.split("-").map(Number), result = await drawZodiac([], "leona", month, day);
    reading.summary = `${result.zodiac.glyph} ${result.zodiac.ko} · ${result.zodiac.dateRange}`;
    reading.sections = [{ title: "별자리의 상징", body: result.zodiac.traits.join(" · "), items: [`원소: ${result.zodiac.element}`, `상징 천체: ${result.zodiac.ruling}`] }, { title: "오늘의 관찰", body: "키워드 중 내 모습과 닮은 것과 다른 것을 하나씩 골라 보세요. 다름도 좋은 발견이에요." }];
    reading.notes.push("일반적인 월·일 경계의 태양 별자리입니다. 출생지·천체 경계 시각·상승궁·달 별자리를 계산한 출생 차트가 아닙니다."); return reading;
  }
  const dates = id === "yearly" ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-15`) : id === "monthly" ? fortuneMonthDays(input.month ?? date.slice(0, 7)).map((d) => d.date) : id === "weekly" ? Array.from({ length: 7 }, (_, i) => shiftFortuneDate(date, i)) : [id === "tomorrow" ? shiftFortuneDate(date, 1) : date];
  reading.trend = dates.map((d) => dailyTheme(chart, d, id));
  reading.summary = id === "yearly" ? `${year}년 열두 달의 상징을 기록하며 나만의 계획을 세워 보세요.` : id === "weekly" ? "조회일부터 일곱 날의 키워드입니다. 높낮이보다 각 날의 질문을 살펴보세요." : id === "monthly" ? "한 달의 일진을 창작과 일상 계획의 질문으로 바꿔 보세요." : reading.trend[0].detail;
  reading.sections = [DAILY_ACTIONS[id] ?? { title: "오늘의 실천", body: reading.trend[0].detail, items: ["가장 기억에 남은 순간을 짧게 기록해 보세요.", "예측과 비교하기보다 내가 한 선택과 느낌을 적어 보세요."] }];
  reading.notes.push("그래프는 일진 키워드와 날짜별 시드로 구성한 콘텐츠 지수입니다. 통계·확률·길일 판정이 아닙니다. 연간 보기의 월별 키워드는 매월 15일 일진을 대표로 사용하며 전통 월운 계산과 다릅니다."); return reading;
}
export function fortuneReadingText(reading: FortuneReading): string {
  // Public export excludes dates of birth, times, dream text, charts and numerology derivation.
  const sections = reading.id === "numerology" ? reading.sections.filter((s) => s.title !== "계산을 따라가기") : reading.sections;
  return ["ToonStudio 운세 관측소", reading.title, `조회일 ${reading.generatedFor}`, reading.summary, ...sections.flatMap((s) => [s.title, s.body, ...(s.items ?? [])]), FORTUNE_DISCLAIMER].join("\n\n");
}
