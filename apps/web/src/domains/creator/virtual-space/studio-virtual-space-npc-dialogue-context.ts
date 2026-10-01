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

// ── 분기형 다이얼로그 트리 (Track C: 가이드 NPC 대화) ─────────────────────────

/** 분기형 다이얼로그의 선택지. */
export interface StudioNpcDialogueChoice {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 이동할 노드 id. */
  readonly next: string;
}

/** 분기형 다이얼로그 노드. */
export interface StudioNpcDialogueNode {
  readonly id: string;
  readonly textKo: string;
  readonly textEn: string;
  readonly choices: readonly StudioNpcDialogueChoice[];
  /** 조건 (시간대/방문 횟수 등). 조건에 맞지 않으면 건너뛴다. */
  readonly condition?: {
    readonly phases?: readonly string[];
    readonly minVisits?: number;
    readonly maxVisits?: number;
  };
  /** 끝 노드 여부 (선택지 없음). */
  readonly terminal?: boolean;
}

/** 분기형 다이얼로그 트리. */
export interface StudioNpcDialogueTree {
  readonly npcId: string;
  readonly startNodeId: string;
  readonly nodes: readonly StudioNpcDialogueNode[];
}

/** 대화 방문 횟수를 기록하는 런타임 상태. */
export interface StudioNpcDialogueVisitState {
  readonly visits: Readonly<Record<string, number>>;
}

export const EMPTY_NPC_DIALOGUE_VISIT_STATE: StudioNpcDialogueVisitState = Object.freeze({ visits: Object.freeze({}) });

/** NPC 대화 방문을 1회 기록한다. */
export function recordNpcDialogueVisit(
  state: StudioNpcDialogueVisitState,
  npcId: string,
): StudioNpcDialogueVisitState {
  const current = state.visits[npcId] ?? 0;
  return Object.freeze({ visits: Object.freeze({ ...state.visits, [npcId]: current + 1 }) });
}

/**
 * 트리 시작 노드를 찾는다. 조건에 맞는 후보 중 조건부 노드를 기본 시작 노드보다
 * 우선한다(방문 횟수·시간대별 첫 인사 전환용). 없으면 startNodeId, 그것도 없으면
 * 첫 후보를 반환한다.
 */
export function studioNpcDialogueStartNode(
  tree: StudioNpcDialogueTree,
  visits: StudioNpcDialogueVisitState,
  context?: { readonly phase?: string },
): StudioNpcDialogueNode {
  const visitCount = visits.visits[tree.npcId] ?? 0;
  const candidates = tree.nodes.filter((node) =>
    nodeMatchesCondition(node, visitCount, context?.phase),
  );
  const conditional = candidates.find((node) => node.condition !== undefined);
  if (conditional) return conditional;
  return candidates.find((node) => node.id === tree.startNodeId)
    ?? candidates[0]
    ?? tree.nodes[0];
}

function nodeMatchesCondition(
  node: StudioNpcDialogueNode,
  visitCount: number,
  phase: string | undefined,
): boolean {
  const condition = node.condition;
  if (!condition) return true;
  if (condition.phases && (phase === undefined || !condition.phases.includes(phase))) return false;
  if (condition.minVisits !== undefined && visitCount < condition.minVisits) return false;
  if (condition.maxVisits !== undefined && visitCount > condition.maxVisits) return false;
  return true;
}

/** 선택지를 골라 다음 노드로 전이한다. 전이 실패 시 null. */
export function advanceStudioNpcDialogue(
  tree: StudioNpcDialogueTree,
  currentNodeId: string,
  choiceId: string,
): StudioNpcDialogueNode | null {
  const current = tree.nodes.find((node) => node.id === currentNodeId);
  if (!current) return null;
  const choice = current.choices.find((entry) => entry.id === choiceId);
  if (!choice) return null;
  return tree.nodes.find((node) => node.id === choice.next) ?? null;
}

// ── 가이드 NPC "안내원 미로" 실제 대화 트리 ───────────────────────────────────

/**
 * 로비 가이드 NPC "안내원 미로"의 대화 트리.
 * 첫 방문: 환영 + 방 안내 선택지 / 재방문: 간편 메뉴 / 밤 시간대: 야간 안내.
 */
export const STUDIO_NPC_GUIDE_MIRO_DIALOGUE_TREE: StudioNpcDialogueTree = Object.freeze({
  npcId: "npc-guide-miro",
  startNodeId: "welcome",
  nodes: Object.freeze([
    Object.freeze({
      id: "welcome",
      textKo: "어서오세요! 저는 안내원 미로예요. 스튜디오 구경을 도와드릴게요. 어디로 안내할까요?",
      textEn: "Welcome! I'm Miro, your guide. Let me show you around. Where to?",
      choices: Object.freeze([
        { id: "to-lounge", labelKo: "휴게실로 가고 싶어요", labelEn: "Take me to the lounge", next: "lounge-info" },
        { id: "to-meeting", labelKo: "회의실 위치가 궁금해요", labelEn: "Where is the meeting room?", next: "meeting-info" },
        { id: "to-minigame", labelKo: "미니게임이 하고 싶어요", labelEn: "I want to play mini-games", next: "minigame-info" },
        { id: "bye", labelKo: "나중에요", labelEn: "Later", next: "farewell" },
      ]),
    }),
    Object.freeze({
      id: "welcome-back",
      textKo: "다시 오셨네요! 오늘은 어떤 용무로 오셨어요?",
      textEn: "Welcome back! What brings you in today?",
      condition: { minVisits: 2 },
      choices: Object.freeze([
        { id: "to-lounge", labelKo: "휴게실", labelEn: "Lounge", next: "lounge-info" },
        { id: "to-meeting", labelKo: "회의실", labelEn: "Meeting room", next: "meeting-info" },
        { id: "bye", labelKo: "그냥 둘러볼게요", labelEn: "Just looking around", next: "farewell" },
      ]),
    }),
    Object.freeze({
      id: "night-greeting",
      textKo: "늦은 시간에 오셨네요. 밤에는 로비 반딧불이 투어가 인기예요!",
      textEn: "Up late? The nighttime firefly tour in the lobby is lovely!",
      condition: { phases: ["night", "midnight"] },
      choices: Object.freeze([
        { id: "ok", labelKo: "알겠어요", labelEn: "Got it", next: "farewell" },
      ]),
    }),
    Object.freeze({
      id: "lounge-info",
      textKo: "휴게실은 로비 남쪽이에요. 커피 머신과 의자가 있으니 편히 쉬다 가세요!",
      textEn: "The lounge is south of the lobby. Coffee machine and chairs await!",
      choices: Object.freeze([{ id: "ok", labelKo: "고마워요", labelEn: "Thanks", next: "farewell" }]),
    }),
    Object.freeze({
      id: "meeting-info",
      textKo: "회의실은 동쪽 끝이에요. 문을 열고 들어가면 화이트보드가 보일 거예요.",
      textEn: "The meeting room is at the east end. Open the door and you'll see the whiteboard.",
      choices: Object.freeze([{ id: "ok", labelKo: "고마워요", labelEn: "Thanks", next: "farewell" }]),
    }),
    Object.freeze({
      id: "minigame-info",
      textKo: "미니게임 존은 각 방에 있어요! 🎮 가까이 가면 초대 메시지가 뜹니다.",
      textEn: "Mini-game zones are in each room! 🎮 Walk close to see an invitation.",
      choices: Object.freeze([{ id: "ok", labelKo: "신나네요!", labelEn: "Exciting!", next: "farewell" }]),
    }),
    Object.freeze({
      id: "farewell",
      textKo: "언제든 불러주세요. 좋은 하루 되세요!",
      textEn: "Call me anytime. Have a great day!",
      choices: Object.freeze([]),
      terminal: true,
    }),
  ]),
});
