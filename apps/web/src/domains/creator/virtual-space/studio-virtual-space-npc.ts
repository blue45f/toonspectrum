import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioVirtualSpaceDistance } from "./studio-virtual-space-model";
import { studioNpcSchedulePeriod, type StudioNpcSchedulePeriod } from "./studio-virtual-space-npc-schedule";
import {
  advanceNpcWander,
  createNpcWanderState,
  type StudioNpcWanderState,
} from "./studio-virtual-space-npc-wander";
import type { StudioSpaceObstacle } from "./studio-virtual-space-physics";

/**
 * 상주 NPC 시스템 (분위기형 NPC)
 *
 * 가상 오피스에 생기를 주는 4종의 NPC:
 * - 안내 NPC (모아 · 컨시어지): 입구에서 환영 + 조작법 안내
 * - 바리스타 NPC (린 · 카페 매니저): 커피 제공 (☕ 휴식 버프)
 * - 멘토 NPC (하루 · 아틀리에 메이트): 드로잉 팁 제공
 * - 리셉션 NPC (윤 · 프로듀서): 회의실 예약 도움
 *
 * - 웨이포인트 순찰 (배회 AI 사용)
 * - 플레이어 접근 시 바라보기 + 인사 말풍선
 * - 시간대별 행동 (npc-schedule의 period 재사용)
 *
 * 순수 로직 모듈. 실제 렌더링·대화 UI는 호출 측에서 담당한다.
 */

/** NPC 역할. */
export type StudioAmbientNpcRole = "guide" | "barista" | "mentor" | "receptionist";

/** NPC 서비스 종류. */
export type StudioNpcServiceKind = "coffee" | "tip" | "booking" | "tour";

export interface StudioAmbientNpcDefinition {
  readonly id: string;
  readonly role: StudioAmbientNpcRole;
  /** 기존 npc-cast 스킨 키. */
  readonly skinKey: string;
  readonly nameKo: string;
  readonly nameEn: string;
  /** 순찰 웨이포인트 (월드 좌표 1280x960). */
  readonly waypoints: readonly StudioVirtualSpacePoint[];
  /** 대기/고정 위치. */
  readonly home: StudioVirtualSpacePoint;
}

/** 기본 상주 NPC 4종. */
export const STUDIO_AMBIENT_NPC_DEFINITIONS: readonly StudioAmbientNpcDefinition[] = Object.freeze([
  {
    id: "npc-guide-moa",
    role: "guide",
    skinKey: "npc-concierge",
    nameKo: "모아",
    nameEn: "Moa",
    home: { x: 640, y: 140 },
    waypoints: [
      { x: 640, y: 140 },
      { x: 420, y: 220 },
      { x: 860, y: 220 },
      { x: 640, y: 340 },
    ],
  },
  {
    id: "npc-barista-lin",
    role: "barista",
    skinKey: "npc-cafe",
    nameKo: "린",
    nameEn: "Rin",
    home: { x: 1060, y: 720 },
    waypoints: [
      { x: 1060, y: 720 },
      { x: 980, y: 660 },
      { x: 1140, y: 660 },
    ],
  },
  {
    id: "npc-mentor-haru",
    role: "mentor",
    skinKey: "npc-artist",
    nameKo: "하루",
    nameEn: "Haru",
    home: { x: 240, y: 720 },
    waypoints: [
      { x: 240, y: 720 },
      { x: 330, y: 650 },
      { x: 150, y: 650 },
    ],
  },
  {
    id: "npc-reception-yoon",
    role: "receptionist",
    skinKey: "npc-producer",
    nameKo: "윤",
    nameEn: "Yoon",
    home: { x: 640, y: 500 },
    waypoints: [
      { x: 640, y: 500 },
      { x: 520, y: 430 },
      { x: 760, y: 430 },
    ],
  },
]);

export interface StudioAmbientNpcState {
  readonly definition: StudioAmbientNpcDefinition;
  readonly wander: StudioNpcWanderState;
  /** 마지막 인사 시각 (ms epoch, 0이면 인사한 적 없음). */
  readonly lastGreetedAtMs: number;
  /** 서비스 말풍선 표시 종료 시각 (ms epoch). */
  readonly servingUntilMs: number;
  readonly lastService: StudioNpcServiceKind | null;
}

export type StudioAmbientNpcEvent =
  | { readonly kind: "npc-greeted"; readonly npcId: string; readonly role: StudioAmbientNpcRole }
  | { readonly kind: "npc-service"; readonly npcId: string; readonly role: StudioAmbientNpcRole; readonly service: StudioNpcServiceKind };

export interface StudioAmbientNpcInput {
  readonly selfPoint: StudioVirtualSpacePoint;
  readonly obstacles: readonly StudioSpaceObstacle[];
  readonly others: readonly StudioVirtualSpacePoint[];
  readonly deltaSeconds: number;
  readonly nowMs: number;
  /** NPC 스케줄 주기 경과 시간 (ms). */
  readonly elapsedMs: number;
}

/** 인사 판정 반경. */
export const STUDIO_NPC_GREET_RADIUS = 130;
/** 같은 NPC의 인사 쿨다운. */
export const STUDIO_NPC_GREET_COOLDOWN_MS = 90_000;
/** 서비스 말풍선 표시 시간. */
export const STUDIO_NPC_SERVICE_BUBBLE_MS = 4_000;

/** 시간대별 행동 힌트. */
export type StudioNpcTimeHint = "patrol" | "station" | "serve" | "welcome";

export function ambientNpcTimeHint(
  role: StudioAmbientNpcRole,
  period: StudioNpcSchedulePeriod,
): StudioNpcTimeHint {
  switch (role) {
    case "guide":
      return period === "arrival" ? "welcome" : "patrol";
    case "barista":
      return period === "break" ? "serve" : "patrol";
    case "mentor":
      return period === "work" || period === "review" ? "station" : "patrol";
    case "receptionist":
      return period === "meeting" ? "station" : "patrol";
  }
}

export function createAmbientNpcStates(
  definitions: readonly StudioAmbientNpcDefinition[] = STUDIO_AMBIENT_NPC_DEFINITIONS,
): readonly StudioAmbientNpcState[] {
  return Object.freeze(definitions.map((definition) => Object.freeze({
    definition,
    wander: createNpcWanderState(definition.home),
    lastGreetedAtMs: 0,
    servingUntilMs: 0,
    lastService: null,
  })));
}

function facingToward(from: StudioVirtualSpacePoint, to: StudioVirtualSpacePoint): StudioVirtualSpaceFacing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

function roleService(role: StudioAmbientNpcRole): StudioNpcServiceKind {
  switch (role) {
    case "guide": return "tour";
    case "barista": return "coffee";
    case "mentor": return "tip";
    case "receptionist": return "booking";
  }
}

/**
 * 상주 NPC 전체를 한 스텝 전진시킨다.
 * 시간대별 힌트에 따라 순찰/고정을 전환하고, 플레이어 접근 시 인사 이벤트를 발행한다.
 */
export function advanceAmbientNpcs(
  states: readonly StudioAmbientNpcState[],
  input: StudioAmbientNpcInput,
): { readonly states: readonly StudioAmbientNpcState[]; readonly events: readonly StudioAmbientNpcEvent[] } {
  const period = studioNpcSchedulePeriod(input.elapsedMs);
  const events: StudioAmbientNpcEvent[] = [];
  const next = states.map((npc) => {
    const hint = ambientNpcTimeHint(npc.definition.role, period);
    // station/serve/welcome 힌트에서는 홈에 머문다
    const waypoints = hint === "patrol" ? npc.definition.waypoints : [npc.definition.home];
    const wander = advanceNpcWander(npc.wander, npc.definition.id, {
      waypoints,
      obstacles: input.obstacles,
      others: input.others,
      deltaSeconds: input.deltaSeconds,
      nowMs: input.nowMs,
    });
    const position = wander.physics.position;
    const distance = studioVirtualSpaceDistance(position, input.selfPoint);
    let lastGreetedAtMs = npc.lastGreetedAtMs;
    let facing = wander.facing;
    // 플레이어가 다가오면 바라보고 인사한다 (쿨다운 적용).
    // lastGreetedAtMs가 0이면 인사한 적이 없다는 뜻이다.
    const cooledDown = lastGreetedAtMs <= 0 || input.nowMs - lastGreetedAtMs >= STUDIO_NPC_GREET_COOLDOWN_MS;
    if (distance <= STUDIO_NPC_GREET_RADIUS && cooledDown) {
      lastGreetedAtMs = input.nowMs;
      facing = facingToward(position, input.selfPoint);
      events.push(Object.freeze({
        kind: "npc-greeted",
        npcId: npc.definition.id,
        role: npc.definition.role,
      }));
    }
    return Object.freeze({
      ...npc,
      wander: Object.freeze({ ...wander, facing }),
      lastGreetedAtMs,
    });
  });
  return { states: Object.freeze(next), events: Object.freeze(events) };
}

/**
 * NPC 서비스를 실행한다 (플레이어가 NPC를 클릭/선택했을 때 호출).
 * 역할에 맞는 서비스를 제공하고 말풍선을 띄운다.
 */
export function activateNpcService(
  npcId: string,
  states: readonly StudioAmbientNpcState[],
  nowMs: number,
): { readonly states: readonly StudioAmbientNpcState[]; readonly event: StudioAmbientNpcEvent | null } {
  const target = states.find((npc) => npc.definition.id === npcId);
  if (!target) return { states, event: null };
  const service = roleService(target.definition.role);
  const event = Object.freeze({
    kind: "npc-service" as const,
    npcId: target.definition.id,
    role: target.definition.role,
    service,
  });
  const next = states.map((npc) => npc.definition.id === npcId
    ? Object.freeze({ ...npc, servingUntilMs: nowMs + STUDIO_NPC_SERVICE_BUBBLE_MS, lastService: service })
    : npc);
  return { states: Object.freeze(next), event };
}

/** NPC 서비스가 말풍선 표시 중인지. */
export function isNpcServing(npc: StudioAmbientNpcState, nowMs: number): boolean {
  return nowMs < npc.servingUntilMs && npc.lastService !== null;
}

/** 역할 라벨. */
export function npcRoleLabel(role: StudioAmbientNpcRole): { readonly ko: string; readonly en: string } {
  switch (role) {
    case "guide": return { ko: "안내", en: "Guide" };
    case "barista": return { ko: "바리스타", en: "Barista" };
    case "mentor": return { ko: "멘토", en: "Mentor" };
    case "receptionist": return { ko: "리셉션", en: "Reception" };
  }
}

/** 인사 문구. */
export function npcGreetingText(role: StudioAmbientNpcRole): { readonly ko: string; readonly en: string } {
  switch (role) {
    case "guide":
      return { ko: "어서 오세요! 궁금한 곳이 있으면 저를 눌러보세요.", en: "Welcome! Tap me if you need a tour." };
    case "barista":
      return { ko: "어서 오세요! 커피 한 잔 어떠세요? ☕", en: "Welcome! How about a coffee? ☕" };
    case "mentor":
      return { ko: "그림 그릴 때 막히면 언제든 물어보세요.", en: "Ask me anytime you're stuck drawing." };
    case "receptionist":
      return { ko: "회의실 예약 도와드릴까요?", en: "Need help booking a meeting room?" };
  }
}

/** 멘토 드로잉 팁 목록. */
export const STUDIO_NPC_MENTOR_TIPS: readonly string[] = Object.freeze([
  "선은 한 번에 길게 그어보세요. 짧게 끊으면 떨림이 생겨요.",
  "채색 전 선화 레이어를 잠그면 색이 삐져나오지 않아요.",
  "인물의 눈 높이를 일정하게 맞추면 화면이 안정돼요.",
  "배경은 흐리게, 인물은 선명하게 — 시선이 모여요.",
  "스크린톤은 10% 단위로 농도를 조절해보세요.",
  "말풍선 꼬리는 말하는 사람을 정확히 가리켜야 해요.",
]);

export function npcMentorTip(index: number): string {
  const safe = ((index % STUDIO_NPC_MENTOR_TIPS.length) + STUDIO_NPC_MENTOR_TIPS.length) % STUDIO_NPC_MENTOR_TIPS.length;
  return STUDIO_NPC_MENTOR_TIPS[safe] ?? "";
}

/** 서비스 실행 문구. */
export function npcServiceText(
  role: StudioAmbientNpcRole,
  service: StudioNpcServiceKind,
  tipIndex = 0,
): { readonly ko: string; readonly en: string } {
  switch (service) {
    case "coffee":
      return { ko: "따뜻한 커피 나왔습니다! ☕ 잠시 쉬었다 가세요.", en: "Here's a warm coffee! ☕ Take a break." };
    case "tip":
      return { ko: `💡 ${npcMentorTip(tipIndex)}`, en: `💡 ${npcMentorTip(tipIndex)}` };
    case "booking":
      return { ko: "회의실 예약을 도와드릴게요. 원하는 시간을 골라보세요.", en: "Let me help you book a room. Pick a time." };
    case "tour":
      void role;
      return { ko: "가이드 투어를 시작합니다! 저를 따라오세요.", en: "Starting the guide tour! Follow me." };
  }
}
