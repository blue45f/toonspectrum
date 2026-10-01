import { Pcg32 } from "../../engine/core/rng";

import { assertCanvasSize, DEFAULT_CANVAS } from "./canvas-presets";

import type { RawSample } from "../../engine/core/types";

/**
 * 결정적 획 fixture 9종. 같은 (id, canvas)이면 샘플 배열이 deep-equal이다.
 *
 * - 경로는 정규화 좌표(0..1)로 정의하고 캔버스 크기로 스케일한다. 시간축(ms)과 표본율은 캔버스와
 *   무관하게 고정하므로 캔버스가 커지면 px/ms 속도도 비례해 커진다(기본 512² 기준으로 설계).
 * - 압력은 0.02 이상으로 바닥을 둔다(접촉 중 압력 0은 물리적으로 없다).
 * - 난수가 필요한 fixture(tremor)는 `Pcg32` 고정 시드만 쓴다.
 * - 첫 표본 phase "down", 마지막 "up", 나머지 "move", source는 모두 "raw"다.
 */

export const FIXTURE_IDS = [
  "line",
  "curve",
  "zigzag",
  "spiral",
  "fast-flick",
  "slow-pressure-ramp",
  "corner-square",
  "tilt-sweep",
  "tremor",
] as const;
export type FixtureId = (typeof FIXTURE_IDS)[number];

export function isFixtureId(id: string): id is FixtureId {
  return (FIXTURE_IDS as readonly string[]).includes(id);
}

export interface StrokeFixture {
  /** 9종 fixture id 또는 캡처 획 id(`captured:` 접두). */
  id: string;
  width: number;
  height: number;
  samples: RawSample[];
  description: string;
  /** 의도 경로(문서 px). 직선·모서리·곡선의 기하 지표(선폭·모서리 편차)에 쓴다. */
  intendedPath?: [number, number][];
  /** 샘플 생성 시드(결정성 기록). */
  seed: number;
  /** 입력 표본율(Hz). */
  sampleRateHz: number;
}

/** 압력 바닥값. */
export const PRESSURE_FLOOR = 0.02;

interface FixtureProfile {
  description: string;
  durationMs: number;
  sampleRateHz: number;
  seed: number;
  /** 정규화 위치(0..1). t ∈ [0,1]. */
  position: (t: number) => [number, number];
  pressure: (t: number) => number;
  tilt: (t: number) => [number, number];
  twist: (t: number) => number;
  /** px 단위 위치 노이즈(σ). 0이면 없음. */
  positionNoisePx: number;
  pressureNoise: number;
  /** 정규화 의도 경로(없으면 생략). */
  intendedPath?: [number, number][];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function bezier3(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

/** 균일 속도 폴리라인 보간(세그먼트 길이 비례). */
function polylineAt(vertices: readonly [number, number][], t: number): [number, number] {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < vertices.length; i += 1) {
    const a = vertices[i - 1];
    const b = vertices[i];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(len);
    total += len;
  }
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (!first || !last || total === 0) return first ?? [0, 0];
  if (t <= 0) return [first[0], first[1]];
  if (t >= 1) return [last[0], last[1]];
  let target = t * total;
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i] ?? 0;
    const a = vertices[i];
    const b = vertices[i + 1];
    if (!a || !b) break;
    if (target <= len || i === lengths.length - 1) {
      const s = len > 0 ? target / len : 0;
      return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
    }
    target -= len;
  }
  return [last[0], last[1]];
}

const ZIGZAG_VERTICES: [number, number][] = [0, 1, 2, 3, 4, 5, 6].map((i) => [
  0.15 + (0.7 * i) / 6,
  i % 2 === 0 ? 0.3 : 0.7,
]);

const CORNER_VERTICES: [number, number][] = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.75, 0.75],
  [0.25, 0.75],
];

const CURVE_P0: [number, number] = [0.15, 0.7];
const CURVE_P1: [number, number] = [0.35, 0.1];
const CURVE_P2: [number, number] = [0.65, 0.9];
const CURVE_P3: [number, number] = [0.85, 0.3];

const NO_TILT: [number, number] = [0, 0];

const PROFILES: Record<FixtureId, FixtureProfile> = {
  line: {
    description: "수평 직선, 압력 0.6 일정, 중속(선폭 일관성·에지 지표 기준)",
    durationMs: 600,
    sampleRateHz: 240,
    seed: 1,
    position: (t) => [0.15 + 0.7 * t, 0.5],
    pressure: () => 0.6,
    tilt: () => NO_TILT,
    twist: () => 0,
    positionNoisePx: 0,
    pressureNoise: 0,
    intendedPath: [
      [0.15, 0.5],
      [0.85, 0.5],
    ],
  },
  curve: {
    description: "3차 베지에 S 곡선, 압력 사인 변조, 기울기 완만 회전(곡률 추종·회전 추종)",
    durationMs: 800,
    sampleRateHz: 240,
    seed: 2,
    position: (t) => bezier3(CURVE_P0, CURVE_P1, CURVE_P2, CURVE_P3, t),
    pressure: (t) => 0.4 + 0.4 * Math.sin(Math.PI * t),
    tilt: (t) => [15 * Math.sin(2 * Math.PI * t), -10 * Math.cos(2 * Math.PI * t)],
    twist: () => 0,
    positionNoisePx: 0,
    pressureNoise: 0,
    intendedPath: Array.from({ length: 65 }, (_, i) =>
      bezier3(CURVE_P0, CURVE_P1, CURVE_P2, CURVE_P3, i / 64),
    ),
  },
  zigzag: {
    description: "6세그먼트 지그재그, 압력 0.6..0.8, 기울기 20°(방향 급변·중첩 영역)",
    durationMs: 900,
    sampleRateHz: 240,
    seed: 3,
    position: (t) => polylineAt(ZIGZAG_VERTICES, t),
    pressure: (t) => 0.7 + 0.1 * Math.sin(4 * Math.PI * t),
    tilt: () => [20, 0],
    twist: () => 0,
    positionNoisePx: 0,
    pressureNoise: 0,
    intendedPath: ZIGZAG_VERTICES,
  },
  spiral: {
    description: "아르키메데스 소용돌이 2회전, 압력 0.2→0.9 선형 증가(곡률 변화·압력 램프)",
    durationMs: 1500,
    sampleRateHz: 240,
    seed: 4,
    position: (t) => {
      const theta = 4 * Math.PI * t;
      const r = 0.03 + 0.32 * t;
      return [0.5 + r * Math.cos(theta), 0.5 + r * Math.sin(theta)];
    },
    pressure: (t) => 0.2 + 0.7 * t,
    tilt: () => NO_TILT,
    twist: () => 0,
    positionNoisePx: 0,
    pressureNoise: 0,
  },
  "fast-flick": {
    description: "80 ms 고속 획(≈3.8 px/ms @512), 압력 종 모양(빠른 획 끊김·테이퍼)",
    durationMs: 80,
    sampleRateHz: 240,
    seed: 5,
    position: (t) => [0.2 + 0.6 * t, 0.6 - 0.2 * t],
    pressure: (t) => (t < 0.3 ? (0.8 * t) / 0.3 : t > 0.6 ? (0.8 * (1 - t)) / 0.4 : 0.8),
    tilt: () => NO_TILT,
    twist: () => 0,
    positionNoisePx: 0,
    pressureNoise: 0,
    intendedPath: [
      [0.2, 0.6],
      [0.8, 0.4],
    ],
  },
  "slow-pressure-ramp": {
    description: "3 s 저속 직선, 압력 삼각파 0→1→0(단조성·선형성·히스테리시스)",
    durationMs: 3000,
    sampleRateHz: 120,
    seed: 6,
    position: (t) => [0.1 + 0.8 * t, 0.5],
    pressure: (t) => (t <= 0.5 ? 2 * t : 2 * (1 - t)),
    tilt: () => NO_TILT,
    twist: () => 0,
    positionNoisePx: 0,
    pressureNoise: 0,
    intendedPath: [
      [0.1, 0.5],
      [0.9, 0.5],
    ],
  },
  "corner-square": {
    description: "정사각형 3변(직각 모서리 2개), 균일 속도, 압력 0.6(모서리 편차·오버슈트)",
    durationMs: 1200,
    sampleRateHz: 240,
    seed: 7,
    position: (t) => polylineAt(CORNER_VERTICES, t),
    pressure: () => 0.6,
    tilt: () => NO_TILT,
    twist: () => 0,
    positionNoisePx: 0,
    pressureNoise: 0,
    intendedPath: CORNER_VERTICES,
  },
  "tilt-sweep": {
    description: "수평 직선, tiltX −55°→+55° 스윕, tiltY 사인, twist 0→180°(기울기·회전 응답)",
    durationMs: 1000,
    sampleRateHz: 240,
    seed: 8,
    position: (t) => [0.15 + 0.7 * t, 0.5],
    pressure: () => 0.5,
    tilt: (t) => [-55 + 110 * t, 10 * Math.sin(2 * Math.PI * t)],
    twist: (t) => 180 * t,
    positionNoisePx: 0,
    pressureNoise: 0,
    intendedPath: [
      [0.15, 0.5],
      [0.85, 0.5],
    ],
  },
  tremor: {
    description: "≈20 px/s 극저속 직선 + 위치 노이즈 σ 0.8 px, 압력 노이즈 σ 0.02(저속 지터)",
    durationMs: 7500,
    sampleRateHz: 120,
    seed: 0x7e3a,
    position: (t) => [0.35 + 0.3 * t, 0.5],
    pressure: () => 0.5,
    tilt: () => NO_TILT,
    twist: () => 0,
    positionNoisePx: 0.8,
    pressureNoise: 0.02,
    intendedPath: [
      [0.35, 0.5],
      [0.65, 0.5],
    ],
  },
};

/** Box–Muller 표준정규. nextF32는 [0,1)이므로 1−u로 log(0)을 피한다. */
function gaussian(rng: Pcg32): number {
  const u1 = 1 - rng.nextF32();
  const u2 = rng.nextF32();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function normalizeTwist(deg: number): number {
  const t = ((deg % 360) + 360) % 360;
  return t >= 359 ? 359 : t;
}

/** fixture 생성. 같은 (id, canvas)이면 결과가 deep-equal이다. */
export function buildFixture(
  id: FixtureId,
  canvas: { width: number; height: number } = DEFAULT_CANVAS,
): StrokeFixture {
  const profile = PROFILES[id];
  assertCanvasSize(canvas);
  const { width, height } = canvas;
  const dt = 1000 / profile.sampleRateHz;
  const count = Math.round((profile.durationMs * profile.sampleRateHz) / 1000) + 1;
  const rng = new Pcg32(profile.seed, 0x5eed);
  const samples: RawSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count > 1 ? i / (count - 1) : 0;
    const [u, v] = profile.position(t);
    let x = u * width;
    let y = v * height;
    if (profile.positionNoisePx > 0) {
      x += gaussian(rng) * profile.positionNoisePx;
      y += gaussian(rng) * profile.positionNoisePx;
    }
    let pressure = profile.pressure(t);
    if (profile.pressureNoise > 0) pressure += gaussian(rng) * profile.pressureNoise;
    const [tiltXDeg, tiltYDeg] = profile.tilt(t);
    samples.push({
      x: clamp(x, 0, width),
      y: clamp(y, 0, height),
      tMs: i * dt,
      pressure: clamp(pressure, PRESSURE_FLOOR, 1),
      tiltXDeg: clamp(tiltXDeg, -90, 90),
      tiltYDeg: clamp(tiltYDeg, -90, 90),
      twistDeg: normalizeTwist(profile.twist(t)),
      pointerType: "pen",
      phase: i === 0 ? "down" : i === count - 1 ? "up" : "move",
      source: "raw",
    });
  }
  const fixture: StrokeFixture = {
    id,
    width,
    height,
    samples,
    description: profile.description,
    seed: profile.seed,
    sampleRateHz: profile.sampleRateHz,
  };
  if (profile.intendedPath) {
    fixture.intendedPath = profile.intendedPath.map(([u, v]) => [u * width, v * height]);
  }
  return fixture;
}

/** 9종 전부. */
export function buildAllFixtures(
  canvas: { width: number; height: number } = DEFAULT_CANVAS,
): StrokeFixture[] {
  return FIXTURE_IDS.map((id) => buildFixture(id, canvas));
}

/** fixture 설명(UI 목록용). */
export function fixtureDescription(id: FixtureId): string {
  return PROFILES[id].description;
}

/** 압력 응답 지표를 적용하는 최소 압력 범위(max − min). 지그재그의 ±0.1 변조·tremor 노이즈는 제외된다. */
export const PRESSURE_VARIATION_MIN_RANGE = 0.25;

/** 압력이 실제로 변하는 fixture인지(압력 응답 지표 적용 여부). */
export function fixtureHasPressureVariation(fixture: StrokeFixture): boolean {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const s of fixture.samples) {
    if (s.pressure < lo) lo = s.pressure;
    if (s.pressure > hi) hi = s.pressure;
  }
  return hi - lo > PRESSURE_VARIATION_MIN_RANGE;
}
