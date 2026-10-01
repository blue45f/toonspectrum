/**
 * NPC 주민 말풍선·짧은 대화·이모트 반응 스케줄러(로컬 연출 전용).
 *
 * - 프레즌스로 보내지 않는다. 실제 접속자가 한 말처럼 보이지 않게 모든 말풍선은 NPC 이름표
 *   ("NPC · …") 위에만 뜨고 NPC 전용 테두리(--color-accent-2)를 쓴다.
 * - 시각과 시드가 같으면 같은 대사를 고른다(결정적). 테스트와 화면 재현이 쉽다.
 * - 집중·자리 비움·focus 분위기에서는 말풍선을 끈다. 모션 줄이기는 빈도를 절반으로 줄인다.
 */
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioNpcPhase, StudioNpcRole } from "./studio-virtual-space-npc-director";

export interface StudioNpcChatterLine {
  readonly ko: string;
  readonly en: string;
}

const line = (ko: string, en: string): StudioNpcChatterLine => Object.freeze({ ko, en });

/** 한국어는 18자 이하. 이미지 1(콘셉트 보드)의 대사를 포함한다. */
const ROLE_LINES: Readonly<Record<StudioNpcRole, readonly StudioNpcChatterLine[]>> = Object.freeze({
  guide: [line("어서오세요!", "Welcome!"), line("길 안내가 필요하세요?", "Need directions?"),
    line("광장 분수 보셨어요?", "Seen the plaza fountain?"), line("오늘도 반가워요!", "Good to see you!")],
  producer: [line("일정 한번 볼까요?", "Shall we check the plan?"), line("마감까지 파이팅!", "Deadline, let's go!"),
    line("회의는 토크 룸에서요", "Meetings in the Talk room")],
  editor: [line("이 컷 정말 좋네요!", "Love this panel!"), line("검수 거의 끝났어요", "Review almost done"),
    line("갤러리 구경 오세요", "Come visit the gallery")],
  writer: [line("재밌는 이야기네요!", "What a fun story!"), line("다음 화가 궁금해요", "Can't wait for more"),
    line("아이디어 나눠요!", "Let's share ideas!")],
  artist: [line("함께 만들어요!", "Let's make it together!"), line("선 하나 더 다듬는 중", "Refining one more line"),
    line("색감 어때요?", "How are the colors?")],
  librarian: [line("자료는 여기 있어요", "References are here"), line("버전 정리 끝!", "Versions sorted!")],
  cafe: [line("커피 한잔 할까요?", "Coffee break?"), line("오늘의 라떼 추천!", "Try today's latte!"),
    line("잠깐 쉬어 가세요", "Take a short break")],
  security: [line("회의 중엔 조용히!", "Quiet, meeting on"), line("출입 확인했어요", "Entry confirmed")],
  host: [line("곧 무대 시작해요!", "Stage starts soon!"), line("박수 준비됐나요?", "Ready to cheer?"),
    line("멋진 공간이에요!", "What a great space!")],
  resident: [line("좋은 하루예요!", "Have a nice day!")],
});

const COMMON_LINES: readonly StudioNpcChatterLine[] = Object.freeze([
  line("멋진 공간이에요!", "What a great space!"), line("함께 만들어요!", "Let's make it together!"),
  line("좋은 하루예요!", "Have a nice day!"),
]);

/** 쉬는 두 NPC가 번갈아 말하는 짧은 대화. */
const CONVERSATIONS: readonly (readonly [StudioNpcChatterLine, StudioNpcChatterLine])[] = Object.freeze([
  [line("커피 한잔 할까요?", "Coffee break?"), line("좋아요, 가요!", "Sure, let's go!")],
  [line("새 에피소드 봤어요?", "Seen the new episode?"), line("재밌는 이야기네요!", "What a fun story!")],
  [line("오늘 작업 어때요?", "How's work today?"), line("거의 다 했어요!", "Almost done!")],
  [line("여기 멋진 공간이에요!", "This place is great!"), line("함께 만들어요!", "Let's make it together!")],
]);

const GREETING_LINES: Readonly<Partial<Record<StudioNpcRole, StudioNpcChatterLine>>> = Object.freeze({
  guide: line("어서오세요!", "Welcome!"),
  cafe: line("어서오세요!", "Welcome!"),
  host: line("반가워요!", "Nice to see you!"),
});

export function studioNpcChatterLines(role: StudioNpcRole): readonly StudioNpcChatterLine[] {
  return [...ROLE_LINES[role], ...COMMON_LINES];
}

export function studioNpcGreetingLine(role: StudioNpcRole): StudioNpcChatterLine {
  return GREETING_LINES[role] ?? line("안녕하세요!", "Hello!");
}

function hash(value: string): number {
  let seed = 2166136261;
  for (const char of value) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

/** 역할·시드·순번이 같으면 항상 같은 대사를 고른다. */
export function studioNpcChatterLine(role: StudioNpcRole, seed: string, slot: number): StudioNpcChatterLine {
  const lines = studioNpcChatterLines(role);
  return lines[hash(`${seed}:${role}:${slot}`) % lines.length] ?? COMMON_LINES[0] ?? line("안녕하세요!", "Hello!");
}

export interface StudioNpcChatterActor {
  readonly id: string;
  readonly role: StudioNpcRole;
  readonly point: StudioVirtualSpacePoint;
  readonly phase: StudioNpcPhase;
  /** 카메라 안에 보이는지. 화면 밖 NPC는 말하지 않는다. */
  readonly visible: boolean;
  readonly greeting: boolean;
}

export interface StudioNpcChatterInput {
  readonly time: number;
  readonly actors: readonly StudioNpcChatterActor[];
  /** 집중·자리 비움·focus 분위기·입력 차단 중이면 true. */
  readonly quiet: boolean;
  readonly reducedMotion: boolean;
}

export interface StudioNpcSpeechBubble {
  readonly npcId: string;
  readonly text: StudioNpcChatterLine;
  readonly until: number;
  /** 대화의 두 번째 줄이면 true. */
  readonly reply: boolean;
}

export interface StudioNpcEmoteResponse {
  readonly npcId: string;
  readonly emote: StudioSpaceEmoteId;
  readonly at: number;
}

export const STUDIO_NPC_CHATTER_MIN_GAP_MS = 8_000;
export const STUDIO_NPC_CHATTER_MAX_GAP_MS = 14_000;
export const STUDIO_NPC_SPEECH_MS = 3_200;
/** 프레임이 아주 느린 기기에서도 말풍선이 최소 이만큼의 step(렌더 프레임)에는 보인다. 60fps에서는 영향이 없다. */
export const STUDIO_NPC_SPEECH_MIN_FRAMES = 3;
export const STUDIO_NPC_CONVERSATION_RADIUS = 70;
export const STUDIO_NPC_EMOTE_RESPONSE_RADIUS = 160;

/** 플레이어 이모트에 대한 NPC 반응. 목록에 없는 이모트에는 반응하지 않는다. */
export const STUDIO_NPC_EMOTE_RESPONSES: Readonly<Partial<Record<StudioSpaceEmoteId, StudioSpaceEmoteId>>> = Object.freeze({
  wave: "wave",
  heart: "heart",
  dance: "clap",
  laugh: "laugh",
  party: "clap",
  "thumbs-up": "thumbs-up",
  clap: "clap",
});

/** 말 대신 머리 위 이모트로 기분을 드러내는 역할별 습관. */
export const STUDIO_NPC_ROLE_EMOTES: Readonly<Record<StudioNpcRole, StudioSpaceEmoteId>> = Object.freeze({
  guide: "wave",
  producer: "thumbs-up",
  editor: "think",
  writer: "idea",
  artist: "sparkles",
  librarian: "idea",
  cafe: "coffee",
  security: "exclaim",
  host: "music",
  resident: "heart",
});

/** 세 번 중 한 번쯤은 말 대신 이모트를 띄운다. */
const EMOTE_TURN_DIVISOR = 3;
/** 짧은 대화의 답이 나온 뒤 먼저 말한 NPC가 웃는 간격. */
const CONVERSATION_LAUGH_DELAY_MS = 700;

function resting(phase: StudioNpcPhase): boolean {
  return phase === "rest" || phase === "wait";
}

export class StudioNpcChatterScheduler {
  private nextAt: number | null = null;
  private turn = 0;
  private bubbles: StudioNpcSpeechBubble[] = [];
  private readonly bubbleFrames = new WeakMap<StudioNpcSpeechBubble, number>();
  private pendingReply: {
    readonly npcId: string; readonly text: StudioNpcChatterLine; readonly at: number; readonly partnerId: string;
  } | null = null;
  private responses: StudioNpcEmoteResponse[] = [];
  private readonly greeted = new Set<string>();

  constructor(private readonly seed = "studio-npc-chatter") {}

  private gap(reducedMotion: boolean): number {
    const span = STUDIO_NPC_CHATTER_MAX_GAP_MS - STUDIO_NPC_CHATTER_MIN_GAP_MS;
    const gap = STUDIO_NPC_CHATTER_MIN_GAP_MS + hash(`${this.seed}:gap:${this.turn}`) % (span + 1);
    return reducedMotion ? gap * 2 : gap;
  }

  /** 한 프레임을 진행하고 지금 보여야 할 말풍선을 돌려준다. */
  step(input: StudioNpcChatterInput): readonly StudioNpcSpeechBubble[] {
    const { time } = input;
    if (!Number.isFinite(time)) return this.bubbles;
    if (input.quiet) {
      this.bubbles = [];
      this.pendingReply = null;
      this.nextAt = null;
      return this.bubbles;
    }
    const byId = new Map(input.actors.map((actor) => [actor.id, actor] as const));
    this.bubbles = this.bubbles.filter((bubble) => {
      if (!byId.get(bubble.npcId)?.visible) return false;
      const frames = (this.bubbleFrames.get(bubble) ?? 0) + 1;
      this.bubbleFrames.set(bubble, frames);
      return bubble.until > time || frames <= STUDIO_NPC_SPEECH_MIN_FRAMES;
    });
    for (const actor of input.actors) {
      if (!actor.greeting) { this.greeted.delete(actor.id); continue; }
      if (!actor.visible || this.greeted.has(actor.id)) continue;
      this.greeted.add(actor.id);
      this.show(actor.id, studioNpcGreetingLine(actor.role), time, false);
    }
    if (this.pendingReply && time >= this.pendingReply.at) {
      const reply = this.pendingReply;
      this.pendingReply = null;
      if (byId.get(reply.npcId)?.visible) {
        this.show(reply.npcId, reply.text, time, true);
        this.schedule(reply.partnerId, "laugh", time + CONVERSATION_LAUGH_DELAY_MS);
      }
    }
    if (this.nextAt === null) { this.nextAt = time + this.gap(input.reducedMotion) / 2; return this.bubbles; }
    if (time < this.nextAt || this.pendingReply) return this.bubbles;
    this.turn += 1;
    this.nextAt = time + this.gap(input.reducedMotion);
    const speaking = new Set(this.bubbles.map((bubble) => bubble.npcId));
    const candidates = input.actors.filter((actor) => actor.visible && !speaking.has(actor.id));
    if (candidates.length === 0) return this.bubbles;
    const pair = this.restingPair(candidates);
    if (pair) {
      const conversation = CONVERSATIONS[hash(`${this.seed}:talk:${this.turn}`) % CONVERSATIONS.length] ?? CONVERSATIONS[0];
      if (conversation) {
        this.show(pair[0].id, conversation[0], time, false);
        this.pendingReply = { npcId: pair[1].id, text: conversation[1], at: time + STUDIO_NPC_SPEECH_MS * 0.8, partnerId: pair[0].id };
        return this.bubbles;
      }
    }
    const speaker = candidates[hash(`${this.seed}:who:${this.turn}`) % candidates.length];
    if (!speaker) return this.bubbles;
    if (hash(`${this.seed}:mode:${this.turn}`) % EMOTE_TURN_DIVISOR === 0) this.schedule(speaker.id, STUDIO_NPC_ROLE_EMOTES[speaker.role], time);
    else this.show(speaker.id, studioNpcChatterLine(speaker.role, this.seed, this.turn), time, false);
    return this.bubbles;
  }

  private restingPair(candidates: readonly StudioNpcChatterActor[]): readonly [StudioNpcChatterActor, StudioNpcChatterActor] | null {
    const restingActors = candidates.filter((actor) => resting(actor.phase));
    for (let i = 0; i < restingActors.length; i += 1) {
      for (let j = i + 1; j < restingActors.length; j += 1) {
        const a = restingActors[i], b = restingActors[j];
        if (a && b && Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y) <= STUDIO_NPC_CONVERSATION_RADIUS) return [a, b];
      }
    }
    return null;
  }

  /** NPC 이모트를 예약한다. 같은 NPC의 이전 예약은 새 예약으로 바꾼다. */
  private schedule(npcId: string, emote: StudioSpaceEmoteId, at: number): void {
    this.responses = [...this.responses.filter((item) => item.npcId !== npcId), Object.freeze({ npcId, emote, at })];
  }

  private show(npcId: string, text: StudioNpcChatterLine, time: number, reply: boolean): void {
    this.bubbles = [...this.bubbles.filter((bubble) => bubble.npcId !== npcId),
      Object.freeze({ npcId, text, until: time + STUDIO_NPC_SPEECH_MS, reply })];
  }

  /**
   * 플레이어 이모트에 가까운 NPC(160px 안, 최대 2명)가 0.4~0.9초 뒤 대응 이모트로 반응하도록 예약한다.
   * 집중(quiet) 중에는 예약하지 않는다.
   */
  reactToPlayerEmote(
    emote: StudioSpaceEmoteId,
    time: number,
    player: StudioVirtualSpacePoint,
    actors: readonly StudioNpcChatterActor[],
    quiet: boolean,
  ): readonly StudioNpcEmoteResponse[] {
    const response = STUDIO_NPC_EMOTE_RESPONSES[emote];
    if (!response || quiet || !Number.isFinite(time)) return [];
    const nearby = actors
      .map((actor) => ({ actor, distance: Math.hypot(actor.point.x - player.x, actor.point.y - player.y) }))
      .filter(({ actor, distance }) => actor.visible && distance <= STUDIO_NPC_EMOTE_RESPONSE_RADIUS)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 2);
    const scheduled = nearby.map(({ actor }, index) => Object.freeze({
      npcId: actor.id,
      emote: response,
      at: time + 400 + (hash(`${this.seed}:react:${actor.id}:${time}`) % 351) + index * 150,
    }));
    this.responses = [...this.responses.filter((item) => !scheduled.some((next) => next.npcId === item.npcId)), ...scheduled];
    return scheduled;
  }

  /** 예약된 반응 중 지금 재생할 것을 꺼낸다. */
  dueResponses(time: number): readonly StudioNpcEmoteResponse[] {
    if (this.responses.length === 0) return [];
    const due = this.responses.filter((item) => item.at <= time);
    if (due.length) this.responses = this.responses.filter((item) => item.at > time);
    return due;
  }

  reset(): void {
    this.bubbles = [];
    this.pendingReply = null;
    this.responses = [];
    this.nextAt = null;
    this.greeted.clear();
  }
}
