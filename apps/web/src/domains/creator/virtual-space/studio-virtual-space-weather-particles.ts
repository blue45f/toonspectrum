/**
 * 가상 스튜디오 날씨 파티클 엔진 (비·눈·벚꽃잎)
 *
 * 날씨 상태와 품질 등급(particleRatio)에 맞춰 파티클 풀을 스폰·전진시키는
 * 순수 로직 엔진. 실제 렌더링(Phaser/캔버스 2D)은 호출 측이 담당한다.
 *
 * - 비·눈: 날씨 모듈(`studio-virtual-space-weather`)의 이펙트 프로필 스펙을
 *   파티클 풀로 구체화한다 (천둥번개는 비와 같은 빗방울 종류).
 * - 벚꽃잎: 실제 기상 조건이 아니라 수동 분위기 설정("petals") 전용이다.
 *   꽃잎이 천천히 떨어지며 좌우로 크게 흩날리는 플러터 물리를 쓴다.
 * - 성능 상한: 풀 상한(STUDIO_PARTICLE_MAX)과 날씨 상한
 *   (STUDIO_WEATHER_MAX_PARTICLES)을 동시에 적용한다.
 * - 저사양 자동 축소: 품질 등급의 particleRatio
 *   (`studio-virtual-space-quality`의 등급별 비율)를 그대로 받는다.
 *   등급이 내려가면 목표 개수가 줄고, 초과분은 오래된 것부터 제거해
 *   화면이 갑자기 비는 일 없이 자연스럽게 가벼워진다.
 * - reduced-motion: 스폰을 멈추고 풀을 즉시 비운다
 *   (정적 하늘·조명 표시는 날씨 프로필 쪽에서 이미 담당한다).
 */

import {
  advanceStudioParticles,
  spawnStudioPetalParticles,
  spawnStudioWeatherParticles,
  type StudioParticle,
} from "./studio-virtual-space-particles";
import {
  studioWeatherEffectProfile,
  STUDIO_WEATHER_MAX_PARTICLES,
  type StudioWeatherCondition,
} from "./studio-virtual-space-weather";

/** 엔진이 받아들이는 날씨 종류. "petals"는 수동 분위기 날씨다. */
export type StudioWeatherParticleCondition = StudioWeatherCondition | "petals";

/** 벚꽃잎 기본 밀도 (particleRatio=1 기준). */
export const STUDIO_PETAL_PARTICLE_COUNT = 140;

/** 뷰포트 (파티클 스폰 영역). */
export interface StudioWeatherParticleViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 엔진 상태. */
export interface StudioWeatherParticleState {
  readonly particles: readonly StudioParticle[];
  /** 다음 스폰 시드 회전값 (스폰 분산용). */
  readonly spawnSeed: number;
  /** 다음 파티클 id 시작값. */
  readonly idCursor: number;
}

export function createStudioWeatherParticleState(): StudioWeatherParticleState {
  return Object.freeze({ particles: Object.freeze([]), spawnSeed: 0, idCursor: 1 });
}

function clampRatio(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

/**
 * 현재 목표 파티클 개수.
 * 품질 등급 비율(particleRatio)에 비례하고, reduced-motion이면 0이다.
 */
export function studioWeatherParticleTarget(
  condition: StudioWeatherParticleCondition | null,
  budget: { readonly particleRatio: number; readonly reducedMotion: boolean },
): number {
  if (budget.reducedMotion) return 0;
  if (condition === null) return 0;
  const ratio = clampRatio(budget.particleRatio);
  const base = condition === "petals"
    ? STUDIO_PETAL_PARTICLE_COUNT
    : studioWeatherEffectProfile(condition, { reducedMotion: false }).particles
        .reduce((sum, spec) => sum + spec.count, 0);
  return Math.min(STUDIO_WEATHER_MAX_PARTICLES, Math.round(base * ratio));
}

/**
 * 파티클 풀을 한 스텝 전진시킨다.
 * - 기존 파티클을 물리로 전진 (수명·화면 밖 제거)
 * - 목표보다 많으면 오래된 것부터 제거 (저사양 자동 축소)
 * - 목표보다 적으면 뷰포트 위에 나머지를 스폰
 */
export function stepStudioWeatherParticles(
  state: StudioWeatherParticleState,
  input: {
    readonly condition: StudioWeatherParticleCondition | null;
    readonly viewport: StudioWeatherParticleViewport;
    readonly deltaSeconds: number;
    readonly particleRatio: number;
    readonly reducedMotion: boolean;
    readonly nowMs: number;
  },
): StudioWeatherParticleState {
  const target = studioWeatherParticleTarget(input.condition, input);
  if (target === 0) {
    // 비움: reduced-motion이면 기존 파티클도 즉시 제거한다.
    return Object.freeze({
      particles: Object.freeze([]),
      spawnSeed: state.spawnSeed,
      idCursor: state.idCursor,
    });
  }
  let particles = advanceStudioParticles(state.particles, input.deltaSeconds, input.viewport);
  if (particles.length > target) {
    // 오래된(ageMs 큰) 것부터 제거해 비율 축소를 매끄럽게 반영한다.
    particles = Object.freeze(
      [...particles].sort((a, b) => b.ageMs - a.ageMs).slice(particles.length - target),
    );
  }
  if (particles.length >= target || input.condition === null) {
    return Object.freeze({
      particles,
      spawnSeed: state.spawnSeed,
      idCursor: state.idCursor,
    });
  }
  const deficit = target - particles.length;
  const spawned: StudioParticle[] = [];
  let idCursor = state.idCursor;
  // 한 번에 스폰할 수 있는 상한(스포너 200개)이 있어 부족분을 나눠 채운다.
  while (spawned.length < deficit && spawned.length < target) {
    const batchSeed = `weather-fx:${state.spawnSeed + Math.floor(spawned.length / 200)}`;
    const batch = input.condition === "petals"
      ? spawnStudioPetalParticles(input.viewport, deficit - spawned.length, batchSeed, input.nowMs, idCursor)
      : spawnStudioWeatherParticles(input.condition, input.viewport, deficit - spawned.length, batchSeed, input.nowMs, idCursor);
    if (batch.length === 0) break;
    spawned.push(...batch);
    idCursor += batch.length;
  }
  return Object.freeze({
    particles: Object.freeze([...particles, ...spawned]),
    spawnSeed: state.spawnSeed + 1,
    idCursor,
  });
}
