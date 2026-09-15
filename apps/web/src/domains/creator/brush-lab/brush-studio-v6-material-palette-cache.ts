import type { BrushStudioV6PigmentProviderId } from "./brush-studio-v6-pigment-provider";

type PaletteFactory = (
  primary: string,
  secondary: string,
  providerId: BrushStudioV6PigmentProviderId,
) => readonly string[];

/** Small immutable LRU: no stroke geometry, canvas resources, or provider state retained. */
export class BrushStudioV6MaterialPaletteCache {
  private readonly entries = new Map<string, readonly string[]>();
  private readonly create: PaletteFactory;
  private hits = 0;
  private misses = 0;

  static readonly capacity = 32;

  constructor(create: PaletteFactory) {
    this.create = create;
  }

  get(
    primary: string,
    secondary: string,
    providerId: BrushStudioV6PigmentProviderId,
  ): readonly string[] {
    const key = JSON.stringify([primary, secondary, providerId]);
    const cached = this.entries.get(key);
    if (cached) {
      this.hits++;
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }
    this.misses++;
    const palette = Object.freeze([...this.create(primary, secondary, providerId)]);
    if (this.entries.size >= BrushStudioV6MaterialPaletteCache.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, palette);
    return palette;
  }

  statistics(): Readonly<{
    entries: number;
    hits: number;
    misses: number;
  }> {
    return {
      entries: this.entries.size,
      hits: this.hits,
      misses: this.misses,
    };
  }
}
