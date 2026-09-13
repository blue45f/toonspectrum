/**
 * Area-sampled, bounded procedural tip compiler.
 *
 * Work belongs at brush selection time, never in the pointer/dab loop. The result is the same
 * document-safe R8 alpha payload consumed by Canvas, SVG, WebGPU and collaboration replay.
 * No DOM, image downloads, clock, global random stream or native dependency is involved.
 */
export type StudioTipCoverageField = (x: number, y: number) => number;

export const STUDIO_PROCEDURAL_TIP_MAX_SIZE = 64;
export const STUDIO_PROCEDURAL_TIP_CACHE_BYTES = 1024 * 1024;
export const STUDIO_PROCEDURAL_TIP_RASTER_VERSION = "area-r8-v1";

type SampleGrid = 1 | 2 | 4;

function validateSize(size: number, samples: number): void {
  if (!Number.isInteger(size) || size < 1 || size > STUDIO_PROCEDURAL_TIP_MAX_SIZE) {
    throw new RangeError("Procedural tip size must be an integer in [1, 64].");
  }
  if (samples !== 1 && samples !== 2 && samples !== 4) {
    throw new RangeError("Procedural tip sample grid must be 1, 2 or 4.");
  }
}

/** Integrate coverage over each texel instead of point-sampling thin fibres and cut edges. */
export function rasterizeStudioProceduralTip(
  size: number,
  field: StudioTipCoverageField,
  samples: SampleGrid = 2,
): Uint8Array {
  validateSize(size, samples);
  const bytes = new Uint8Array(size * size);
  const scale = 2 / size;
  const weight = 255 / (samples * samples);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let coverage = 0;
      for (let sy = 0; sy < samples; sy++) {
        const y = (py + (sy + 0.5) / samples) * scale - 1;
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) * scale - 1;
          const alpha = field(x, y);
          coverage += Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0;
        }
      }
      bytes[py * size + px] = Math.round(coverage * weight);
    }
  }
  return bytes;
}

export interface StudioProceduralTipCacheStats {
  readonly entries: number;
  readonly bytes: number;
  readonly hits: number;
  readonly misses: number;
}

/** Byte-budgeted LRU; callers receive detached bytes and cannot poison a later brush selection. */
export class StudioProceduralTipCache {
  private readonly entries = new Map<string, Uint8Array>();
  private retainedBytes = 0;
  private hits = 0;
  private misses = 0;

  constructor(private readonly byteBudget = STUDIO_PROCEDURAL_TIP_CACHE_BYTES) {
    if (!Number.isSafeInteger(byteBudget) || byteBudget < 0 || byteBudget > 16 * 1024 * 1024) {
      throw new RangeError("Procedural tip cache budget must be between zero and 16 MiB.");
    }
  }

  get(
    identity: string,
    size: number,
    field: StudioTipCoverageField,
    samples: SampleGrid = 2,
  ): Uint8Array {
    validateSize(size, samples);
    if (!identity || identity.length > 256) {
      throw new RangeError("Procedural tip identity must contain 1 to 256 characters.");
    }
    const key = `${STUDIO_PROCEDURAL_TIP_RASTER_VERSION}:${samples}:${size}:${identity}`;
    const existing = this.entries.get(key);
    if (existing) {
      this.hits++;
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.slice();
    }
    this.misses++;
    const bytes = rasterizeStudioProceduralTip(size, field, samples);
    if (bytes.byteLength <= this.byteBudget) {
      while (this.retainedBytes + bytes.byteLength > this.byteBudget) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) break;
        this.retainedBytes -= this.entries.get(oldest)!.byteLength;
        this.entries.delete(oldest);
      }
      this.entries.set(key, bytes);
      this.retainedBytes += bytes.byteLength;
      return bytes.slice();
    }
    return bytes;
  }

  stats(): StudioProceduralTipCacheStats {
    return {
      entries: this.entries.size,
      bytes: this.retainedBytes,
      hits: this.hits,
      misses: this.misses,
    };
  }

  clear(): void {
    this.entries.clear();
    this.retainedBytes = 0;
    this.hits = 0;
    this.misses = 0;
  }
}

export const studioProceduralTipCache = new StudioProceduralTipCache();

/** Stable identity seed. Reordering/adding catalogue rows cannot alter an existing material. */
export function studioMaterialIdentitySeed(identity: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < identity.length; i++) {
    hash = Math.imul(hash ^ identity.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}
