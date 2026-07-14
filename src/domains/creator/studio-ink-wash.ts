/**
 * Studio Ink Wash Material Engine
 *
 * 수묵화/번짐 종이 재질 효과. 기존 `studio-grain`의 단순 종이 노이즈나 `oilPaint`의
 * 이웃 평탄화와 달리, 원본의 어두운 톤을 안료 밀도로 바꾼 뒤 다음 순서로 합성한다.
 *
 *   1. 휘도가 낮은 픽셀에서 안료 밀도(pigment density)를 추출한다.
 *   2. 밀도를 분리형 박스 블러로 확산해 젖은 종이 위의 번짐 범위를 만든다.
 *   3. 확산된 안료가 밝은 이웃으로 넘어가는 부분에 edgeBleed를 더하고, 안쪽에는
 *      약한 농도 고임(pooling)을 더한다.
 *   4. 결정적 다중 스케일 종이결과 안료 과립(granulation)을 입힌 뒤 종이색과 먹색을 보간한다.
 *   5. 결과를 원본과 strength만큼 블렌드한다. 블렌드에는 원본 알파를 곱해 투명 경계의
 *      RGB 헤일로를 막고, 알파 채널 자체는 절대 변경하지 않는다.
 *
 * 물리 유체 시뮬레이션은 아니며, 실시간 캔버스 필터에 적합한 O(width*height) 근사다.
 * Math.random/DOM/Konva에 의존하지 않아 같은 입력·설정·seed는 항상 같은 결과를 낸다.
 */

import { hexToRgb } from "./studio-filters";
import { hash2 } from "./studio-grain";

import type { StudioImageDataLike } from "./studio-filters";

// ---------------------------------------------------------------------------
// 파라미터 타입·기본값·범위
// ---------------------------------------------------------------------------

/** 수묵 번짐 재질 설정. 모든 퍼센트 값은 0..100 범위다. */
export type InkWash = {
  strength: number; // 0..100, 0이면 항등
  spread: number; // 1..12 px, 안료 확산 반경
  edgeBleed: number; // 0..100, 밝은 이웃으로 스며드는 가장자리 안료
  granulation: number; // 0..100, 안료 알갱이/농도 불균일
  paper: number; // 0..100, 따뜻한 종이색·섬유 질감
  inkColor: string; // #rrggbb 안료색
  seed: number; // 0..9999 결정적 재질 시드
};

/** 기본값은 항등(강도 0)이다. 나머지는 수묵화에 적당한 시작점으로 둔다. */
export const DEFAULT_INK_WASH: InkWash = {
  strength: 0,
  spread: 3,
  edgeBleed: 48,
  granulation: 38,
  paper: 46,
  inkColor: "#20282c",
  seed: 41,
};

export const INK_WASH_STRENGTH_RANGE = { min: 0, max: 100, step: 1 } as const;
export const INK_WASH_SPREAD_RANGE = { min: 1, max: 12, step: 1 } as const;
export const INK_WASH_EDGE_BLEED_RANGE = { min: 0, max: 100, step: 1 } as const;
export const INK_WASH_GRANULATION_RANGE = { min: 0, max: 100, step: 1 } as const;
export const INK_WASH_PAPER_RANGE = { min: 0, max: 100, step: 1 } as const;

const INK_WASH_SEED_MIN = 0;
const INK_WASH_SEED_MAX = 9999;
const HEX6_RE = /^#[0-9a-f]{6}$/i;

// ---------------------------------------------------------------------------
// 정규화·항등 판정
// ---------------------------------------------------------------------------

function clampTo(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

function normalizeInkColor(raw: unknown): string {
  return typeof raw === "string" && HEX6_RE.test(raw) ? raw.toLowerCase() : DEFAULT_INK_WASH.inkColor;
}

/**
 * 저장본·Konva attrs 등 외부 입력을 안전한 수묵 번짐 설정으로 정규화한다.
 * spread/seed는 픽셀 반경·해시 입력이라 내림해 정수화하고, 색은 #rrggbb만 받는다.
 */
export function normalizeInkWash(effect?: Partial<InkWash> | null): InkWash {
  const src = effect && typeof effect === "object" ? effect : {};
  return {
    strength: clampTo(src.strength, INK_WASH_STRENGTH_RANGE.min, INK_WASH_STRENGTH_RANGE.max, DEFAULT_INK_WASH.strength),
    spread: Math.floor(clampTo(src.spread, INK_WASH_SPREAD_RANGE.min, INK_WASH_SPREAD_RANGE.max, DEFAULT_INK_WASH.spread)),
    edgeBleed: clampTo(
      src.edgeBleed,
      INK_WASH_EDGE_BLEED_RANGE.min,
      INK_WASH_EDGE_BLEED_RANGE.max,
      DEFAULT_INK_WASH.edgeBleed,
    ),
    granulation: clampTo(
      src.granulation,
      INK_WASH_GRANULATION_RANGE.min,
      INK_WASH_GRANULATION_RANGE.max,
      DEFAULT_INK_WASH.granulation,
    ),
    paper: clampTo(src.paper, INK_WASH_PAPER_RANGE.min, INK_WASH_PAPER_RANGE.max, DEFAULT_INK_WASH.paper),
    inkColor: normalizeInkColor(src.inkColor),
    seed: Math.floor(clampTo(src.seed, INK_WASH_SEED_MIN, INK_WASH_SEED_MAX, DEFAULT_INK_WASH.seed)),
  };
}

/** strength가 유한 양수가 아니면 픽셀을 건드리지 않는 항등 설정이다. */
export function isIdentityInkWash(effect: Pick<InkWash, "strength">): boolean {
  return !Number.isFinite(effect.strength) || effect.strength <= 0;
}

// ---------------------------------------------------------------------------
// 결정적 재질 노이즈 — 낮은 해상도 격자를 보간해 해시 호출과 고주파 깜빡임을 줄인다.
// ---------------------------------------------------------------------------

type NoiseField = {
  values: Float32Array;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
};

function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t);
}

function createNoiseField(
  width: number,
  height: number,
  cellWidth: number,
  cellHeight: number,
  seed: number,
): NoiseField {
  // 오른쪽/아래 보간에 필요한 한 칸을 추가한다.
  const columns = Math.floor((width - 1) / cellWidth) + 2;
  const rows = Math.floor((height - 1) / cellHeight) + 2;
  const values = new Float32Array(columns * rows);
  for (let y = 0; y < rows; y++) {
    const row = y * columns;
    for (let x = 0; x < columns; x++) values[row + x] = hash2(x, y, seed);
  }
  return { values, columns, rows, cellWidth, cellHeight };
}

/** 저해상도 해시 격자의 부드러운 이중선형 보간값(0..1). */
function sampleNoise(field: NoiseField, x: number, y: number): number {
  const rawX = x / field.cellWidth;
  const rawY = y / field.cellHeight;
  const left = Math.min(field.columns - 2, Math.max(0, Math.floor(rawX)));
  const top = Math.min(field.rows - 2, Math.max(0, Math.floor(rawY)));
  const tx = smoothstep01(Math.min(1, Math.max(0, rawX - left)));
  const ty = smoothstep01(Math.min(1, Math.max(0, rawY - top)));
  const topOffset = top * field.columns + left;
  const a = field.values[topOffset]!;
  const b = field.values[topOffset + 1]!;
  const c = field.values[topOffset + field.columns]!;
  const d = field.values[topOffset + field.columns + 1]!;
  const topValue = a + (b - a) * tx;
  const bottomValue = c + (d - c) * tx;
  return topValue + (bottomValue - topValue) * ty;
}

// ---------------------------------------------------------------------------
// 안료 확산 — scalar 분리형 박스 블러. r가 커져도 O(width*height)다.
// ---------------------------------------------------------------------------

function boxBlurScalar(source: Uint8Array, width: number, height: number, radius: number): Float32Array {
  const count = width * height;
  const temporary = new Float32Array(count);
  const output = new Float32Array(count);
  const window = radius * 2 + 1;
  const invWindow = 1 / window;

  // 가로 패스. 가장자리는 가장 가까운 픽셀로 clamp해 작은 이미지도 안전하다.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const sx = k < 0 ? 0 : k >= width ? width - 1 : k;
      sum += source[row + sx]!;
    }
    temporary[row] = sum * invWindow;
    for (let x = 1; x < width; x++) {
      const addX = x + radius >= width ? width - 1 : x + radius;
      const subtractX = x - radius - 1 < 0 ? 0 : x - radius - 1;
      sum += source[row + addX]! - source[row + subtractX]!;
      temporary[row + x] = sum * invWindow;
    }
  }

  // 세로 패스.
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const sy = k < 0 ? 0 : k >= height ? height - 1 : k;
      sum += temporary[sy * width + x]!;
    }
    output[x] = sum * invWindow;
    for (let y = 1; y < height; y++) {
      const addY = y + radius >= height ? height - 1 : y + radius;
      const subtractY = y - radius - 1 < 0 ? 0 : y - radius - 1;
      sum += temporary[addY * width + x]! - temporary[subtractY * width + x]!;
      output[y * width + x] = sum * invWindow;
    }
  }

  return output;
}

function clampUnit(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function clampByte(value: number): number {
  return value <= 0 ? 0 : value >= 255 ? 255 : value;
}

function sourcePigment(data: Uint8ClampedArray, offset: number): number {
  const luma = 0.299 * data[offset]! + 0.587 * data[offset + 1]! + 0.114 * data[offset + 2]!;
  // 반투명 원본은 번짐 원료도 비례해 약해진다. RGB가 남아 있는 완전 투명 픽셀은 0이다.
  return (1 - luma / 255) * (data[offset + 3]! / 255);
}

function isUsableRaster(img: StudioImageDataLike): boolean {
  if (!Number.isSafeInteger(img.width) || !Number.isSafeInteger(img.height) || img.width <= 0 || img.height <= 0) {
    return false;
  }
  const pixels = img.width * img.height;
  return Number.isSafeInteger(pixels) && pixels <= Math.floor(img.data.length / 4);
}

// ---------------------------------------------------------------------------
// 적용 — 안료 밀도 → 확산/edge bleed → 종이/안료 합성
// ---------------------------------------------------------------------------

/**
 * 수묵 번짐을 제자리 적용한다. 입력 알파는 완전히 보존한다.
 *
 * edgeBleed=0이면 비싼 확산 버퍼를 만들지 않아 단순 먹/종이 재질 변환만 수행한다.
 * spread가 큰 경우도 슬라이딩 윈도 박스 블러 두 패스만 쓰므로 반경에 비례해 느려지지 않는다.
 */
export function applyInkWash(img: StudioImageDataLike, input: InkWash): void {
  const effect = normalizeInkWash(input);
  if (isIdentityInkWash(effect) || !isUsableRaster(img)) return;

  const { data, width, height } = img;
  const count = width * height;
  const bleedStrength = effect.edgeBleed / 100;
  const paperStrength = effect.paper / 100;
  const granulationStrength = effect.granulation / 100;
  const applyStrength = effect.strength / 100;
  const ink = hexToRgb(effect.inkColor);

  // edgeBleed가 있을 때만 원본 안료 밀도와 확산 버퍼를 잡는다.
  let sourceDensity: Uint8Array | null = null;
  let diffusedDensity: Float32Array | null = null;
  if (bleedStrength > 0) {
    sourceDensity = new Uint8Array(count);
    for (let pixel = 0; pixel < count; pixel++) {
      sourceDensity[pixel] = Math.round(sourcePigment(data, pixel * 4) * 255);
    }
    diffusedDensity = boxBlurScalar(sourceDensity, width, height, effect.spread);
  }

  // 종이결은 느린 얼룩 + 가로로 긴 섬유를 섞는다. paper=0이면 아예 할당하지 않는다.
  const paperCloud = paperStrength > 0 ? createNoiseField(width, height, 18, 18, effect.seed + 17) : null;
  const paperFibres = paperStrength > 0 ? createNoiseField(width, height, 22, 3, effect.seed + 41) : null;
  // 안료 과립은 더 촘촘한 격자. 같은 seed에서 안정적이며 scale만 다른 종이결과 독립적이다.
  const granules = granulationStrength > 0 ? createNoiseField(width, height, 2, 2, effect.seed + 89) : null;

  // 종이를 100%로 올려도 과도하게 노랗지 않게, 따뜻한 미색으로만 살짝 이동시킨다.
  const paperBaseR = 255 - 12 * paperStrength;
  const paperBaseG = 255 - 15 * paperStrength;
  const paperBaseB = 255 - 27 * paperStrength;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const originalPigment = sourceDensity ? sourceDensity[pixel]! / 255 : sourcePigment(data, offset);
      let pigment = originalPigment;

      if (diffusedDensity) {
        const diffused = diffusedDensity[pixel]! / 255;
        // 밖으로 번진 안료가 핵심이고, 안쪽 농도 고임은 약하게 보조한다.
        const outwardBleed = Math.max(0, diffused - originalPigment);
        const innerPooling = Math.max(0, originalPigment - diffused);
        pigment = clampUnit(pigment + bleedStrength * (outwardBleed * 0.92 + innerPooling * 0.18));
      }

      if (granules) {
        const grain = sampleNoise(granules, x, y) * 2 - 1;
        // 안료가 있는 곳에서만 과립이 보여 흰 종이까지 점 노이즈가 퍼지지 않는다.
        pigment = clampUnit(pigment * (1 + grain * granulationStrength * 0.27));
      }

      let paperShift = 0;
      if (paperCloud && paperFibres) {
        const cloudy = sampleNoise(paperCloud, x, y) - 0.5;
        const fibre = sampleNoise(paperFibres, x, y) - 0.5;
        paperShift = (cloudy * 0.68 + fibre * 0.32) * paperStrength * 16;
      }

      const paperR = clampByte(paperBaseR + paperShift * 0.86);
      const paperG = clampByte(paperBaseG + paperShift * 0.92);
      const paperB = clampByte(paperBaseB + paperShift * 1.08);
      const targetR = paperR + (ink.r - paperR) * pigment;
      const targetG = paperG + (ink.g - paperG) * pigment;
      const targetB = paperB + (ink.b - paperB) * pigment;

      // 알파는 읽기만 하고 절대 기록하지 않는다. 반투명 RGB의 과도한 종이색 헤일로도 막는다.
      const blend = applyStrength * (data[offset + 3]! / 255);
      data[offset] = data[offset]! + (targetR - data[offset]!) * blend;
      data[offset + 1] = data[offset + 1]! + (targetG - data[offset + 1]!) * blend;
      data[offset + 2] = data[offset + 2]! + (targetB - data[offset + 2]!) * blend;
    }
  }
}

// ---------------------------------------------------------------------------
// 웹툰 재질 프리셋
// ---------------------------------------------------------------------------

export type InkWashPreset = { id: string; label: string; tip: string; value: InkWash };

export const INK_WASH_PRESETS: InkWashPreset[] = [
  {
    id: "none",
    label: "없음",
    tip: "수묵 번짐을 적용하지 않는 원본.",
    value: normalizeInkWash(DEFAULT_INK_WASH),
  },
  {
    id: "sumi-e",
    label: "수묵화",
    tip: "검푸른 먹과 한지 결, 가장자리의 은은한 번짐을 더합니다.",
    value: normalizeInkWash({ strength: 86, spread: 3, edgeBleed: 56, granulation: 46, paper: 62, inkColor: "#20282c", seed: 41 }),
  },
  {
    id: "indigo-wash",
    label: "청묵",
    tip: "푸른 안료가 종이에 스며든 듯한 차분한 청묵 수채 질감.",
    value: normalizeInkWash({ strength: 78, spread: 4, edgeBleed: 65, granulation: 54, paper: 48, inkColor: "#264c70", seed: 112 }),
  },
  {
    id: "antique-sepia",
    label: "고서 세피아",
    tip: "갈색 잉크와 누런 종이결로 오래된 삽화·고서 무드를 만듭니다.",
    value: normalizeInkWash({ strength: 80, spread: 2, edgeBleed: 42, granulation: 35, paper: 80, inkColor: "#65432d", seed: 217 }),
  },
  {
    id: "vermilion-seal",
    label: "주인",
    tip: "진한 주홍 안료가 번진 도장·강조 컷 느낌을 만듭니다.",
    value: normalizeInkWash({ strength: 90, spread: 2, edgeBleed: 35, granulation: 60, paper: 32, inkColor: "#9c3f36", seed: 703 }),
  },
];

// ---------------------------------------------------------------------------
// Konva 등록용 얇은 어댑터 — 핵심 효과 함수는 위의 순수 applyInkWash다.
// ---------------------------------------------------------------------------

function attrNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Konva node attrs에서 `inkWash*` 값을 읽는 어댑터. attrs가 없거나 strength가 0이면 no-op다.
 * 이 함수도 DOM/Konva 런타임을 import하지 않아 Vitest에서 일반 객체로 호출할 수 있다.
 */
export function inkWashKonvaFilter(this: { attrs?: Record<string, unknown> }, imageData: StudioImageDataLike): void {
  const attrs = this.attrs;
  if (!attrs) return;
  applyInkWash(
    imageData,
    normalizeInkWash({
      strength: attrNumber(attrs.inkWashStrength),
      spread: attrNumber(attrs.inkWashSpread),
      edgeBleed: attrNumber(attrs.inkWashEdgeBleed),
      granulation: attrNumber(attrs.inkWashGranulation),
      paper: attrNumber(attrs.inkWashPaper),
      inkColor: typeof attrs.inkWashColor === "string" ? attrs.inkWashColor : undefined,
      seed: attrNumber(attrs.inkWashSeed),
    }),
  );
}
