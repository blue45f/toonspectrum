/**
 * studio-symmetry.ts
 *
 * CSP 대칭 자 격차 보강 — 대칭 그리기 순수 도메인 모델.
 *
 * 벤치마크:
 * - Clip Studio Paint: 대칭 자(Symmetrical Ruler) — 선 대칭 축 기준 미러 스냅
 * - Procreate: Drawing Guide 대칭 (수직/수평/쿼드런트/방사형)
 * - ibisPaint: 대칭 그리기 (수직·수평·방사형)
 * - Krita: Multibrush (미러·병렬·스노플레이크)
 *
 * ## 왜 "샘플 단계에서 복제" 인가
 * 순진한 구현은 스트로크를 다 그린 뒤 래스터 완성본을 뒤집어 합친다.
 * 그러면 방향성 브러시(캘리그래피 펜, 납작 붓, 질감 브러시)의 획 방향이
 * 뒤집힌 채로 찍혀 대칭축 너머의 질감이 어색해진다.
 * 이 모듈은 스트로크 샘플(x/y/pressure/방향벡터)을 대칭 행렬로 복제한다:
 * 좌표는 아핀 변환(회전/반사 + 평행이동), 방향벡터는 선형 부분(회전/반사)만
 * 적용한다. 브러시 엔진은 각 복제본을 독립된 스트로크로 렌더링하면 된다.
 *
 * DOM에 의존하지 않는다. 호출자가 PointerEvent 등에서 x/y/pressure와
 * 방향벡터(dx/dy)를 추출해 전달하면 복제된 샘플 배열을 반환한다.
 */

/** 대칭 복제 대상 스트로크 샘플 1개. */
export interface SymmetryStrokeSample {
  readonly x: number;
  readonly y: number;
  /** 필압 0–1. */
  readonly pressure: number;
  /** 스트로크 진행 방향 벡터. 정규화되지 않아도 된다. */
  readonly dx: number;
  readonly dy: number;
}

/** 대칭 모드: 끄기 / 수직축 / 수평축 / 4방향(수직+수평) / 방사형 N-fold. */
export type StudioSymmetryMode =
  | "off"
  | "vertical"
  | "horizontal"
  | "quad"
  | "radial";

export const STUDIO_SYMMETRY_MODES = [
  "off",
  "vertical",
  "horizontal",
  "quad",
  "radial",
] as const;

/** 방사형 분할 수 범위 (Procreate/CSP 관례 2–12). */
export const STUDIO_SYMMETRY_FOLDS_MIN = 2;
export const STUDIO_SYMMETRY_FOLDS_MAX = 12;

export function isStudioSymmetryMode(
  value: unknown,
): value is StudioSymmetryMode {
  return (
    STUDIO_SYMMETRY_MODES as readonly unknown[]
  ).includes(value);
}

export interface StudioSymmetrySettings {
  readonly mode: StudioSymmetryMode;
  /** 수직축 x 위치 (캔버스 좌표, 드래그로 이동). */
  readonly axisX: number;
  /** 수평축 y 위치 (캔버스 좌표, 드래그로 이동). */
  readonly axisY: number;
  /** 대칭축 각도(도, -180–180). 0이면 수직 모드는 정확히 수직선. */
  readonly angleDeg: number;
  /** 방사형 중심점 (드래그로 이동). */
  readonly centerX: number;
  readonly centerY: number;
  /** 방사형 분할 수 2–12. */
  readonly folds: number;
}

export function normalizeStudioSymmetrySettings(
  input: Partial<StudioSymmetrySettings> | null | undefined,
): StudioSymmetrySettings {
  const mode = isStudioSymmetryMode(input?.mode) ? input.mode : "off";
  const num = (value: unknown, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const rawFolds = num(input?.folds, 6);
  return {
    mode,
    axisX: num(input?.axisX, 160),
    axisY: num(input?.axisY, 120),
    angleDeg: Math.min(180, Math.max(-180, num(input?.angleDeg, 0))),
    centerX: num(input?.centerX, 160),
    centerY: num(input?.centerY, 120),
    folds: Math.min(
      STUDIO_SYMMETRY_FOLDS_MAX,
      Math.max(STUDIO_SYMMETRY_FOLDS_MIN, Math.round(rawFolds)),
    ),
  };
}

/** 모드별 복제본 개수 (off=1: 원본만). */
export function studioSymmetryCloneCount(
  settings: StudioSymmetrySettings,
): number {
  switch (settings.mode) {
    case "off":
      return 1;
    case "vertical":
    case "horizontal":
      return 2;
    case "quad":
      return 4;
    case "radial":
      return settings.folds;
  }
}

interface Affine2D {
  /** 선형 부분 [a b; c d] — 방향벡터에 적용. */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  /** 평행이동 (tx, ty) — 좌표에만 적용. */
  readonly tx: number;
  readonly ty: number;
}

const IDENTITY: Affine2D = Object.freeze({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx: 0,
  ty: 0,
});

/**
 * 점 P를 지나고 단위 방향 u를 갖는 직선에 대한 반사 변환.
 * p' = 2P − p + 2(u·(p−P))u, 선형 부분 R = 2uuᵀ − I.
 */
function reflectionAcrossLine(
  px: number,
  py: number,
  ux: number,
  uy: number,
): Affine2D {
  const a = 2 * ux * ux - 1;
  const b = 2 * ux * uy;
  const c = 2 * ux * uy;
  const d = 2 * uy * uy - 1;
  // t = (I − R)P
  const tx = (1 - a) * px - b * py;
  const ty = -c * px + (1 - d) * py;
  return { a, b, c, d, tx, ty };
}

/** 점 C를 중심으로 각도 θ(rad)만큼 회전. */
function rotationAbout(
  cx: number,
  cy: number,
  theta: number,
): Affine2D {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const tx = (1 - cos) * cx + sin * cy;
  const ty = -sin * cx + (1 - cos) * cy;
  return { a: cos, b: -sin, c: sin, d: cos, tx, ty };
}

/** 수직축(기본: x = axisX 직선, angleDeg만큼 회전)의 반사 행렬. */
function verticalAxisTransform(settings: StudioSymmetrySettings): Affine2D {
  const phi = Math.PI / 2 + (settings.angleDeg * Math.PI) / 180;
  return reflectionAcrossLine(
    settings.axisX,
    settings.axisY,
    Math.cos(phi),
    Math.sin(phi),
  );
}

/** 수평축(기본: y = axisY 직선, angleDeg만큼 회전)의 반사 행렬. */
function horizontalAxisTransform(settings: StudioSymmetrySettings): Affine2D {
  const phi = (settings.angleDeg * Math.PI) / 180;
  return reflectionAcrossLine(
    settings.axisX,
    settings.axisY,
    Math.cos(phi),
    Math.sin(phi),
  );
}

function composeAffine(first: Affine2D, second: Affine2D): Affine2D {
  // second ∘ first: p ↦ second(first(p))
  return {
    a: second.a * first.a + second.b * first.c,
    b: second.a * first.b + second.b * first.d,
    c: second.c * first.a + second.d * first.c,
    d: second.c * first.b + second.d * first.d,
    tx: second.a * first.tx + second.b * first.ty + second.tx,
    ty: second.c * first.tx + second.d * first.ty + second.ty,
  };
}

/**
 * cloneIndex번째 복제본에 적용할 아핀 변환.
 * quad는 [원본, 수직반사, 수평반사, 수직∘수평(=중심점 대칭)] 4개다.
 */
export function studioSymmetryTransform(
  settings: StudioSymmetrySettings,
  cloneIndex: number,
): Affine2D {
  const count = studioSymmetryCloneCount(settings);
  const index = ((cloneIndex % count) + count) % count;
  switch (settings.mode) {
    case "off":
      return IDENTITY;
    case "vertical":
      return index === 0 ? IDENTITY : verticalAxisTransform(settings);
    case "horizontal":
      return index === 0 ? IDENTITY : horizontalAxisTransform(settings);
    case "quad": {
      const v = verticalAxisTransform(settings);
      const h = horizontalAxisTransform(settings);
      if (index === 0) return IDENTITY;
      if (index === 1) return v;
      if (index === 2) return h;
      return composeAffine(v, h);
    }
    case "radial":
      return rotationAbout(
        settings.centerX,
        settings.centerY,
        (index * 2 * Math.PI) / settings.folds,
      );
  }
}

/**
 * 스트로크 샘플 1개를 cloneIndex번째 복제본 좌표계로 변환한다.
 * 좌표에는 아핀 전체를, 방향벡터에는 선형 부분만 적용한다
 * (평행이동이 방향을 바꾸면 안 된다 — 방향성 브러시 정확도의 핵심).
 */
export function transformStudioSymmetrySample(
  settings: StudioSymmetrySettings,
  cloneIndex: number,
  sample: SymmetryStrokeSample,
): SymmetryStrokeSample {
  const t = studioSymmetryTransform(settings, cloneIndex);
  return {
    x: t.a * sample.x + t.b * sample.y + t.tx,
    y: t.c * sample.x + t.d * sample.y + t.ty,
    pressure: sample.pressure,
    dx: t.a * sample.dx + t.b * sample.dy,
    dy: t.c * sample.dx + t.d * sample.dy,
  };
}

/**
 * 스트로크 샘플 1개를 모든 복제본으로 펼친다.
 * 반환 배열의 인덱스 i가 cloneIndex i에 대응한다.
 */
export function cloneStudioSymmetrySample(
  settings: StudioSymmetrySettings,
  sample: SymmetryStrokeSample,
): SymmetryStrokeSample[] {
  const count = studioSymmetryCloneCount(settings);
  const clones: SymmetryStrokeSample[] = [];
  for (let i = 0; i < count; i += 1) {
    clones.push(transformStudioSymmetrySample(settings, i, sample));
  }
  return clones;
}
