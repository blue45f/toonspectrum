/**
 * Sumi 엔진 공용 타입.
 *
 * - 외부 패키지 import 없이 구조적 타입만 둔다. `RawSample`은 `@toonstudio/studio-project-model`의
 *   `RawInputSampleIR`와 필드가 호환되지만 의도적으로 import하지 않는다(엔진 코어는 승격 단위).
 * - 좌표는 문서 px, 시간은 ms, 각도는 외부 API에서 deg·내부 수식에서 rad, 압력은 0..1이다.
 */

/** 포인터 종류. */
export type PointerKind = "pen" | "touch" | "mouse";

/** 획 단계. */
export type SamplePhase = "down" | "move" | "up";

/** 입력 표본 출처. `predicted`는 표시 전용이며 정본 스트림에 들어가지 않는다. */
export type SampleSource = "raw" | "coalesced" | "predicted";

/** 플랫폼 어댑터가 넘기는 원시 입력 표본(교정 전). */
export interface RawSample {
  x: number;
  y: number;
  tMs: number;
  pressure: number;
  tiltXDeg: number;
  tiltYDeg: number;
  twistDeg: number;
  tangentialPressure?: number;
  contactWidth?: number;
  contactHeight?: number;
  buttons?: number;
  pointerType: PointerKind;
  phase: SamplePhase;
  source: SampleSource;
}

/** 입력 파이프라인(교정·필터·곡률 추정)을 거친 정본 표본. */
export interface ModeledSample {
  x: number;
  y: number;
  /** 필터가 출력을 확정한 시각(ms). */
  tMs: number;
  /** 원본 입력 시각(ms). 지연 측정에 쓴다. */
  inputTMs: number;
  /** 교정·필터 후 압력 0..1. */
  pressure: number;
  /** 속도 px/ms. */
  velocity: number;
  /** 고도각(deg). 90 = 수직. */
  altitudeDeg: number;
  /** 방위각(deg). */
  azimuthDeg: number;
  twistDeg?: number;
  /** 단위 진행 방향 벡터. 정지 시 (1, 0). */
  dirX: number;
  dirY: number;
  /** Menger 곡률(1/px, 부호 있음). */
  curvature: number;
  phase: SamplePhase;
  source: "raw" | "coalesced";
  /** push()에 들어온 원시 배열 안에서의 인덱스. */
  sourceIndex: number;
}

/** 표시 전용 예측 표본. */
export interface PreviewSample {
  x: number;
  y: number;
  tMs: number;
  pressure: number;
  source: "predicted";
}

/** 팁 접촉 물리 1틱의 결과(dab 생성 전 발자국). */
export interface ContactFootprint {
  /** 장축 반경(px). */
  rx: number;
  /** 단축 반경(px). */
  ry: number;
  /** 회전각(rad). */
  angle: number;
  /** 도포 강도 배율 0..1. */
  depositStrength: number;
  /** 빠른 획에서 끊김(갈필) 정도 0..1. */
  breakup: number;
  /** 종이 요철 응답(흑연 등) 0..1. */
  grain: number;
  /** 수분 공급량 0..1. */
  water: number;
  /** 기울기에 의한 장·단축 비대칭 0..1. */
  asymmetry: number;
  /** 닙 벌어짐(px). 닙이 아니면 0. */
  nibGap: number;
}

/** 팁 마스크 종류(절차 생성 8종). */
export type TipKind =
  | "round"
  | "flat"
  | "bristle-strands"
  | "texture-stamp"
  | "noise"
  | "hatch"
  | "stipple"
  | "particle";

/** 도포 모델(래스터라이저가 dab를 해석하는 방식). */
export type DepositionModel =
  | "dry-stamp"
  | "airbrush"
  | "spray"
  | "bristle"
  | "hatch-halftone"
  | "smudge"
  | "eraser"
  | "impasto"
  | "wet-flow";

/**
 * dab 인스턴스 — 결정성 검증 단위.
 * 색은 선형 premultiplied RGBA이며 `core/dab-layout.ts`의 64 B 레이아웃으로 GPU에 전달된다.
 */
export interface DabInstance {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** 회전각(rad). */
  angle: number;
  /** 0 = 매우 부드러움, 1 = 1 px 전이. */
  hardness: number;
  /** dab 1개의 불투명도 기여 0..1. */
  flow: number;
  /** 초타원 지수 n. 2 = 타원, 큰 값 = 사각형에 수렴. */
  shapeExp: number;
  r: number;
  g: number;
  b: number;
  a: number;
  tipKind: TipKind;
  /** 24비트 시드(픽셀 해시 노이즈·질감 위상). */
  seed: number;
  /** 종이 그레인 응답 강도 0..1. */
  grain: number;
  /** 수분 투입량 0..1. */
  wet: number;
  /** 안료 질량 0..1(u16로 양자화). */
  pigmentMass: number;
  erase: boolean;
  smudge: boolean;
  dualTip: boolean;
  lockAlpha: boolean;
  impasto: boolean;
  deposition: DepositionModel;
}

/** sRGB straight alpha RGBA8 이미지(리포트·표시용). */
export interface LabImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** 주입 가능한 시계. 엔진 안에서 `Date.now`·`performance.now`를 직접 쓰지 않는다. */
export interface Clock {
  now: () => number;
}

/** 2D 점. */
export interface Pt {
  x: number;
  y: number;
}

/** sRGB straight RGBA(각 0..1). */
export type Rgba = readonly [number, number, number, number];

/**
 * GPU 어댑터 정보(레인 능력 리포트 공용 어휘).
 * `engine/gpu/device.ts`의 `GpuProbeResult["adapterInfo"]`가 이 타입을 재사용한다.
 */
export interface GpuAdapterInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}

/**
 * GPU 시간 측정 출처(레인 영수증 공용 어휘).
 * `engine/gpu/timing.ts`가 이 타입을 재수출한다.
 */
export type TimingSource =
  | "timestamp-query"
  | "submitted-work-done"
  | "performance-now"
  | "unavailable";
