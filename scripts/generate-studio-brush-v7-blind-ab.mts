import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

import { createBrushStudioV6Program } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine";
import {
  brushStudioV6MaterialMarksToSvg,
  createBrushStudioV6MaterialStroke,
} from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-engine";

const OUT = "qa-results/studio-brush-v7-blind-ab";
const PAIRS = [
  ["backrun", "v7-backrun-cauliflower", "v7-rough-mineral-watercolor"],
  ["kozo-backrun", "v7-backrun-kozo-tide", "v7-washi-sumi-fiber"],
  ["sediment", "v7-sediment-cobalt-granulation", "salt-crystal-watercolor"],
  ["superbloom", "v7-backrun-sediment-superbloom", "mineral-bloom"],
  ["split-oil", "v7-split-fan-oil", "oil-hair-mixer"],
  ["split-dry", "v7-split-dry-rake", "linen-dry-bristle"],
  ["impasto-light", "v7-raking-light-impasto", "v7-heavy-canvas-impasto"],
  ["gesso-light", "v7-crosslight-gesso-bristle", "v7-gesso-scrape-oil"],
  ["vector-vortex", "v7-vector-vortex-ink", "vortex-flow"],
  ["vector-contour", "v7-vector-contour-etch", "contour-engraving"],
  ["satin", "v7-textile-satin-thread", "woven-ribbon"],
  ["twill", "v7-textile-twill-denim", "cross-embroidery"],
] as const;

await mkdir(OUT, { recursive: true });

function points(): readonly { x: number; y: number; pressure: number; tilt: number; twist: number }[] {
  return Array.from({ length: 44 }, (_, index) => {
    const t = index / 43;
    return {
      x: 14 + t * 250,
      y: 66 + Math.sin(t * Math.PI * 3.7) * 18 + Math.sin(t * Math.PI * 9.3) * 4,
      pressure: 0.24 + Math.sin(t * Math.PI) * 0.7,
      tilt: 0.18 + t * 0.58,
      twist: -28 + t * 104,
    };
  });
}

function orderFor(id: string): boolean {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2 === 0;
}

function render(id: string): { svg: string; marks: number; ms: number } {
  const base = createBrushStudioV6Program(id);
  const program = {
    ...base,
    tuning: {
      ...base.tuning,
      size: 34,
      opacity: 0.8,
      primaryColor: "#233958",
      secondaryColor: "#a7523f",
    },
  };
  const stroke = createBrushStudioV6MaterialStroke(program, { maxMarksPerPush: 4096 });
  const started = performance.now();
  const marks = points().flatMap((point) => stroke.push(point));
  return { svg: brushStudioV6MaterialMarksToSvg(marks), marks: marks.length, ms: performance.now() - started };
}

const key: { pair: string; a: string; b: string; candidate: "A" | "B" }[] = [];
const cards = PAIRS.map(([pair, candidate, reference], index) => {
  const candidateFirst = orderFor(pair);
  const aId = candidateFirst ? candidate : reference;
  const bId = candidateFirst ? reference : candidate;
  const a = render(aId);
  const b = render(bId);
  key.push({ pair, a: aId, b: bId, candidate: candidateFirst ? "A" : "B" });
  return `<article class="pair"><header><strong>Blind pair ${String(index + 1).padStart(2, "0")}</strong><code>${pair}</code></header>
    <div class="compare"><section><b>A</b><svg viewBox="0 0 278 132"><rect width="278" height="132" rx="12" fill="#f7f2e8"/>${a.svg}</svg><small>${a.marks.toLocaleString()} contacts · ${a.ms.toFixed(2)} ms</small></section>
    <section><b>B</b><svg viewBox="0 0 278 132"><rect width="278" height="132" rx="12" fill="#f7f2e8"/>${b.svg}</svg><small>${b.marks.toLocaleString()} contacts · ${b.ms.toFixed(2)} ms</small></section></div>
    <p>이름을 보지 않고 질감 분리도, 재료감, 획 내부의 구조 변화, 과도한 규칙 반복 여부를 비교한다.</p></article>`;
});

await writeFile(`${OUT}/blind-ab-key.json`, `${JSON.stringify({ generatedAt: new Date().toISOString(), pairs: key }, null, 2)}\n`, "utf8");
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Brush V7.1 blind A/B</title><style>
*{box-sizing:border-box}body{margin:0;background:#0f1115;color:#f4f0e8;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Pretendard",sans-serif}
main{max-width:1420px;margin:auto;padding:38px}.hero{padding:26px 28px;border:1px solid #343943;background:#191d23;border-radius:22px;margin-bottom:22px}
h1{margin:0 0 8px;font-size:32px}.hero p{margin:0;color:#b6bec9;max-width:1000px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.pair{border:1px solid #333944;background:#191d23;border-radius:18px;padding:14px}.pair header{display:flex;justify-content:space-between;align-items:baseline}.pair code{color:#7d8996;font-size:11px}
.compare{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.compare section{position:relative}.compare b{position:absolute;z-index:2;left:10px;top:8px;background:#11151b;padding:4px 8px;border-radius:999px}
svg{display:block;width:100%;border-radius:12px}.compare small{display:block;margin-top:5px;color:#7d8996}.pair p{margin:10px 2px 0;color:#b6bec9;font-size:12px}
</style></head><body><main><section class="hero"><h1>ToonSpectrum Brush V7.1 · Blind A/B Matrix</h1>
<p>후보/기준 브러시 이름을 숨기고 좌우 순서를 결정적으로 섞었다. 동일한 색·크기·불투명도로 실제 material-contact solver 출력을 비교한다. 정답 키는 별도 JSON에만 기록한다.</p></section><section class="grid">${cards.join("")}</section></main></body></html>`;
await writeFile(`${OUT}/blind-ab.html`, html, "utf8");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1460, height: 1100 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(`${process.cwd()}/${OUT}/blind-ab.html`).href);
  await page.screenshot({ path: `${OUT}/blind-ab.png`, fullPage: true });
} finally {
  await browser.close();
}
console.log(JSON.stringify({ pairCount: PAIRS.length, key }, null, 2));
