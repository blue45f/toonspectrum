/**
 * Studio Perfect Freehand — 벡터 펜 스트로크 어댑터 (perfect-freehand / tldraw 필기감 엔진).
 *
 * 획의 점·필압·브러시 프로필을 받아 perfect-freehand `getStroke`의 아웃라인 폴리곤을 만들고,
 * 이를 Konva <Path data> / SVG export가 그대로 그릴 수 있는 채워진(fill) SVG 패스 문자열로
 * 변환하는 순수 어댑터. 스트로크는 stroked Line이 아니라 "선 색으로 채운 아웃라인 폴리곤"으로
 * 렌더된다 — 필압 굵기·테이퍼가 실제 지오메트리에 새겨져 확대/내보내기에서도 동일하다.
 *  - 결정성: getStroke는 입력만의 순수 함수다(난수 없음). 필압이 없을 때의 simulatePressure도
 *    점 간 거리 기반이라 같은 입력이면 협업 복제본·재렌더·내보내기에서 항상 같은 패스가 나온다.
 *  - 번들 규율: perfect-freehand 본체는 `loadStudioPerfectFreehandStroker()` 동적 import 뒤에만
 *    로드된다(rough.js와 같은 다이내믹 청크 패턴). 이 파일의 나머지(프로필·옵션·outline→path
 *    매핑)는 eager 그래프에 안전한 순수 코드다. 스트로커는 DI 파라미터로 받아 DOM 의존 없이
 *    단위 테스트할 수 있다.
 *  - 라이브 계약: 다이렉트 핫패스 초안 파이프라인(임페러티브 sceneFunc/WebGPU — pen/marker
 *    전용)은 건드리지 않는다. "perfect" 패밀리는 direct-live 대상이 아니므로 리테인드 초안과
 *    커밋 렌더 모두 StudioDrawNode의 같은 어댑터 경로를 지난다(pointer-up 커밋 스왑 계약 유지).
 */
import { resampleStrokePressures } from "./studio-brush";

import type { StrokeOptions } from "perfect-freehand";

/** 렌더러가 perfect-freehand 타입에 직접 의존하지 않도록 재노출하는 스트로커 핸들 타입. */
export type StudioPerfectFreehandStroker = (
  points: (number[] | { x: number; y: number; pressure?: number })[],
  options?: StrokeOptions
) => number[][];

// ---------------------------------------------------------------------------
// 브러시 프로필 — 카탈로그 id → getStroke 옵션 튜닝(단일 정의처)
// ---------------------------------------------------------------------------

export type StudioPerfectFreehandBrushId = "perfect-ink" | "perfect-marker";

/** 퍼펙트-프리핸드 렌더 경로를 쓰는 브러시의 획 성격 — 카탈로그 계약과 함께 감사된다. */
export interface StudioPerfectFreehandProfile {
  readonly id: StudioPerfectFreehandBrushId;
  /** 필압이 굵기에 미치는 영향(0=균일 굵기, 1=최대) — getStroke thinning. */
  readonly thinning: number;
  /** 아웃라인 모서리 연화 정도 — getStroke smoothing. */
  readonly smoothing: number;
  /** 입력 점 지터를 억제하는 보간 강도 — getStroke streamline. */
  readonly streamline: number;
  /** 획 시작을 펜촉처럼 가늘게 뽑는 길이 = strokeWidth × factor (0이면 테이퍼 없음). */
  readonly taperStartFactor: number;
  /** 획 끝 테이퍼 길이 = strokeWidth × factor (0이면 테이퍼 없음). */
  readonly taperEndFactor: number;
  /** 테이퍼가 0일 때 끝을 둥근 캡으로 마감할지. */
  readonly capStart: boolean;
  readonly capEnd: boolean;
}

/**
 * 퍼펙트-프리핸드 브러시 카탈로그 프로필.
 *  - perfect-ink: 강한 thinning + 양끝 테이퍼 — 붓펜/캘리 잉크의 눌림·빠짐 필기감.
 *  - perfect-marker: 약한 thinning + 캡 마감 — 균일에 가까운 매끈한 마커 획.
 */
export const STUDIO_PERFECT_FREEHAND_PROFILES: Readonly<
  Record<StudioPerfectFreehandBrushId, StudioPerfectFreehandProfile>
> = {
  "perfect-ink": {
    id: "perfect-ink",
    thinning: 0.72,
    smoothing: 0.52,
    streamline: 0.45,
    taperStartFactor: 2.8,
    taperEndFactor: 3.4,
    capStart: true,
    capEnd: true,
  },
  "perfect-marker": {
    id: "perfect-marker",
    thinning: 0.16,
    smoothing: 0.62,
    streamline: 0.32,
    taperStartFactor: 0,
    taperEndFactor: 0,
    capStart: true,
    capEnd: true,
  },
};

/** 브러시 id가 퍼펙트-프리핸드 렌더 경로를 쓰면 프로필, 아니면 null — 렌더러의 단일 판정 지점. */
export function resolveStudioPerfectFreehandProfile(
  brushId: unknown
): StudioPerfectFreehandProfile | null {
  if (typeof brushId !== "string" || !brushId) return null;
  return (
    STUDIO_PERFECT_FREEHAND_PROFILES[brushId as StudioPerfectFreehandBrushId] ?? null
  );
}

function clampTo(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

/**
 * 프로필 + 브러시 굵기 → getStroke 옵션. easing은 기본값(결정적)을 쓰고, 하드웨어 필압
 * 배열이 없을 때만 속도 기반 시뮬레이션을 켠다(입력 좌표만의 함수라 역시 결정적).
 */
export function studioPerfectFreehandStrokeOptions(
  profile: StudioPerfectFreehandProfile,
  strokeWidth: number,
  hasPressures: boolean,
  segmentLength?: number
): StrokeOptions {
  const size = clampTo(strokeWidth, 0.5, 400, 6);
  const safeShortLength = size * 1.4;
  const shouldDisableTaper = segmentLength !== undefined
    && (!Number.isFinite(segmentLength) || segmentLength <= 0 || segmentLength <= safeShortLength);
  return {
    size,
    thinning: profile.thinning,
    smoothing: profile.smoothing,
    streamline: profile.streamline,
    simulatePressure: !hasPressures,
    last: true,
    start: {
      cap: profile.capStart,
      taper: shouldDisableTaper || profile.taperStartFactor <= 0
        ? 0
        : size * profile.taperStartFactor,
    },
    end: {
      cap: profile.capEnd,
      taper: shouldDisableTaper || profile.taperEndFactor <= 0
        ? 0
        : size * profile.taperEndFactor,
    },
  };
}

// ---------------------------------------------------------------------------
// outline → SVG 패스 문자열 매핑(순수)
// ---------------------------------------------------------------------------

/** 소수 둘째 자리 반올림 — 패스 문자열을 결정적·직렬화 친화적으로 유지. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * getStroke 아웃라인 폴리곤 → 채워질 SVG 패스 `d` 문자열.
 * 표준 perfect-freehand 레시피: 각 정점을 제어점으로, 이웃 정점과의 중점을 끝점으로 하는
 * 이차 곡선(Q) 체인으로 폴리곤을 부드럽게 닫는다. 정점이 3개 미만이거나 비유한 좌표가
 * 섞여 있으면 빈 문자열을 반환한다(렌더러는 깨끗한 Line 폴백).
 */
export function studioPerfectFreehandOutlineToPathData(
  outline: readonly (readonly number[])[]
): string {
  if (outline.length < 3) return "";
  for (const vertex of outline) {
    if (
      vertex.length < 2
      || !Number.isFinite(vertex[0])
      || !Number.isFinite(vertex[1])
    ) {
      return "";
    }
  }
  const first = outline[0]!;
  const parts: string[] = [`M${round2(first[0]!)} ${round2(first[1]!)}`];
  for (let index = 0; index < outline.length; index++) {
    const current = outline[index]!;
    const next = outline[(index + 1) % outline.length]!;
    parts.push(
      `Q${round2(current[0]!)} ${round2(current[1]!)} ` +
        `${round2((current[0]! + next[0]!) / 2)} ${round2((current[1]! + next[1]!) / 2)}`
    );
  }
  parts.push("Z");
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// 획 → 아웃라인/패스 빌드(순수, 스트로커는 DI)
// ---------------------------------------------------------------------------

export interface StudioPerfectFreehandStrokeInput {
  /** 평탄 좌표 [x0,y0,x1,y1,...] — DrawEl.points(대칭 변형본 포함) 그대로. */
  readonly points: readonly number[];
  /** DrawEl.pressures — 없으면 getStroke의 속도 기반 시뮬레이션을 쓴다. */
  readonly pressures?: readonly number[] | null;
  readonly strokeWidth: number;
  readonly profile: StudioPerfectFreehandProfile;
}

/**
 * 평탄 점·필압을 getStroke 입력으로 정규화해 아웃라인 폴리곤을 만든다. 스트로커는
 * loadStudioPerfectFreehandStroker()가 만든 getStroke(DI — 테스트에서는 직접 import 주입 가능).
 * 유효한 점이 2개 미만이면 빈 배열을 반환한다(렌더러는 깨끗한 Line/도트 폴백).
 */
export function buildStudioPerfectFreehandOutline(
  stroker: StudioPerfectFreehandStroker,
  input: StudioPerfectFreehandStrokeInput
): number[][] {
  const pointCount = Math.floor(input.points.length / 2);
  if (pointCount < 2) return [];

  const hasPressures = Array.isArray(input.pressures) && input.pressures.length > 0;
  const sampledPressures = hasPressures
    ? resampleStrokePressures(input.pressures, pointCount, 0.5)
    : null;

  const strokePoints: number[][] = [];
  for (let index = 0; index < pointCount; index++) {
    const x = input.points[index * 2];
    const y = input.points[index * 2 + 1];
    if (
      typeof x !== "number" || !Number.isFinite(x)
      || typeof y !== "number" || !Number.isFinite(y)
    ) {
      continue;
    }
    strokePoints.push([x, y, sampledPressures?.[index] ?? 0.5]);
  }
  if (strokePoints.length < 2) return [];
  const firstPoint = strokePoints[0];
  const lastPoint = strokePoints[strokePoints.length - 1];
  const segmentLength = firstPoint && lastPoint
    ? Math.hypot(lastPoint[0] - firstPoint[0], lastPoint[1] - firstPoint[1])
    : 0;

  return stroker(
    strokePoints,
    studioPerfectFreehandStrokeOptions(input.profile, input.strokeWidth, hasPressures, segmentLength)
  );
}

/**
 * 획 → Konva <Path data>/SVG로 그릴 채워진 아웃라인 패스 문자열.
 * 지오메트리가 부족하거나 비정상이면 빈 문자열(렌더러 폴백).
 */
export function buildStudioPerfectFreehandPathData(
  stroker: StudioPerfectFreehandStroker,
  input: StudioPerfectFreehandStrokeInput
): string {
  const path = studioPerfectFreehandOutlineToPathData(
    buildStudioPerfectFreehandOutline(stroker, input)
  );
  if (typeof globalThis !== "undefined") {
    const debug = (globalThis as { __debugPerfectInk?: boolean }).__debugPerfectInk;
    if (debug) {
      const pointCount = Math.floor(input.points.length / 2);
      const profileId = input.profile.id;
      console.log(
        `[debug-perfect-ink] ${profileId} points=${pointCount} inputWidth=${input.strokeWidth} pathLen=${path.length}`
      );
    }
  }
  return path;
}

// ---------------------------------------------------------------------------
// perfect-freehand 로더 — 동적 import 뒤에만 라이브러리가 번들에 들어온다
// ---------------------------------------------------------------------------

let cachedStroker: StudioPerfectFreehandStroker | null = null;
let pendingStrokerLoad: Promise<StudioPerfectFreehandStroker> | null = null;

/** 이미 로드된 스트로커(없으면 null) — 렌더러/SVG export가 동기 프레임에서 사용. */
export function peekStudioPerfectFreehandStroker(): StudioPerfectFreehandStroker | null {
  return cachedStroker;
}

/**
 * perfect-freehand getStroke를 동적 import로 로드해 캐시한다. Studio eager 청크에
 * 라이브러리가 포함되지 않도록 하는 유일한 로드 경로. 실패하면 다음 호출이 재시도한다.
 */
export function loadStudioPerfectFreehandStroker(): Promise<StudioPerfectFreehandStroker> {
  if (cachedStroker) return Promise.resolve(cachedStroker);
  pendingStrokerLoad ??= import("perfect-freehand")
    .then((module) => {
      cachedStroker = module.getStroke;
      return cachedStroker;
    })
    .catch((error: unknown) => {
      pendingStrokerLoad = null;
      throw error;
    });
  return pendingStrokerLoad;
}
