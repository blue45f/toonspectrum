import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = process.argv[2] ?? 'http://127.0.0.1:5287';
const cycles = Number(process.env.SKIA_SOAK_CYCLES ?? 5000);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) {
  throw new Error('Loopback soak only');
}
if (!Number.isInteger(cycles) || cycles < 1 || cycles > 20_000) {
  throw new Error('SKIA_SOAK_CYCLES must be an integer from 1 to 20000');
}

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(new URL('/tools/browser-harnesses/skia-document-engine.html', origin).href);
  await page.waitForFunction(() => document.querySelector('#result')?.textContent !== 'loading');
  const baseline = await page.evaluate(() => window.skiaEngineQA.load(10_000));
  if (baseline.status !== 'presented') throw new Error('baseline failed');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const startHeap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  const result = await page.evaluate(async (count) => {
    const api = window.skiaEngineQA;
    const baselineFrame = await api.redraw();
    if (baselineFrame.status !== 'presented') throw new Error('baseline redraw failed');
    const baseBytes = baselineFrame.stats.pictureBytes;
    const samples = [];
    for (let cycle = 0; cycle < count; cycle++) {
      const append = await api.append();
      if (append.status !== 'presented' || append.stats.compiledItems !== 1
        || append.stats.compiledBatches !== 1 || append.stats.paintedItems !== 1) {
        throw new Error(`append invariant failed at ${cycle}`);
      }
      const undo = await api.undo();
      if (undo.status !== 'presented' || undo.stats.cachedItems !== 10_000
        || undo.stats.pictureBytes !== baseBytes
        || undo.stats.retainedSnapshotBytes > 32 * 1024 * 1024) {
        throw new Error(`undo/cache invariant failed at ${cycle}`);
      }
      samples.push(append.stats.frameMs);
      if (cycle > 0 && cycle % 250 === 0) {
        await api.camera({
          scaleX: 1, scaleY: 1, rotation: 0,
          offsetX: cycle % 17, offsetY: cycle % 11,
        });
        await api.camera({
          scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0,
        });
      }
    }
    samples.sort((a, b) => a - b);
    const end = await api.redraw();
    return {
      cycles: count,
      pictureBytes: end.stats.pictureBytes,
      cachedBatches: end.stats.cachedBatches,
      retainedSnapshotBytes: end.stats.retainedSnapshotBytes,
      p95Ms: samples[Math.floor(samples.length * 0.95)] ?? 0,
      p99Ms: samples[Math.floor(samples.length * 0.99)] ?? 0,
      worstMs: samples.at(-1) ?? 0,
    };
  }, cycles);

  await cdp.send('HeapProfiler.collectGarbage');
  const endHeap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  await cdp.detach();
  assert.equal(result.pictureBytes > 0, true);
  assert(result.retainedSnapshotBytes <= 32 * 1024 * 1024);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    driver: await page.evaluate(() => {
      const gl = document.querySelector('#gpu').getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
    }),
    ...result,
    startHeap,
    endHeap,
    heapDelta: startHeap !== null && endHeap !== null ? endHeap - startHeap : null,
    errors,
  }, null, 2));
} finally {
  await browser.close();
}
