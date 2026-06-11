/**
 * Studio Brush Math Utilities
 * Handles freehand stroke point thinning, smoothing, stabilizing, pencil jitter,
 * pressure-width simulation (G-pen) and screentone dot stamping.
 * 전부 순수 함수 — StudioPage 캔버스 로직과 단위 테스트가 공유한다.
 */

// 브러시 프리셋 데이터(드로잉 툴바/우측 패널 공용).
export interface BrushPreset {
  id: string;
  name: string;
  defaultWidth: number;
  defaultOpacity: number;
  defaultColor?: string;
}

export const BRUSH_PRESETS: BrushPreset[] = [
  { id: "pen", name: "펜(매끈)", defaultWidth: 6, defaultOpacity: 1.0 },
  { id: "gpen", name: "G펜(필압)", defaultWidth: 7, defaultOpacity: 1.0 },
  { id: "marker", name: "마커(굵고 반투명)", defaultWidth: 16, defaultOpacity: 0.6 },
  { id: "highlighter", name: "형광펜", defaultWidth: 24, defaultOpacity: 0.45, defaultColor: "#ffd84d" },
  { id: "brush", name: "붓", defaultWidth: 10, defaultOpacity: 1.0 },
  { id: "pencil", name: "연필", defaultWidth: 2.5, defaultOpacity: 0.85 },
  { id: "screentone", name: "스크린톤(도트)", defaultWidth: 22, defaultOpacity: 1.0 },
];

// 손떨림 보정 강도 범위(0=끔 ~ 10=최대).
export const STABILIZER_MAX = 10;

function clampStrength(strength: number): number {
  if (!Number.isFinite(strength)) return 0;
  return Math.min(STABILIZER_MAX, Math.max(0, strength));
}

/**
 * 손떨림 보정 1단계 — 입력 시점 끌림 보정(지수 이동평균 한 스텝).
 * 직전 확정점(prev)에서 새 입력점(raw)으로 strength가 클수록 천천히 따라간다.
 * strength 0 → 원본 그대로, 10 → 가장 강한 끌림.
 */
export function stabilizePoint(
  prevX: number,
  prevY: number,
  rawX: number,
  rawY: number,
  strength: number
): [number, number] {
  const s = clampStrength(strength);
  if (s === 0) return [rawX, rawY];
  const weight = 1 / (1 + s * 1.4);
  return [prevX + (rawX - prevX) * weight, prevY + (rawY - prevY) * weight];
}

/**
 * 손떨림 보정 2단계 — 스트로크 확정 시 삼각 가중 이동평균 스무딩.
 * 점 개수를 보존(필압 배열과 1:1 정렬 유지)하고 양 끝점은 고정한다.
 * strength 0~10: 0이면 입력 배열을 그대로 반환.
 */
export function smoothStrokePoints(points: number[], strength: number): number[] {
  const s = Math.round(clampStrength(strength));
  if (s === 0 || points.length < 6) return points;

  const radius = Math.max(1, Math.ceil(s / 3)); // 1~4
  const passes = s >= 6 ? 2 : 1;
  const count = Math.floor(points.length / 2);

  let current = points;
  for (let pass = 0; pass < passes; pass++) {
    const out = current.slice();
    for (let i = 1; i < count - 1; i++) {
      let sx = 0;
      let sy = 0;
      let total = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = Math.min(count - 1, Math.max(0, i + k));
        const w = radius + 1 - Math.abs(k); // 삼각 가중치
        const px = current[j * 2];
        const py = current[j * 2 + 1];
        if (px === undefined || py === undefined) continue;
        sx += px * w;
        sy += py * w;
        total += w;
      }
      if (total > 0) {
        out[i * 2] = sx / total;
        out[i * 2 + 1] = sy / total;
      }
    }
    current = out;
  }
  return current;
}

/**
 * G펜 — 필압(또는 속도 기반 의사 필압) 배열을 세그먼트 굵기 배열로 변환.
 * 압력이 높을수록 굵고, 스트로크 양 끝은 펜촉처럼 가늘게 테이퍼.
 */
export function gpenSegmentWidths(pressures: number[], baseWidth: number): number[] {
  const safeBase = Math.max(0.5, baseWidth);
  const total = pressures.length;
  if (total === 0) return [];
  const taperSpan = Math.min(4, Math.max(1, Math.floor(total / 3)));

  return pressures.map((rawPressure, index) => {
    const p = Math.min(1, Math.max(0, rawPressure));
    let width = safeBase * (0.22 + p * 1.55);
    const fromStart = index;
    const fromEnd = total - 1 - index;
    const edge = Math.min(fromStart, fromEnd);
    if (edge < taperSpan) {
      const t = (edge + 1) / (taperSpan + 1); // 0~1
      width *= 0.35 + 0.65 * t;
    }
    return Math.max(0.4, width);
  });
}

/**
 * 스크린톤(도트) 브러시 — 폴리라인을 따라 "전역 격자에 정렬된" 도트 좌표를 생성.
 * 격자 정렬 덕분에 겹쳐 칠해도 망점 패턴이 균일하게 메워진다(겹침 중복 제거).
 * 반환: [x0, y0, x1, y1, ...] 평탄 배열. 결정적(랜덤 없음).
 */
export function screentoneDotsForStroke(points: number[], brushRadius: number, pitch: number): number[] {
  const r = Math.max(1, brushRadius);
  const p = Math.max(2, pitch);
  if (points.length < 2) return [];

  const seen = new Set<string>();
  const dots: number[] = [];

  const stampAt = (cx: number, cy: number) => {
    const minIx = Math.floor((cx - r) / p);
    const maxIx = Math.ceil((cx + r) / p);
    const minIy = Math.floor((cy - r) / p);
    const maxIy = Math.ceil((cy + r) / p);
    for (let iy = minIy; iy <= maxIy; iy++) {
      // 홀수 행은 반 피치 어긋난 허니컴 배열(망점 느낌).
      const rowOffset = (iy % 2 === 0 ? 0 : 0.5) * p;
      for (let ix = minIx; ix <= maxIx; ix++) {
        const dx = ix * p + rowOffset;
        const dy = iy * p;
        if ((dx - cx) * (dx - cx) + (dy - cy) * (dy - cy) > r * r) continue;
        const key = `${ix}:${iy}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dots.push(dx, dy);
      }
    }
  };

  // 폴리라인을 일정 간격으로 리샘플하며 도장 찍기.
  const step = Math.max(1, r * 0.5);
  let prevX = points[0];
  let prevY = points[1];
  if (prevX === undefined || prevY === undefined) return [];
  stampAt(prevX, prevY);
  let carried = 0;

  for (let i = 2; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x === undefined || y === undefined) continue;
    const segLen = Math.hypot(x - prevX, y - prevY);
    if (segLen === 0) continue;
    let traveled = step - carried;
    while (traveled <= segLen) {
      const t = traveled / segLen;
      stampAt(prevX + (x - prevX) * t, prevY + (y - prevY) * t);
      traveled += step;
    }
    carried = segLen - (traveled - step);
    prevX = x;
    prevY = y;
  }
  stampAt(prevX, prevY);

  return dots;
}

/** 스크린톤 도트 반지름(피치에 비례하는 망점 크기). */
export function screentoneDotRadius(pitch: number): number {
  return Math.max(0.8, pitch * 0.32);
}

// Simple deterministic hash function for pencil jitter (flashing-free noise)
function hash(n: number): number {
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

/**
 * Thins and smooths a list of 2D points [x0, y0, x1, y1, ...].
 * 1. Thinning: discards points that are too close to the previous point.
 * 2. Smoothing: applies a weighted moving average to remove high-frequency jitter.
 */
export function processFreehandPoints(points: number[]): number[] {
  if (points.length < 4) return points;

  // 1. Light point-thinning (distance thresholding)
  const thinned: number[] = [points[0], points[1]];
  let lastX = points[0];
  let lastY = points[1];
  
  for (let i = 2; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x === undefined || y === undefined) continue;

    const dist = Math.hypot(x - lastX, y - lastY);
    // Keep point if it is at least 3 pixels away or it is the very last point in the path
    if (dist >= 3 || i === points.length - 2) {
      thinned.push(x, y);
      lastX = x;
      lastY = y;
    }
  }

  // 2. Bezier-like smoothing (weighted moving average)
  if (thinned.length < 6) return thinned;
  const smoothed: number[] = [thinned[0], thinned[1]];

  for (let i = 2; i < thinned.length - 2; i += 2) {
    const prevX = thinned[i - 2]!;
    const prevY = thinned[i - 1]!;
    const currX = thinned[i]!;
    const currY = thinned[i + 1]!;
    const nextX = thinned[i + 2]!;
    const nextY = thinned[i + 3]!;

    // 25% prev, 50% current, 25% next
    const sx = 0.25 * prevX + 0.5 * currX + 0.25 * nextX;
    const sy = 0.25 * prevY + 0.5 * currY + 0.25 * nextY;
    smoothed.push(sx, sy);
  }

  smoothed.push(thinned[thinned.length - 2]!, thinned[thinned.length - 1]!);
  return smoothed;
}

/**
 * Applies a stable deterministic jitter to points [x0, y0, ...] to simulate a pencil texture.
 */
export function processPencilPoints(points: number[]): number[] {
  const output: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x === undefined || y === undefined) continue;

    // Stable, deterministic offset between -0.75 and 0.75 pixels
    const dx = (hash(i * 17 + 5) - 0.5) * 1.5;
    const dy = (hash(i * 31 + 13) - 0.5) * 1.5;
    output.push(x + dx, y + dy);
  }
  return output;
}
