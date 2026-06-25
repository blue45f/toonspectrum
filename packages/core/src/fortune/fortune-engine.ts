// 운세 엔진 — 웹 백엔드(NestJS)·토스가 공유하는 UI/플랫폼-비종속 순수 코어.
// 명리(사주/궁합/일진/세운)·타로·별자리·오늘의 운세·독서 처방의 결정적 계산과 웹툰
// 콘티(panels) 파싱을 모두 담는다. 외부 의존: 없음(React/DOM/Node/Drizzle/env 0).
//
// LLM 가공(Gemini, process.env·fetch)은 플랫폼 종속이라 여기에 두지 않고, generateText
// 콜백으로 주입한다(없거나 throw 하면 결정적 폴백 콘티를 쓴다). 추천 작품(curateTitles)도
// 카탈로그(TITLES)를 인자로 받아 산출하므로, 웹은 core/server 의 TITLES 를, 토스는 자기
// 카탈로그를 넘기면 동일 엔진이 그대로 동작한다.

import {
  analyzeCompatibility,
  analyzeSaju,
  analyzeTodayByIljin,
  analyzeYearLuck,
  todayCategoryScores,
  type CompatibilityAnalysis,
  type SajuAnalysis,
  type TenGod,
  type TodayIljinAnalysis,
} from "./saju-analysis";
import { calculateSaju, type SajuResult } from "./saju-utils";
import { getZodiacSign, genresByZodiacElement, ZODIAC_ELEMENT_COLOR, type ZodiacSign } from "./zodiac";

/* ── 공개 타입 ──────────────────────────────────────────────────────────── */

export interface TarotCard {
  id: number;
  name: string;
  nameEn: string;
  type: "upright" | "reversed";
  keywords: string[];
  description: string;
}

export interface FortuneCharacter {
  id: string;
  name: string;
  origin: string; // 등장 웹툰
  greeting: string;
  avatarUrl: string;
}

export interface TodayFortuneResult {
  score: number;
  color: string;
  direction: string;
  time: string;
  luckyNumber: number;
}

// 웹툰 컷(패널) 한 줄: 나레이션(speaker="") 혹은 캐릭터 대사
export interface FortunePanelLine {
  speaker: string; // 화자 이름. 나레이션이면 빈 문자열
  characterId: string | null; // 매칭된 ToonSpectrum 캐릭터 id (없으면 null)
  text: string;
  sfx?: string; // 효과음(있으면 컷에 스티커로 표시)
}

// 웹툰 컷(패널) 한 칸
export interface FortunePanel {
  scene: string | null; // [N컷 - 장면 묘사]의 묘사 부분
  lines: FortunePanelLine[];
}

/** curateTitles 가 읽는 카탈로그 항목의 최소 구조(웹·토스 Title 모두 할당 가능). */
export interface CurateTitleLike {
  ageRating: string;
  genres: string[];
  stats?: { ratingAvg?: number };
}

/**
 * LLM 가공 콜백 — env/네트워크 종속 부분의 주입점. 미주입(undefined)이거나 reject 하면
 * 엔진은 결정적 폴백 콘티를 사용한다.
 * @param type 운세 종류 라벨(예: "오늘의 타로 운세")
 * @param dataText 캐릭터에게 줄 결과 데이터 텍스트
 * @param character 화자 캐릭터
 */
export type FortuneTextGenerator = (
  type: string,
  dataText: string,
  character: FortuneCharacter,
) => Promise<string>;

/* ── 정적 데이터 ────────────────────────────────────────────────────────── */

export const CHARACTERS: FortuneCharacter[] = [
  {
    id: "ara",
    name: "사서 아라",
    origin: "ToonSpectrum",
    greeting: "어서 오세요. 당신의 운명이 적힌 기록을 찾고 계셨나요? 차분하게 한 장씩 읽어드릴게요.",
    avatarUrl: "/images/characters/ara.jpg",
  },
  {
    id: "danwoo",
    name: "도깨비 단우",
    origin: "ToonSpectrum",
    greeting: "오호라, 인간이 내 소문을 듣고 찾아왔나? 오늘 네 운이 대박인지 쪽박인지 내가 한번 봐주지!",
    avatarUrl: "/images/characters/danwoo.jpg",
  },
  {
    id: "leona",
    name: "점술가 레오나",
    origin: "ToonSpectrum",
    greeting: "별들이 오늘 밤 유난히 반짝이네요. 당신의 별자리가 가리키는 미래를 엿볼 준비가 되셨나요?",
    avatarUrl: "/images/characters/leona.jpg",
  },
  {
    id: "gaon",
    name: "검객 가온",
    origin: "ToonSpectrum",
    greeting: "운명 따위, 칼 한 자루로 베어버릴 뿐. 하지만 굳이 길을 묻겠다면 검끝이 가리키는 곳을 말해주지.",
    avatarUrl: "/images/characters/gaon.jpg",
  },
];

const TAROT_CARDS = [
  { id: 0, name: "광대", nameEn: "The Fool", keywords: ["시작", "자유", "모험", "무모함"], reversed: ["경솔", "망설임", "무책임"] },
  { id: 1, name: "마법사", nameEn: "The Magician", keywords: ["창조", "재능", "기술", "자신감"], reversed: ["속임수", "미숙", "자만"] },
  { id: 2, name: "여사제", nameEn: "The High Priestess", keywords: ["직관", "지혜", "비밀", "침묵"], reversed: ["혼란", "직관 무시", "숨겨진 동기"] },
  { id: 3, name: "여황제", nameEn: "The Empress", keywords: ["풍요", "모성", "자연", "결실"], reversed: ["결핍", "의존", "정체"] },
  { id: 4, name: "황제", nameEn: "The Emperor", keywords: ["권력", "질서", "지배", "책임"], reversed: ["독선", "경직", "통제 상실"] },
  { id: 5, name: "교황", nameEn: "The Hierophant", keywords: ["전통", "교육", "동맹", "자비"], reversed: ["독단", "인습 거부", "위선"] },
  { id: 6, name: "연인", nameEn: "The Lovers", keywords: ["사랑", "선택", "조화", "관계"], reversed: ["불화", "잘못된 선택", "엇갈림"] },
  { id: 7, name: "전차", nameEn: "The Chariot", keywords: ["돌진", "승리", "통제", "극복"], reversed: ["폭주", "방향 상실", "조급함"] },
  { id: 8, name: "힘", nameEn: "Strength", keywords: ["인내", "용기", "부드러운 통제", "내면의 힘"], reversed: ["자기 의심", "충동", "소진"] },
  { id: 9, name: "은둔자", nameEn: "The Hermit", keywords: ["성찰", "고독", "탐구", "길잡이"], reversed: ["고립", "외로움", "회피"] },
  { id: 10, name: "운명의 수레바퀴", nameEn: "Wheel of Fortune", keywords: ["운명", "변화", "전환점", "순환"], reversed: ["불운", "정체", "통제 불가"] },
  { id: 11, name: "정의", nameEn: "Justice", keywords: ["균형", "공정", "결정", "원인과 결과"], reversed: ["불공정", "회피", "편견"] },
  { id: 12, name: "매달린 사람", nameEn: "The Hanged Man", keywords: ["희생", "관점의 전환", "정지", "인내"], reversed: ["정체", "집착", "무의미한 희생"] },
  { id: 13, name: "죽음", nameEn: "Death", keywords: ["종결", "새로운 시작", "이별", "재생"], reversed: ["변화 거부", "미련", "정체"] },
  { id: 14, name: "절제", nameEn: "Temperance", keywords: ["조화", "균형", "중용", "정화"], reversed: ["불균형", "과잉", "조급함"] },
  { id: 15, name: "악마", nameEn: "The Devil", keywords: ["집착", "유혹", "속박", "물욕"], reversed: ["해방", "집착 탈피", "각성"] },
  { id: 16, name: "탑", nameEn: "The Tower", keywords: ["급격한 붕괴", "갑작스러운 변화", "해방", "충격"], reversed: ["위기 모면", "지연된 변화", "점진적 회복"] },
  { id: 17, name: "별", nameEn: "The Star", keywords: ["희망", "영감", "치유", "미래"], reversed: ["실망", "자신감 상실", "비관"] },
  { id: 18, name: "달", nameEn: "The Moon", keywords: ["불안", "의혹", "무의식", "변덕"], reversed: ["혼란 해소", "진실 직면", "불안 완화"] },
  { id: 19, name: "태양", nameEn: "The Sun", keywords: ["성공", "기쁨", "활력", "명확함"], reversed: ["일시적 그늘", "지연", "과신"] },
  { id: 20, name: "심판", nameEn: "Judgement", keywords: ["부활", "깨달음", "결단", "평가"], reversed: ["자기 비판", "후회", "결단 지연"] },
  { id: 21, name: "세계", nameEn: "The World", keywords: ["완성", "통합", "조화", "여행의 끝"], reversed: ["미완성", "지연", "마무리 부족"] },
];

// 오행 영문키 → 한글 (오늘의 운세 개인화 텍스트용)
const ELEMENT_NAMES_KO: Record<string, string> = {
  wood: "목", fire: "화", earth: "토", metal: "금", water: "수",
};

// 오행별 행운 컬러·방위·숫자 (명리 방위·색 매핑).
const ELEMENT_LUCK: Record<string, { color: string; direction: string; numbers: number[] }> = {
  wood: { color: "초록색", direction: "동쪽", numbers: [3, 8] },
  fire: { color: "붉은색", direction: "남쪽", numbers: [2, 7] },
  earth: { color: "황금색", direction: "남서쪽", numbers: [0, 5] },
  metal: { color: "은백색", direction: "서쪽", numbers: [4, 9] },
  water: { color: "검은색", direction: "북쪽", numbers: [1, 6] },
};

const TIME_SLOTS = [
  "오전 07시 ~ 09시", "오전 10시 ~ 12시", "오후 01시 ~ 03시",
  "오후 04시 ~ 06시", "오후 07시 ~ 09시", "오후 10시 ~ 12시",
];

/* ── 결정적(시드) 난수 ──────────────────────────────────────────────────── */
// '오늘의 운세'가 하루 동안 흔들리지 않도록, 외부 의존성 없이 문자열 시드 →
// 안정적 난수열을 만든다(xfnv1a 해시 + mulberry32).

// KST 기준 오늘 날짜 + 캐릭터로 하루짜리 시드 생성
export function dailySeed(characterId: string): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC→KST 보정
  const ymd = kst.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${ymd}:${characterId}`;
}

export function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── 헬퍼: 캐릭터 / 추천 / 장르 매칭 ─────────────────────────────────────── */

export function getCharacters(): FortuneCharacter[] {
  return CHARACTERS;
}

function characterOf(characterId: string): FortuneCharacter {
  return CHARACTERS.find((c) => c.id === characterId) || CHARACTERS[0];
}

// 시드 키로 결정적 타로 카드 1장 생성(정/역 포함)
function buildTarotCard(seedKey: string): TarotCard {
  const rng = seededRandom(seedKey);
  const base = TAROT_CARDS[Math.floor(rng() * TAROT_CARDS.length)];
  const isReversed = rng() > 0.58; // 정방향이 조금 더 잦게
  return {
    id: base.id,
    name: base.name,
    nameEn: base.nameEn,
    type: isReversed ? "reversed" : "upright",
    keywords: isReversed ? base.reversed : base.keywords,
    description: `${base.name} 카드 (${isReversed ? "역방향" : "정방향"})`,
  };
}

// 타로 테마별 매칭 장르 도출
function getGenresByTarot(card: TarotCard): string[] {
  const darkCards = [13, 15, 16, 18]; // 죽음, 악마, 탑, 달
  const brightCards = [3, 6, 17, 19, 21]; // 여황제, 연인, 별, 태양, 세계
  if (darkCards.includes(card.id)) return ["스릴러", "액션", "미스터리", "아포칼립스"];
  if (brightCards.includes(card.id)) return ["로맨스", "로판", "드라마", "일상"];
  return ["판타지", "무협", "퓨전판타지", "현판"];
}

// 사주 오행별 매칭 장르 도출
function getGenresBySaju(saju: SajuResult): string[] {
  const ratios = saju.elementsRatio;
  const maxVal = Math.max(ratios.wood, ratios.fire, ratios.earth, ratios.metal, ratios.water);
  if (maxVal === ratios.fire) return ["액션", "현판", "무협"]; // 열정적 에너지
  if (maxVal === ratios.water) return ["스릴러", "미스터리", "SF"]; // 냉정하고 차분함
  if (maxVal === ratios.wood) return ["일상", "성장", "스포츠", "드라마"]; // 성장과 자라남
  if (maxVal === ratios.metal) return ["군상극", "느와르", "전쟁"]; // 단단하고 예리함
  return ["판타지", "로판", "학원"]; // 포용하고 수렴함
}

// 오늘의 십성 테마별 장르 매칭
function getGenresByTenGod(god: TenGod): string[] {
  switch (god) {
    case "재성": return ["로맨스", "로판", "드라마"]; // 재물·애정
    case "관성": return ["무협", "느와르", "전쟁"]; // 책임·명예
    case "인성": return ["판타지", "미스터리", "성장"]; // 학업·귀인
    case "식상": return ["일상", "개그", "스포츠"]; // 표현·활동
    case "비겁": return ["액션", "학원", "스릴러"]; // 경쟁·동료
  }
}

/**
 * 카탈로그 큐레이션 — 타겟 장르 중 하나 이상 포함하는 비-19금 작품을 평점순 3개.
 * 카탈로그(catalog)는 인자로 주입한다(엔진을 브라우저-세이프하게 유지).
 */
export function curateTitles<T extends CurateTitleLike>(catalog: T[], targetGenres: string[]): T[] {
  if (!catalog || catalog.length === 0) return [];
  return catalog
    .filter((t) => t.ageRating !== "19" && t.genres.some((g) => targetGenres.includes(g)))
    .sort((a, b) => (b.stats?.ratingAvg ?? 0) - (a.stats?.ratingAvg ?? 0))
    .slice(0, 3);
}

/* ── 웹툰 컷(패널) 파싱 ─────────────────────────────────────────────────── */
// [N컷 - 묘사] + 이름: "대사" 형식의 콘티 텍스트를 구조화된 panels[] 로 변환.

function matchCharacterId(speaker: string): string | null {
  const s = speaker.trim();
  if (!s) return null;
  for (const c of CHARACTERS) {
    const short = c.name.split(" ").pop() ?? c.name; // "사서 아라" -> "아라"
    if (s === c.name || s === short || s.includes(short)) return c.id;
  }
  return null;
}

function cleanLine(text: string): string {
  return text
    .trim()
    .replace(/^["“'『「]+/, "")
    .replace(/["”'』」]+$/, "")
    .trim();
}

export function parsePanels(text: string, fallbackCharacterId: string): FortunePanel[] {
  const sceneRe = /^\[\s*제?\s*\d+\s*컷\s*(?:[-–—:|]\s*)?(.*?)\s*\]$/; // [1컷 - 묘사] (제 접두 선택)
  const bracketRe = /^\[\s*(.+?)\s*\]$/; // [임의 지문]
  const sfxRe = /(?:효과음|SFX)\s*[:：]\s*(.+)$/i; // 효과음: 두근두근
  const dialogueRe = /^([^"“'『「:：]{1,18}?)\s*[:：]\s*(.+)$/; // 이름: 대사

  const panels: FortunePanel[] = [];
  let current: FortunePanel | null = null;
  const ensurePanel = (scene: string | null = null) => {
    current = { scene, lines: [] };
    panels.push(current);
    return current;
  };

  const rawLines = text.replace(/\r/g, "").split("\n");
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;

    // 1) 컷 헤더 [N컷 - 묘사]
    const sceneMatch = line.match(sceneRe);
    if (sceneMatch) {
      ensurePanel(cleanLine(sceneMatch[1]) || null);
      continue;
    }

    // 2) 효과음 단독 라인
    const sfxMatch = line.match(sfxRe);
    if (sfxMatch && line.length < 40) {
      const panel = current ?? ensurePanel();
      panel.lines.push({ speaker: "", characterId: null, text: "", sfx: cleanLine(sfxMatch[1]) });
      continue;
    }

    // 3) 그 외 대괄호 지문 → 새 컷의 장면 묘사로
    const bracketMatch = line.match(bracketRe);
    if (bracketMatch && !line.includes(":") && !line.includes("：")) {
      ensurePanel(cleanLine(bracketMatch[1]) || null);
      continue;
    }

    // 4) 대사 "이름: 대사" — 화자가 짧고 캐릭터로 매칭되거나 따옴표가 있을 때만
    const dm = line.match(dialogueRe);
    if (dm) {
      const speaker = dm[1].trim();
      const characterId = matchCharacterId(speaker);
      const hasQuote = /["“'『「]/.test(dm[2]);
      const looksLikeName = speaker.length <= 8 && !/[.!?…]/.test(speaker);
      if (characterId || hasQuote || looksLikeName) {
        const panel = current ?? ensurePanel();
        panel.lines.push({ speaker, characterId, text: cleanLine(dm[2]) });
        continue;
      }
    }

    // 5) 나레이션
    const panel = current ?? ensurePanel();
    panel.lines.push({ speaker: "", characterId: null, text: cleanLine(line) });
  }

  // 컷 표기가 없어 한 덩어리로만 잡힌 평문은 문단 단위로 쪼개 나레이션 컷으로 재구성.
  if (panels.length <= 1 && panels[0]?.lines.every((l) => !l.speaker)) {
    const paragraphs = text
      .replace(/\r/g, "")
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, " ").trim())
      .filter(Boolean);
    if (paragraphs.length > 1) {
      return paragraphs.map((p) => ({
        scene: null,
        lines: [{ speaker: "", characterId: fallbackCharacterId, text: cleanLine(p) }],
      }));
    }
  }

  // 파싱 결과가 비면 통짜 나레이션 1컷으로 폴백
  if (panels.length === 0) {
    return [
      {
        scene: null,
        lines: [{ speaker: "", characterId: fallbackCharacterId, text: cleanLine(text) }],
      },
    ];
  }

  return panels;
}

/* ── 폴백 콘티(LLM 미사용 시) ───────────────────────────────────────────── */

function getFallbackTarotSpread(cards: Array<TarotCard & { position: string }>, character: FortuneCharacter): string {
  const sn = character.name.split(" ").pop() ?? character.name;
  const line = (c: TarotCard & { position: string }) =>
    `${c.position}의 ${c.name}(${c.type === "upright" ? "정방향" : "역방향"}) — ${c.keywords.slice(0, 2).join(", ")}`;
  return (
    `[1컷 - ${sn}이(가) 카드 세 장을 과거·현재·미래로 나란히 펼친다]\n` +
    `${sn}: "세 장의 흐름을 읽어볼게요. 과거엔 ${cards[0].name}, 현재는 ${cards[1].name}, 미래엔 ${cards[2].name}이 놓였네요."\n` +
    `효과음: 차르륵\n\n` +
    `[2컷 - 과거 카드를 짚는 ${sn}]\n` +
    `${sn}: "${line(cards[0])}. 지나온 자리가 지금의 당신을 만들었어요."\n\n` +
    `[3컷 - 현재 카드를 짚는 ${sn}]\n` +
    `${sn}: "${line(cards[1])}. 지금 이 기운을 어떻게 쓰느냐가 관건이에요."\n\n` +
    `[4컷 - 미래 카드를 가리키며 미소 짓는 ${sn}]\n` +
    `${sn}: "${line(cards[2])}. 흐름을 믿고 한 걸음 내디뎌 보세요."`
  );
}

function getFallbackTarotInterpretation(card: TarotCard, character: FortuneCharacter): string {
  const directionStr = card.type === "upright" ? "정방향" : "역방향";
  const kw = card.keywords.slice(0, 3).join(", ");
  switch (character.id) {
    case "ara":
      return `[1컷 - 아라가 먼지 쌓인 책장 사이에서 카드 한 장을 조심스레 집어 든다]\n` +
        `아라: "당신을 기다리던 카드는 ${card.name}(${directionStr})이네요."\n` +
        `효과음: 사르륵\n\n` +
        `[2컷 - 카드를 펼쳐 보이는 아라]\n` +
        `아라: "여기 적힌 구절은 [${kw}]. 잠시 숨을 고르라는 기록이에요."\n\n` +
        `[3컷 - 따뜻하게 미소 짓는 아라]\n` +
        `아라: "급히 페이지를 넘기지 않아도 다음 이야기는 멋지게 펼쳐질 테니, 마음 편히 가지세요."`;
    case "danwoo":
      return `[1컷 - 단우가 카드를 휙 뒤집으며 눈을 동그랗게 뜬다]\n` +
        `단우: "오호라! 네가 뽑은 게 ${card.name}(${directionStr})이라고?"\n` +
        `효과음: 뚝딱!\n\n` +
        `[2컷 - 방망이를 빙글 돌리는 단우]\n` +
        `단우: "기운이 [${kw}]… 보물 상자 열기 직전 같은 설렘이 어른거리는걸."\n\n` +
        `[3컷 - 씩 웃으며 엄지를 치켜드는 단우]\n` +
        `단우: "머리 굴리지 말고 내 방망이 믿고 신나게 한 판 놀아봐!"`;
    case "leona":
      return `[1컷 - 레오나가 별빛 감도는 테이블 위로 카드를 미끄러뜨린다]\n` +
        `레오나: "별빛을 따라가니, 당신의 카드는 ${card.name}(${directionStr})이었군요."\n` +
        `효과음: 반짝\n\n` +
        `[2컷 - 카드를 손끝으로 어루만지는 레오나]\n` +
        `레오나: "우주가 보낸 신호는 [${kw}]…"\n\n` +
        `[3컷 - 매혹적으로 속삭이는 레오나]\n` +
        `레오나: "은하수의 흐름이 잠시 혼란스러워도 결국 당신만의 궤도를 찾아줘요. 직관을 조금 더 믿어요."`;
    case "gaon":
      return `[1컷 - 가온이 카드를 내려다보며 눈을 가늘게 뜬다]\n` +
        `가온: "${card.name}(${directionStr})…"\n\n` +
        `[2컷 - 검을 고쳐 쥐는 가온]\n` +
        `가온: "검끝을 스치는 바람 같은 기운이군. 바로 [${kw}]."\n` +
        `효과음: 스릉\n\n` +
        `[3컷 - 등을 돌려 앞을 응시하는 가온]\n` +
        `가온: "망설임이 칼날을 흔든다. 오늘은 중심을 굳건히 잡고 눈앞의 수련에만 집중하라."`;
    default:
      return `[1컷 - 에이전트가 카드를 펼친다]\n` +
        `에이전트: "당신이 뽑은 카드는 ${card.name}(${directionStr}). '${card.keywords[0]}'의 에너지가 흐릅니다."\n\n` +
        `[2컷 - 차분히 조언하는 에이전트]\n` +
        `에이전트: "오늘은 차분하고 지혜로운 선택을 하세요."`;
  }
}

// 십성 의미를 한 줄로 (폴백 풀이에 사용)
function tenGodMeaning(god: TenGod): string {
  switch (god) {
    case "비겁": return "자기 주관과 추진력이 강하고 동료·경쟁 운이 두드러진다";
    case "식상": return "표현력과 재능, 활동력이 풍부해 무언가를 만들어내는 힘이 있다";
    case "재성": return "현실 감각과 재물·인연을 다루는 수완이 좋다";
    case "관성": return "책임감과 자기 관리가 뛰어나 명예·직장 운으로 이어진다";
    case "인성": return "배움과 사색을 즐기고 귀인의 도움과 문서 운이 따른다";
  }
}

function getFallbackSajuInterpretation(saju: SajuResult, character: FortuneCharacter, analysis: SajuAnalysis): string {
  const dayPillar = `${saju.dayPillar.kanKorean}${saju.dayPillar.jiKorean}`;
  const dm = `${analysis.dayMasterKan}(${analysis.dayMasterElement}·${analysis.yinYang})`;
  const tg = analysis.tenGodCounts;
  const persona = analysis.personality;
  const useStr =
    analysis.strength === "신강"
      ? `기운이 강한 신강 사주라, 넘치는 힘을 ${analysis.usefulElement}(으)로 흘려보내면 더 빛나요`
      : analysis.strength === "신약"
        ? `기운을 도와줄 뿌리가 필요한 신약 사주라, ${analysis.usefulElement}의 기운으로 채우면 단단해져요`
        : `오행이 비교적 고른 중화 사주라, 가장 옅은 ${analysis.usefulElement}을(를) 더하면 균형이 살아나요`;

  switch (character.id) {
    case "ara":
      return `[1컷 - 아라가 두꺼운 명리 고서를 펼쳐 일간 칸을 짚는다]\n` +
        `아라: "당신의 일간은 ${dm}. ${persona}."\n` +
        `효과음: 사르륵\n\n` +
        `[2컷 - 책장을 넘기며 십성 표를 살피는 아라]\n` +
        `아라: "일주 ${dayPillar}, 십성으로 보면 ${analysis.dominantTenGod}의 기운이 가장 또렷하네요. 그래서 ${tenGodMeaning(analysis.dominantTenGod)}."\n\n` +
        `[3컷 - 찻잔을 내려놓으며 차분히 설명하는 아라]\n` +
        `아라: "${useStr}."\n\n` +
        `[4컷 - 책을 덮으며 따뜻하게 미소 짓는 아라]\n` +
        `아라: "타고난 결을 억누르기보다 그 강점을 살려가면, 당신만의 한 권이 아름답게 채워질 거예요."`;
    case "danwoo":
      return `[1컷 - 단우가 사주판을 들여다보며 눈을 빛낸다]\n` +
        `단우: "오호! 네 일간이 ${dm}이네. ${persona}!"\n` +
        `효과음: 두구두구\n\n` +
        `[2컷 - 방망이로 십성 글자를 가리키는 단우]\n` +
        `단우: "${analysis.dominantTenGod} 기운이 제일 세! 한마디로 ${tenGodMeaning(analysis.dominantTenGod)}는 뜻이라고."\n\n` +
        `[3컷 - 팔짱을 끼고 진지해지는 단우]\n` +
        `단우: "${useStr}. 이거 하나만 챙겨도 운이 확 풀려!"\n\n` +
        `[4컷 - 메밀묵을 건네며 씩 웃는 단우]\n` +
        `단우: "타고난 끼를 숨기지 말고 팍팍 써먹어. 그게 네 복을 부르는 길이야!"`;
    case "leona":
      return `[1컷 - 레오나가 별자리 운판 위로 사주를 펼친다]\n` +
        `레오나: "당신의 중심별, 일간은 ${dm}. ${persona}."\n` +
        `효과음: 반짝\n\n` +
        `[2컷 - 손끝으로 십성의 궤도를 따라 그리는 레오나]\n` +
        `레오나: "별들의 배치를 보니 ${analysis.dominantTenGod}의 기운이 가장 강하게 흐르네요. ${tenGodMeaning(analysis.dominantTenGod)}."\n\n` +
        `[3컷 - 수정구에 비친 빛을 응시하는 레오나]\n` +
        `레오나: "${useStr}."\n\n` +
        `[4컷 - 매혹적으로 미소 지으며 고개를 드는 레오나]\n` +
        `레오나: "타고난 궤도를 신뢰해요. 당신의 별빛은 이미 제 길을 알고 있으니까요."`;
    case "gaon":
      return `[1컷 - 가온이 검을 닦으며 사주를 응시한다]\n` +
        `가온: "네 본바탕, 일간은 ${dm}. ${persona}."\n\n` +
        `[2컷 - 검끝으로 십성 글자를 짚는 가온]\n` +
        `가온: "${analysis.dominantTenGod}의 기운이 가장 무겁군. 곧 ${tenGodMeaning(analysis.dominantTenGod)}는 뜻이다."\n` +
        `효과음: 스릉\n\n` +
        `[3컷 - 검을 칼집에 꽂으며 눈을 감는 가온]\n` +
        `가온: "${useStr}."\n\n` +
        `[4컷 - 등을 돌려 앞을 응시하는 가온]\n` +
        `가온: "타고난 날을 갈되, 부족한 결은 채워라. 그래야 검도 사람도 부러지지 않는다."`;
    default:
      return `[1컷 - 에이전트가 사주를 풀이한다]\n` +
        `에이전트: "일간 ${dm}, 일주 ${dayPillar}. ${analysis.strength} 사주이고 ${analysis.dominantTenGod} 기운이 두드러집니다."\n\n` +
        `[2컷 - 십성 분포를 설명하는 에이전트]\n` +
        `에이전트: "비겁 ${tg.비겁}·식상 ${tg.식상}·재성 ${tg.재성}·관성 ${tg.관성}·인성 ${tg.인성}. ${useStr}."`;
  }
}

function getFallbackZodiacInterpretation(sign: ZodiacSign, score: number, luckyColor: string, character: FortuneCharacter): string {
  const sn = character.name.split(" ").pop() ?? character.name;
  const traits = sign.traits.join("·");
  return `[1컷 - ${sn}이(가) 밤하늘에서 ${sign.ko}를 가리킨다]\n` +
    `${sn}: "당신의 별자리는 ${sign.ko}(${sign.glyph}), ${sign.element}의 기운이에요. ${traits}의 빛을 타고났죠."\n` +
    `효과음: 반짝\n\n` +
    `[2컷 - 별의 흐름을 읽는 ${sn}]\n` +
    `${sn}: "오늘 ${sign.ko}의 운세 지수는 ${score}%. 타고난 ${sign.traits[0]}이(가) 빛을 발하는 하루예요."\n\n` +
    `[3컷 - 다정하게 조언하는 ${sn}]\n` +
    `${sn}: "행운의 색 '${luckyColor}'을 곁에 두면, 별빛이 당신의 길을 한층 또렷이 밝혀줄 거예요."`;
}

function getFallbackTodayInterpretation(data: TodayFortuneResult, character: FortuneCharacter, iljin?: TodayIljinAnalysis | null): string {
  const sn = character.name.split(" ").pop() ?? character.name;
  const themeIntro = iljin
    ? `[1컷 - ${sn}이(가) 오늘의 일진을 짚어준다]\n` +
      `${sn}: "오늘은 ${iljin.todayPillar}일. 당신 일간과는 '${iljin.relationTenGod}' 관계라 ${iljin.themeName}이 드는 날이에요."\n` +
      `효과음: 반짝\n\n` +
      `[2컷 - 오늘의 핵심 조언을 건네는 ${sn}]\n` +
      `${sn}: "${iljin.themeFocus}"\n\n`
    : "";
  const base = ((): string => {
    switch (character.id) {
      case "ara":
        return `[1컷 - 아라가 오래된 운세 장부를 펼치며 부드럽게 미소 짓는다]\n` +
          `아라: "오늘 당신의 하루는 ${data.score}%의 맑은 기운으로 적혀 있네요."\n` +
          `효과음: 사르륵\n\n` +
          `[2컷 - 책갈피를 짚으며 한 구절을 가리키는 아라]\n` +
          `아라: "행운의 색은 '${data.color}', 걸음을 옮기면 좋은 방향은 '${data.direction}'이에요."\n\n` +
          `[3컷 - 창밖으로 시선을 돌리는 아라]\n` +
          `아라: "특히 '${data.time}'에 작은 기쁨이 찾아올 거예요. 숫자 '${data.luckyNumber}'을 마음에 품고, 차 한 잔과 함께 오늘의 책장을 우아하게 넘겨보길."`;
      case "danwoo":
        return `[1컷 - 단우가 도깨비 방망이를 어깨에 걸치고 호탕하게 웃는다]\n` +
          `단우: "야아, 오늘 네 운세 점수가 무려 ${data.score}점이네!"\n` +
          `효과음: 뚝딱!\n\n` +
          `[2컷 - 손가락을 튕기며 장난스레 윙크하는 단우]\n` +
          `단우: "행운 컬러 '${data.color}' 소품 하나 챙기고, '${data.direction}' 방향으로 슬쩍 움직여봐."\n\n` +
          `[3컷 - 메밀묵 그릇을 내밀며 씩 웃는 단우]\n` +
          `단우: "'${data.time}'엔 요술 같은 행운이 솟을지 몰라. 숫자 '${data.luckyNumber}' 기억하고 신나게 한 판 놀아보라고!"`;
      case "leona":
        return `[1컷 - 레오나가 별빛이 감도는 수정구를 들여다본다]\n` +
          `레오나: "오늘 우주가 가리키는 당신의 운세는 ${data.score}%…"\n` +
          `효과음: 반짝\n\n` +
          `[2컷 - 손끝으로 별자리를 그리는 레오나]\n` +
          `레오나: "당신을 지키는 빛은 '${data.color}', 에너지가 솟는 방향은 '${data.direction}'이에요."\n\n` +
          `[3컷 - 매혹적으로 미소 지으며 고개를 드는 레오나]\n` +
          `레오나: "'${data.time}'에 우주의 파동이 가장 크게 울려요. 숫자 '${data.luckyNumber}'을 부적처럼 지녀요. 별의 신호가 당신을 밝히길."`;
      case "gaon":
        return `[1컷 - 가온이 검을 천천히 닦으며 눈을 가늘게 뜬다]\n` +
          `가온: "오늘 네 마음가짐 지수는 ${data.score}%. 꽤 훌륭하군."\n\n` +
          `[2컷 - 검끝으로 한 방향을 가리키는 가온]\n` +
          `가온: "마음을 가라앉힐 기운은 '${data.color}', 검끝이 향할 방향은 '${data.direction}'이다."\n` +
          `효과음: 스릉\n\n` +
          `[3컷 - 등을 돌려 앞을 응시하는 가온]\n` +
          `가온: "'${data.time}'에 네 수련이 빛을 발한다. 숫자는 '${data.luckyNumber}'. 흔들리지 말고 단단하게 나아가라."`;
      default:
        return `[1컷 - 에이전트가 오늘의 운세를 풀이한다]\n` +
          `에이전트: "오늘 운세 지수는 ${data.score}%, 행운의 컬러는 '${data.color}', 방향은 '${data.direction}'입니다."\n\n` +
          `[2컷 - 따뜻하게 인사하는 에이전트]\n` +
          `에이전트: "행운의 시간대 '${data.time}', 숫자 '${data.luckyNumber}'과 함께 편안한 하루 보내세요."`;
    }
  })();
  return themeIntro + base;
}

function getFallbackCompatibilityInterpretation(score: number, character: FortuneCharacter, compat?: CompatibilityAnalysis): string {
  const sn = character.name.split(" ").pop() ?? character.name;
  const themeIntro = compat
    ? `[1컷 - ${sn}이(가) 두 사람의 사주를 나란히 펼쳐 본다]\n` +
      `${sn}: "두 분의 궁합은 ${score}%, '${compat.grade}'예요. ${compat.factors[0]}."\n` +
      `효과음: 두근\n\n` +
      (compat.factors[1]
        ? `[2컷 - 근거를 하나 더 짚어주는 ${sn}]\n${sn}: "${compat.factors.slice(1).join(", ")}."\n\n`
        : "")
    : "";
  const base = ((): string => {
    switch (character.id) {
      case "ara":
        return `[1컷 - 도서관 구석에서 책을 얹어두고 미소 짓는 사서 아라]\n` +
          `아라: "두 분의 생년월일이 적힌 기록지를 함께 포개어 보았어요. 서로 포근하게 겹치는 부분이 무척 아름답네요."\n\n` +
          `[2컷 - 장난스레 아라 머리맡으로 뛰어내리는 도깨비 단우]\n` +
          `단우: "어디 어디? 우와, 궁합 지수가 ${score}%나 되네! 이 정도면 방망이 뚝딱 안 해도 알아서 달달하게 잘 놀겠구먼!"\n\n` +
          `[3컷 - 차분히 찻잔을 내려놓는 아라]\n` +
          `아라: "맞아요, 단우 씨. 서로 부족한 기운을 채워주며 한 편의 예쁜 성장 웹툰 같은 관계를 이어갈 수 있는 좋은 궁합이랍니다."`;
      case "danwoo":
        return `[1컷 - 도깨비 방망이를 어깨에 얹고 흐뭇하게 웃는 단우]\n` +
          `단우: "으하하! 너희 둘의 오행 기운을 냄비에 넣고 끓여봤는데 상성이 아주 펄펄 끓는다! 궁합 지수는 ${score}%!"\n\n` +
          `[2컷 - 옆에서 팔짱을 끼고 한숨을 푹 쉬는 검객 가온]\n` +
          `가온: "조용히 해라, 도깨비. 시끄럽다. 하지만... 두 사람의 기운이 서로 검과 방패처럼 든든해 보이는 건 사실이군."\n\n` +
          `[3컷 - 가온의 어깨를 툭 치며 웃는 단우]\n` +
          `단우: "그렇지? 가끔 사소한 장난으로 투덕거려도 결국 찰떡같이 붙어 다닐 녀석들이니까 걱정 붙들어 매라고!"`;
      case "leona":
        return `[1컷 - 신비로운 보랏빛 점술 테이블 위에 타로 카드를 부채꼴로 펼치는 레오나]\n` +
          `레오나: "두 분의 사주 은하수가 서로를 향해 부드러운 궤도를 그리며 수렴하고 있어요. 조화율은 ${score}%..."\n\n` +
          `[2컷 - 책장을 넘기며 안경을 고쳐 쓰는 사서 아라]\n` +
          `아라: "도서관 고서에 적힌 조화의 흐름과도 정확히 일치하네요. 상생의 기운이 아주 맑게 흐르고 있습니다."\n\n` +
          `[3컷 - 별자리를 가리키며 매혹적으로 웃는 레오나]\n` +
          `레오나: "맞아요. 가끔 은하수의 폭풍이 불더라도 두 분은 별빛처럼 서로를 구원해 줄 운명적인 소울메이트가 될 거예요."`;
      case "gaon":
        return `[1컷 - 검을 천천히 칼집에 꽂으며 눈을 감는 검객 가온]\n` +
          `가온: "두 사람의 운명의 궤적을 베어 내어 나란히 놓아 보았다. 부딪힘 없이 물 흐르듯 어우러지는군. 궁합 지수 ${score}%."\n\n` +
          `[2컷 - 수정구를 들여다보며 유쾌하게 윙크하는 점술가 레오나]\n` +
          `레오나: "어머, 가온이 웬일로 칭찬을 다 하네? 맞아, 두 사람의 합은 아주 화려하고 뜨거운 로맨스 웹툰의 정석 같은 상성이야."\n\n` +
          `[3컷 - 눈을 살며시 뜨고 앞을 응시하는 가온]\n` +
          `가온: "흥, 시끄러운 점술가 같으니. 하지만... 서로의 검끝이 흔들릴 때 든든한 바람이 되어줄 귀한 인연임은 분명하다. 소중히 다스려라."`;
      default:
        return `[1컷 - 운세를 풀이하는 캐릭터 에이전트]\n` +
          `에이전트: "두 분의 궁합 지수는 ${score}%입니다. 서로 양보하고 존중한다면 아주 훌륭한 관계를 유지할 수 있습니다."`;
    }
  })();
  return themeIntro + base;
}

function getFallbackPrescription(query: string, character: FortuneCharacter): string {
  switch (character.id) {
    case "ara":
      return `[1컷 - 아라가 당신의 사연이 적힌 쪽지를 두 손으로 감싸 읽는다]\n` +
        `아라: "보내주신 마음의 결, ‘${query}’을 조심스레 읽어 보았어요."\n` +
        `효과음: 사르륵\n\n` +
        `[2컷 - 서가에서 책 몇 권을 골라 품에 안는 아라]\n` +
        `아라: "지친 날엔 자극적인 바람보다, 따뜻한 차처럼 스며드는 이야기가 필요하죠."\n\n` +
        `[3컷 - 책을 책상에 가만히 내려놓으며 미소 짓는 아라]\n` +
        `아라: "가장 다정한 책들을 얹어둘게요. 이 온기가 당신의 오늘 밤을 포근히 안아주길."`;
    case "danwoo":
      return `[1컷 - 단우가 사연을 읽다 눈썹을 찡그리며 안타까워한다]\n` +
        `단우: "오늘 힘든 일 있었어? ‘${query}’… 읽으니까 내가 다 속상하네!"\n\n` +
        `[2컷 - 방망이를 번쩍 들어 올리는 단우]\n` +
        `단우: "이럴 땐 머리 복잡하게 굴리지 말고, 유쾌한 친구들이랑 노는 게 정답이야."\n` +
        `효과음: 뚝딱!\n\n` +
        `[3컷 - 작품 더미를 안겨주며 활짝 웃는 단우]\n` +
        `단우: "활력 뿜뿜한 꿀잼 작품들 골라왔어. 바로 읽어봐, 기분이 확 좋아질걸!"`;
    case "leona":
      return `[1컷 - 레오나가 사연을 별빛에 비춰 가만히 응시한다]\n` +
        `레오나: "보내주신 별빛의 방황, ‘${query}’을 들여다봅니다."\n` +
        `효과음: 반짝\n\n` +
        `[2컷 - 손끝으로 흔들리는 별을 어루만지는 레오나]\n` +
        `레오나: "궤도가 흔들리는 건, 당신이 성장의 은하수를 지나는 중이기 때문이에요."\n\n` +
        `[3컷 - 작품의 주파수를 건네는 레오나]\n` +
        `레오나: "혼란한 파동을 평온으로 정화해 줄 이야기를 우주에서 엿들었어요. 별의 신호가 당신을 밝히길."`;
    case "gaon":
      return `[1컷 - 가온이 사연을 읽고 잠시 눈을 감는다]\n` +
        `가온: "적어준 번민 ‘${query}’의 고단함이 내게까지 전해지는군."\n\n` +
        `[2컷 - 검을 내려놓고 바람 소리에 귀 기울이는 가온]\n` +
        `가온: "수련이 막힐 땐, 검을 내려놓고 바람 소리를 들어야 하는 법이다."\n` +
        `효과음: 스으…\n\n` +
        `[3컷 - 작품 몇 권을 검끝으로 가리키는 가온]\n` +
        `가온: "날선 마음을 다듬고 다시 나아갈 힘을 길러줄 것들을 골라뒀다. 잡념을 비우고 마음의 힘을 길러라."`;
    default:
      return `[1컷 - 에이전트가 당신의 고민을 헤아린다]\n` +
        `에이전트: "당신의 고민 ‘${query}’에 깊이 공감합니다."\n\n` +
        `[2컷 - 추천 도서를 건네는 에이전트]\n` +
        `에이전트: "지친 마음을 위로해 줄 작품들과 함께 기분 전환의 시간을 가져보세요."`;
  }
}

/* ── 메인 엔진(각 운세 한 판) ───────────────────────────────────────────── */
// 각 draw* 는 LLM 가공기(generateText)와 카탈로그(catalog)를 받아 한 판을 완성한다.
// generateText 가 없거나 throw 하면 결정적 폴백 콘티를 쓴다(항상 panels 가 채워짐).

async function withInterpretation(
  generateText: FortuneTextGenerator | undefined,
  type: string,
  dataText: string,
  character: FortuneCharacter,
  fallback: () => string,
): Promise<string> {
  if (!generateText) return fallback();
  try {
    return await generateText(type, dataText, character);
  } catch {
    return fallback();
  }
}

export async function drawTarot<T extends CurateTitleLike>(
  catalog: T[],
  characterId: string,
  cardIdx = 0,
  spread: "one" | "three" = "one",
  generateText?: FortuneTextGenerator,
) {
  const character = characterOf(characterId);
  const day = dailySeed(characterId);

  if (spread === "three") {
    const positions = ["과거", "현재", "미래"];
    const used = new Set<number>();
    const cards = positions.map((position, i) => {
      let c = buildTarotCard(`${day}:tarot3:${i}`);
      let salt = 0;
      while (used.has(c.id) && salt < 30) {
        salt += 1;
        c = buildTarotCard(`${day}:tarot3:${i}:${salt}`);
      }
      used.add(c.id);
      return { ...c, position };
    });
    const present = cards[1];
    const recommendations = curateTitles(catalog, getGenresByTarot(present));

    const text = cards
      .map((c) => `[${c.position}] ${c.name}(${c.type === "upright" ? "정방향" : "역방향"}) — ${c.keywords.slice(0, 3).join(", ")}`)
      .join("\n");
    const interpretation = await withInterpretation(
      generateText, `3카드 타로 스프레드(과거·현재·미래)`, text, character,
      () => getFallbackTarotSpread(cards, character),
    );

    return {
      character,
      card: present, // 공유/하위호환용 대표 카드(현재)
      cards,
      spread: "three" as const,
      interpretation,
      panels: parsePanels(interpretation, character.id),
      recommendations,
    };
  }

  const card = buildTarotCard(`${day}:tarot:${cardIdx}`);
  const recommendations = curateTitles(catalog, getGenresByTarot(card));

  const interpretation = await withInterpretation(
    generateText, `오늘의 타로 운세`,
    `뽑힌 카드: ${card.name} (${card.type === "upright" ? "정방향" : "역방향"})\n키워드: ${card.keywords.join(", ")}`,
    character,
    () => getFallbackTarotInterpretation(card, character),
  );

  return {
    character,
    card,
    cards: [{ ...card, position: "오늘" }],
    spread: "one" as const,
    interpretation,
    panels: parsePanels(interpretation, character.id),
    recommendations,
  };
}

export async function drawSaju<T extends CurateTitleLike>(
  catalog: T[],
  birthDate: string,
  birthTime?: string,
  gender = "none",
  characterId = "ara",
  generateText?: FortuneTextGenerator,
) {
  const character = characterOf(characterId);
  const sajuResult: SajuResult = calculateSaju(birthDate, birthTime);
  const analysis = analyzeSaju(sajuResult);

  const recommendedGenres = getGenresBySaju(sajuResult);
  const recommendations = curateTitles(catalog, recommendedGenres);

  const tg = analysis.tenGodCounts;
  const sajuText = `
        생년월일시: ${birthDate} ${birthTime || "시간 모름"} (${gender === "male" ? "남성" : gender === "female" ? "여성" : "성별 미상"})
        년주 ${sajuResult.yearPillar.kanKorean}${sajuResult.yearPillar.jiKorean} · 월주 ${sajuResult.monthPillar.kanKorean}${sajuResult.monthPillar.jiKorean} · 일주 ${sajuResult.dayPillar.kanKorean}${sajuResult.dayPillar.jiKorean} · 시주 ${sajuResult.hourPillar.kanKorean}${sajuResult.hourPillar.jiKorean}
        [핵심 명리 분석]
        일간(나): ${analysis.dayMasterKan}(${analysis.dayMasterElement}·${analysis.yinYang}) — ${analysis.personality}
        신강/신약: ${analysis.strength}
        십성 분포: 비겁 ${tg.비겁} · 식상 ${tg.식상} · 재성 ${tg.재성} · 관성 ${tg.관성} · 인성 ${tg.인성} (주된 기운: ${analysis.dominantTenGod})
        용신(보완하면 좋은 기운): ${analysis.usefulElement}
        오행 비율: 목 ${sajuResult.elementsRatio.wood}% 화 ${sajuResult.elementsRatio.fire}% 토 ${sajuResult.elementsRatio.earth}% 금 ${sajuResult.elementsRatio.metal}% 수 ${sajuResult.elementsRatio.water}%
        위 명리 분석을 근거로(일간 성향·신강신약·주된 십성·용신을 반드시 녹여), 성격·강점·올해 흐름·조언을 충실히 풀어줘.
      `;
  const interpretation = await withInterpretation(
    generateText, `평생 사주 및 성향 분석`, sajuText, character,
    () => getFallbackSajuInterpretation(sajuResult, character, analysis),
  );

  // 세운 — 올해/내년의 운세(연 간지 vs 일간)
  const kstYear = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
  const yearLuck = {
    thisYear: analyzeYearLuck(analysis, kstYear),
    nextYear: analyzeYearLuck(analysis, kstYear + 1),
  };

  return {
    character,
    saju: sajuResult,
    analysis,
    yearLuck,
    interpretation,
    panels: parsePanels(interpretation, character.id),
    recommendations,
  };
}

export async function drawTodayFortune<T extends CurateTitleLike>(
  catalog: T[],
  characterId: string,
  birthDate?: string,
  birthTime?: string,
  gender = "none",
  generateText?: FortuneTextGenerator,
) {
  const character = characterOf(characterId);
  const saju = birthDate ? calculateSaju(birthDate, birthTime) : null;
  const analysis = saju ? analyzeSaju(saju) : null;
  const iljin = analysis ? analyzeTodayByIljin(analysis) : null;

  const seed = `${dailySeed(characterId)}:${birthDate ?? "anon"}:${birthTime ?? ""}`;
  const rng = seededRandom(seed);

  let luckyElement: string | null = null;
  let todayData: TodayFortuneResult;
  if (analysis && iljin) {
    luckyElement = analysis.usefulElementEn; // 용신
    const luck = ELEMENT_LUCK[luckyElement];
    todayData = {
      score: iljin.score, // 일진 명리 기반 점수
      color: luck.color,
      direction: luck.direction,
      time: TIME_SLOTS[Math.floor(rng() * TIME_SLOTS.length)],
      luckyNumber: luck.numbers[Math.floor(rng() * luck.numbers.length)],
    };
  } else {
    const score = Math.floor(rng() * 41) + 60;
    const colors = ["금색", "보라색", "청록색", "검은색", "붉은색", "은색", "주황색", "푸른색"];
    const directions = ["동쪽", "서쪽", "남쪽", "북쪽", "남동쪽", "북동쪽", "남서쪽", "북서쪽"];
    todayData = {
      score,
      color: colors[Math.floor(rng() * colors.length)],
      direction: directions[Math.floor(rng() * directions.length)],
      time: TIME_SLOTS[Math.floor(rng() * TIME_SLOTS.length)],
      luckyNumber: Math.floor(rng() * 10),
    };
  }
  const score = todayData.score;

  let recommendedGenres = ["일상", "드라마", "로맨스"];
  if (iljin) {
    recommendedGenres = getGenresByTenGod(iljin.relationTenGod);
  } else if (score < 75) {
    recommendedGenres = ["액션", "스릴러", "느와르"];
  } else if (score < 90) {
    recommendedGenres = ["판타지", "현판", "성장"];
  }

  const recommendations = curateTitles(catalog, recommendedGenres);

  const grounding = analysis && iljin
    ? `\n        [명리 근거]\n        내 일간: ${analysis.dayMasterKan}(${analysis.dayMasterElement}·${analysis.yinYang}), ${analysis.strength} 사주\n        오늘의 일진: ${iljin.todayPillar} → 내 일간과의 관계는 '${iljin.relationTenGod}'\n        오늘의 테마: ${iljin.themeName} — ${iljin.themeFocus}\n        오늘 보완하면 좋은 기운(용신): ${ELEMENT_NAMES_KO[analysis.usefulElementEn]}\n        ※ 위 일진 관계와 테마를 반드시 근거로 삼아 오늘 하루를 구체적으로 풀어줘.`
    : "";
  const todayText = `
        오늘의 종합 운세 지수: ${score}%${gender !== "none" ? ` (${gender === "male" ? "남성" : "여성"})` : ""}
        행운의 컬러: ${todayData.color} / 방향: ${todayData.direction} / 시간: ${todayData.time} / 숫자: ${todayData.luckyNumber}${grounding}
      `;
  const interpretation = await withInterpretation(
    generateText, `오늘의 종합 운세`, todayText, character,
    () => getFallbackTodayInterpretation(todayData, character, iljin),
  );

  return {
    character,
    today: todayData,
    saju,
    analysis,
    iljin,
    categories: iljin ? todayCategoryScores(iljin, rng) : null, // 애정·금전·직장·건강
    luckyElement,
    interpretation,
    panels: parsePanels(interpretation, character.id),
    recommendations,
  };
}

export async function drawZodiac<T extends CurateTitleLike>(
  catalog: T[],
  characterId: string,
  month: number,
  day: number,
  generateText?: FortuneTextGenerator,
) {
  const character = characterOf(characterId);
  const sign = getZodiacSign(month, day);

  const rng = seededRandom(`${dailySeed(characterId)}:zodiac:${sign.id}`);
  const score = Math.floor(rng() * 36) + 62; // 62~97
  const luckyColor = ZODIAC_ELEMENT_COLOR[sign.element];
  const luckyNumber = Math.floor(rng() * 10);

  const recommendations = curateTitles(catalog, genresByZodiacElement(sign.element));

  const text = `
        별자리: ${sign.ko}(${sign.en} ${sign.glyph}) · ${sign.element}의 별자리 · 지배행성 ${sign.ruling}
        성향 키워드: ${sign.traits.join(", ")}
        오늘의 별자리 운세 지수: ${score}% / 행운 컬러: ${luckyColor} / 행운 숫자: ${luckyNumber}
        ※ 위 별자리 성향과 오늘의 기운을 근거로 오늘 하루를 구체적으로 풀어줘.
      `;
  const interpretation = await withInterpretation(
    generateText, `오늘의 별자리 운세`, text, character,
    () => getFallbackZodiacInterpretation(sign, score, luckyColor, character),
  );

  return {
    character,
    zodiac: { ...sign, score, luckyColor, luckyNumber },
    interpretation,
    panels: parsePanels(interpretation, character.id),
    recommendations,
  };
}

export async function drawCompatibility<T extends CurateTitleLike>(
  catalog: T[],
  myBirthDate: string,
  myBirthTime: string | undefined,
  partnerBirthDate: string,
  partnerBirthTime: string | undefined,
  characterId = "ara",
  generateText?: FortuneTextGenerator,
) {
  const character = characterOf(characterId);
  const mySaju: SajuResult = calculateSaju(myBirthDate, myBirthTime);
  const partnerSaju: SajuResult = calculateSaju(partnerBirthDate, partnerBirthTime);

  const compat = analyzeCompatibility(mySaju, partnerSaju);
  const compatibilityScore = compat.score;

  const recommendations = curateTitles(catalog, ["로맨스", "로판", "드라마"]);

  const compatText = `
        나의 일주: ${mySaju.dayPillar.kanKorean}${mySaju.dayPillar.jiKorean} (일간 ${mySaju.dayPillar.kanKorean}·${mySaju.dayPillar.elementKan})
        상대의 일주: ${partnerSaju.dayPillar.kanKorean}${partnerSaju.dayPillar.jiKorean} (일간 ${partnerSaju.dayPillar.kanKorean}·${partnerSaju.dayPillar.elementKan})
        궁합 지수: ${compatibilityScore}% (${compat.grade})
        [명리 궁합 근거]
        ${compat.factors.map((f) => `- ${f}`).join("\n        ")}
        ※ 위 명리 근거(일간 합충·일지 관계·오행 상생상극)를 반드시 녹여 두 사람의 궁합을 풀어줘.
      `;
  const interpretation = await withInterpretation(
    generateText, `두 사람의 찰떡 궁합 분석`, compatText, character,
    () => getFallbackCompatibilityInterpretation(compatibilityScore, character, compat),
  );

  return {
    character,
    mySaju,
    partnerSaju,
    score: compatibilityScore,
    compat,
    interpretation,
    panels: parsePanels(interpretation, character.id),
    recommendations,
  };
}

export async function drawPrescription<T extends CurateTitleLike>(
  catalog: T[],
  query: string,
  characterId: string,
  generateText?: FortuneTextGenerator,
) {
  const character = characterOf(characterId);

  let recommendedGenres = ["일상", "드라마", "치유"];
  if (query.includes("우울") || query.includes("슬픈") || query.includes("울고") || query.includes("외롭")) {
    recommendedGenres = ["로맨스", "성장", "드라마"];
  } else if (query.includes("가벼운") || query.includes("시원한") || query.includes("웃고") || query.includes("킬링")) {
    recommendedGenres = ["개그", "일상", "판타지"];
  } else if (query.includes("스트레스") || query.includes("화나") || query.includes("답답") || query.includes("액션")) {
    recommendedGenres = ["액션", "무협", "학원"];
  }

  const recommendations = curateTitles(catalog, recommendedGenres);

  const dataText = `
        사용자의 마음고민: "${query}"
        분류된 처방 장르: ${recommendedGenres.join(", ")}
      `;
  const interpretation = await withInterpretation(
    generateText, `독서 처방전`, dataText, character,
    () => getFallbackPrescription(query, character),
  );

  return {
    character,
    query,
    interpretation,
    panels: parsePanels(interpretation, character.id),
    recommendations,
  };
}
