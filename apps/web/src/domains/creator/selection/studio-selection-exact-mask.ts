import { normalizePixelSelectionHistoryLimits } from "../studio-pixel-selection-history";
import { pointInSelection, type PixelSelection, type SelectionOperationMode, type SelPoint } from "../studio-selection-tools";
import type { ColorRangeMask } from "../studio-color-range";

/** 원본 픽셀 경계만 추적한다. 일직선 중간점만 제거하며 구멍·대각선 접점은 수정하지 않는다. */
export function exactSelectionFromMask(mask: ColorRangeMask, featherPx = 0, threshold = 128): PixelSelection | null {
  threshold = Number.isFinite(threshold) ? Math.max(1, Math.min(255, Math.round(threshold))) : 128;
  const { width, height, alpha } = mask;
  assertExactSelectionSize(width, height);
  if (alpha.length !== width * height) throw new RangeError("선택 마스크 크기가 일치하지 않습니다.");
  const stride = width + 1;
  // 각 꼭짓점에서 출발하는 방향 비트. 모서리만 닿는 픽셀도 별도 루프로 유지한다.
  const edges = new Map<number, number>();
  const add = (vertex: number, direction: number) => edges.set(vertex, (edges.get(vertex) ?? 0) | (1 << direction));
  const selected = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && alpha[y * width + x]! >= threshold;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!selected(x, y)) continue;
    if (edges.size > EXACT_SELECTION_MAX_AXIS * 32) {
      throw new RangeError("원본 선택 경계가 처리 예산을 초과했습니다. 기존 선택을 유지합니다.");
    }
    const vertex = y * stride + x;
    if (!selected(x, y - 1)) add(vertex, 0);
    if (!selected(x + 1, y)) add(vertex + 1, 1);
    if (!selected(x, y + 1)) add(vertex + stride + 1, 2);
    if (!selected(x - 1, y)) add(vertex + stride, 3);
  }
  const offsets = [1, stride, -1, -stride];
  const rings: { points: SelPoint[]; area: number }[] = [];
  let pointCount = 0;
  while (edges.size) {
    const start = edges.keys().next().value;
    if (start === undefined) break;
    let vertex = start;
    let direction = 0;
    const points: SelPoint[] = [];
    do {
      const bits = edges.get(vertex) ?? 0;
      const nextDirection = [(direction + 1) % 4, direction, (direction + 3) % 4, (direction + 2) % 4]
        .find((candidate) => (bits & (1 << candidate)) !== 0);
      if (nextDirection === undefined) throw new Error("선택 경계를 완성하지 못했습니다. 기존 선택을 유지합니다.");
      const point = { x: vertex % stride, y: Math.floor(vertex / stride) };
      const previous = points.at(-1);
      const before = points.at(-2);
      if (previous && before && (previous.x - before.x) * (point.y - previous.y) === (previous.y - before.y) * (point.x - previous.x)) points.pop();
      points.push(point);
      const remaining = bits & ~(1 << nextDirection);
      if (remaining) edges.set(vertex, remaining); else edges.delete(vertex);
      vertex += offsets[nextDirection]!;
      direction = nextDirection;
    } while (vertex !== start);
    for (const index of [points.length - 1, 0]) {
      const a = points[(index + points.length - 1) % points.length]!;
      const b = points[index]!;
      const c = points[(index + 1) % points.length]!;
      if ((b.x - a.x) * (c.y - b.y) === (b.y - a.y) * (c.x - b.x)) points.splice(index, 1);
    }
    const area = points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    pointCount += points.length;
    const limits = normalizePixelSelectionHistoryLimits();
    // 기존 문서/Undo 예산을 넘어서는 경계는 일부를 버리는 대신 원본 선택을 보존한다.
    if (rings.length >= limits.maxSubpathsPerSnapshot || points.length > limits.maxPointsPerSubpath || pointCount > limits.maxPointsPerSnapshot) {
      throw new RangeError("원본 선택 경계가 너무 복잡하여 일부를 생략하지 않고 작업을 중단했습니다. 기존 선택은 유지됩니다.");
    }
    rings.push({ points: points.map((point) => ({ x: point.x / width, y: point.y / height })), area });
  }
  if (!rings.length) return null;
  rings.sort((left, right) => Math.abs(right.area) - Math.abs(left.area));
  return { featherPx, invert: false, subpaths: rings.map((ring) => ({ mode: ring.area > 0 ? "add" : "subtract", points: ring.points })) };
}

export const EXACT_SELECTION_MAX_AXIS = 8_192;
export const EXACT_SELECTION_MAX_PIXELS = 16_777_216;
export function assertExactSelectionSize(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > EXACT_SELECTION_MAX_AXIS || height > EXACT_SELECTION_MAX_AXIS || width * height > EXACT_SELECTION_MAX_PIXELS) {
    throw new RangeError("원본 선택 이미지 크기가 처리 범위를 벗어났습니다. 해상도를 낮추지 않고 기존 선택을 유지합니다.");
  }
}

/** 선택 결합을 원본 픽셀에서 수행해 구멍이 이전 선택을 덮어쓰거나 되살리지 않게 한다. */
export function applyExactSelectionMask(selection: PixelSelection | null, mask: ColorRangeMask, operation: SelectionOperationMode,
  options: { aspect?: number; threshold?: number } = {}): PixelSelection | null {
  if (operation === "replace") return exactSelectionFromMask(mask, selection?.featherPx ?? 0, options.threshold);
  const alpha = new Uint8ClampedArray(mask.alpha.length);
  const threshold = Number.isFinite(options.threshold) ? Math.max(1, Math.min(255, Math.round(options.threshold!))) : 128;
  for (let y = 0; y < mask.height; y += 1) for (let x = 0; x < mask.width; x += 1) {
    const index = y * mask.width + x;
    const source = mask.alpha[index]! >= threshold;
    const previous = pointInSelection(selection, { x: (x + 0.5) / mask.width, y: (y + 0.5) / mask.height }, options);
    const included = operation === "add" ? source || previous : operation === "subtract" ? previous && !source : previous && source;
    if (included) alpha[index] = 255;
  }
  return exactSelectionFromMask({ ...mask, alpha }, selection?.featherPx ?? 0);
}
