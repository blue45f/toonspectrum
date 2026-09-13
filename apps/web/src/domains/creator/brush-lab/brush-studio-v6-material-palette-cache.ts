type PaletteMixer = (primary: string, secondary: string, ratio: number, spectral: boolean) => string;

/** Small immutable LRU: no stroke geometry, canvas resources, or provider state retained. */
export class BrushStudioV6MaterialPaletteCache {
  private readonly entries = new Map<string, readonly string[]>();
  private readonly mix: PaletteMixer;
  constructor(mix: PaletteMixer) { this.mix = mix; }
  private hits = 0;
  private misses = 0;
  static readonly capacity = 32;

  get(primary: string, secondary: string, spectral: boolean): readonly string[] {
    const key = JSON.stringify([primary, secondary, spectral]);
    const cached = this.entries.get(key);
    if (cached) {
      this.hits++;
      this.entries.delete(key); this.entries.set(key, cached);
      return cached;
    }
    this.misses++;
    const palette = Object.freeze(Array.from({ length: 33 }, (_, i) => this.mix(primary, secondary, i / 32, spectral)));
    if (this.entries.size >= BrushStudioV6MaterialPaletteCache.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, palette);
    return palette;
  }
  statistics() { return { entries: this.entries.size, hits: this.hits, misses: this.misses }; }
}
