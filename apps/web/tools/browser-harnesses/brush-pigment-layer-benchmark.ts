import { prepareSyntheticPigmentLayers } from "../../src/domains/creator/brush-lab/pigment/external-pigments";

export function benchmarkPigmentLayers() {
  const args = ["#002185", "#fcd200", "#ffffff"] as const;
  const prepared = prepareSyntheticPigmentLayers(...args);
  let observed = "";
  const measure = (reuse: boolean) => {
    const start = performance.now();
    for (let index = 0; index < 128; index += 1) {
      const evaluate = reuse ? prepared : prepareSyntheticPigmentLayers(...args);
      observed = evaluate((index % 7 + 1) / 10, (index % 5 + 1) / 10).premixed;
    }
    return (performance.now() - start) / 128;
  };
  for (let i = 0; i < 10; i += 1) { measure(false); measure(true); }
  const cold: number[] = [], cached: number[] = [];
  for (let i = 0; i < 31; i += 1) {
    if (i % 2 === 0) { cold.push(measure(false)); cached.push(measure(true)); }
    else { cached.push(measure(true)); cold.push(measure(false)); }
  }
  const summarize = (data: number[]) => {
    const sorted = [...data].sort((a, b) => a - b);
    return { medianMs: sorted[15]!, p95Ms: sorted[29]!, samplesMs: data };
  };
  return { freshPreparation: summarize(cold), preparedPair: summarize(cached), swatches: prepared(0.5, 0.5), observed,
    scope: "CPU time for three 38-band optical results plus sRGB/gamut mapping. Excludes React, canvas rendering, pen latency, GPU and full document persistence." };
}
