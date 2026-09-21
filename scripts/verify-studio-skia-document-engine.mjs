import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox } from '@playwright/test';

const origin = process.argv[2] ?? 'http://127.0.0.1:5268';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Loopback QA only');
const output = path.resolve('artifacts/skia-document'); await fs.mkdir(output, { recursive: true });
const report = { checks: [], measurements: [], errors: [] };
function checkpoint(message) { report.checks.push(message); console.log(message); }
async function pixelComparison(page) {
  return page.evaluate(() => {
    // Test-only readback. The production renderer never reads pixels to JS.
    const gpu = document.querySelector('#gpu'); const reference = document.querySelector('#reference');
    const probe = document.createElement('canvas'); probe.width = gpu.width; probe.height = gpu.height;
    const context = probe.getContext('2d'); context.drawImage(gpu, 0, 0);
    const a = context.getImageData(0, 0, gpu.width, gpu.height).data;
    const b = reference.getContext('2d').getImageData(0, 0, gpu.width, gpu.height).data;
    let alphaA = 0, alphaB = 0, bad = 0, painted = 0, absolute = 0, colorError = 0;
    for (let i = 0; i < a.length; i += 4) {
      alphaA += a[i + 3]; alphaB += b[i + 3]; if (a[i + 3] || b[i + 3]) painted++;
      for (let channel = 0; channel < 3; channel++) colorError += Math.abs(a[i + channel] * a[i + 3] - b[i + channel] * b[i + 3]) / 255;
      const difference = Math.abs(a[i + 3] - b[i + 3]); absolute += difference; if (difference > 48) bad++;
    }
    return { alphaRatio: alphaA / alphaB, edgeMismatch: bad / painted, meanAlphaError: absolute / painted, meanPremultipliedColorError: colorError / (painted * 3) };
  });
}
async function verify(type, name) {
  const browser = await type.launch({ headless: true, ...(name === 'chromium' ? { channel: 'chromium' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const evaluate = page.evaluate.bind(page);
    page.evaluate = async (...args) => {
      let timer;
      try { return await Promise.race([evaluate(...args), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${name}: GPU test operation exceeded 45 seconds`)), 45_000);
      })]); } finally { clearTimeout(timer); }
    };
    page.on('pageerror', (error) => report.errors.push(`${name}: ${error.message}`));
    await page.goto(new URL('/tools/browser-harnesses/skia-document-engine.html', origin).href);
    await page.waitForFunction(() => document.querySelector('#result')?.textContent !== 'loading', undefined, { timeout: 60000 });
    assert.equal(JSON.parse(await page.locator('#result').innerText()).status, 'presented', await page.locator('#result').innerText());
    report.measurements.push({ engine: name, renderer: await page.evaluate(() => {
      const gl = document.querySelector('#gpu').getContext('webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'not exposed';
    }) });
    const parity = await pixelComparison(page);
    assert(parity.alphaRatio > 0.95 && parity.alphaRatio < 1.05, `${name} alpha mass: ${JSON.stringify(parity)}`);
    assert(parity.edgeMismatch < 0.08, `${name} edge mismatch: ${JSON.stringify(parity)}`);
    assert(parity.meanPremultipliedColorError < 8, `${name} premultiplied color mismatch: ${JSON.stringify(parity)}`);
    report.measurements.push({ engine: name, parity });
    await page.screenshot({ path: path.join(output, `${name}-parity.png`) });
    const initialPixels = await page.evaluate(() => window.skiaEngineQA.pixels().gpu);
    const incremental = await page.evaluate(() => window.skiaEngineQA.append());
    assert.equal(incremental.stats.presentation, 'append'); assert.equal(incremental.stats.paintedItems, 1);
    const appendParity = await pixelComparison(page);
    assert(appendParity.alphaRatio > 0.95 && appendParity.alphaRatio < 1.05);
    const recovered = await page.evaluate(() => window.skiaEngineQA.undo());
    assert.equal(recovered.stats.presentation, 'restored');
    assert.equal(await page.evaluate(() => window.skiaEngineQA.pixels().gpu), initialPixels);
    await page.evaluate(() => window.skiaEngineQA.erase());
    const eraseParity = await pixelComparison(page);
    assert(eraseParity.alphaRatio > 0.94 && eraseParity.alphaRatio < 1.06, `eraser parity ${JSON.stringify(eraseParity)}`);
    await page.evaluate(() => window.skiaEngineQA.undo());
    checkpoint(`${name}: incremental append preserves old pixels; GPU snapshot undo is exact; finalized eraser matches canonical alpha`);

    const rotated = await page.evaluate(() => window.skiaEngineQA.camera({ scaleX: -0.6, scaleY: 0.6, rotation: 90, offsetX: 550, offsetY: 400 }));
    assert.equal(rotated.status, 'presented'); assert.equal(rotated.stats.compiledItems, 0);
    const rotatedParity = await pixelComparison(page);
    assert(rotatedParity.alphaRatio > 0.94 && rotatedParity.alphaRatio < 1.06, `rotated alpha ${JSON.stringify(rotatedParity)}`);
    checkpoint(`${name}: real WebGL2 pixels, canonical pen parity, rotation/reflection reuse`);
    await page.evaluate(() => window.skiaEngineQA.camera({ scaleX: 1, scaleY: 1, rotation: 0, offsetX: 0, offsetY: 0 }));
    await page.evaluate(() => window.skiaEngineQA.load(80, 'marker'));
    const markerParity = await pixelComparison(page);
    assert(markerParity.alphaRatio > 0.94 && markerParity.alphaRatio < 1.06, `marker alpha ${JSON.stringify(markerParity)}`);
    assert(markerParity.meanPremultipliedColorError < 8, `marker color ${JSON.stringify(markerParity)}`);
    checkpoint(`${name}: original marker nib, pressure and stroke opacity match within antialiasing tolerance`);

    const interleaved = await page.evaluate(() => window.skiaEngineQA.interleavedSurface());
    assert.equal(interleaved.status, 'presented');
    const interleavedParity = await pixelComparison(page);
    assert(interleavedParity.alphaRatio > 0.94 && interleavedParity.alphaRatio < 1.06);
    await page.evaluate(() => window.skiaEngineQA.undo());
    const beforeResize = await page.evaluate(() => window.skiaEngineQA.pixels().gpu);
    const resize = await page.evaluate(() => window.skiaEngineQA.resize(540, 400, 2));
    assert.equal(resize.status, 'presented'); assert.equal(resize.stats.compiledItems, 0);
    const resizeParity = await pixelComparison(page);
    assert(resizeParity.alphaRatio > 0.94 && resizeParity.alphaRatio < 1.06);
    await page.evaluate(() => window.skiaEngineQA.resize(640, 480, 1));
    assert((await page.evaluate(() => window.skiaEngineQA.pixels().gpu)) === beforeResize, `${name}: resized-back GPU pixels differ from original`);
    checkpoint(`${name}: independent GPU contexts and DPR resize preserve source geometry and return pixels`);

    const bulk = await page.evaluate(() => window.skiaEngineQA.load(3000));
    assert.equal(bulk.status, 'presented'); assert.equal(bulk.stats.cachedItems, 3000);
    const appended = await page.evaluate(() => window.skiaEngineQA.append());
    assert.equal(appended.stats.compiledItems, 1); assert.equal(appended.stats.paintedItems, 1);
    assert.equal(appended.stats.compiledBatches, 1);
    report.measurements.push({ engine: name, append3001SubmissionMs: appended.stats.frameMs, appendPresentation: appended.stats.presentation });
    const undone = await page.evaluate(() => window.skiaEngineQA.undo());
    assert.equal(undone.stats.compiledItems, 0); assert.equal(undone.stats.cachedItems, 3000);
    const samples = [];
    for (let i = 0; i < 50; i++) {
      const result = await page.evaluate(() => window.skiaEngineQA.redraw());
      assert.equal(result.status, 'presented'); assert.equal(result.stats.compiledItems, 0); assert.equal(result.stats.presentation, 'cached'); assert.equal(result.stats.paintedItems, 0);
      samples.push(result.stats);
    }
    const times = samples.map((sample) => sample.frameMs).sort((a, b) => a - b);
    assert.equal(samples.at(-1).pictureBytes, samples[0].pictureBytes);
    assert(samples.every((sample) => sample.interactiveReadbacks === 0));
    report.measurements.push({ engine: name, strokes: 3000, unchangedFrameSubmissionP95Ms: times[Math.floor(times.length * 0.95)],
      pictureBytes: samples[0].pictureBytes, gpuBytesStart: samples[0].gpuCacheBytes, gpuBytesEnd: samples.at(-1).gpuCacheBytes });
    checkpoint(`${name}: 3000 actual strokes, append compiles one, undo releases, 50 warm frames reuse stable picture bytes`);
    const large = await page.evaluate(() => window.skiaEngineQA.load(10000));
    assert.equal(large.status, 'presented'); assert.equal(large.stats.cachedItems, 10000);
    const extra = await page.evaluate(() => window.skiaEngineQA.append());
    assert.equal(extra.stats.compiledItems, 1); assert.equal(extra.stats.compiledBatches, 1);
    assert.equal(extra.stats.paintedItems, 1);
    assert(extra.stats.retainedSnapshotBytes <= 32 * 1024 * 1024);
    report.measurements.push({ engine: name, strokes: 10000, appendSubmissionMs: extra.stats.frameMs,
      compiledBatches: extra.stats.compiledBatches, pictureBytes: extra.stats.pictureBytes });
    await page.evaluate(() => window.skiaEngineQA.undo());
    const retained = [];
    for (let i = 0; i < 20; i++) {
      const receipt = await page.evaluate((offset) => window.skiaEngineQA.camera({ scaleX: 1, scaleY: 1, rotation: 0, offsetX: offset, offsetY: 0 }), i % 7);
      assert.equal(receipt.status, 'presented'); assert.equal(receipt.stats.compiledItems, 0);
      assert(receipt.stats.retainedSnapshotBytes <= 32 * 1024 * 1024);
      retained.push(receipt.stats.pictureBytes);
    }
    assert(retained.every((bytes) => bytes === retained[0]));
    checkpoint(`${name}: 10000 retained strokes, one affected append batch, repeated camera frames keep bounded caches`);
    await page.evaluate(() => window.skiaEngineQA.load(80));
    const beforeLoss = await page.evaluate(() => window.skiaEngineQA.pixels().gpu);
    const lost = await page.evaluate(() => window.skiaEngineQA.loseContext());
    assert.equal(lost.status, 'unavailable');
    assert.equal((await page.evaluate(() => window.skiaEngineQA.redraw())).status, 'unavailable');
    const recoveredGpu = await page.evaluate(() => window.skiaEngineQA.recover());
    assert.equal(recoveredGpu.status, 'presented');
    assert((await page.evaluate(() => window.skiaEngineQA.pixels().gpu)) === beforeLoss, `${name}: explicit GPU recovery changed pixels`);
    checkpoint(`${name}: real GPU context loss stays unavailable until explicit recovery of the same engine`);
    await page.evaluate(() => window.skiaEngineQA.destroy());
    const disposed = await page.evaluate(() => window.skiaEngineQA.redraw()); assert.equal(disposed.status, 'disposed');
  } finally { await browser.close(); }
}
for (const [name, type] of [['chromium', chromium], ['firefox', firefox]]) {
  try { await verify(type, name); } catch (error) { report.errors.push(`${name}: ${error.stack ?? error}`); }
}
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
