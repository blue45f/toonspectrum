/**
 * studio-screentone.ts
 *
 * 만화 스크린톤(도트/사선/크로스) 패턴 생성기.
 * ibisPaint·CSP의 "톤 46종" 같은 프리셋 갤러리 대신, 농도·선 수·각도·패턴을
 * 조합해 원하는 톤을 직접 만드는 생성기 중심 설계 (UI 복제 아님, 원리 재해석).
 *
 * 모델:
 * - ScreentoneConfig: pattern(dot|line|cross), density(10..80%), lines, angleDeg
 * - buildScreentoneTile: 타일 한 변 px의 커버리지(0..1) Float32Array — 순수 함수
 * - Canvas2D 패턴 타일 렌더 / 영역 채우기 헬퍼 — 브라우저 전용, 가드 포함
 */

export type ScreentonePattern = "dot" | "line" | "cross";

export interface ScreentoneConfig {
  /** 도트 / 사선 / 크로스(교차 사선). */
  readonly pattern: ScreentonePattern;
  /** 잉크 커버리지 %, 10..80. */
  readonly density: number;
  /** 타일 한 변당 선 수 (LPI 유사), 8..72. */
  readonly lines: number;
  /** 패턴 회전 각도(도), 0..180. */
  readonly angleDeg: number;
}

export const STUDIO_SCREENTONE_LIMITS = {
  minDensity: 10,
  maxDensity: 80,
  minLines: 8,
  maxLines: 72,
  minAngle: 0,
  maxAngle: 180,
} as const;

export interface ScreentonePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly config: ScreentoneConfig;
}

/** 자주 쓰는 톤 4종 시작 프리셋. */
export const STUDIO_SCREENTONE_PRESETS: ReadonlyArray<ScreentonePreset> =
  Object.freeze([
    {
      id: "dot-30",
      labelKo: "표준 도트 30%",
      labelEn: "Standard dot 30%",
      config: { pattern: "dot", density: 30, lines: 24, angleDeg: 45 },
    },
    {
      id: "dot-60",
      labelKo: "거친 도트 60%",
      labelEn: "Coarse dot 60%",
      config: { pattern: "dot", density: 60, lines: 14, angleDeg: 45 },
    },
    {
      id: "line-20",
      labelKo: "사선 20%",
      labelEn: "Diagonal line 20%",
      config: { pattern: "line", density: 20, lines: 32, angleDeg: 60 },
    },
    {
      id: "cross-45",
      labelKo: "크로스 45%",
      labelEn: "Cross 45%",
      config: { pattern: "cross", density: 45, lines: 20, angleDeg: 45 },
    },
  ]);

export function validateScreentoneConfig(
  config: ScreentoneConfig,
): { readonly ok: boolean; readonly errors: ReadonlyArray<string> } {
  const errors: string[] = [];
  const L = STUDIO_SCREENTONE_LIMITS;
  if (!["dot", "line", "cross"].includes(config.pattern)) {
    errors.push(`알 수 없는 패턴: ${String(config.pattern)}`);
  }
  if (
    !Number.isFinite(config.density) ||
    config.density < L.minDensity ||
    config.density > L.maxDensity
  ) {
    errors.push(`농도는 ${L.minDensity}..${L.maxDensity}% 범위여야 합니다.`);
  }
  if (
    !Number.isFinite(config.lines) ||
    Math.floor(config.lines) !== config.lines ||
    config.lines < L.minLines ||
    config.lines > L.maxLines
  ) {
    errors.push(`선 수는 ${L.minLines}..${L.maxLines} 정수여야 합니다.`);
  }
  if (
    !Number.isFinite(config.angleDeg) ||
    config.angleDeg < L.minAngle ||
    config.angleDeg > L.maxAngle
  ) {
    errors.push(`각도는 ${L.minAngle}..${L.maxAngle}도 범위여야 합니다.`);
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/* ------------------------------------------------------------------ */
/* 타일 커버리지 생성 (순수 함수)                                         */
/* ------------------------------------------------------------------ */

export interface BuildScreentoneTileOptions {
  readonly size?: number;
}

/**
 * 스크린톤 타일 생성. size*size 길이의 Float32Array, 0..1 커버리지.
 * 도트: 농도 → 도트 면적 비율로 반경 계산 (r = spacing * sqrt(d/π))
 * 선: 선 두께 = 간격 × 농도. 크로스: 두 방향 선 겹침.
 * angleDeg만큼 타일 중심 기준 회전.
 */
export function buildScreentoneTile(
  config: ScreentoneConfig,
  options: BuildScreentoneTileOptions = {},
): Float32Array {
  const size = Math.max(16, Math.min(512, Math.floor(options.size ?? 120)));
  const tile = new Float32Array(size * size);
  const density = Math.max(0, Math.min(1, config.density / 100));
  const spacing = size / config.lines;
  const angle = (config.angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // 타일 중심 기준 회전
      const dx = x - cx;
      const dy = y - cy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;

      let coverage: number;
      if (config.pattern === "dot") {
        const radius = spacing * Math.sqrt(density / Math.PI);
        // 가장 가까운 격자점까지 거리
        const gx = Math.round(rx / spacing) * spacing;
        const gy = Math.round(ry / spacing) * spacing;
        const dist = Math.hypot(rx - gx, ry - gy);
        coverage = dist <= radius ? 1 : 0;
      } else if (config.pattern === "line") {
        const width = spacing * density;
        const m = ((rx % spacing) + spacing) % spacing;
        coverage = m < width ? 1 : 0;
      } else {
        // cross: 두 방향 선, 겹치면 1 (농도는 선 두께의 절반씩 분배)
        const halfWidth = (spacing * density) / 2;
        const m1 = ((rx % spacing) + spacing) % spacing;
        const m2 = ((ry % spacing) + spacing) % spacing;
        coverage = m1 <= halfWidth || m2 <= halfWidth ? 1 : 0;
      }
      tile[y * size + x] = coverage;
    }
  }
  return tile;
}

/**
 * 타일의 실제 평균 커버리지를 측정한다 (밀도 설정 검증용).
 */
export function measureScreentoneCoverage(tile: Float32Array): number {
  if (tile.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < tile.length; i += 1) sum += tile[i];
  return sum / tile.length;
}

/* ------------------------------------------------------------------ */
/* Canvas2D 렌더 헬퍼 (브라우저 전용)                                     */
/* ------------------------------------------------------------------ */

/** 커버리지 타일 + 잉크 색 → 타일 캔버스. 브라우저가 아니면 null. */
export function createScreentoneTileCanvas(
  tile: Float32Array,
  size: number,
  ink: readonly [number, number, number],
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const [r, g, b] = ink;
  for (let i = 0; i < tile.length; i += 1) {
    const a = Math.round(tile[i] * 255);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * 대상 컨텍스트의 직사각형 영역을 스크린톤으로 채운다.
 * ink: [r,g,b] 0..255.
 */
export function fillScreentoneRegion(
  ctx: CanvasRenderingContext2D,
  config: ScreentoneConfig,
  x: number,
  y: number,
  width: number,
  height: number,
  ink: readonly [number, number, number] = [0, 0, 0],
): void {
  const tileSize = 120;
  const tile = buildScreentoneTile(config, { size: tileSize });
  const tileCanvas = createScreentoneTileCanvas(tile, tileSize, ink);
  if (!tileCanvas) return;
  const pattern = ctx.createPattern(tileCanvas, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

/** hex 색상(#rrggbb) → [r,g,b]. 실패 시 [0,0,0]. */
export function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [0, 0, 0] as const;
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 255) as number, ((v >> 8) & 255) as number, (v & 255) as number] as const;
}
