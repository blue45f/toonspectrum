/**
 * 파티클 시뮬레이션 (Track 4 · 이펙트)
 *
 * 발자국 먼지·반짝임·날씨(비/눈)·나뭇잎·연기·꽃가루·물튐·꽃잎 파티클의
 * 스폰·이동·소멸을 계산하는 순수 로직 풀. 실제 렌더링(Phaser 파티클)은
 * `studio-virtual-space-particle-sprites.ts`의 스프라이트와 함께
 * 호출 측이 담당한다.
 *
 * - 모든 스폰은 결정적 시드 기반 (같은 시드 → 같은 파티클)
 * - 파티클 수 상한 + 화면 밖 제거로 성능을 지킨다
 * - reduced-motion에서는 스폰을 억제한다
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioWeatherCondition } from "./studio-virtual-space-weather";
import type { StudioParticleSpriteKind } from "./studio-virtual-space-particle-sprites";

/** 파티클 종류 = 스프라이트 종류와 1:1. */
export type StudioParticleKind = StudioParticleSpriteKind;

export interface StudioParticle {
  readonly id: number;
  readonly kind: StudioParticleKind;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  /** 경과 수명 (ms). */
  readonly ageMs: number;
  /** 전체 수명 (ms). */
  readonly lifeMs: number;
  readonly size: number;
  readonly rotation: number;
  readonly spin: number;
}

export interface StudioParticleBounds {
  readonly width: number;
  readonly height: number;
}

/** 파티클 풀 상한. */
export const STUDIO_PARTICLE_MAX = 600;
/** 화면 밖 여유 (px). 이 밖으로 나가면 제거. */
export const STUDIO_PARTICLE_CULL_MARGIN = 80;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

interface KindPhysics {
  readonly gravity: number;
  readonly drag: number;
  readonly lifeMin: number;
  readonly lifeMax: number;
  readonly sizeMin: number;
  readonly sizeMax: number;
}

const KIND_PHYSICS: Readonly<Record<StudioParticleKind, KindPhysics>> = Object.freeze({
  dust:      { gravity: -30, drag: 2.2, lifeMin: 350, lifeMax: 700, sizeMin: 4, sizeMax: 9 },
  sparkle:   { gravity: -12, drag: 1.2, lifeMin: 500, lifeMax: 900, sizeMin: 5, sizeMax: 10 },
  raindrop:  { gravity: 900, drag: 0.05, lifeMin: 900, lifeMax: 1400, sizeMin: 5, sizeMax: 8 },
  snowflake: { gravity: 28, drag: 0.6, lifeMin: 4000, lifeMax: 8000, sizeMin: 4, sizeMax: 9 },
  leaf:      { gravity: 55, drag: 1.4, lifeMin: 2500, lifeMax: 4500, sizeMin: 6, sizeMax: 11 },
  smoke:     { gravity: -45, drag: 1.1, lifeMin: 1400, lifeMax: 2600, sizeMin: 8, sizeMax: 16 },
  confetti:  { gravity: 160, drag: 1.8, lifeMin: 1200, lifeMax: 2200, sizeMin: 4, sizeMax: 8 },
  splash:    { gravity: 500, drag: 0.4, lifeMin: 350, lifeMax: 650, sizeMin: 5, sizeMax: 10 },
  petal:     { gravity: 46, drag: 1.6, lifeMin: 3200, lifeMax: 6500, sizeMin: 5, sizeMax: 11 },
});

/** 종류별 한글·영문 이름. */
export function studioParticleKindLabel(kind: StudioParticleKind): { readonly ko: string; readonly en: string } {
  switch (kind) {
    case "dust": return { ko: "먼지", en: "Dust" };
    case "sparkle": return { ko: "반짝임", en: "Sparkle" };
    case "raindrop": return { ko: "빗방울", en: "Raindrop" };
    case "snowflake": return { ko: "눈송이", en: "Snowflake" };
    case "leaf": return { ko: "나뭇잎", en: "Leaf" };
    case "smoke": return { ko: "연기", en: "Smoke" };
    case "confetti": return { ko: "색종이 조각", en: "Confetti" };
    case "splash": return { ko: "물튐", en: "Splash" };
    case "petal": return { ko: "꽃잎", en: "Petal" };
  }
}

/**
 * 파티클을 스폰한다. 같은 (kind, seed, count)면 같은 파티클이 나온다.
 * idBase는 기존 풀과 id가 겹치지 않게 호출 측이 관리한다.
 */
export function spawnStudioParticles(
  kind: StudioParticleKind,
  origin: StudioVirtualSpacePoint,
  count: number,
  seed: string,
  nowMs: number,
  idBase = 0,
  spread = 24,
): readonly StudioParticle[] {
  const physics = KIND_PHYSICS[kind];
  const safeCount = Math.min(Math.max(0, Math.floor(count)), 120);
  if (safeCount === 0) return Object.freeze([]);
  const random = mulberry32(hashSeed(`${kind}:${seed}`));
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const particles: StudioParticle[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = random() * spread;
    const speed = kind === "raindrop" ? 60 + random() * 60
      : kind === "smoke" ? 12 + random() * 22
      : 20 + random() * 70;
    particles.push(Object.freeze({
      id: idBase + index,
      kind,
      x: origin.x + Math.cos(angle) * radius,
      y: origin.y + Math.sin(angle) * radius * 0.6,
      vx: Math.cos(angle) * speed * (kind === "raindrop" ? 0.12 : 1),
      vy: kind === "raindrop" ? speed * 2.2 : Math.sin(angle) * speed * 0.7 - 18,
      ageMs: -Math.floor(random() * 120), // 약간의 스태거
      lifeMs: physics.lifeMin + random() * (physics.lifeMax - physics.lifeMin),
      size: physics.sizeMin + random() * (physics.sizeMax - physics.sizeMin),
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 6,
    }));
  }
  void now;
  return Object.freeze(particles);
}

/**
 * 파티클 풀을 한 스텝 전진시킨다.
 * 수명 종료·화면 밖 파티클을 제거하고 상한을 넘으면 오래된 것부터 버린다.
 */
export function advanceStudioParticles(
  particles: readonly StudioParticle[],
  deltaSeconds: number,
  bounds: StudioParticleBounds,
): readonly StudioParticle[] {
  const dt = Number.isFinite(deltaSeconds) ? Math.min(Math.max(deltaSeconds, 0), 0.1) : 0;
  if (dt === 0) return particles;
  const margin = STUDIO_PARTICLE_CULL_MARGIN;
  const next: StudioParticle[] = [];
  for (const particle of particles) {
    const physics = KIND_PHYSICS[particle.kind];
    const ageMs = particle.ageMs + dt * 1000;
    if (ageMs >= particle.lifeMs) continue;
    const dragFactor = Math.max(0, 1 - physics.drag * dt);
    const flutters = particle.kind === "snowflake" || particle.kind === "petal";
    const flutterAmplitude = particle.kind === "petal" ? 26 : 14;
    const flutterSpeed = particle.kind === "petal" ? 2.4 : 1;
    const vx = particle.vx * dragFactor + (flutters ? Math.sin(ageMs / 700 * flutterSpeed + particle.id) * flutterAmplitude * dt : 0);
    const vy = particle.vy * dragFactor + physics.gravity * dt;
    const x = particle.x + vx * dt;
    const y = particle.y + vy * dt;
    if (x < -margin || x > bounds.width + margin || y < -margin || y > bounds.height + margin) continue;
    next.push(Object.freeze({
      ...particle,
      x, y, vx, vy,
      ageMs,
      rotation: particle.rotation + particle.spin * dt,
    }));
  }
  // 상한 초과 시 오래된(나이 많은) 것부터 제거
  if (next.length > STUDIO_PARTICLE_MAX) {
    next.sort((a, b) => a.ageMs - b.ageMs);
    return Object.freeze(next.slice(next.length - STUDIO_PARTICLE_MAX));
  }
  return Object.freeze(next);
}

/* ---------------- 발자국 먼지 ---------------- */

/** 발자국 먼지 스폰 간격 (ms). */
export const STUDIO_FOOTSTEP_DUST_INTERVAL_MS = 260;

export interface StudioFootstepDustState {
  /** 다음 스폰 시각 (ms epoch). */
  readonly nextSpawnAtMs: number;
  /** 파티클 id 카운터. */
  readonly idCounter: number;
}

export function createStudioFootstepDustState(): StudioFootstepDustState {
  return Object.freeze({ nextSpawnAtMs: 0, idCounter: 0 });
}

/**
 * 이동 중 발밑에 먼지 파티클을 스폰한다.
 * 서 있거나 reduced-motion이면 스폰하지 않는다.
 */
export function stepStudioFootstepDust(
  state: StudioFootstepDustState,
  input: {
    readonly feet: StudioVirtualSpacePoint;
    readonly moving: boolean;
    readonly nowMs: number;
    readonly reducedMotion: boolean;
  },
): { readonly state: StudioFootstepDustState; readonly particles: readonly StudioParticle[] } {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  if (!input.moving || input.reducedMotion || nowMs < state.nextSpawnAtMs) {
    return { state, particles: Object.freeze([]) };
  }
  const particles = spawnStudioParticles("dust", input.feet, 2, `footstep:${nowMs}`, nowMs, state.idCounter, 10);
  return {
    state: Object.freeze({ nextSpawnAtMs: nowMs + STUDIO_FOOTSTEP_DUST_INTERVAL_MS, idCounter: state.idCounter + 2 }),
    particles,
  };
}

/* ---------------- 날씨 파티클 ---------------- */

/** 날씨별 파티클 종류. 비·눈·천둥번개만 파티클을 낸다. */
export function studioWeatherParticleKind(condition: StudioWeatherCondition | null): StudioParticleKind | null {
  switch (condition) {
    case "rain": return "raindrop";
    case "snow": return "snowflake";
    case "thunderstorm": return "raindrop";
    default: return null;
  }
}

/**
 * 화면(뷰포트) 안에 날씨 파티클을 스폰한다.
 * 비는 위에서 아래로, 눈은 천천히 흩날리며 떨어진다.
 */
export function spawnStudioWeatherParticles(
  condition: StudioWeatherCondition | null,
  viewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  count: number,
  seed: string,
  nowMs: number,
  idBase = 0,
): readonly StudioParticle[] {
  const kind = studioWeatherParticleKind(condition);
  if (!kind || count <= 0) return Object.freeze([]);
  const random = mulberry32(hashSeed(`weather:${kind}:${seed}`));
  const safeCount = Math.min(Math.max(0, Math.floor(count)), 200);
  const particles: StudioParticle[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    const physics = KIND_PHYSICS[kind];
    particles.push(Object.freeze({
      id: idBase + index,
      kind,
      x: viewport.x + random() * viewport.width,
      y: viewport.y - random() * viewport.height * 0.4,
      vx: kind === "raindrop" ? -40 : (random() - 0.5) * 24,
      vy: kind === "raindrop" ? 520 + random() * 160 : 26 + random() * 30,
      ageMs: 0,
      lifeMs: physics.lifeMin + random() * (physics.lifeMax - physics.lifeMin),
      size: physics.sizeMin + random() * (physics.sizeMax - physics.sizeMin),
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 4,
    }));
  }
  void nowMs;
  return Object.freeze(particles);
}

/**
 * 벚꽃잎 파티클을 뷰포트 위에 흩뿌린다 (분위기 날씨 "petals" 전용).
 * 실제 날씨 조건이 아니라 수동 분위기 설정에서만 쓰인다.
 * 꽃잎은 천천히 떨어지며 좌우로 크게 흩날린다.
 */
export function spawnStudioPetalParticles(
  viewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  count: number,
  seed: string,
  nowMs: number,
  idBase = 0,
): readonly StudioParticle[] {
  if (count <= 0) return Object.freeze([]);
  const random = mulberry32(hashSeed(`weather:petal:${seed}`));
  const safeCount = Math.min(Math.max(0, Math.floor(count)), 200);
  const physics = KIND_PHYSICS.petal;
  const particles: StudioParticle[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    particles.push(Object.freeze({
      id: idBase + index,
      kind: "petal" as const,
      x: viewport.x + random() * viewport.width,
      y: viewport.y - random() * viewport.height * 0.4,
      vx: (random() - 0.5) * 36,
      vy: 30 + random() * 36,
      ageMs: 0,
      lifeMs: physics.lifeMin + random() * (physics.lifeMax - physics.lifeMin),
      size: physics.sizeMin + random() * (physics.sizeMax - physics.sizeMin),
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 3,
    }));
  }
  void nowMs;
  return Object.freeze(particles);
}
