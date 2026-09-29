/**
 * 만화 전용 툴킷 — 효과선 브러시 생성 로직.
 *
 * ⚠️ 이 모듈은 **페이지 모드**를 전제로 동작한다.
 * 웹툰 세로 스크롤(무한 세로 캔버스)에서는 사용하지 않는다.
 *
 * 모든 생성 함수는 시드를 받으면 결정적(deterministic)으로 동일한 선분을 반환한다.
 */

/** 캔버스 좌표계 기준 선분. */
export interface EffectLineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 집중선/스피드선/섬광에 공통으로 적용되는 스트로크 파라미터. */
export interface EffectStrokeParams {
  /** 선 수 (섬광에서는 스파이크 수). */
  count: number;
  /** 선 길이 px. */
  length: number;
  /** 선 굵기 px (렌더 시 strokeWidth). */
  width: number;
  /** 길이 지터 비율 (0~1). */
  lengthJitter: number;
  /** 투명도 (0~1, 렌더 시 opacity). */
  opacity: number;
  /** 난수 시드. 같은 시드는 같은 결과를 만든다. */
  seed: number;
}

export const DEFAULT_EFFECT_STROKE: EffectStrokeParams = {
  count: 24,
  length: 120,
  width: 2,
  lengthJitter: 0.25,
  opacity: 1,
  seed: 20260930,
};

/** 시드 기반 난수 생성기 (mulberry32). */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

/** 각도(도)를 라디안으로, -180~180 범위로 정규화한다. */
export function normalizeDegrees(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** 각도(도)가 제외 범위 [excludeFrom, excludeTo] 안에 있는지. 경계는 포함.
 * 범위가 0°를 가로지르면(예: 350°→10°) 래핑을 처리한다. */
export function isAngleExcluded(
  degrees: number,
  excludeFrom: number,
  excludeTo: number,
): boolean {
  const angle = (((normalizeDegrees(degrees) % 360) + 360) % 360 + 360) % 360;
  const from = (((normalizeDegrees(excludeFrom) % 360) + 360) % 360 + 360) % 360;
  const to = (((normalizeDegrees(excludeTo) % 360) + 360) % 360 + 360) % 360;
  if (from === to) return false; // 제외 범위 없음
  if (from < to) return angle >= from && angle <= to;
  return angle >= from || angle <= to; // 0°를 가로지르는 범위
}

export interface ConcentrationLineOptions extends EffectStrokeParams {
  /** 방사 중심점. */
  cx: number;
  cy: number;
  /** 선이 시작하는 내측 반경 px (중심 빈 공간). */
  innerRadius: number;
  /** 각도 지터 (도, 0~180). */
  angleJitter: number;
  /** 제외 각도 범위 (도). 제외하지 않으려면 excludeFrom === excludeTo. */
  excludeFrom: number;
  excludeTo: number;
}

/**
 * 집중선(concentration lines): 중심점에서 방사형으로 뻗는 선분 N개 생성.
 * 선은 innerRadius에서 시작해 length(±지터)만큼 뻗는다.
 * 제외 각도 범위에 들어가는 선은 생성하지 않는다.
 */
export function createConcentrationLines(
  options: ConcentrationLineOptions,
  random: () => number = createSeededRandom(options.seed),
): EffectLineSegment[] {
  const count = Math.max(0, Math.floor(options.count));
  const innerRadius = Math.max(0, options.innerRadius);
  const lines: EffectLineSegment[] = [];
  let guard = 0;

  while (lines.length < count && guard < count * 50 + 100) {
    guard += 1;
    const baseAngle = (TAU * lines.length) / count;
    const jitterRange = ((options.angleJitter * Math.PI) / 180) * 2;
    const angle = baseAngle + (random() - 0.5) * jitterRange;
    const degrees = (angle * 180) / Math.PI;
    if (isAngleExcluded(degrees, options.excludeFrom, options.excludeTo)) {
      continue;
    }
    const length = Math.max(0, options.length * (1 + (random() * 2 - 1) * options.lengthJitter));
    const x1 = options.cx + Math.cos(angle) * innerRadius;
    const y1 = options.cy + Math.sin(angle) * innerRadius;
    const x2 = options.cx + Math.cos(angle) * (innerRadius + length);
    const y2 = options.cy + Math.sin(angle) * (innerRadius + length);
    lines.push({ x1, y1, x2, y2 });
  }
  return lines;
}

export interface SpeedLineOptions extends EffectStrokeParams {
  /** 선분 묶음의 기준점 (첫 번째 선의 시작점). */
  x: number;
  y: number;
  /** 진행 방향 (도, 0 = 오른쪽). */
  direction: number;
  /** 선 사이 간격 px. */
  spacing: number;
  /** 위치 지터 px (선분 묶음 전체에 적용). */
  positionJitter: number;
}

/**
 * 스피드선(speed lines): 방향에 평행한 선분 N개를 간격(spacing)씩 띄워 생성.
 * 각 선의 시작점은 방향의 수직 벡터를 따라 배치된다.
 */
export function createSpeedLines(
  options: SpeedLineOptions,
  random: () => number = createSeededRandom(options.seed),
): EffectLineSegment[] {
  const count = Math.max(0, Math.floor(options.count));
  const spacing = Math.max(0, options.spacing);
  const rad = (options.direction * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  // 수직 벡터
  const nx = -dy;
  const ny = dx;

  const lines: EffectLineSegment[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = (i - (count - 1) / 2) * spacing + (random() * 2 - 1) * options.positionJitter;
    const length = Math.max(0, options.length * (1 + (random() * 2 - 1) * options.lengthJitter));
    const x1 = options.x + nx * offset;
    const y1 = options.y + ny * offset;
    lines.push({ x1, y1, x2: x1 + dx * length, y2: y1 + dy * length });
  }
  return lines;
}

/** 섬광(flash): 별형 폴리곤 정점. */
export interface FlashOptions {
  cx: number;
  cy: number;
  /** 안쪽 반경 px. */
  innerRadius: number;
  /** 바깥쪽 반경 px. */
  outerRadius: number;
  /** 스파이크 수. */
  spikes: number;
  /** 스파이크 길이 지터 비율 (0~1). */
  spikeJitter: number;
  /** 시작 각도 (도). */
  rotation: number;
  /** 난수 시드. */
  seed: number;
}

export const DEFAULT_FLASH_OPTIONS: FlashOptions = {
  cx: 0,
  cy: 0,
  innerRadius: 30,
  outerRadius: 100,
  spikes: 12,
  spikeJitter: 0.15,
  rotation: 0,
  seed: 20260930,
};

/**
 * 섬광(flash): 중심을 기준으로 번갈아 안쪽/바깥쪽 반경을 잇는 별형 폴리곤 정점 생성.
 * `2 * spikes`개의 정점을 시계 방향 순서로 반환한다.
 */
export function createFlashPolygon(
  options: FlashOptions,
  random: () => number = createSeededRandom(options.seed),
): { x: number; y: number }[] {
  const spikes = Math.max(3, Math.floor(options.spikes));
  const innerRadius = Math.max(0, options.innerRadius);
  const outerRadius = Math.max(innerRadius, options.outerRadius);
  const rotationRad = (options.rotation * Math.PI) / 180;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const isOuter = i % 2 === 0;
    const angle = rotationRad + (TAU * i) / (spikes * 2);
    const base = isOuter ? outerRadius : innerRadius;
    const radius = isOuter
      ? Math.max(innerRadius, base * (1 + (random() * 2 - 1) * options.spikeJitter))
      : base;
    points.push({
      x: options.cx + Math.cos(angle) * radius,
      y: options.cy + Math.sin(angle) * radius,
    });
  }
  return points;
}

/** 선분 길이. */
export function effectLineLength(line: EffectLineSegment): number {
  return Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
}

/** 선분 목록을 SVG path(d)로 변환한다. */
export function effectLinesToSvgPath(lines: readonly EffectLineSegment[]): string {
  return lines
    .map(
      (line) =>
        `M ${Math.round(line.x1 * 100) / 100} ${Math.round(line.y1 * 100) / 100} ` +
        `L ${Math.round(line.x2 * 100) / 100} ${Math.round(line.y2 * 100) / 100}`,
    )
    .join(" ");
}
