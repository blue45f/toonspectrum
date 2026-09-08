import { studioDeterministicContentId } from "../studio-deterministic-serialization";

export interface StudioTextureSurface {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  /** -1 means no UV island; non-negative values identify seam-isolated UV islands. */
  readonly islandIds: Int32Array;
  /** Optional material ownership; pixels never dilate across material boundaries. */
  readonly materialIds?: Int32Array;
}

export interface StudioTexturePixelDelta {
  readonly pixelIndex: number;
  readonly before: readonly [number, number, number, number];
  readonly after: readonly [number, number, number, number];
}

export interface StudioTextureDilationReceipt {
  readonly pixels: Uint8ClampedArray;
  readonly changedPixels: number;
  readonly deltas: readonly StudioTexturePixelDelta[];
  readonly sourceHash: string;
  readonly resultHash: string;
}

function validateSurface(surface: StudioTextureSurface): void {
  if (!Number.isSafeInteger(surface.width) || !Number.isSafeInteger(surface.height) || surface.width < 1 || surface.height < 1) {
    throw new RangeError("texture dimensions must be positive integers.");
  }
  const pixels = surface.width * surface.height;
  if (surface.rgba.length !== pixels * 4) throw new RangeError("texture RGBA length does not match dimensions.");
  if (surface.islandIds.length !== pixels) throw new RangeError("texture island map length does not match dimensions.");
  if (surface.materialIds && surface.materialIds.length !== pixels) {
    throw new RangeError("texture material map length does not match dimensions.");
  }
}

function pixelTuple(bytes: Uint8ClampedArray, pixelIndex: number): readonly [number, number, number, number] {
  const offset = pixelIndex * 4;
  return Object.freeze([
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  ]);
}

function sameOwner(surface: StudioTextureSurface, left: number, right: number): boolean {
  if (surface.islandIds[left] < 0 || surface.islandIds[left] !== surface.islandIds[right]) return false;
  return !surface.materialIds || surface.materialIds[left] === surface.materialIds[right];
}

export function dilateStudioVrmTexture(
  surface: StudioTextureSurface,
  radiusPx: number,
): StudioTextureDilationReceipt {
  validateSurface(surface);
  if (!Number.isSafeInteger(radiusPx) || radiusPx < 0 || radiusPx > 64) {
    throw new RangeError("texture dilation radius must be an integer from 0 to 64.");
  }
  const result = new Uint8ClampedArray(surface.rgba);
  if (radiusPx === 0) {
    const hash = studioDeterministicContentId(Array.from(result));
    return Object.freeze({
      pixels: result,
      changedPixels: 0,
      deltas: Object.freeze([]),
      sourceHash: hash,
      resultHash: hash,
    });
  }

  const count = surface.width * surface.height;
  const distance = new Int16Array(count);
  distance.fill(-1);
  const ownerSource = new Int32Array(count);
  ownerSource.fill(-1);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  for (let pixel = 0; pixel < count; pixel += 1) {
    if ((surface.rgba[pixel * 4 + 3] ?? 0) > 0 && surface.islandIds[pixel] >= 0) {
      distance[pixel] = 0;
      ownerSource[pixel] = pixel;
      queue[tail] = pixel;
      tail += 1;
    }
  }
  const offsets = Object.freeze([
    Object.freeze([-1, 0] as const),
    Object.freeze([1, 0] as const),
    Object.freeze([0, -1] as const),
    Object.freeze([0, 1] as const),
  ]);
  while (head < tail) {
    const pixel = queue[head] ?? -1;
    head += 1;
    if (pixel < 0 || distance[pixel] >= radiusPx) continue;
    const x = pixel % surface.width;
    const y = Math.floor(pixel / surface.width);
    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= surface.width || ny >= surface.height) continue;
      const next = ny * surface.width + nx;
      if (distance[next] >= 0 || !sameOwner(surface, pixel, next)) continue;
      distance[next] = distance[pixel] + 1;
      ownerSource[next] = ownerSource[pixel];
      queue[tail] = next;
      tail += 1;
    }
  }

  const deltas: StudioTexturePixelDelta[] = [];
  for (let pixel = 0; pixel < count; pixel += 1) {
    if ((surface.rgba[pixel * 4 + 3] ?? 0) > 0 || distance[pixel] <= 0) continue;
    const sourcePixel = ownerSource[pixel];
    if (sourcePixel < 0 || !sameOwner(surface, pixel, sourcePixel)) continue;
    const before = pixelTuple(result, pixel);
    const after = pixelTuple(surface.rgba, sourcePixel);
    const offset = pixel * 4;
    result[offset] = after[0];
    result[offset + 1] = after[1];
    result[offset + 2] = after[2];
    result[offset + 3] = after[3];
    deltas.push(Object.freeze({ pixelIndex: pixel, before, after }));
  }
  return Object.freeze({
    pixels: result,
    changedPixels: deltas.length,
    deltas: Object.freeze(deltas),
    sourceHash: studioDeterministicContentId(Array.from(surface.rgba)),
    resultHash: studioDeterministicContentId(Array.from(result)),
  });
}

export function applyStudioTexturePixelDeltas(
  rgba: Uint8ClampedArray,
  deltas: readonly StudioTexturePixelDelta[],
  direction: "redo" | "undo",
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(rgba);
  for (const delta of deltas) {
    const value = direction === "redo" ? delta.after : delta.before;
    const offset = delta.pixelIndex * 4;
    if (offset < 0 || offset + 3 >= result.length) throw new RangeError("texture delta is outside the surface.");
    result[offset] = value[0];
    result[offset + 1] = value[1];
    result[offset + 2] = value[2];
    result[offset + 3] = value[3];
  }
  return result;
}

export interface StudioTextureMemoryEntry {
  readonly id: string;
  readonly bytes: number;
  readonly active: boolean;
  readonly dirty: boolean;
  readonly lastUsedAtMs: number;
}

export interface StudioTextureMemoryPlan {
  readonly residentIds: readonly string[];
  readonly evictedIds: readonly string[];
  readonly residentBytes: number;
  readonly overBudgetBytes: number;
}

export function planStudioTextureMemoryEviction(
  entries: readonly StudioTextureMemoryEntry[],
  budgetBytes: number,
): StudioTextureMemoryPlan {
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 1) throw new RangeError("texture memory budget is invalid.");
  for (const entry of entries) {
    if (!entry.id.trim() || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !Number.isFinite(entry.lastUsedAtMs)) {
      throw new TypeError("texture memory entry is invalid.");
    }
  }
  const resident = new Set(entries.map((entry) => entry.id));
  let residentBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const evicted: string[] = [];
  const candidates = [...entries]
    .filter((entry) => !entry.active && !entry.dirty)
    .sort((left, right) => left.lastUsedAtMs - right.lastUsedAtMs || left.id.localeCompare(right.id));
  for (const entry of candidates) {
    if (residentBytes <= budgetBytes) break;
    resident.delete(entry.id);
    residentBytes -= entry.bytes;
    evicted.push(entry.id);
  }
  return Object.freeze({
    residentIds: Object.freeze(entries.map((entry) => entry.id).filter((id) => resident.has(id))),
    evictedIds: Object.freeze(evicted),
    residentBytes,
    overBudgetBytes: Math.max(0, residentBytes - budgetBytes),
  });
}

export interface StudioTextureArchiveRecord {
  readonly modelHash: string;
  readonly channel: "color" | "roughness" | "metallic" | "emission" | "opacity";
  readonly width: number;
  readonly height: number;
  readonly pixelHash: string;
  readonly colorSpace: string;
  readonly channelPacking: string;
}

export function createStudioTextureArchiveRecord(input: Omit<StudioTextureArchiveRecord, "pixelHash"> & {
  readonly pixels: Uint8ClampedArray;
}): StudioTextureArchiveRecord {
  return Object.freeze({
    modelHash: input.modelHash.trim(),
    channel: input.channel,
    width: input.width,
    height: input.height,
    pixelHash: studioDeterministicContentId(Array.from(input.pixels)),
    colorSpace: input.colorSpace.trim(),
    channelPacking: input.channelPacking.trim(),
  });
}
