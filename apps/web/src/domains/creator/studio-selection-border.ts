import { applyColorRangeMaskToSelection, type ColorRangeMask } from "./studio-color-range";
import { MAGIC_WAND_MAX_LOOPS, MAGIC_WAND_TRACE_MAX_DIM } from "./studio-magic-wand";

import { MIN_SELECTION_SUBPATH_AREA, type PixelSelection } from "./studio-selection-tools";

export type StudioSelectionBorderPlacement = "inside" | "center" | "outside";
export const STUDIO_SELECTION_BORDER_MAX_WIDTH_PX = 128;
export const STUDIO_SELECTION_BORDER_PLACEMENTS = [
  { id: "inside", label: "안쪽" },
  { id: "center", label: "중앙" },
  { id: "outside", label: "바깥쪽" },
] as const;

export interface StudioSelectionBorderOptions {
  readonly widthPx: number;
  readonly placement: StudioSelectionBorderPlacement;
  readonly displayWidth: number;
  readonly displayHeight: number;
}

/** Keep displayed pixel units isotropic; never silently promise sub-sample border precision. */
export function studioSelectionBorderRasterSize(displayWidth: number, displayHeight: number) {
  if (![displayWidth, displayHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("선택 테두리의 이미지 크기가 올바르지 않습니다.");
  }
  const scale = Math.min(1, MAGIC_WAND_TRACE_MAX_DIM / Math.max(displayWidth, displayHeight));
  return {
    width: Math.max(1, Math.round(displayWidth * scale)),
    height: Math.max(1, Math.round(displayHeight * scale)),
    minimumWidthPx: Math.max(1, Math.ceil(2 / scale)),
  };
}

/** Exact squared Euclidean distance transform: lower envelope of weighted parabolas. */
function distanceLine(input: Float64Array, output: Float64Array, length: number, spacing: number) {
  const sites = new Int32Array(length);
  const boundaries = new Float64Array(length + 1);
  const scale = spacing * spacing;
  let last = -1;
  for (let q = 0; q < length; q += 1) {
    if (!Number.isFinite(input[q])) continue;
    let crossing = -Infinity;
    while (last >= 0) {
      const p = sites[last]!;
      crossing = ((input[q]! - input[p]!) / scale + q * q - p * p) / (2 * (q - p));
      if (crossing > boundaries[last]!) break;
      last -= 1;
    }
    last += 1;
    sites[last] = q;
    boundaries[last] = last === 0 ? -Infinity : crossing;
    boundaries[last + 1] = Infinity;
  }
  if (last < 0) {
    output.fill(Infinity, 0, length);
    return;
  }
  let site = 0;
  for (let q = 0; q < length; q += 1) {
    while (boundaries[site + 1]! < q) site += 1;
    const p = sites[site]!;
    output[q] = input[p]! + scale * (q - p) ** 2;
  }
}

function distancesTo(mask: ColorRangeMask, selected: boolean, xSpacing: number, ySpacing: number) {
  // A transparent one-pixel frame gives full/inverted selections a real image-edge boundary.
  const width = mask.width + 2;
  const height = mask.height + 2;
  const distances = new Float64Array(width * height);
  distances.fill(Infinity);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x > 0 && y > 0 && x <= mask.width && y <= mask.height
        && mask.alpha[(y - 1) * mask.width + x - 1]! >= 128;
      if (inside === selected) distances[y * width + x] = 0;
    }
  }
  const input = new Float64Array(Math.max(width, height));
  const output = new Float64Array(input.length);
  for (let y = 0; y < height; y += 1) {
    input.set(distances.subarray(y * width, (y + 1) * width));
    distanceLine(input, output, width, xSpacing);
    distances.set(output.subarray(0, width), y * width);
  }
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) input[y] = distances[y * width + x]!;
    distanceLine(input, output, height, ySpacing);
    for (let y = 0; y < height; y += 1) distances[y * width + x] = output[y]!;
  }
  return distances;
}

/**
 * Rounded inside/center/outside borders of the composed hard mask, including holes and islands.
 * O(width*height), independent of requested border width. Canonical feather is reapplied once
 * after tracing; original RGBA content and its transparency never enter this computation.
 */
export function buildStudioSelectionBorderMask(mask: ColorRangeMask, options: StudioSelectionBorderOptions): ColorRangeMask {
  const { width, height, alpha } = mask;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > MAGIC_WAND_TRACE_MAX_DIM || height > MAGIC_WAND_TRACE_MAX_DIM
    || alpha.length !== width * height) {
    throw new RangeError("선택 테두리 마스크는 축당 최대 640px이며 버퍼 크기가 일치해야 합니다.");
  }
  studioSelectionBorderRasterSize(options.displayWidth, options.displayHeight);
  if (!Number.isFinite(options.widthPx) || options.widthPx <= 0 || options.widthPx > STUDIO_SELECTION_BORDER_MAX_WIDTH_PX
    || !STUDIO_SELECTION_BORDER_PLACEMENTS.some((placement) => placement.id === options.placement)) {
    throw new RangeError("선택 테두리 두께 또는 위치가 올바르지 않습니다.");
  }
  const xSpacing = options.displayWidth / width;
  const ySpacing = options.displayHeight / height;
  const innerWidth = options.placement === "outside" ? 0 : options.widthPx / (options.placement === "center" ? 2 : 1);
  const outerWidth = options.placement === "inside" ? 0 : options.widthPx / (options.placement === "center" ? 2 : 1);
  const toOutside = innerWidth > 0 ? distancesTo(mask, false, xSpacing, ySpacing) : null;
  const toInside = outerWidth > 0 ? distancesTo(mask, true, xSpacing, ySpacing) : null;
  const result = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const distanceIndex = (y + 1) * (width + 2) + x + 1;
      const selected = alpha[index]! >= 128;
      if (selected
        ? toOutside !== null && toOutside[distanceIndex]! <= innerWidth ** 2
        : toInside !== null && toInside[distanceIndex]! <= outerWidth ** 2) result[index] = 255;
    }
  }
  return { width, height, alpha: result };
}

/** The shared contour tracer has a finite topology budget; reject, never silently drop loops. */
function assertBorderTopology(mask: ColorRangeMask) {
  const visited = new Uint8Array(mask.alpha.length);
  const stack = new Int32Array(mask.alpha.length);
  const minimumArea = Math.ceil(MIN_SELECTION_SUBPATH_AREA * mask.alpha.length);
  let islands = 0;
  let holes = 0;
  for (let start = 0; start < mask.alpha.length; start += 1) {
    if (visited[start]) continue;
    const selected = mask.alpha[start]! >= 128;
    let count = 0;
    let touchesEdge = false;
    let pending = 1;
    stack[0] = start;
    visited[start] = 1;
    while (pending > 0) {
      const index = stack[--pending]!;
      count += 1;
      const x = index % mask.width;
      const y = Math.floor(index / mask.width);
      touchesEdge ||= x === 0 || y === 0 || x === mask.width - 1 || y === mask.height - 1;
      for (const neighbor of [x > 0 ? index - 1 : -1, x + 1 < mask.width ? index + 1 : -1,
        y > 0 ? index - mask.width : -1, y + 1 < mask.height ? index + mask.width : -1]) {
        if (neighbor < 0 || visited[neighbor] || (mask.alpha[neighbor]! >= 128) !== selected) continue;
        visited[neighbor] = 1;
        stack[pending++] = neighbor;
      }
    }
    if (selected) islands += 1;
    else if (!touchesEdge) holes += 1;
    if (islands > MAGIC_WAND_MAX_LOOPS || holes >= MAGIC_WAND_MAX_LOOPS
      || ((selected || !touchesEdge) && count < minimumArea)) {
      throw new RangeError("테두리에 너무 많은 영역이나 매우 작은 구멍이 있습니다. 기존 선택을 유지했습니다. 영역을 나누거나 테두리 두께를 조절해 주세요.");
    }
  }
}

export function studioSelectionBorderFromMask(mask: ColorRangeMask, selection: PixelSelection, options: StudioSelectionBorderOptions): PixelSelection | null {
  const border = buildStudioSelectionBorderMask(mask, options);
  assertBorderTopology(border);
  const next = applyColorRangeMaskToSelection(null, border, "add");
  return next ? { ...next, featherPx: selection.featherPx } : null;
}
