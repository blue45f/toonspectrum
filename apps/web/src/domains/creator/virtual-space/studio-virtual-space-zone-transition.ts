import { STUDIO_VIRTUAL_CAMPUS_COMMONS_ID } from "./studio-virtual-space-campus-world";
import type { StudioVirtualSpaceZoneChange } from "./studio-virtual-space-engine-events";

/**
 * 구역·포털·스폰 전환 시퀀스를 한곳에서 규격화하는 순수 상태 머신.
 *
 * 이전에는 포털마다 Phaser 카메라 페이드를 제각각 걸었고, 월드 전환 뒤
 * 복귀 페이드인은 실제 준비 완료와 무관한 1400ms 타이머로 예약돼 있어
 * 기기·네트워크 상태에 따라 검은 화면이 길어지거나 연출이 잘렸다.
 * 이제 모든 전환은 이 머신을 거친다:
 *
 * - 포털(같은 월드 순간이동): fade-out → hold(텔레포트 1회) → fade-in
 * - 월드 전환 출발(departure): fade-out → awaiting-arrival(페이지가 같은
 *   장소로 확정했다고 신호를 줄 때까지) → fade-in. 새 월드로 바뀌면 이
 *   씬은 파괴되고 새 씬의 스폰 시퀀스가 화면을 연다.
 * - 스폰/도착(spawn): hold(월드 준비 완료 신호까지) → fade-in + 도착 링.
 *
 * 베일은 전환 순간에만 존재하는 단색 막이다. 주야 틴트·조명 워시 같은
 * 지속형 전면 오버레이와 무관하며, 페이드인이 끝나면 완전히 사라진다.
 * reduced-motion에서는 모든 구간이 즉시 전환으로 축소된다.
 */

export const STUDIO_ZONE_FADE_COLOR = 0x07060b;
export const STUDIO_ZONE_FADE_OUT_MS = 220;
export const STUDIO_ZONE_HOLD_MS = 70;
export const STUDIO_ZONE_FADE_IN_MS = 280;
export const STUDIO_ZONE_SPAWN_FADE_IN_MS = 460;
/** 구역 이름 스플래시 카드가 머무는 시간. */
export const STUDIO_ZONE_SPLASH_MS = 1_200;

export type StudioZoneTransitionPhase =
  | "idle"
  | "fade-out"
  | "hold"
  | "awaiting-arrival"
  | "fade-in";

export type StudioZoneTransitionKind = "portal" | "spawn" | "departure";

export interface StudioZoneTransitionState {
  readonly phase: StudioZoneTransitionPhase;
  readonly kind: StudioZoneTransitionKind;
  readonly zoneId: string | null;
  readonly phaseStartedAt: number;
  readonly teleportAt: number | null;
  readonly teleportDelivered: boolean;
  readonly departureDelivered: boolean;
  readonly fadeInStartedAt: number | null;
  readonly fadeInMs: number;
  readonly instant: boolean;
}

export interface StudioZoneTransitionFrame {
  readonly phase: StudioZoneTransitionPhase;
  readonly kind: StudioZoneTransitionKind;
  readonly zoneId: string | null;
  /** 전환 베일의 불투명도 0~1. idle에서는 항상 0이다. */
  readonly veilAlpha: number;
  /** 이 step에서 텔레포트를 적용해야 하면 true (시퀀스당 정확히 1회). */
  readonly teleportDue: boolean;
  /** 월드 전환 출발에서 onPortal 콜백을 발화해야 하면 true (정확히 1회). */
  readonly departureDue: boolean;
  /** 이동 입력을 막아야 하는 구간인지. */
  readonly blocksInput: boolean;
  /** fade-in 진행도 0~1. fade-in 구간이 아니면 null (도착 링 연출용). */
  readonly fadeInProgress: number | null;
  readonly active: boolean;
}

const IDLE_STATE: StudioZoneTransitionState = {
  phase: "idle",
  kind: "portal",
  zoneId: null,
  phaseStartedAt: 0,
  teleportAt: null,
  teleportDelivered: false,
  departureDelivered: false,
  fadeInStartedAt: null,
  fadeInMs: 0,
  instant: false,
};

export function createStudioZoneTransitionState(): StudioZoneTransitionState {
  return IDLE_STATE;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

function fadeOutDurationMs(instant: boolean): number {
  return instant ? 0 : STUDIO_ZONE_FADE_OUT_MS;
}

/** 같은 월드 안 포털 순간이동 시퀀스를 시작한다. 진행 중이면 무시한다. */
export function beginStudioZonePortalTransition(
  state: StudioZoneTransitionState,
  input: { readonly zoneId: string | null; readonly now: number; readonly reducedMotion: boolean },
): StudioZoneTransitionState {
  if (state.phase !== "idle") return state;
  return {
    phase: "fade-out",
    kind: "portal",
    zoneId: input.zoneId,
    phaseStartedAt: input.now,
    teleportAt:
      input.now +
      fadeOutDurationMs(input.reducedMotion) +
      (input.reducedMotion ? 0 : STUDIO_ZONE_HOLD_MS),
    teleportDelivered: false,
    departureDelivered: true,
    fadeInStartedAt: null,
    fadeInMs: input.reducedMotion ? 0 : STUDIO_ZONE_FADE_IN_MS,
    instant: input.reducedMotion,
  };
}

/** 다른 월드로 나가는 포털의 출발 시퀀스를 시작한다. 진행 중이면 무시한다. */
export function beginStudioZoneDepartureTransition(
  state: StudioZoneTransitionState,
  input: { readonly now: number; readonly reducedMotion: boolean },
): StudioZoneTransitionState {
  if (state.phase !== "idle") return state;
  return {
    phase: "fade-out",
    kind: "departure",
    zoneId: null,
    phaseStartedAt: input.now,
    teleportAt: null,
    teleportDelivered: true,
    departureDelivered: false,
    fadeInStartedAt: null,
    fadeInMs: input.reducedMotion ? 0 : STUDIO_ZONE_FADE_IN_MS,
    instant: input.reducedMotion,
  };
}

/** 입장·재입장 스폰 시퀀스를 시작한다. 준비 완료 신호 전까지 화면을 덮는다. */
export function beginStudioZoneSpawnTransition(
  state: StudioZoneTransitionState,
  input: { readonly zoneId: string | null; readonly now: number; readonly reducedMotion: boolean },
): StudioZoneTransitionState {
  if (state.phase !== "idle") return state;
  return {
    phase: "hold",
    kind: "spawn",
    zoneId: input.zoneId,
    phaseStartedAt: input.now,
    teleportAt: null,
    teleportDelivered: true,
    departureDelivered: true,
    fadeInStartedAt: null,
    fadeInMs: input.reducedMotion ? 0 : STUDIO_ZONE_SPAWN_FADE_IN_MS,
    instant: input.reducedMotion,
  };
}

/** 스폰 hold 상태에서 "월드 준비 완료" 신호를 받아 페이드인을 시작한다. */
export function markStudioZoneTransitionReady(
  state: StudioZoneTransitionState,
  now: number,
): StudioZoneTransitionState {
  if (state.kind !== "spawn" || state.phase !== "hold") return state;
  return { ...state, phase: "fade-in", phaseStartedAt: now, fadeInStartedAt: now };
}

/** 출발 대기 상태에서 "같은 장소로 확정" 신호를 받아 화면을 다시 연다. */
export function revealStudioZoneTransition(
  state: StudioZoneTransitionState,
  now: number,
): StudioZoneTransitionState {
  if (state.kind !== "departure" || state.phase !== "awaiting-arrival") return state;
  return { ...state, phase: "fade-in", phaseStartedAt: now, fadeInStartedAt: now };
}

function frameFor(
  state: StudioZoneTransitionState,
  veilAlpha: number,
  extras: {
    teleportDue?: boolean;
    departureDue?: boolean;
    fadeInProgress?: number | null;
    kind?: StudioZoneTransitionKind;
    zoneId?: string | null;
  } = {},
): StudioZoneTransitionFrame {
  return {
    phase: state.phase,
    kind: extras.kind ?? state.kind,
    zoneId: extras.zoneId !== undefined ? extras.zoneId : state.zoneId,
    veilAlpha,
    teleportDue: extras.teleportDue === true,
    departureDue: extras.departureDue === true,
    blocksInput:
      state.phase === "fade-out" || state.phase === "hold" || state.phase === "awaiting-arrival",
    fadeInProgress: extras.fadeInProgress ?? null,
    active: state.phase !== "idle",
  };
}

export function stepStudioZoneTransition(
  state: StudioZoneTransitionState,
  now: number,
): { readonly state: StudioZoneTransitionState; readonly frame: StudioZoneTransitionFrame } {
  switch (state.phase) {
    case "idle":
      return { state, frame: frameFor(state, 0) };
    case "fade-out": {
      const duration = fadeOutDurationMs(state.instant);
      const progress = duration <= 0 ? 1 : clamp01((now - state.phaseStartedAt) / duration);
      if (state.kind === "departure") {
        if (progress >= 1) {
          const next: StudioZoneTransitionState = {
            ...state,
            phase: "awaiting-arrival",
            phaseStartedAt: now,
            departureDelivered: true,
          };
          return {
            state: next,
            frame: frameFor(next, next.instant ? 0 : 1, {
              departureDue: !state.departureDelivered,
            }),
          };
        }
        return { state, frame: frameFor(state, state.instant ? 0 : smoothstep(progress)) };
      }
      // portal: 페이드아웃이 끝나면 hold로 넘어가 텔레포트 시각을 기다린다.
      if (progress >= 1) {
        const next: StudioZoneTransitionState = { ...state, phase: "hold", phaseStartedAt: now };
        return stepStudioZoneTransition(next, now);
      }
      return { state, frame: frameFor(state, state.instant ? 0 : smoothstep(progress)) };
    }
    case "hold": {
      if (state.kind === "portal" && state.teleportAt !== null && now >= state.teleportAt) {
        const next: StudioZoneTransitionState = {
          ...state,
          phase: "fade-in",
          phaseStartedAt: now,
          fadeInStartedAt: now,
          teleportDelivered: true,
        };
        const stepped = stepStudioZoneTransition(next, now);
        return { state: stepped.state, frame: { ...stepped.frame, teleportDue: true } };
      }
      return { state, frame: frameFor(state, state.instant ? 0 : 1) };
    }
    case "awaiting-arrival":
      return { state, frame: frameFor(state, state.instant ? 0 : 1) };
    case "fade-in": {
      const startedAt = state.fadeInStartedAt ?? state.phaseStartedAt;
      const progress = state.fadeInMs <= 0 ? 1 : clamp01((now - startedAt) / state.fadeInMs);
      if (progress >= 1) {
        return {
          state: IDLE_STATE,
          frame: frameFor(IDLE_STATE, 0, {
            kind: state.kind,
            zoneId: state.zoneId,
            fadeInProgress: 1,
          }),
        };
      }
      return {
        state,
        frame: frameFor(state, 1 - easeOutCubic(progress), { fadeInProgress: progress }),
      };
    }
  }
}

/**
 * 구역 이름 스플래시를 띄울 zone change인지. 월드 바깥(캠퍼스 공용 구역)은
 * 장소명이 아니라 이동 중 구간이라 제외하고, 첫 진입(initial)도 포함해
 * "지금 어디에 있는지"를 입장 직후 바로 알 수 있게 한다.
 */
export function studioZoneSplashEligible(
  change: Pick<StudioVirtualSpaceZoneChange, "roomId">,
): boolean {
  return change.roomId !== null && change.roomId !== STUDIO_VIRTUAL_CAMPUS_COMMONS_ID;
}
