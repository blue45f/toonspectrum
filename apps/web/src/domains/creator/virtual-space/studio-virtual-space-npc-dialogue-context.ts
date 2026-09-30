/**
 * NPC 상황별 대화 선택 (Gather Town NPC 상호작용 대응)
 *
 * - 방 종류·시간대·날씨에 따라 NPC 대사를 선택
 * - 기존 NPC 모듈을 수정하지 않는 어댑터 방식
 * - 결정적 선택 (seed 기반) — 같은 상황에서 같은 대사
 *
 * 순수 로직 모듈.
 */

import { studioDayPhaseForHour, type StudioDayPhase } from "./studio-virtual-space-lighting";
import type { StudioWeatherCondition } from "./studio-virtual-space-weather";

export type StudioNpcDialogueContext = {
  /** 방 템플릿 kind (예: "lounge", "meeting-room"). */
  readonly roomKind: string | null;
  readonly hour: number;
  readonly weather: StudioWeatherCondition | null;
  /** 같은 상황에서 대사를 순환시킬 때 쓰는 seed. */
  readonly seed?: number;
};

export interface StudioNpcDialogueLine {
  readonly ko: string;
  readonly en: string;
  /** 대사가 어울리는 상황 태그 (디버깅·필터용). */
  readonly tags: readonly string[];
}

type DialoguePool = readonly StudioNpcDialogueLine[];

const MORNING_LINES: DialoguePool = [
  { ko: "좋은 아침이에요! 오늘은 어떤 장면을 그리시나요?", en: "Good morning! What scene are you drawing today?", tags: ["morning"] },
  { ko: "아침 공기가 상쾌하네요. 커피 한 잔 어떠세요?", en: "The morning air is fresh. How about a cup of coffee?", tags: ["morning"] },
];

const AFTERNOON_LINES: DialoguePool = [
  { ko: "오후 작업은 순조로우신가요? 쉬엄쉬엄 하세요.", en: "How is the afternoon work going? Take it easy.", tags: ["afternoon"] },
  { ko: "점심은 드셨나요? 휴게실에 간식이 있어요.", en: "Did you have lunch? There are snacks in the lounge.", tags: ["afternoon"] },
];

const EVENING_LINES: DialoguePool = [
  { ko: "해가 지고 있네요. 오늘 작업은 마무리되가나요?", en: "The sun is setting. Wrapping up for today?", tags: ["evening"] },
  { ko: "저녁 노을이 예쁘죠. 잠시 창밖을 보세요.", en: "The sunset is beautiful. Take a look outside.", tags: ["evening"] },
];

const NIGHT_LINES: DialoguePool = [
  { ko: "늦은 시간까지 고생이 많으세요. 무리하지 마세요.", en: "Working late, huh? Don't overdo it.", tags: ["night"] },
  { ko: "밤에는 조명을 은은하게 낮추는 게 눈에 편해요.", en: "Dimming the lights at night is easier on the eyes.", tags: ["night"] },
];

const RAINY_LINES: DialoguePool = [
  { ko: "비가 오네요. 빗소리 들으며 작업하기 좋은 날이에요.", en: "It's raining. A perfect day to work with the rain sounds.", tags: ["rain"] },
  { ko: "우산 챙기셨어요? 퇴근길에 비 맞지 마세요.", en: "Did you bring an umbrella? Don't get caught in the rain.", tags: ["rain"] },
];

const SNOWY_LINES: DialoguePool = [
  { ko: "눈이 오네요! 창밖 풍경이 정말 예뻐요.", en: "It's snowing! The view outside is gorgeous.", tags: ["snow"] },
];

const ROOM_LINES: Record<string, DialoguePool> = {
  lounge: [
    { ko: "휴게실에 오신 걸 환영해요. 편히 쉬다 가세요.", en: "Welcome to the lounge. Rest easy.", tags: ["lounge"] },
    { ko: "커피 머신은 제가 관리해요. 맛있게 드세요!", en: "I take care of the coffee machine. Enjoy!", tags: ["lounge"] },
  ],
  "meeting-room": [
    { ko: "회의 준비는 되셨나요? 화이트보드를 펴드릴게요.", en: "Ready for the meeting? I'll set up the whiteboard.", tags: ["meeting-room"] },
    { ko: "문 닫으면 방음이 돼요. 편히 회의하세요.", en: "Close the door for soundproofing. Have a good meeting.", tags: ["meeting-room"] },
  ],
  "personal-studio": [
    { ko: "집중하기 좋은 조용한 방이에요.", en: "A quiet room, perfect for focus.", tags: ["personal-studio"] },
    { ko: "레퍼런스 자료는 선반에 정리해뒀어요.", en: "Reference materials are organized on the shelf.", tags: ["personal-studio"] },
  ],
  rooftop: [
    { ko: "옥상 바람이 시원하죠? 머리 식히기 좋아요.", en: "The rooftop breeze is nice, isn't it? Great for clearing your head.", tags: ["rooftop"] },
    { ko: "밤에는 별이 잘 보여요. 망원경을 써보세요.", en: "Stars are visible at night. Try the telescope.", tags: ["rooftop"] },
  ],
  lobby: [
    { ko: "어서오세요! 안내 데스크에서 도와드릴게요.", en: "Welcome! I can help you at the front desk.", tags: ["lobby"] },
    { ko: "디렉토리 보드에서 각 방 위치를 확인하세요.", en: "Check the directory board for room locations.", tags: ["lobby"] },
  ],
};

const DEFAULT_LINES: DialoguePool = [
  { ko: "안녕하세요! 무엇을 도와드릴까요?", en: "Hello! How can I help?", tags: ["default"] },
  { ko: "오늘도 좋은 작업 되세요!", en: "Have a great workday!", tags: ["default"] },
];

function phaseLines(phase: StudioDayPhase): DialoguePool {
  switch (phase) {
    case "dawn":
    case "morning": return MORNING_LINES;
    case "noon":
    case "afternoon": return AFTERNOON_LINES;
    case "sunset": return EVENING_LINES;
    case "night":
    case "midnight": return NIGHT_LINES;
  }
}

function weatherLines(weather: StudioWeatherCondition | null): DialoguePool | null {
  switch (weather) {
    case "rain":
    case "thunderstorm": return RAINY_LINES;
    case "snow": return SNOWY_LINES;
    default: return null;
  }
}

function pickDeterministic(pool: DialoguePool, seed: number): StudioNpcDialogueLine {
  const safeSeed = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) : 0;
  return pool[safeSeed % pool.length];
}

/**
 * 상황에 맞는 NPC 대사를 선택한다.
 * 우선순위: 방 특화 > 날씨 > 시간대 > 기본
 */
export function studioNpcDialogueFor(
  context: StudioNpcDialogueContext,
): StudioNpcDialogueLine {
  const seed = context.seed ?? 0;
  const roomPool = context.roomKind ? ROOM_LINES[context.roomKind] : undefined;
  if (roomPool && roomPool.length > 0) return pickDeterministic(roomPool, seed);
  const weatherPool = weatherLines(context.weather);
  if (weatherPool) return pickDeterministic(weatherPool, seed);
  const phase = studioDayPhaseForHour(context.hour);
  return pickDeterministic(phaseLines(phase), seed);
}

/** 폴백 기본 대사. */
export function studioNpcDefaultDialogue(seed = 0): StudioNpcDialogueLine {
  return pickDeterministic(DEFAULT_LINES, seed);
}
