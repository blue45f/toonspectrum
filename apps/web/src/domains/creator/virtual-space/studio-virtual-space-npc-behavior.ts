/**
 * NPC 행동 상태머신 (Track 4 · NPC 행동 패턴)
 *
 * idle(대기) / wander(배회) / patrol(순찰) 세 가지 행동 모드를 오가는
 * 명시적 상태머신. 실제 이동은 `studio-virtual-space-npc-wander.ts`의
 * 배회 AI를 재사용하고, 이 모듈은 "언제 무엇을 할지"만 결정한다.
 *
 * - idle: 홈 위치에서 대기. 결정적 대기 시간이 지나면 다음 행동 선택.
 * - wander: 웨이포인트 중 하나를 골라 다녀온 뒤 idle로 복귀.
 * - patrol: 웨이포인트를 1~2바퀴 순찰한 뒤 idle로 복귀.
 *
 * 모든 전이는 결정적이다 (npcId + 전이 횟수 시드). 순수 로직 모듈.
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  advanceNpcWander,
  createNpcWanderState,
  type StudioNpcWanderState,
} from "./studio-virtual-space-npc-wander";
import type { StudioSpaceObstacle } from "./studio-virtual-space-physics";

/** NPC 행동 모드. */
export type StudioNpcBehaviorMode = "idle" | "wander" | "patrol";

export const STUDIO_NPC_BEHAVIOR_MODES: readonly StudioNpcBehaviorMode[] = Object.freeze([
  "idle", "wander", "patrol",
]);

export interface StudioNpcBehaviorConfig {
  /** 대기·복귀 기준 위치. */
  readonly home: StudioVirtualSpacePoint;
  /** 배회·순찰 경로 (월드 좌표). */
  readonly waypoints: readonly StudioVirtualSpacePoint[];
  /** 시작 모드 (기본: 웨이포인트 수로 자동 결정). */
  readonly initialMode?: StudioNpcBehaviorMode;
}

export interface StudioNpcBehaviorState {
  readonly config: StudioNpcBehaviorConfig;
  readonly mode: StudioNpcBehaviorMode;
  readonly wander: StudioNpcWanderState;
  readonly modeEnteredAtMs: number;
  /** idle 종료 시각 (ms epoch). */
  readonly idleUntilMs: number;
  /** 행동 전이 횟수 (결정적 시드용). */
  readonly cycle: number;
  /** patrol 시작 시점의 방문 카운트. */
  readonly patrolStartVisits: number;
  /** 이번 patrol에서 돌 바퀴 수. */
  readonly patrolLoopsTarget: number;
  /** wander 시작 시점의 방문 카운트. */
  readonly wanderStartVisits: number;
}

export type StudioNpcBehaviorEvent =
  | { readonly kind: "npc-behavior-mode-changed"; readonly from: StudioNpcBehaviorMode; readonly to: StudioNpcBehaviorMode };

export interface StudioNpcBehaviorInput {
  readonly obstacles: readonly StudioSpaceObstacle[];
  readonly others: readonly StudioVirtualSpacePoint[];
  readonly deltaSeconds: number;
  readonly nowMs: number;
}

/** idle 대기 시간 범위 (ms). */
export const STUDIO_NPC_BEHAVIOR_IDLE_MIN_MS = 4_000;
export const STUDIO_NPC_BEHAVIOR_IDLE_MAX_MS = 12_000;

function hash01(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

function defaultInitialMode(config: StudioNpcBehaviorConfig): StudioNpcBehaviorMode {
  if (config.initialMode) return config.initialMode;
  if (config.waypoints.length >= 2) return "patrol";
  if (config.waypoints.length === 1) return "wander";
  return "idle";
}

/** npcId로 시작하는 NPC 행동 상태를 만든다. */
export function createNpcBehavior(config: StudioNpcBehaviorConfig, nowMs: number): StudioNpcBehaviorState {
  const mode = defaultInitialMode(config);
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const idleDuration = STUDIO_NPC_BEHAVIOR_IDLE_MIN_MS
    + hash01(`${config.home.x},${config.home.y}:idle:0`) * (STUDIO_NPC_BEHAVIOR_IDLE_MAX_MS - STUDIO_NPC_BEHAVIOR_IDLE_MIN_MS);
  return Object.freeze({
    config: Object.freeze({ ...config, waypoints: Object.freeze([...config.waypoints]) }),
    mode,
    wander: createNpcWanderState(config.home),
    modeEnteredAtMs: now,
    idleUntilMs: now + idleDuration,
    cycle: 0,
    patrolStartVisits: 0,
    patrolLoopsTarget: 1,
    wanderStartVisits: 0,
  });
}

function idleDurationMs(npcId: string, cycle: number): number {
  return STUDIO_NPC_BEHAVIOR_IDLE_MIN_MS
    + hash01(`${npcId}:idle:${cycle}`) * (STUDIO_NPC_BEHAVIOR_IDLE_MAX_MS - STUDIO_NPC_BEHAVIOR_IDLE_MIN_MS);
}

/** idle 종료 후 다음 행동을 고른다. */
function pickNextMode(npcId: string, cycle: number, waypointCount: number): StudioNpcBehaviorMode {
  if (waypointCount === 0) return "idle";
  if (waypointCount === 1) return "wander";
  return hash01(`${npcId}:pick:${cycle}`) < 0.5 ? "patrol" : "wander";
}

function enterMode(
  state: StudioNpcBehaviorState,
  npcId: string,
  to: StudioNpcBehaviorMode,
  nowMs: number,
  events: StudioNpcBehaviorEvent[],
): StudioNpcBehaviorState {
  const cycle = state.cycle + 1;
  events.push(Object.freeze({ kind: "npc-behavior-mode-changed", from: state.mode, to }));
  if (to === "idle") {
    return Object.freeze({
      ...state,
      mode: to,
      modeEnteredAtMs: nowMs,
      idleUntilMs: nowMs + idleDurationMs(npcId, cycle),
      cycle,
      wander: createNpcWanderState(state.wander.physics.position),
    });
  }
  if (to === "wander") {
    // 웨이포인트 중 하나를 골라 다녀온다. 목표 선택은 advanceNpcBehavior에서
    // `${npcId}:wander:${cycle}` 시드로 결정적으로 다시 계산한다.
    return Object.freeze({
      ...state,
      mode: to,
      modeEnteredAtMs: nowMs,
      cycle,
      wander: createNpcWanderState(state.wander.physics.position),
      wanderStartVisits: 0,
    });
  }
  // patrol: 전체 웨이포인트 순환, 1~2바퀴 뒤 idle.
  const loopsTarget = 1 + Math.floor(hash01(`${npcId}:loops:${cycle}`) * 2);
  return Object.freeze({
    ...state,
    mode: to,
    modeEnteredAtMs: nowMs,
    cycle,
    wander: createNpcWanderState(state.wander.physics.position),
    patrolStartVisits: 0,
    patrolLoopsTarget: loopsTarget,
  });
}

export interface StudioNpcBehaviorStep {
  readonly state: StudioNpcBehaviorState;
  readonly events: readonly StudioNpcBehaviorEvent[];
}

/**
 * NPC 행동을 한 스텝 전진시킨다.
 * 이동 자체는 배회 AI에 위임하고, 모드 전이만 이 모듈이 결정한다.
 */
export function advanceNpcBehavior(
  state: StudioNpcBehaviorState,
  npcId: string,
  input: StudioNpcBehaviorInput,
): StudioNpcBehaviorStep {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  const events: StudioNpcBehaviorEvent[] = [];
  const waypoints = state.mode === "idle"
    ? []
    : state.mode === "wander"
      ? [state.config.waypoints[Math.floor(hash01(`${npcId}:wander:${state.cycle}`) * state.config.waypoints.length) % Math.max(1, state.config.waypoints.length)] ?? state.config.home]
      : state.config.waypoints;

  const wander = advanceNpcWander(state.wander, npcId, {
    waypoints,
    obstacles: input.obstacles,
    others: input.others,
    deltaSeconds: input.deltaSeconds,
    nowMs,
  });

  if (state.mode === "idle") {
    if (nowMs >= state.idleUntilMs) {
      const next = enterMode({ ...state, wander }, npcId, pickNextMode(npcId, state.cycle, state.config.waypoints.length), nowMs, events);
      return { state: next, events: Object.freeze(events) };
    }
    return { state: Object.freeze({ ...state, wander }), events: Object.freeze(events) };
  }

  if (state.mode === "wander") {
    // 목표 웨이포인트에 도착(방문 카운트 증가 + 대기 중)하면 idle로 복귀.
    const arrived = wander.visitCount > state.wanderStartVisits && wander.status === "waiting";
    if (arrived) {
      const next = enterMode({ ...state, wander }, npcId, "idle", nowMs, events);
      return { state: next, events: Object.freeze(events) };
    }
    return { state: Object.freeze({ ...state, wander }), events: Object.freeze(events) };
  }

  // patrol: 목표 바퀴 수를 채우면 idle로 복귀.
  const visits = wander.visitCount - state.patrolStartVisits;
  const loopsDone = Math.floor(visits / Math.max(1, state.config.waypoints.length));
  if (loopsDone >= state.patrolLoopsTarget && state.config.waypoints.length > 0) {
    const next = enterMode({ ...state, wander }, npcId, "idle", nowMs, events);
    return { state: next, events: Object.freeze(events) };
  }
  return { state: Object.freeze({ ...state, wander }), events: Object.freeze(events) };
}

/** 현재 행동 모드의 한글·영문 라벨. */
export function npcBehaviorModeLabel(mode: StudioNpcBehaviorMode): { readonly ko: string; readonly en: string } {
  switch (mode) {
    case "idle": return { ko: "대기", en: "Idle" };
    case "wander": return { ko: "배회", en: "Wandering" };
    case "patrol": return { ko: "순찰", en: "Patrolling" };
  }
}
