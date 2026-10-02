/**
 * 가상 스튜디오 앰비언트 순찰 (NPC·동물)
 *
 * NPC와 동물(고양이·강아지·여우·새·나비·토끼)이 정해진 길(웨이포인트)을
 * 오가며 공간에 생동감을 주는 순수 로직 모듈.
 *
 * - 이동은 기존 NPC 배회 엔진(`advanceNpcWander`)을 그대로 재사용한다
 *   (물리·막힘 우회·대기 사이클 포함).
 * - 플레이어와는 충돌하지 않는다: 물리 분리 대상(`others`)에 순찰
 *   배우들끼리만 넣고 플레이어 위치는 넣지 않아, 배우가 플레이어를
 *   막거나 밀어내지 않는다 (스쳐 지나가는 앰비언트 전용).
 * - 날씨 반응: 비·눈·천둥이면 야외 활동을 멈추고 집(첫 웨이포인트)으로
 *   대피한다 (`studioWeatherNpcGuidance` 재사용).
 * - 주야 반응: 마감 시간대이거나 밤이면 집에서 쉰다
 *   (`studioNpcSchedulePeriod` + 주야 라이팅 시간대 재사용).
 * - reduced-motion: 배우를 그 자리에 정지시킨다 (포즈는 그대로 렌더).
 */

import type { StudioAnimalSpriteKind } from "./studio-virtual-space-animal-sprites";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  advanceNpcWander,
  createNpcWanderState,
  type StudioNpcWanderState,
} from "./studio-virtual-space-npc-wander";
import { studioNpcSchedulePeriod } from "./studio-virtual-space-npc-schedule";
import type { StudioSpaceObstacle } from "./studio-virtual-space-physics";
import type { StudioSpriteDirection } from "./studio-virtual-space-sprite";
import { studioWeatherNpcGuidance, type StudioWeatherCondition } from "./studio-virtual-space-weather";
import { studioDayNightLightingPhaseAt } from "./studio-virtual-space-day-night-lighting";

/** 순찰 배우 종류. NPC 1종 + 동물 6종. */
export type StudioAmbientPatrolSpecies = "npc" | StudioAnimalSpriteKind;

/** 순찰 배우 모드. */
export type StudioAmbientPatrolMode = "patrol" | "shelter" | "rest";

/** 순찰 배우 정의. `route`의 첫 지점이 집(대피·휴식 지점)이다. */
export interface StudioAmbientPatrolActorSpec {
  readonly id: string;
  readonly species: StudioAmbientPatrolSpecies;
  readonly route: readonly StudioVirtualSpacePoint[];
}

/** 순찰 배우 상태. */
export interface StudioAmbientPatrolActorState {
  readonly id: string;
  readonly species: StudioAmbientPatrolSpecies;
  readonly route: readonly StudioVirtualSpacePoint[];
  readonly wander: StudioNpcWanderState;
  readonly mode: StudioAmbientPatrolMode;
}

/** 순찰 전체 상태. */
export interface StudioAmbientPatrolState {
  readonly actors: readonly StudioAmbientPatrolActorState[];
}

/** 렌더러가 소비하는 배우 포즈. */
export interface StudioAmbientPatrolPose {
  readonly id: string;
  readonly species: StudioAmbientPatrolSpecies;
  readonly x: number;
  readonly y: number;
  readonly facing: StudioVirtualSpaceFacing;
  readonly spriteDirection: StudioSpriteDirection;
  readonly moving: boolean;
  readonly mode: StudioAmbientPatrolMode;
  /** 대피 중일 때 NPC 대사 키 (그 외에는 "none"). */
  readonly speechKey: "shelter-rain" | "shelter-snow" | "shelter-storm" | "enjoy-clear" | "none";
}

const ORIGIN: StudioVirtualSpacePoint = Object.freeze({ x: 0, y: 0 });

/** 종류별 이동 속도 배율 (시간 가속). 새는 빠르게, 나비는 느리게. */
const SPECIES_SPEED: Readonly<Record<StudioAmbientPatrolSpecies, number>> = Object.freeze({
  npc: 1,
  cat: 1.05,
  dog: 1.15,
  fox: 1.1,
  bird: 1.35,
  butterfly: 0.8,
  rabbit: 1.2,
});

function homeOf(route: readonly StudioVirtualSpacePoint[]): StudioVirtualSpacePoint {
  return route[0] ?? ORIGIN;
}

function poseOf(actor: StudioAmbientPatrolActorState): StudioAmbientPatrolPose {
  const { wander } = actor;
  return Object.freeze({
    id: actor.id,
    species: actor.species,
    x: wander.physics.position.x,
    y: wander.physics.position.y,
    facing: wander.facing,
    spriteDirection: wander.spriteDirection,
    moving: wander.moving,
    mode: actor.mode,
    speechKey: "none",
  });
}

/** 순찰 상태를 만든다. 모든 배우는 집에서 출발한다. */
export function createStudioAmbientPatrol(
  specs: readonly StudioAmbientPatrolActorSpec[],
): StudioAmbientPatrolState {
  return Object.freeze({
    actors: Object.freeze(specs.map((spec) => Object.freeze({
      id: spec.id,
      species: spec.species,
      route: spec.route,
      wander: createNpcWanderState(homeOf(spec.route)),
      mode: "patrol" as const,
    }))),
  });
}

/**
 * 현재 상황(날씨·시간대)에 따른 배우 모드를 정한다.
 * 대피(날씨)가 휴식(밤·마감)보다 우선한다.
 * 가상 시각(timeOfDay)이 있으면 라이팅 시간대로, 없으면 스튜디오
 * 스케줄(12분 하루)의 마감 시간대로 휴식을 판정한다.
 */
export function studioAmbientPatrolMode(input: {
  readonly weather: StudioWeatherCondition | null;
  readonly timeOfDay: number | null;
  readonly scheduleElapsedMs: number;
}): StudioAmbientPatrolMode {
  const guidance = input.weather ? studioWeatherNpcGuidance(input.weather) : null;
  if (guidance?.pauseOutdoor) return "shelter";
  const resting = input.timeOfDay !== null
    ? studioDayNightLightingPhaseAt(input.timeOfDay) === "night"
    : studioNpcSchedulePeriod(input.scheduleElapsedMs) === "closing";
  return resting ? "rest" : "patrol";
}

/**
 * 순찰을 한 스텝 전진시킨다.
 * 플레이어 위치(`players`)는 받지만 물리 분리 대상에 넣지 않는다 —
 * 순찰 배우는 플레이어를 막지 않고 스쳐 지나간다 (비차단 보장).
 */
export function stepStudioAmbientPatrol(
  state: StudioAmbientPatrolState,
  input: {
    readonly deltaSeconds: number;
    readonly nowMs: number;
    readonly obstacles: readonly StudioSpaceObstacle[];
    readonly players: readonly StudioVirtualSpacePoint[];
    readonly weather: StudioWeatherCondition | null;
    readonly timeOfDay: number | null;
    readonly reducedMotion: boolean;
    /** 스튜디오 스케줄 경과(ms). timeOfDay가 없을 때만 휴식 판정에 쓴다. */
    readonly scheduleElapsedMs?: number;
  },
): { readonly state: StudioAmbientPatrolState; readonly poses: readonly StudioAmbientPatrolPose[] } {
  const mode = studioAmbientPatrolMode({
    weather: input.weather,
    timeOfDay: input.timeOfDay,
    scheduleElapsedMs: input.scheduleElapsedMs ?? input.nowMs,
  });
  const guidance = input.weather ? studioWeatherNpcGuidance(input.weather) : null;
  // 플레이어 비차단: 순찰 배우끼리만 분리 대상으로 삼는다.
  const positions = state.actors.map((actor) => actor.wander.physics.position);
  const actors = state.actors.map((actor, index) => {
    const others = positions.filter((_, otherIndex) => otherIndex !== index);
    const waypoints = mode === "patrol" ? actor.route : [homeOf(actor.route)];
    const wander = input.reducedMotion
      ? actor.wander
      : advanceNpcWander(actor.wander, actor.id, {
          waypoints,
          obstacles: input.obstacles,
          others,
          deltaSeconds: input.deltaSeconds * (SPECIES_SPEED[actor.species] ?? 1),
          nowMs: input.nowMs,
        });
    return Object.freeze({ ...actor, wander, mode });
  });
  const speechKey = mode === "shelter" && guidance ? guidance.speechKey : "none";
  return Object.freeze({
    state: Object.freeze({ actors: Object.freeze(actors) }),
    poses: Object.freeze(actors.map((actor) => Object.freeze({ ...poseOf(actor), speechKey }))),
  });
}
