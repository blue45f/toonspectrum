import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/**
 * 근접 트리거 엔진 (Track C)
 *
 * "다가가면 이벤트 발생"식 공간 트리거의 순수 상태 머신이다.
 * - 트리거: 구역(zone) / NPC / 오브젝트 접근 판정
 * - 이벤트: enter(진입) / stay(체류 n초) / exit(이탈)
 * - 쿨다운: enter 재발화 최소 간격
 * - once: 최초 1회만 발화
 *
 * 완전 순수 함수 모듈. 렌더링·캔버스 연동은 호출 측(B 트랙)이 담당한다.
 * 이벤트 디렉터(studio-virtual-space-event-director.ts)가 이 엔진을 소비한다.
 */

/** 근접 트리거 종류. */
export type StudioProximityTriggerKind = "zone" | "npc" | "object";

export interface StudioProximityTrigger {
  readonly id: string;
  readonly point: StudioVirtualSpacePoint;
  readonly radius: number;
  readonly kind: StudioProximityTriggerKind;
  /** enter 재발화 최소 간격 (ms). 기본값 0. */
  readonly cooldownMs: number;
  /** true면 최초 1회 발화 후 어떤 이벤트도 다시 내지 않는다. */
  readonly once?: boolean;
  /**
   * 체류 판정 임계 (ms). 지정된 경우 진입 후 이 시간만큼 계속 머물면
   * stay 이벤트를 진입당 1회 발화한다. 미지정·0 이하이면 stay를 내지 않는다.
   */
  readonly stayAfterMs?: number;
}

/** 트리거 이벤트 종류. */
export type StudioProximityEventKind = "enter" | "stay" | "exit";

export interface StudioProximityEvent {
  readonly triggerId: string;
  readonly kind: StudioProximityEventKind;
  readonly at: number;
}

interface StudioProximityMemory {
  readonly inside: boolean;
  /** 현재 진입이 UI에 공지됐는지 (enter 발화 여부). 미공지 진입의 stay/exit은 생략한다. */
  readonly announced: boolean;
  readonly enteredAt: number;
  readonly stayFired: boolean;
  readonly lastEnterAt: number;
  readonly done: boolean;
}

const EMPTY_MEMORY: StudioProximityMemory = {
  inside: false,
  announced: false,
  enteredAt: 0,
  stayFired: false,
  lastEnterAt: Number.NEGATIVE_INFINITY,
  done: false,
};

/** 트리거별 진입 상태를 들고 있는 불변 트래커 상태. */
export interface StudioProximityTrackerState {
  readonly triggers: readonly StudioProximityTrigger[];
  readonly memories: ReadonlyMap<string, StudioProximityMemory>;
}

/** 트리거 원 안에 점이 들어있는지 판정한다. */
export function studioProximityTriggerContains(
  trigger: StudioProximityTrigger,
  point: StudioVirtualSpacePoint,
): boolean {
  const radius = Number.isFinite(trigger.radius) ? Math.max(0, trigger.radius) : 0;
  return Math.hypot(point.x - trigger.point.x, point.y - trigger.point.y) <= radius;
}

/** 새 트래커를 만든다. */
export function createStudioProximityTracker(
  triggers: readonly StudioProximityTrigger[],
): StudioProximityTrackerState {
  return Object.freeze({
    triggers: Object.freeze([...triggers]),
    memories: new Map<string, StudioProximityMemory>(),
  });
}

/** 특정 트리거 안에 현재 들어있는지 조회한다. */
export function studioProximityTrackerInside(
  state: StudioProximityTrackerState,
  triggerId: string,
): boolean {
  return state.memories.get(triggerId)?.inside ?? false;
}

function cleanNow(now: number): number {
  return Number.isFinite(now) ? now : 0;
}

/**
 * 한 엔티티의 위치를 갱신하고 발생한 트리거 이벤트를 반환한다.
 *
 * 규칙:
 * - enter: 밖→안 전이 시 발화. 쿨다운 안이면 상태만 갱신하고 생략한다.
 * - stay: stayAfterMs가 지정되고, 공지된 진입이 임계 시간만큼 지속되면 진입당 1회 발화.
 * - exit: 공지된 진입이 끝날 때 항상 발화 (쿨다운과 무관).
 * - once: 최초 enter 발화 후 done — 이후 어떤 이벤트도 내지 않는다.
 */
export function updateStudioProximityTracker(
  state: StudioProximityTrackerState,
  point: StudioVirtualSpacePoint,
  now: number,
): { readonly state: StudioProximityTrackerState; readonly events: readonly StudioProximityEvent[] } {
  const at = cleanNow(now);
  const events: StudioProximityEvent[] = [];
  let memories = state.memories;
  let mutated: Map<string, StudioProximityMemory> | null = null;

  const remember = (id: string, memory: StudioProximityMemory): void => {
    if (mutated === null) mutated = new Map(memories);
    mutated.set(id, memory);
  };

  for (const trigger of state.triggers) {
    const inside = studioProximityTriggerContains(trigger, point);
    const memory = memories.get(trigger.id) ?? EMPTY_MEMORY;
    if (memory.done) {
      if (memory.inside !== inside) remember(trigger.id, { ...memory, inside });
      continue;
    }
    const stayAfterMs = trigger.stayAfterMs ?? 0;
    if (!memory.inside && inside) {
      // 진입
      const cooledDown = at - memory.lastEnterAt >= trigger.cooldownMs;
      if (cooledDown) {
        events.push(Object.freeze({ triggerId: trigger.id, kind: "enter" as const, at }));
        remember(trigger.id, {
          inside: true,
          announced: true,
          enteredAt: at,
          stayFired: false,
          lastEnterAt: at,
          done: trigger.once === true,
        });
      } else {
        remember(trigger.id, { ...memory, inside: true, announced: false, enteredAt: at, stayFired: false });
      }
    } else if (memory.inside && inside) {
      // 체류
      if (memory.announced && !memory.stayFired && stayAfterMs > 0 && at - memory.enteredAt >= stayAfterMs) {
        events.push(Object.freeze({ triggerId: trigger.id, kind: "stay" as const, at }));
        remember(trigger.id, { ...memory, stayFired: true });
      }
    } else if (memory.inside && !inside) {
      // 이탈
      if (memory.announced) {
        events.push(Object.freeze({ triggerId: trigger.id, kind: "exit" as const, at }));
      }
      remember(trigger.id, { ...memory, inside: false, announced: false, enteredAt: 0, stayFired: false });
    }
  }

  const next: StudioProximityTrackerState = mutated === null
    ? state
    : Object.freeze({ triggers: state.triggers, memories: mutated });
  return { state: next, events: Object.freeze(events) };
}
