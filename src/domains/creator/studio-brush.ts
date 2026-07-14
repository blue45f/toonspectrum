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
  { id: "calligraphy", name: "캘리그래피(펜 기울기)", defaultWidth: 12, defaultOpacity: 1.0 },
  { id: "marker", name: "마커(굵고 반투명)", defaultWidth: 16, defaultOpacity: 0.6 },
  { id: "highlighter", name: "형광펜", defaultWidth: 24, defaultOpacity: 0.45, defaultColor: "#ffd84d" },
  { id: "brush", name: "붓", defaultWidth: 10, defaultOpacity: 1.0 },
  { id: "watercolor", name: "수채 번짐", defaultWidth: 28, defaultOpacity: 0.55 },
  { id: "pencil", name: "연필", defaultWidth: 2.5, defaultOpacity: 0.85 },
  { id: "screentone", name: "스크린톤(도트)", defaultWidth: 22, defaultOpacity: 1.0 },
];

// 손떨림 보정 강도 범위(0=끔 ~ 10=최대).
export const STABILIZER_MAX = 10;

/** 캘리그래피 펜촉의 수동 폴백 설정. roundness는 단축/장축 비율(0.08~1). */
export interface CalligraphyTipSettings {
  tiltEnabled: boolean;
  angleDeg: number;
  roundness: number;
}

/** PointerEvent와 구조적으로 호환되는 최소 스타일러스 입력(테스트·코얼레스트 이벤트 공용). */
export interface CalligraphyStylusInput {
  pointerType?: unknown;
  tiltX?: unknown;
  tiltY?: unknown;
  twist?: unknown;
}

export type NormalizedCalligraphyPointerType = "pen" | "mouse" | "touch" | "unknown";

/** 브라우저/기기 편차를 제거한 유한한 스타일러스 샘플. */
export interface NormalizedCalligraphyStylusInput {
  pointerType: NormalizedCalligraphyPointerType;
  tiltX: number;
  tiltY: number;
  twist: number;
  /** pen 입력이면서 0이 아닌 유효 tilt가 실제로 전달됐는지 여부. */
  hasTilt: boolean;
}

/** Canvas와 SVG가 동일하게 소비할 수 있는 캘리그래피 선분 표현. */
export interface CalligraphySegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  tipAngleRad: number;
  roundness: number;
}

/** 실제 필압과 마우스/터치 속도 폴백을 한 곳에서 판정하기 위한 순수 함수 입력. */
export interface BrushPressureSampleInput {
  pointerType?: unknown;
  rawPressure?: unknown;
  distance?: unknown;
  velocityFallbackEnabled?: boolean;
  velocitySensitivity?: unknown;
  pressureCurve?: unknown;
  maxDistance?: unknown;
  fallbackPressure?: unknown;
}

const CALLIGRAPHY_MIN_ROUNDNESS = 0.08;
const DEFAULT_CALLIGRAPHY_SETTINGS: CalligraphyTipSettings = {
  tiltEnabled: true,
  angleDeg: 45,
  roundness: 0.32,
};

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeDegrees(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function normalizeRadians(value: number): number {
  const tau = Math.PI * 2;
  const wrapped = value % tau;
  return wrapped < 0 ? wrapped + tau : wrapped;
}

function normalizePointerType(value: unknown): NormalizedCalligraphyPointerType {
  if (typeof value !== "string") return "unknown";
  const normalized = value.toLowerCase();
  if (normalized === "pen" || normalized === "mouse" || normalized === "touch") return normalized;
  return "unknown";
}

/**
 * PointerEvent duck-type 입력을 CSS Pointer Events 범위로 정규화한다.
 * 마우스·터치의 합성 tilt/twist 값은 펜촉 방향으로 오인하지 않도록 버린다.
 */
export function normalizeCalligraphyStylusInput(
  input: CalligraphyStylusInput | null | undefined
): NormalizedCalligraphyStylusInput {
  const pointerType = normalizePointerType(input?.pointerType);
  if (pointerType !== "pen") {
    return { pointerType, tiltX: 0, tiltY: 0, twist: 0, hasTilt: false };
  }

  const tiltX = clamp(finiteNumber(input?.tiltX, 0), -90, 90);
  const tiltY = clamp(finiteNumber(input?.tiltY, 0), -90, 90);
  const twist = clamp(finiteNumber(input?.twist, 0), 0, 359);
  return {
    pointerType,
    tiltX,
    tiltY,
    twist,
    hasTilt: Math.hypot(tiltX, tiltY) > Number.EPSILON,
  };
}

/** 런타임/저장 데이터에서 들어온 캘리그래피 설정을 유한한 렌더 범위로 정규화한다. */
export function sanitizeCalligraphyTipSettings(
  settings: Partial<CalligraphyTipSettings> | null | undefined
): CalligraphyTipSettings {
  return {
    tiltEnabled:
      typeof settings?.tiltEnabled === "boolean"
        ? settings.tiltEnabled
        : DEFAULT_CALLIGRAPHY_SETTINGS.tiltEnabled,
    angleDeg: normalizeDegrees(finiteNumber(settings?.angleDeg, DEFAULT_CALLIGRAPHY_SETTINGS.angleDeg)),
    roundness: clamp(
      finiteNumber(settings?.roundness, DEFAULT_CALLIGRAPHY_SETTINGS.roundness),
      CALLIGRAPHY_MIN_ROUNDNESS,
      1
    ),
  };
}

/**
 * 펜의 유효한 하드웨어 필압을 우선하고, 그렇지 않은 포인터만 이동 거리 기반 의사 필압을 쓴다.
 * 브라우저가 마우스에 관례적으로 주는 0.5는 실제 펜(pointerType=pen)에서만 유효 필압이다.
 */
export function resolveBrushPressureSample(input: BrushPressureSampleInput = {}): number {
  const pointerType = normalizePointerType(input.pointerType);
  const rawPressure = finiteNumber(input.rawPressure, Number.NaN);
  const hasHardwarePressure = pointerType === "pen" && rawPressure >= 0 && rawPressure <= 1;

  let basePressure: number;
  if (hasHardwarePressure) {
    basePressure = rawPressure;
  } else if (input.velocityFallbackEnabled) {
    const distance = Math.max(0, finiteNumber(input.distance, 0));
    const maxDistance = Math.max(0.001, finiteNumber(input.maxDistance, 28));
    const speedRatio = clamp01(distance / maxDistance);
    const sensitivity = clamp01(finiteNumber(input.velocitySensitivity, 0.65));
    basePressure = 1 - speedRatio * sensitivity * 0.75;
  } else {
    basePressure = clamp01(finiteNumber(input.fallbackPressure, 0.5));
  }

  const curve = clamp(finiteNumber(input.pressureCurve, 1), 0.05, 8);
  return clamp01(Math.pow(clamp01(basePressure), curve));
}

/**
 * 포인트 스무딩/솎기 뒤의 개수에 맞춰 필압을 선형 재표본화한다.
 * 첫·끝 필압을 보존하며 누락·NaN·Infinity는 fallback으로 치환한다.
 */
export function resampleStrokePressures(
  pressures: readonly number[] | null | undefined,
  outputPointCount: number,
  fallback = 0.5
): number[] {
  const count = Number.isFinite(outputPointCount) ? Math.max(0, Math.floor(outputPointCount)) : 0;
  if (count === 0) return [];

  const safeFallback = clamp01(finiteNumber(fallback, 0.5));
  if (!pressures || pressures.length === 0) return Array(count).fill(safeFallback) as number[];

  const safe = pressures.map((pressure) => clamp01(finiteNumber(pressure, safeFallback)));
  if (count === 1) return [safe[0] ?? safeFallback];
  if (safe.length === 1) return Array(count).fill(safe[0] ?? safeFallback) as number[];

  const result: number[] = [];
  for (let index = 0; index < count; index++) {
    const sourcePosition = (index / (count - 1)) * (safe.length - 1);
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(safe.length - 1, Math.ceil(sourcePosition));
    const amount = sourcePosition - lowerIndex;
    const lower = safe[lowerIndex] ?? safeFallback;
    const upper = safe[upperIndex] ?? lower;
    result.push(clamp01(lower + (upper - lower) * amount));
  }
  return result;
}

function sampleNumberAtProgress(
  values: readonly number[] | null | undefined,
  progress: number,
  fallback: number,
  min: number,
  max: number
): number {
  if (!values || values.length === 0) return fallback;
  if (values.length === 1) return clamp(finiteNumber(values[0], fallback), min, max);
  const sourcePosition = clamp01(progress) * (values.length - 1);
  const lowerIndex = Math.floor(sourcePosition);
  const upperIndex = Math.min(values.length - 1, Math.ceil(sourcePosition));
  const amount = sourcePosition - lowerIndex;
  const lower = clamp(finiteNumber(values[lowerIndex], fallback), min, max);
  const upper = clamp(finiteNumber(values[upperIndex], lower), min, max);
  return clamp(lower + (upper - lower) * amount, min, max);
}

function interpolateTwist(from: number, to: number, amount: number): number {
  const shortestDelta = ((to - from + 540) % 360) - 180;
  return normalizeDegrees(from + shortestDelta * amount);
}

function sampleStylusAtProgress(
  samples: readonly CalligraphyStylusInput[] | null | undefined,
  progress: number
): NormalizedCalligraphyStylusInput {
  if (!samples || samples.length === 0) {
    return { pointerType: "unknown", tiltX: 0, tiltY: 0, twist: 0, hasTilt: false };
  }
  if (samples.length === 1) return normalizeCalligraphyStylusInput(samples[0]);

  const sourcePosition = clamp01(progress) * (samples.length - 1);
  const lowerIndex = Math.floor(sourcePosition);
  const upperIndex = Math.min(samples.length - 1, Math.ceil(sourcePosition));
  const amount = sourcePosition - lowerIndex;
  const lower = normalizeCalligraphyStylusInput(samples[lowerIndex]);
  const upper = normalizeCalligraphyStylusInput(samples[upperIndex]);
  const tiltX = lower.tiltX + (upper.tiltX - lower.tiltX) * amount;
  const tiltY = lower.tiltY + (upper.tiltY - lower.tiltY) * amount;
  return {
    pointerType: lower.pointerType === "pen" || upper.pointerType === "pen" ? "pen" : lower.pointerType,
    tiltX,
    tiltY,
    twist: interpolateTwist(lower.twist, upper.twist, amount),
    hasTilt: (lower.hasTilt || upper.hasTilt) && Math.hypot(tiltX, tiltY) > Number.EPSILON,
  };
}

/**
 * 점·필압·스타일러스 샘플을 결정적인 캘리그래피 선분으로 변환한다.
 * 각 배열 길이가 달라도 스트로크 진행률로 비례 표본화하며, 이동 방향의 법선에 투영된
 * 타원형 펜촉 직경을 width로 반환해 Canvas/SVG가 같은 결과를 그릴 수 있다.
 */
export function buildCalligraphySegments(
  smoothedPoints: readonly number[],
  pressures: readonly number[] | null | undefined,
  stylusSamples: readonly CalligraphyStylusInput[] | null | undefined,
  baseWidth: number,
  settings: Partial<CalligraphyTipSettings> | null | undefined
): CalligraphySegment[] {
  const pointCount = Math.floor(smoothedPoints.length / 2);
  if (pointCount < 2) return [];

  const safeBaseWidth = clamp(finiteNumber(baseWidth, 1), 0.25, 2048);
  const safeSettings = sanitizeCalligraphyTipSettings(settings);
  const fallbackTipAngle = (safeSettings.angleDeg * Math.PI) / 180;
  const segments: CalligraphySegment[] = [];
  let x0 = finiteNumber(smoothedPoints[0], 0);
  let y0 = finiteNumber(smoothedPoints[1], 0);
  let lastTravelAngle = 0;

  for (let pointIndex = 1; pointIndex < pointCount; pointIndex++) {
    const x1 = finiteNumber(smoothedPoints[pointIndex * 2], x0);
    const y1 = finiteNumber(smoothedPoints[pointIndex * 2 + 1], y0);
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (Math.hypot(dx, dy) > Number.EPSILON) lastTravelAngle = Math.atan2(dy, dx);

    const progress = (pointIndex - 0.5) / (pointCount - 1);
    const pressure = sampleNumberAtProgress(pressures, progress, 0.5, 0, 1);
    const stylus = sampleStylusAtProgress(stylusSamples, progress);

    let tipAngleRad = fallbackTipAngle;
    let roundness = safeSettings.roundness;
    if (safeSettings.tiltEnabled && stylus.pointerType === "pen") {
      const twistRad = (stylus.twist * Math.PI) / 180;
      if (stylus.hasTilt) {
        const tiltStrength = clamp01(Math.hypot(stylus.tiltX, stylus.tiltY) / 90);
        tipAngleRad = Math.atan2(stylus.tiltY, stylus.tiltX) + twistRad;
        roundness = clamp(
          safeSettings.roundness * (1 - 0.72 * tiltStrength),
          CALLIGRAPHY_MIN_ROUNDNESS,
          1
        );
      } else if (stylus.twist > Number.EPSILON) {
        // 수직으로 세운 펜은 tilt 벡터가 없지만 barrel twist는 여전히 유효할 수 있다.
        tipAngleRad = fallbackTipAngle + twistRad;
      }
    }
    tipAngleRad = normalizeRadians(tipAngleRad);

    const relativeTravelAngle = lastTravelAngle - tipAngleRad;
    const sin = Math.sin(relativeTravelAngle);
    const cos = Math.cos(relativeTravelAngle);
    const ellipticalProjection = Math.sqrt(sin * sin + roundness * roundness * cos * cos);
    const pressureScale = 0.35 + pressure * 0.9;
    const width = clamp(safeBaseWidth * pressureScale * ellipticalProjection, 0.05, 4096);

    segments.push({ x0, y0, x1, y1, width, tipAngleRad, roundness });
    x0 = x1;
    y0 = y1;
  }
  return segments;
}

/** 폴리라인 [x0,y0,x1,y1,…] 누적 길이(export·가이드 스냅용). */
export function polylineLength(points: readonly number[]): number {
  if (points.length < 4) return 0;
  let sum = 0;
  for (let i = 2; i < points.length; i += 2) {
    const x0 = points[i - 2]!;
    const y0 = points[i - 1]!;
    const x1 = points[i]!;
    const y1 = points[i + 1]!;
    sum += Math.hypot(x1 - x0, y1 - y0);
  }
  return sum;
}

/** 라이브 드로잉 중 너무 촘촘한 포인트 추가를 건너뛴다(RAF 부하·메모리 절감). */
export function shouldAppendStrokePoint(
  lastX: number,
  lastY: number,
  nextX: number,
  nextY: number,
  minDist = 1.5
): boolean {
  return Math.hypot(nextX - lastX, nextY - lastY) >= minDist;
}

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
