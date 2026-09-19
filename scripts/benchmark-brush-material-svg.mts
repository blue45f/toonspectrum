import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

import { planStudioMaterialBrush } from "../apps/web/src/domains/creator/brush/studio-material-brush-runtime";
import { createBrushStudioV6Program } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine";
import { brushStudioV6MaterialMarksToSvg } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-engine";
import { createBrushStudioV6MaterialReceipt } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-receipt";

const rows = [];
for (const recipe of ["oil-hair-mixer", "mineral-bloom", "document-halftone"]) {
  const base = createBrushStudioV6Program(recipe);
  const material = createBrushStudioV6MaterialReceipt({ ...base, seed: 2147483647,
    tuning: { ...base.tuning, size: 33, opacity: 0.42 } });
  const marks = planStudioMaterialBrush({
    points: Array.from({ length: 61 }, (_, i) => [34 + i * 5.8, 94 + Math.sin(i / 60 * Math.PI * 2.15) * 45]).flat(),
    pressures: Array.from({ length: 61 }, (_, i) => 0.12 + Math.sin(i / 60 * Math.PI) * 0.86),
    stroke: material.tuning.primaryColor, strokeWidth: 33, opacity: 0.42,
    brushEnginePrograms: { version: 1, material },
  });
  const timings = { "legacy-primitives": [] as number[], "canvas-paths": [] as number[] };
  const modes = ["legacy-primitives", "canvas-paths"] as const;
  for (let i = 0; i < 41; i++) {
    for (const mode of i % 2 ? [...modes].reverse() : modes) {
      const started = performance.now();
      const text = brushStudioV6MaterialMarksToSvg(marks, mode);
      if (!text.length) throw new Error("An empty output cannot establish performance");
      if (i >= 10) timings[mode].push(performance.now() - started);
    }
  }
  for (const mode of modes) {
    const samples = timings[mode].sort((a, b) => a - b);
    const output = brushStudioV6MaterialMarksToSvg(marks, mode);
    rows.push({ recipe, mode, contacts: marks.length,
      medianMs: samples[Math.floor(samples.length / 2)], p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
      sha256: createHash("sha256").update(output).digest("hex"),
      utf8Bytes: Buffer.byteLength(output), utf16BudgetBytes: output.length * 2,
      gzipBytes: gzipSync(output).byteLength,
    });
  }
}
console.log(JSON.stringify({ node: process.version, rows,
  scope: "Warm Node JS serialization only: 10 warm-ups then 31 alternating-order samples. Gzip is an illustrative measurement, not the product SVG download format. No raster drawing, pen latency or end-to-end FPS is measured.",
}, null, 2));
