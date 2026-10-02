/**
 * 가상 스튜디오 발소리·이동 파티클 게임필 로직
 *
 * 속도 기반 발소리 타이밍(좌/우 교대), 표면(카펫/나무/타일)별 파티클 종류와
 * 먼지 파티클 스폰 규칙을 계산한다. 실제 오디오 재생과 파티클 렌더링은
 * 호출 측(Phaser Scene·오디오 엔진)에서 담당한다.
 *
 * 순수 로직 모듈. reduced-motion에서는 파티클 스폰을 억제한다.
 */

export const STUDIO_FOOTSTEP_SURFACES = ["carpet", "wood", "tile"] as const;

/** 바닥 표면 종류. */
export type StudioFootstepSurface = typeof STUDIO_FOOTSTEP_SURFACES[number];

/** 발소리 발. */
export type StudioFootstepFoot = "left" | "right";

/** 표면별 발소리·파티클 특성. */
export interface StudioFootstepSurfaceSpec {
  /** 표면의 발소리 볼륨 계수 0~1 (카펫은 조용하다). */
  readonly loudness: number;
  /** 한 걸음(좌→우 또는 우→좌)당 이동 거리(px). 발소리 타이밍 기준. */
  readonly stridePx: number;
  /** 파티클 종류. */
  readonly particleKind: "lint" | "chip" | "dust";
  /** 파티클 색상(호출 측 렌더링용). */
  readonly particleColor: string;
  /** 파티클 크기(px). */
  readonly particleSize: number;
  /** 파티클 수명(ms). */
  readonly particleLifetimeMs: number;
}

const SURFACE_SPECS: Record<StudioFootstepSurface, StudioFootstepSurfaceSpec> = {
  // 카펫: 조용하고 섬유(먼지 보풀) 파티클
  carpet: { loudness: 0.35, stridePx: 34, particleKind: "lint", particleColor: "#d8cfc2", particleSize: 3, particleLifetimeMs: 700 },
  // 나무: 중간 소리, 작은 나무 조각
  wood: { loudness: 0.65, stridePx: 38, particleKind: "chip", particleColor: "#c9a06a", particleSize: 2.5, particleLifetimeMs: 500 },
  // 타일: 맑은 소리, 발밑 먼지
  tile: { loudness: 0.9, stridePx: 40, particleKind: "dust", particleColor: "#e8e4da", particleSize: 4, particleLifetimeMs: 600 },
};

export function studioFootstepSurfaceSpec(surface: StudioFootstepSurface): StudioFootstepSurfaceSpec {
  return SURFACE_SPECS[surface];
}

function oneOfSurface(value: unknown): value is StudioFootstepSurface {
  return typeof value === "string" && (STUDIO_FOOTSTEP_SURFACES as readonly string[]).includes(value);
}

/** 표면 문자열 파싱 (월드 타일 메타데이터 → 발소리 표면). */
export function parseStudioFootstepSurface(value: unknown): StudioFootstepSurface {
  return oneOfSurface(value) ? value : "wood";
}

/** 발소리 상태 (누적 거리 기반). */
export interface StudioFootstepState {
  /** 다음 발소리까지 남은 거리(px). */
  readonly distanceRemaining: number;
  /** 다음에 내딛을 발. */
  readonly nextFoot: StudioFootstepFoot;
}

/** 초기 발소리 상태. */
export function createStudioFootstepState(): StudioFootstepState {
  return Object.freeze({ distanceRemaining: 0, nextFoot: "left" as StudioFootstepFoot });
}

/** 발소리 발생 이벤트. 호출 측에서 실제 사운드를 재생한다. */
export interface StudioFootstepEvent {
  readonly foot: StudioFootstepFoot;
  /** 재생 볼륨 0~1 (표면 계수 × 속도 계수). */
  readonly volume: number;
  readonly surface: StudioFootstepSurface;
}

/**
 * 이동 거리를 누적해 발소리 타이밍을 계산한다.
 * 속도가 빠를수록 걸음이 잦아지고, 표면마다 보폭이 다르다.
 * 정지 상태(속도 < 8px/s)에서는 누적하지 않는다.
 */
export function stepStudioFootsteps(
  state: StudioFootstepState,
  distanceDelta: number,
  surface: StudioFootstepSurface,
  speed: number,
): { readonly state: StudioFootstepState; readonly events: readonly StudioFootstepEvent[] } {
  const delta = Number.isFinite(distanceDelta) ? Math.max(0, distanceDelta) : 0;
  const spec = SURFACE_SPECS[surface];
  const events: StudioFootstepEvent[] = [];
  let distanceRemaining = state.distanceRemaining;
  let nextFoot = state.nextFoot;
  if (delta > 0 && speed >= 8 && Number.isFinite(speed)) {
    distanceRemaining -= delta;
    // 한 프레임에 여러 걸음이 발생할 수 있다 (빠른 이동/긴 프레임)
    while (distanceRemaining < 0) {
      distanceRemaining += spec.stridePx;
      const foot = nextFoot;
      nextFoot = foot === "left" ? "right" : "left";
      const speedFactor = Math.min(1, speed / 210);
      events.push({
        foot,
        volume: spec.loudness * (0.45 + 0.55 * speedFactor),
        surface,
      });
    }
  }
  return {
    state: Object.freeze({ distanceRemaining, nextFoot }),
    events: Object.freeze(events),
  };
}

/** 먼지 파티클 스폰 요청. */
export interface StudioDustSpawnRequest {
  /** 스폰할 파티클 개수. */
  readonly count: number;
  /** 파티클 종류. */
  readonly kind: "lint" | "chip" | "dust";
  readonly color: string;
  readonly size: number;
  readonly lifetimeMs: number;
  /** 퍼짐 속도(px/s). */
  readonly spreadSpeed: number;
}

/** 이번 프레임의 발밑 먼지 수(studioDustSpawnRule의 count). 객체를 만들지 않는 캔버스용. */
export function studioDustSpawnCount(
  speed: number,
  surface: StudioFootstepSurface,
  particleDensity: number,
  reducedMotion: boolean,
  deltaSeconds: number,
): number {
  if (reducedMotion) return 0;
  const safeSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.1)) : 0;
  const density = Number.isFinite(particleDensity) ? Math.min(1, Math.max(0, particleDensity)) : 1;
  if (safeSpeed < 60 || dt === 0 || density === 0) return 0;
  const surfaceFactor = surface === "tile" ? 1.4 : surface === "carpet" ? 0.6 : 1;
  const rate = (safeSpeed / 210) * 22 * surfaceFactor * density;
  return Math.max(0, Math.floor(rate * dt + 0.5));
}

/**
 * 이동 먼지 파티클 스폰 규칙.
 *
 * - 일정 속도(60px/s) 이상으로 이동할 때만 발밑 먼지가 난다.
 * - 카펫은 섬유 파티클이 적게, 타일은 먼지가 많이 난다.
 * - particleDensity(0~1) 설정으로 양을 조절한다.
 * - reducedMotion이면 스폰하지 않는다 (count 0).
 */
export function studioDustSpawnRule(input: {
  readonly speed: number;
  readonly surface: StudioFootstepSurface;
  readonly particleDensity: number;
  readonly reducedMotion: boolean;
  readonly deltaSeconds: number;
}): StudioDustSpawnRequest {
  const spec = SURFACE_SPECS[input.surface];
  const base = {
    kind: spec.particleKind,
    color: spec.particleColor,
    size: spec.particleSize,
    lifetimeMs: spec.particleLifetimeMs,
    spreadSpeed: 24,
  } as const;
  const count = studioDustSpawnCount(input.speed, input.surface, input.particleDensity, input.reducedMotion, input.deltaSeconds);
  return Object.freeze({ ...base, count });
}

/**
 * 발소리 순간 파티클 (착지 시 작은 파티클).
 * 발걸음 이벤트마다 1개씩, 표면 종류에 맞는 파티클을 낸다.
 * reducedMotion이면 count 0.
 */
export function studioFootstepImpactParticle(
  event: StudioFootstepEvent,
  reducedMotion: boolean,
): StudioDustSpawnRequest {
  const spec = SURFACE_SPECS[event.surface];
  return Object.freeze({
    kind: spec.particleKind,
    color: spec.particleColor,
    size: spec.particleSize * 0.7,
    lifetimeMs: Math.round(spec.particleLifetimeMs * 0.6),
    spreadSpeed: 14,
    count: reducedMotion ? 0 : 1,
  });
}
