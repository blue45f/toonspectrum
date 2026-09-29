/**
 * 스크린톤 canvas 2D 렌더러 (T6) — 2026-09-30
 *
 * renderScreentone(ctx, width, height, params, mask?) — ScreentoneLayer 파라미터를
 * canvas 2D에 그린다. 모든 패턴은 결정적(같은 입력 → 같은 픽셀):
 * 도트/사선/격자는 수학 격자, 모래망점은 시드 기반 정수 해시 노이즈.
 *
 * 출력 픽셀 형식: 잉크색 RGB + alpha=커버리지(0..255). 농도 100%는 완전 불투명,
 * 농도 0%는 완전 투명. 인쇄용 2치화는 toBinaryThreshold로 이어진다.
 */

import type { ScreentoneLayer, ScreentoneToneKind } from "./screentone-layer";

/**
 * renderScreentone이 요구하는 최소 2D 컨텍스트.
 * CanvasRenderingContext2D를 구조적으로 만족하므로 실제 canvas에 그대로 넘기면 된다.
 * (테스트에서는 createImageData/putImageData만 구현한 가짜를 쓴다.)
 */
export type ScreentoneRenderContext = {
  createImageData(sw: number, sh: number): ImageData;
  putImageData(imagedata: ImageData, dx: number, dy: number): void;
};

export type RenderScreentoneOptions = {
  /** 잉크 색상 [r,g,b] 0..255 — 기본 검정. */
  ink?: readonly [number, number, number];
};

/** 선 수(lines) → 망점 셀 한 변(px). lines=10→30px, lines=60→5px. */
export const SCREENTONE_CELL_BASE_PX = 300;

export function screentoneCellSize(lines: number): number {
  const safe = typeof lines === "number" && Number.isFinite(lines) && lines > 0 ? lines : 10;
  return Math.max(2, Math.round(SCREENTONE_CELL_BASE_PX / safe));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * (x,y)에서의 국소 농도 0..1.
 * 그라데이션이 꺼져 있으면 density/100 균일, 켜져 있으면 from→to를 영역에 걸쳐 보간.
 *  - linear: direction 방향으로의 투영을 0..1로 정규화.
 *  - radial: 중심에서의 거리를 대각선 절반으로 정규화.
 */
export function screentoneDensityAt(
  params: ScreentoneLayer,
  x: number,
  y: number,
  width: number,
  height: number
): number {
  const g = params.gradient;
  if (g.kind === "none") return clamp01(params.density / 100);
  const from = clamp01(g.fromDensity / 100);
  const to = clamp01(g.toDensity / 100);
  let t: number;
  if (g.kind === "radial") {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.hypot(width, height) / 2;
    t = maxR > 0 ? clamp01(Math.hypot(x - cx, y - cy) / maxR) : 0;
  } else {
    // linear
    const rad = (g.direction * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const cx = width / 2;
    const cy = height / 2;
    const maxProj = (Math.abs(dx) * width + Math.abs(dy) * height) / 2;
    const proj = (x - cx) * dx + (y - cy) * dy;
    t = maxProj > 0 ? clamp01(proj / maxProj / 2 + 0.5) : 0.5;
  }
  return from + (to - from) * t;
}

/**
 * 시드 기반 결정적 2D 정수 해시 → 0..1 (1 미만).
 * Math.imul 기반이라 실행 환경에 관계없이 같은 (x,y,seed)는 같은 값을 낸다.
 */
export function screentoneHash01(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// --- 패턴 커버리지 (0..1) ---

/** 도트: 회전 격자 셀 중심의 원 — 면적 ∝ 농도 (r = sqrt(d/π)·cell). */
function dotCoverage(x: number, y: number, cell: number, cos: number, sin: number, d: number): number {
  const u = x * cos + y * sin;
  const v = -x * sin + y * cos;
  const cu = (Math.floor(u / cell) + 0.5) * cell;
  const cv = (Math.floor(v / cell) + 0.5) * cell;
  const dist = Math.hypot(u - cu, v - cv);
  const r = Math.sqrt(d / Math.PI) * cell;
  // 0.5px 선형 램프 — 점 경계 안티에일리어싱(면적 1차 보존).
  return clamp01(r - dist + 0.5);
}

/** 사선: 격자축 좌표 p에서의 평행선 — 두께 ∝ 농도. */
function lineCoverage(p: number, cell: number, d: number): number {
  const pos = ((p % cell) + cell) % cell;
  const dist = Math.abs(pos - cell / 2);
  const halfThick = (d * cell) / 2;
  return clamp01(halfThick - dist + 0.5);
}

function patternCoverage(
  kind: ScreentoneToneKind,
  x: number,
  y: number,
  cell: number,
  cos: number,
  sin: number,
  d: number,
  seed: number
): number {
  if (d <= 0) return 0;
  if (d >= 1) return 1;
  switch (kind) {
    case "line": {
      const u = x * cos + y * sin;
      return lineCoverage(u, cell, d);
    }
    case "cross": {
      const u = x * cos + y * sin;
      const v = -x * sin + y * cos;
      return Math.max(lineCoverage(u, cell, d), lineCoverage(v, cell, d));
    }
    case "sand":
      // 모래망점: 픽셀별 임계 노이즈 — 해시값이 농도보다 작으면 잉크.
      return screentoneHash01(x, y, seed) < d ? 1 : 0;
    case "dot":
    default:
      return dotCoverage(x, y, cell, cos, sin, d);
  }
}

/**
 * 스크린톤 렌더 — canvas 2D 컨텍스트에 톤을 그린다.
 *
 *  - ctx가 null/undefined면 no-op (jsdom 등 canvas 미지원 환경 가드).
 *  - width/height가 0 이하면 no-op.
 *  - mask가 있으면(길이 width*height) 커버리지에 곱해 선택 영역 밖을 자른다.
 *    마스크 길이 불일치는 RangeError.
 *  - 출력은 잉크색 RGB + alpha=커버리지. 농도 100%→완전 불투명, 0%→완전 투명.
 *  - 결정적: 같은 params·크기·마스크는 항상 같은 픽셀을 만든다.
 */
export function renderScreentone(
  ctx: ScreentoneRenderContext | null | undefined,
  width: number,
  height: number,
  params: ScreentoneLayer,
  mask?: ArrayLike<number> | null,
  options?: RenderScreentoneOptions
): void {
  if (!ctx) return;
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (!(w > 0) || !(h > 0)) return;
  if (mask != null && mask.length !== w * h) {
    throw new RangeError("마스크 크기가 캔버스와 다릅니다.");
  }

  const ink = options?.ink ?? [0, 0, 0];
  const ir = Math.min(255, Math.max(0, Math.round(ink[0] ?? 0)));
  const ig = Math.min(255, Math.max(0, Math.round(ink[1] ?? 0)));
  const ib = Math.min(255, Math.max(0, Math.round(ink[2] ?? 0)));

  const cell = screentoneCellSize(params.lines);
  const rad = (params.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const seed = Math.floor(params.seed);

  const img = ctx.createImageData(w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = screentoneDensityAt(params, x, y, w, h);
      let cov = patternCoverage(params.kind, x, y, cell, cos, sin, d, seed);
      if (mask != null) {
        const mv: number = mask[i] as number;
        cov *= clamp01(typeof mv === "number" && Number.isFinite(mv) ? mv : 0);
      }
      const o = i * 4;
      data[o] = ir;
      data[o + 1] = ig;
      data[o + 2] = ib;
      data[o + 3] = Math.round(clamp01(cov) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// 인쇄용 2치화 — 톤 렌더 결과를 1bit 비트맵으로
// ---------------------------------------------------------------------------

export type BinaryThresholdSource = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type BinaryThresholdResult = {
  /** 1=잉크(검정), 0=종이(흰색) — 길이 width*height. */
  bitmap: Uint8Array;
  width: number;
  height: number;
};

/**
 * 2치화 임계값 변환 — 인쇄용 1bit 내보내기의 연계 포인트.
 *
 * 각 픽셀을 흰 종이 위에 합성했을 때의 "어두움"(alpha × (1-휘도))을 구해
 * threshold(0..255, 기본 128) 이상이면 잉크(1), 미만이면 종이(0)로 바꿈다.
 * renderScreentone 출력(검정+alpha)은 물론 일반 RGBA 이미지에도 쓸 수 있다.
 * 결정적. 크기가 유효하지 않으면 RangeError.
 */
export function toBinaryThreshold(
  source: BinaryThresholdSource,
  threshold: number = 128
): BinaryThresholdResult {
  const w = Math.floor(source.width);
  const h = Math.floor(source.height);
  if (!(w > 0) || !(h > 0)) {
    throw new RangeError("2치화 원본 크기가 올바르지 않습니다.");
  }
  if (source.data.length < w * h * 4) {
    throw new RangeError("2치화 원본 데이터 길이가 부족합니다.");
  }
  const t =
    typeof threshold === "number" && Number.isFinite(threshold)
      ? Math.min(255, Math.max(0, threshold))
      : 128;

  const bitmap = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const alpha = source.data[o + 3] / 255;
    const luma = (0.299 * source.data[o] + 0.587 * source.data[o + 1] + 0.114 * source.data[o + 2]) / 255;
    const darkness = alpha * (1 - luma);
    bitmap[i] = darkness * 255 >= t ? 1 : 0;
  }
  return { bitmap, width: w, height: h };
}
