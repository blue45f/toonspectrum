import { createBrushStudioV6Program, replaceBrushStudioV6Slot } from "../../src/domains/creator/brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialStroke } from "../../src/domains/creator/brush-lab/brush-studio-v6-material-engine";
import { BrushStudioV6MaterialPaletteCache } from "../../src/domains/creator/brush-lab/brush-studio-v6-material-palette-cache";
import { createBrushStudioV6PigmentPalette, type BrushStudioV6PigmentProviderId } from "../../src/domains/creator/brush-lab/brush-studio-v6-pigment-provider";

const MODES: readonly { id: BrushStudioV6PigmentProviderId; node: string }[] = [
  { id: "spectral-wgm-v1", node: "pigment-spectral" },
  { id: "mixbox-js-v2", node: "pigment-mixbox" },
  { id: "spectral-js-v3", node: "pigment-spectral-js" },
  { id: "open-km-spectral-v1", node: "pigment-open-km-spectral" },
  { id: "colormix-lab-v3", node: "pigment-colormix-lab" },
];
const PAIRS = [["#002185", "#fcd200"], ["#e53166", "#ffffff"], ["#00bbbb", "#cc00aa"], ["#010101", "#ffffff"], ["#665544", "#447799"]] as const;
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)]!, p95: sorted[Math.ceil(sorted.length * 0.95) - 1]! };
}
function hash(colors: readonly string[]): string {
  let h = 2166136261;
  for (const color of colors) for (const c of color) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Real provider calls; warm JS execution, NOT cold network/WASM startup or input-to-photon latency. */
export function benchmarkBrushPigments(iterations = 31) {
  if (!Number.isSafeInteger(iterations) || iterations < 5 || iterations > 501) throw new RangeError("iterations must be 5..501");
  const records = MODES.map((mode) => ({ ...mode, paletteTimes: [] as number[], cacheTimes: [] as number[], strokeTimes: [] as number[] }));
  const cache = new BrushStudioV6MaterialPaletteCache(createBrushStudioV6PigmentPalette);
  const samples = Array.from({ length: 1024 }, (_, i) => ({ x: 10 + i * 0.6, y: 80 + Math.sin(i / 32) * 16, pressure: 0.6 }));
  const base = createBrushStudioV6Program("oil-hair-mixer");
  const checksum = new Map<string, string>();
  for (let pass = -10; pass < iterations; pass += 1) {
    for (let m = 0; m < records.length; m += 1) {
      const record = records[(m + pass + 10) % records.length]!;
      const beforePalette = performance.now();
      const palettes = PAIRS.map(([a, b]) => createBrushStudioV6PigmentPalette(a, b, record.id));
      const paletteMs = (performance.now() - beforePalette) / PAIRS.length;
      const currentHash = hash(palettes.flat());
      if (checksum.has(record.id) && checksum.get(record.id) !== currentHash) throw new Error("Nondeterministic palette");
      checksum.set(record.id, currentHash);
      for (const [a, b] of PAIRS) cache.get(a, b, record.id);
      const beforeCache = performance.now();
      for (let i = 0; i < 5000; i += 1) {
        const [a, b] = PAIRS[i % PAIRS.length]!;
        const cached = cache.get(a, b, record.id);
        if (cached[0] !== a || cached.at(-1) !== b) throw new Error("Endpoint changed");
      }
      const cacheUs = (performance.now() - beforeCache) * 1000 / 5000;
      const program = replaceBrushStudioV6Slot(base, "pigment", record.node);
      const stroke = createBrushStudioV6MaterialStroke(program);
      const beforeStroke = performance.now();
      let marks = 0;
      for (const point of samples) marks += stroke.push(point).length;
      const strokeMs = performance.now() - beforeStroke;
      if (marks === 0) throw new Error("No material output");
      if (pass >= 0) {
        record.paletteTimes.push(paletteMs); record.cacheTimes.push(cacheUs); record.strokeTimes.push(strokeMs);
      }
    }
  }
  return {
    schema: 1, iterations, warmupPasses: 10, paletteSteps: 33, pairs: PAIRS,
    notes: "Amortized JS palette/cache timing and 1024-sample contact generation only; excludes raster display, GPU, event dispatch, network and physical stylus latency. Different models intentionally produce different colors.",
    rows: records.map((r) => ({ provider: r.id, paletteMs: summary(r.paletteTimes), cacheUs: summary(r.cacheTimes), stroke1024Ms: summary(r.strokeTimes), paletteHash: checksum.get(r.id), midpoint: createBrushStudioV6PigmentPalette(PAIRS[0][0], PAIRS[0][1], r.id)[16] })),
  };
}
