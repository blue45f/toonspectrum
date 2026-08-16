/**
 * 획을 가로지르는 밴딩 계측 — "줄무늬가 보인다"를 눈이 아니라 숫자로.
 *
 * 이 하네스가 존재하는 이유: 하이라이터 3종이 가로 막대로 보인다는 결함을 고치려다, 판정할
 * 지표가 없어서 반쪽 수정을 "지표가 안 움직였다"로도 "그림이 나아졌다"로도 우길 수 있는 상태가
 * 됐다. 내부 톤 개수와 sd 는 밴딩을 재지 못한다 — 밴딩은 톤의 다양성이 아니라 **공간 주파수**
 * 결함이라, 부드러운 그라디언트와 딱딱한 띠 5개가 같은 개수·같은 sd 를 낼 수 있다.
 *
 * 그래서 재는 것: 획을 가로지르는 평균 단면 P(y) 를 만들고, 그 변화량이 몇 개의 급격한 계단에
 * 몰려 있는지 본다.
 *   stepShare  — |ΔP| 총합 중 가장 큰 5개 계단이 차지하는 비율. 부드러운 단면은 변화가 고르게
 *                퍼져 낮고, 딱딱한 띠는 몇 개 경계에 몰려 높다.
 *   plateaus   — |ΔP| 가 거의 0 인 구간(평평한 띠)의 개수. 띠가 몇 개인지 그대로 센다.
 *   profile    — 단면 전체를 남긴다. 지표가 의심스러우면 숫자가 아니라 이걸 봐야 한다.
 *
 * 정직성 규칙:
 *   - 실제 브라우저에서 렌더한다. resvg 는 mix-blend-mode 를 통째로 무시하므로(실측) 네온·
 *     임파스토처럼 블렌드를 쓰는 레인을 resvg 로 판정하면 안 된다.
 *   - 셀 SVG 는 이 하네스가 만들지 않는다. brush-interior-tone-probe 가 앱의 핀(brushDynamics·
 *     drawMode·materialPressureModel)을 그대로 찍어 만든 것을 읽는다 — 핀을 두 곳에서 만들면
 *     이번 세션에서 세 번 나온 "다른 캐리어를 쟀다" 오진이 또 난다.
 *
 * 실행:
 *   TONE_PROBE_WRITE_SVG=1 TONE_PROBE_BRUSHES=highlighter,brush pnpm exec tsx \
 *     tests/benchmarks/harness/brush-interior-tone-probe.ts
 *   pnpm exec tsx tests/benchmarks/harness/brush-cross-banding.ts highlighter brush
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const CELL_DIR = resolve(HERE, "../results/brush-contact-sheet");
const OUT = resolve(HERE, "../results/brush-cross-banding.json");

/** 대조 시트 셀의 직선 획은 y=26 에, 곡선 획은 y≈82 에 있다. 직선만 보도록 세로창을 건다. */
const STRAIGHT_WINDOW_Y = 54;
/** 렌더 배율. 띠 하나가 몇 픽셀뿐이라 확대하지 않으면 단면이 계단인지 경사인지 갈리지 않는다. */
const SCALE = 6;
/** 계단으로 셀 |ΔP| 하한(0..255). 이 아래는 안티에일리어싱과 구분되지 않는다. */
const STEP_FLOOR = 1.5;
/** stepShare 를 계산할 때 세는 가장 큰 계단의 개수. */
const TOP_STEPS = 5;

const IN_PAGE = `(svg, scale, windowY, stepFloor, topSteps) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    const W = img.naturalWidth || 700;
    const H = img.naturalHeight || 140;
    const c = document.createElement("canvas");
    c.width = Math.round(W * scale);
    c.height = Math.round(H * scale);
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const rows = Math.min(c.height, Math.round(windowY * scale));

    // 열마다 잉크가 있는지 보고, 획이 실제로 존재하는 열만 단면 평균에 넣는다.
    const sums = new Float64Array(rows);
    const counts = new Float64Array(rows);
    for (let px = 0; px < c.width; px += 1) {
      let inked = false;
      for (let py = 0; py < rows; py += 1) {
        const i = (py * c.width + px) * 4;
        if (255 - (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114) > 4) { inked = true; break; }
      }
      if (!inked) continue;
      for (let py = 0; py < rows; py += 1) {
        const i = (py * c.width + px) * 4;
        sums[py] += 255 - (d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114);
        counts[py] += 1;
      }
    }
    const profile = [];
    for (let py = 0; py < rows; py += 1) {
      if (counts[py] > 0) profile.push(sums[py] / counts[py]);
    }
    // 획이 차지하는 구간만 남긴다(위아래 여백 제거).
    let lo = 0, hi = profile.length - 1;
    while (lo < profile.length && profile[lo] < 2) lo += 1;
    while (hi > lo && profile[hi] < 2) hi -= 1;
    const band = profile.slice(lo, hi + 1);
    if (band.length < 8) { resolve({ error: "no usable cross section" }); return; }

    const deltas = [];
    for (let i = 1; i < band.length; i += 1) deltas.push(Math.abs(band[i] - band[i-1]));
    const total = deltas.reduce((s, v) => s + v, 0);
    const sorted = [...deltas].sort((a, b) => b - a);
    const top = sorted.slice(0, topSteps).reduce((s, v) => s + v, 0);
    // 평평한 띠: |ΔP| 가 바닥 아래인 연속 구간. 경계가 몇 개인지와 짝을 이룬다.
    let plateaus = 0;
    let run = 0;
    for (const delta of deltas) {
      if (delta < stepFloor) { run += 1; continue; }
      if (run >= Math.max(3, Math.round(band.length / 12))) plateaus += 1;
      run = 0;
    }
    if (run >= Math.max(3, Math.round(band.length / 12))) plateaus += 1;
    resolve({
      thicknessPx: band.length / scale,
      // stepShare 는 비율이라 척도가 없다 — 작은 계단을 없애기만 해도 올라간다. 그래서 절대값을
      // 같이 낸다: maxStep 은 단면에서 가장 큰 한 계단(이게 눈에 띄는 경계의 크기고), totalVar 는
      // 단면 전체의 변동량이다. 밴딩이 줄었다고 말하려면 maxStep 이 내려가야 한다.
      maxStep: sorted[0] ?? 0,
      totalVariation: total,
      stepShare: total > 0 ? top / total : 0,
      hardSteps: deltas.filter((v) => v >= stepFloor).length,
      plateaus,
      peakInk: Math.max(...band),
      profile: band.map((v) => Number(v.toFixed(2))),
    });
  };
  img.onerror = () => resolve({ error: "render failed" });
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
})`;

async function main(): Promise<void> {
  const brushes = process.argv.slice(2);
  if (brushes.length === 0) {
    console.error("usage: brush-cross-banding.ts <brushId> [...]  (cells from the tone probe)");
    process.exit(1);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<!doctype html><meta charset=utf-8>");

  const rows: unknown[] = [];
  for (const brush of brushes) {
    let svg: string;
    try {
      svg = await readFile(resolve(CELL_DIR, `cell-${brush}.svg`), "utf8");
    } catch {
      console.log(`${brush.padEnd(30)} no cell — run the tone probe with TONE_PROBE_WRITE_SVG=1`);
      continue;
    }
    const result = await page.evaluate(
      ([body, args]) => (
         
        new Function(`return (${body})`)()(...(args as unknown[]))
      ),
      [IN_PAGE, [svg, SCALE, STRAIGHT_WINDOW_Y, STEP_FLOOR, TOP_STEPS]] as const,
    ) as Record<string, unknown>;
    if (typeof result.error === "string") {
      console.log(`${brush.padEnd(30)} ${result.error}`);
      continue;
    }
    rows.push({ brush, ...result });
    console.log(
      `${brush.padEnd(30)} stepShare=${(result.stepShare as number).toFixed(3)}`
      + `  maxStep=${(result.maxStep as number).toFixed(1)}`
      + `  hardSteps=${String(result.hardSteps).padStart(3)}`
      + `  plateaus=${String(result.plateaus).padStart(2)}`
      + `  thickness=${(result.thicknessPx as number).toFixed(1)}px`
      + `  peakInk=${(result.peakInk as number).toFixed(1)}`,
    );
  }

  await browser.close();
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    `${JSON.stringify({
      generatedBy: "tests/benchmarks/harness/brush-cross-banding.ts",
      scale: SCALE,
      stepFloor: STEP_FLOOR,
      topSteps: TOP_STEPS,
      rows,
    }, null, 2)}\n`,
    "utf8",
  );
  console.log(`\nwrote ${OUT}`);
}

await main();
