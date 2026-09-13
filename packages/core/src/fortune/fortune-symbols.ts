import { resolveFortuneBirth } from "./fortune-calendar";
import { SAJU_STEMS } from "./saju-utils";

import type { SajuResult } from "./saju-utils";

export interface FortuneSection { title: string; body: string; items?: string[] }
const HIDDEN_STEMS: Record<string, string> = { 子: "癸", 丑: "己癸辛", 寅: "甲丙戊", 卯: "乙", 辰: "戊乙癸", 巳: "丙戊庚", 午: "丁己", 未: "己丁乙", 申: "庚壬戊", 酉: "辛", 戌: "戊辛丁", 亥: "壬甲" };
export function fortuneTenGod(day: string, other: string): string {
  const a = SAJU_STEMS.indexOf(day), b = SAJU_STEMS.indexOf(other);
  if (a < 0 || b < 0 || day.length !== 1 || other.length !== 1) throw new Error("십성을 계산할 천간을 확인해 주세요.");
  const relation = (Math.floor(b / 2) - Math.floor(a / 2) + 5) % 5;
  return [["비견", "겁재"], ["식신", "상관"], ["편재", "정재"], ["편관", "정관"], ["편인", "정인"]][relation][a % 2 === b % 2 ? 0 : 1];
}
export function fortunePillarDetails(chart: SajuResult) {
  return [chart.yearPillar, chart.monthPillar, chart.dayPillar, chart.hourPillar].map((p, i) => ({
    label: ["년주", "월주", "일주", "시주"][i], pillar: p,
    tenGod: p.kan ? i === 2 ? "일간·나" : fortuneTenGod(chart.dayPillar.kan, p.kan) : "시간 미상",
    hidden: [...(HIDDEN_STEMS[p.ji] ?? "")].map((kan) => `${kan}(${fortuneTenGod(chart.dayPillar.kan, kan)})`).join(" · "),
  }));
}
const DREAMS = [
  { words: ["물", "바다", "강", "파도", "수영"], name: "물과 흐름", meaning: "변화하는 감정이나 새로운 환경을 떠올리는 상징", prompt: "물의 색과 속도, 그 안에서 느낀 감정을 적어 보세요." },
  { words: ["날아", "날았", "비행", "하늘", "날개"], name: "날아오르기", meaning: "자유·해방감 또는 새로운 시야를 떠올리는 상징", prompt: "어디로 향했는지 떠올리며 그 장소를 한 컷 그려 보세요." },
  { words: ["쫓", "도망", "달리"], name: "추격과 달리기", meaning: "미뤄 둔 일이나 속도에 대한 느낌을 돌아보는 장면", prompt: "쫓는 대상보다 내 반응과 원하는 거리를 적어 보세요." },
  { words: ["집", "방", "문", "계단"], name: "집과 문", meaning: "익숙한 공간·경계·새로운 선택을 연결해 보는 상징", prompt: "문 뒤에 무엇이 있었으면 좋겠는지 상상해 보세요." },
  { words: ["고양이", "강아지", "개가", "동물"], name: "동물과의 만남", meaning: "호기심·친밀감·독립성을 연상하는 이야기 소재", prompt: "동물의 행동을 사람 캐릭터의 성격으로 바꿔 보세요." },
  { words: ["뱀", "용", "호랑이"], name: "강렬한 존재", meaning: "힘·변신·낯선 감정을 상상하는 상징", prompt: "무서움과 신기함 중 어떤 느낌이 컸는지 기록해 보세요." },
  { words: ["돼지", "돈", "보석", "보물"], name: "소중한 것", meaning: "갖고 싶은 것 또는 나에게 중요한 가치를 생각하는 소재", prompt: "재물이나 당첨을 예고하지 않아요. 지금 소중한 것 세 가지를 적어 보세요." },
  { words: ["이빨", "치아", "빠지"], name: "변화와 상실", meaning: "변화 앞에서 느낀 어색함을 돌아볼 수 있는 장면", prompt: "불행이나 질병의 징조가 아닙니다. 기억에 남은 느낌만 가볍게 적어 보세요." },
  { words: ["학교", "시험", "수업"], name: "배움과 평가", meaning: "준비·기대·평가에 대한 경험을 연상하는 배경", prompt: "꿈속 시험에 정답이 없다면 어떤 문제를 내고 싶나요?" },
  { words: ["죽", "장례", "유령"], name: "끝과 새로운 장면", meaning: "끝맺음이나 낯선 전환을 상상하는 이야기 모티프", prompt: "실제 죽음을 예고하지 않아요. 이 장면 뒤에 따뜻한 에필로그를 붙여 보세요." },
  { words: ["꽃", "나무", "숲"], name: "성장과 계절", meaning: "기다림·돌봄·변화하는 계절을 연상하는 풍경", prompt: "그 풍경의 계절과 향기를 짧게 묘사해 보세요." },
  { words: ["불", "폭발", "번개"], name: "빛과 에너지", meaning: "강렬함·활력·전환을 떠올리는 시각적 모티프", prompt: "밝기와 소리를 기억하고 장면의 색을 세 가지 골라 보세요." },
  { words: ["여행", "기차", "버스", "길"], name: "이동과 선택", meaning: "방향·목적지·과정을 생각하게 하는 장면", prompt: "도착보다 길에서 만난 대상에 이름을 붙여 보세요." },
  { words: ["친구", "연인", "가족", "사람"], name: "인연과 대화", meaning: "관계와 기억을 새롭게 조합하는 이야기", prompt: "상대 마음을 단정하지 말고 내가 전하고 싶은 한 문장을 적어 보세요." },
];
export function matchFortuneDream(text: string): FortuneSection[] {
  const value = text.trim().normalize("NFKC").slice(0, 600);
  if (!value) throw new Error("기억나는 꿈의 장면이나 단어를 입력해 주세요.");
  const matches = DREAMS.filter((d) => d.words.some((w) => value.includes(w)));
  return matches.length ? matches.slice(0, 4).map((d) => ({ title: d.name, body: d.meaning, items: [d.prompt] }))
    : [{ title: "아직 이름 붙이지 않은 꿈", body: "사전에 없는 장면도 좋은 창작 재료입니다. 억지로 길흉을 붙이지 않아도 괜찮아요.", items: ["장소·등장인물·가장 강한 감정을 하나씩 적어 보세요.", "꿈의 결말을 다르게 그려 보는 것도 좋은 시작이에요."] }];
}
export function fortuneLifeNumber(date: string) {
  resolveFortuneBirth({ date });
  let n = [...date.replace(/-/gu, "")].reduce((sum, digit) => sum + Number(digit), 0);
  const steps = [`${date.replace(/-/gu, "").split("").join(" + ")} = ${n}`];
  while (n > 9 && ![11, 22, 33].includes(n)) {
    const digits = String(n).split(""); n = digits.reduce((sum, digit) => sum + Number(digit), 0);
    steps.push(`${digits.join(" + ")} = ${n}`);
  }
  return { number: n, steps };
}
export const FORTUNE_PALETTES = [
  [{ name: "숲의 초록", hex: "#39745B" }, { name: "새잎", hex: "#B8D9A2" }, { name: "아침 안개", hex: "#EAF1E8" }],
  [{ name: "살구빛", hex: "#EB947A" }, { name: "와인", hex: "#7E435B" }, { name: "크림", hex: "#F6E6CF" }],
  [{ name: "밤하늘", hex: "#343D68" }, { name: "라벤더", hex: "#ABA0D2" }, { name: "달빛", hex: "#E5E2F5" }],
  [{ name: "바다", hex: "#317C93" }, { name: "모래", hex: "#DCC8A2" }, { name: "물거품", hex: "#DDEEF0" }],
  [{ name: "먹색", hex: "#3F4246" }, { name: "황금빛", hex: "#C9A969" }, { name: "한지", hex: "#F2EBDD" }],
];
export const FORTUNE_COOKIE_LINES = ["완벽한 첫 선보다, 오늘 그은 첫 선이 이야기를 시작해요.", "빨리 가는 장면과 오래 머무는 장면은 모두 필요해요.", "빈칸은 부족함이 아니라 다음 이야기가 들어올 자리예요.", "다른 속도로 걷는 사람에게도 좋은 풍경이 보여요.", "어제의 습작은 오늘의 관찰력을 남겼어요.", "작은 호기심 하나가 커다란 세계관의 시작이 돼요.", "고쳐 그릴 수 있다는 것은 창작자의 든든한 능력이에요.", "때로는 덜 그려야 더 선명하게 보이는 장면이 있어요."];
