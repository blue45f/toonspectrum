import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

import { BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine";
import { brushStudioV6MaterialMarksToSvg, createBrushStudioV6MaterialStroke } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-engine";
import { BRUSH_STUDIO_V7_ADVANCED_SURFACES, sampleBrushStudioV7SurfaceContact } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v7-surface-library";

const OUT = "qa-results/studio-brush-v7";
const PALETTE = [
  ["#151a24", "#b33f62"], ["#234f9b", "#b23a6f"], ["#283d28", "#b66b2c"],
  ["#7a2e2e", "#1e5f79"], ["#41326b", "#b47625"], ["#224c47", "#b54a34"],
] as const;
const recipes = BRUSH_STUDIO_V6_RECIPES.filter((entry) => entry.id.startsWith("v7-"));
if (recipes.length !== 48) throw new Error(`expected 48 V7 recipes, got ${recipes.length}`);
await mkdir(OUT, { recursive: true });

function pathPoints(): readonly { x: number; y: number; pressure: number; tilt: number; twist: number }[] {
  return Array.from({ length: 46 }, (_, index) => {
    const t = index / 45;
    return {
      x: 14 + t * 242,
      y: 62 + Math.sin(t * Math.PI * 4.2) * 16 + Math.sin(t * Math.PI * 11) * 3,
      pressure: 0.22 + Math.pow(Math.sin(t * Math.PI), 0.7) * 0.74,
      tilt: 0.16 + t * 0.62,
      twist: -24 + t * 92,
    };
  });
}
const timings: { id: string; marks: number; renderMs: number }[] = [];
const cards = recipes.map((recipe, index) => {
  const base = createBrushStudioV6Program(recipe.id);
  const [primaryColor, secondaryColor] = PALETTE[index % PALETTE.length]!;
  const program = { ...base, tuning: { ...base.tuning, primaryColor, secondaryColor } };
  const stroke = createBrushStudioV6MaterialStroke(program, { maxMarksPerPush: 4096 });
  const started = performance.now();
  const marks = pathPoints().flatMap((point) => stroke.push(point));
  const renderMs = performance.now() - started;
  timings.push({ id: recipe.id, marks: marks.length, renderMs });
  return `<article class="brush-card">
    <header><strong>${recipe.label}</strong><code>${recipe.id.replace("v7-", "")}</code></header>
    <svg viewBox="0 0 270 124" role="img" aria-label="${recipe.label} 실제 접촉 마크">
      <rect x="0" y="0" width="270" height="124" rx="12" fill="#f7f2e8"/>
      ${brushStudioV6MaterialMarksToSvg(marks)}
    </svg>
    <p>${recipe.description}</p><small>${marks.length.toLocaleString()} marks · ${renderMs.toFixed(2)} ms</small>
  </article>`;
});

function surfaceSwatch(id: string): string {
  const cells: string[] = [];
  for (let row = 0; row < 20; row++) for (let column = 0; column < 40; column++) {
    const sample = sampleBrushStudioV7SurfaceContact(id, column * 2.4, row * 2.4, 20260918);
    const light = Math.round(246 - sample.tooth * 92);
    const warm = Math.round(light * 0.97);
    cells.push(`<rect x="${column * 5}" y="${row * 5}" width="5.2" height="5.2" fill="rgb(${light},${warm},${Math.max(118, warm - 11)})"/>`);
  }
  return `<svg viewBox="0 0 200 100" preserveAspectRatio="none">${cells.join("")}</svg>`;
}
const surfaceCards = BRUSH_STUDIO_V7_ADVANCED_SURFACES.map((surface) => `<article class="surface-card">
  ${surfaceSwatch(surface.id)}<strong>${surface.label}</strong>
  <span>${surface.family} · absorb ${surface.nominalAbsorbency.toFixed(2)} · anisotropy ${surface.nominalAnisotropy.toFixed(2)}</span>
  <p>${surface.description}</p>
</article>`);
function benchmarkSurface(ids: readonly string[]): { samples: number; elapsedMs: number; checksum: number } {
  const samples = 180_000; let checksum = 0;
  const started = performance.now();
  for (let index = 0; index < samples; index++) {
    const sample = sampleBrushStudioV7SurfaceContact(ids[index % ids.length]!, index * 0.173, index * -0.117, 86421);
    checksum += sample.tooth + sample.localAbsorbency * 0.1 + sample.anisotropy * 0.01;
  }
  return { samples, elapsedMs: performance.now() - started, checksum };
}
const legacyBench = benchmarkSurface(["surface-kent", "surface-coldpress", "surface-linen", "surface-porous"]);
const v7Bench = benchmarkSurface(BRUSH_STUDIO_V7_ADVANCED_SURFACES.map((entry) => entry.id));
const totalMarks = timings.reduce((sum, entry) => sum + entry.marks, 0);
const meanRenderMs = timings.reduce((sum, entry) => sum + entry.renderMs, 0) / timings.length;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Brush Studio V7 visual evidence</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#101216;color:#f4f1e8;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Pretendard",sans-serif}
main{max-width:1560px;margin:auto;padding:38px}.hero{padding:28px;border:1px solid #343942;border-radius:24px;background:#191c22;margin-bottom:28px}
h1{font-size:34px;margin:0 0 8px}.hero p{max-width:980px;color:#b9c0ca;margin:0}.metric{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}.metric b{padding:8px 12px;background:#252a32;border-radius:999px}
h2{margin:32px 0 14px;font-size:22px}.surface-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.surface-card,.brush-card{border:1px solid #343942;background:#191c22;border-radius:18px;overflow:hidden}
.surface-card svg{display:block;width:100%;height:104px}.surface-card strong,.surface-card span,.surface-card p{display:block;margin:10px 14px 0}.surface-card span{font-size:11px;color:#93a0ad}.surface-card p{margin-bottom:14px;color:#b9c0ca;font-size:12px}
.brush-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.brush-card{padding:14px}.brush-card header{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.brush-card code{font-size:10px;color:#7f8b98}.brush-card svg{display:block;width:100%;height:154px;margin:10px 0;border-radius:12px}.brush-card p{min-height:40px;margin:0;color:#b9c0ca;font-size:12px}.brush-card small{display:block;margin-top:9px;color:#7f8b98}
</style></head><body><main><section class="hero"><h1>ToonSpectrum Brush Studio V7.1 · Material Matrix</h1>
<p>실제 material-contact solver가 생성한 마크를 그대로 SVG로 직렬화한 QA 시트. 표면 이미지를 덧씌운 목업이 아니라 동일한 브러시 런타임 출력이다.</p>
<div class="metric"><b>${BRUSH_STUDIO_V7_ADVANCED_SURFACES.length} advanced surfaces</b><b>${recipes.length} signature brushes</b><b>${totalMarks.toLocaleString()} rendered marks</b><b>${meanRenderMs.toFixed(2)} ms avg stroke solve</b></div></section>
<h2>Surface microstructure field</h2><section class="surface-grid">${surfaceCards.join("")}</section>
<h2>Real contact-rendered brush matrix</h2><section class="brush-grid">${cards.join("")}</section></main></body></html>`;
await writeFile(`${OUT}/brush-v7-material-matrix.html`, html, "utf8");
const sortedMs = timings.map((entry) => entry.renderMs).sort((a, b) => a - b);
const metrics = {
  generatedAt: new Date().toISOString(), surfaceCount: BRUSH_STUDIO_V7_ADVANCED_SURFACES.length,
  recipeCount: recipes.length, totalMarks, meanRenderMs,
  p95RenderMs: sortedMs[Math.min(sortedMs.length - 1, Math.floor(sortedMs.length * 0.95))],
  legacySurfaceSamplesPerMs: legacyBench.samples / legacyBench.elapsedMs,
  v7SurfaceSamplesPerMs: v7Bench.samples / v7Bench.elapsedMs,
  v7ToLegacySurfaceCostRatio: v7Bench.elapsedMs / legacyBench.elapsedMs,
  timings, checksums: { legacy: legacyBench.checksum, v7: v7Bench.checksum },
};
await writeFile(`${OUT}/brush-v7-metrics.json`, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(`${process.cwd()}/${OUT}/brush-v7-material-matrix.html`).href);
  await page.screenshot({ path: `${OUT}/brush-v7-material-matrix.png`, fullPage: true });
} finally {
  await browser.close();
}
console.log(JSON.stringify(metrics, null, 2));