import type { ColorRangeMask } from "./studio-color-range";
import { assertExactSelectionSize, exactSelectionFromMask } from "./selection/studio-selection-exact-mask";

import type { PixelSelection } from "./studio-selection-tools";

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
  assertExactSelectionSize(Math.ceil(displayWidth), Math.ceil(displayHeight));
  const scale = 1;
  return {
    width: Math.max(1, Math.round(displayWidth * scale)),
    height: Math.max(1, Math.round(displayHeight * scale)),
    minimumWidthPx: 1,
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
    || alpha.length !== width * height) {
    throw new RangeError("선택 테두리 마스크와 버퍼 크기가 일치해야 합니다.");
  }
  assertExactSelectionSize(width, height);
  studioSelectionBorderRasterSize(options.displayWidth, options.displayHeight);
  if (!Number.isFinite(options.widthPx) || options.widthPx <= 0 || options.widthPx > STUDIO_SELECTION_BORDER_MAX_WIDTH_PX
    || !STUDIO_SELECTION_BORDER_PLACEMENTS.some((placement) => placement.id === options.placement)) {
    throw new RangeError("선택 테두리 두께 또는 위치가 올바르지 않습니다.");
  }
  const xSpacing = options.displayWidth / width;
  const ySpacing = options.displayHeight / height;
  const innerWidth = options.placement === "outside" ? 0 : (options.placement === "center" ? Math.ceil(options.widthPx / 2) : options.widthPx);
  const outerWidth = options.placement === "inside" ? 0 : (options.placement === "center" ? Math.floor(options.widthPx / 2) : options.widthPx);
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

export function studioSelectionBorderFromMask(mask: ColorRangeMask, selection: PixelSelection, options: StudioSelectionBorderOptions): PixelSelection | null {
  const border = buildStudioSelectionBorderMask(mask, options);
  const next = exactSelectionFromMask(border);
  return next ? { ...next, featherPx: selection.featherPx } : null;
}
