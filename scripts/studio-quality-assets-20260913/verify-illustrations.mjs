/** Real Chromium SVG decode/canvas insertion-path checks; no network or visual-approval inference. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { STUDIO_QUALITY_2D_PACKAGES } from '../../apps/web/src/domains/creator/catalog/studio-quality-assets-20260913.ts';
import { createStudioOriginalFreeAssetRecord, findStudioOriginalFreeAsset } from '../../apps/web/src/domains/creator/studio-original-free-asset-packs.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'artifacts/studio-quality-assets-20260913/illustrations');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route('**/*', route => route.abort());
  await page.setContent('<!doctype html><html><body><canvas></canvas></body></html>');
  for (const asset of STUDIO_QUALITY_2D_PACKAGES.flatMap(pkg => pkg.includedItems)) {
    assert.equal(findStudioOriginalFreeAsset(asset.id)?.svg, asset.svg);
    const record = createStudioOriginalFreeAssetRecord(asset);
    const rendered = await page.evaluate(async ({ dataUrl, width, height, svg }) => {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid SVG XML');
      const image = new Image(); image.src = dataUrl; await image.decode();
      if (image.naturalWidth !== width || image.naturalHeight !== height) throw new Error('Intrinsic dimensions changed');
      const canvas = document.querySelector('canvas');
      canvas.width = 512; canvas.height = Math.round(512 * height / width);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0, transparent = 0;
      for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] > 16) visible++; if (pixels[i] === 0) transparent++; }
      return { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, visible, transparent, pixels: pixels.length / 4, png: canvas.toDataURL('image/png') };
    }, { ...record, svg: asset.svg });
    assert(rendered.visible > rendered.pixels * .015, `${asset.id}: empty render`);
    if (asset.category === 'daily-prop') assert(rendered.transparent > rendered.pixels * .1, `${asset.id}: missing transparency`);
    const { png, ...metrics } = rendered;
    const bytes = Buffer.from(png.split(',')[1], 'base64');
    await writeFile(path.join(output, `${asset.id}.png`), bytes);
    results.push({ id: asset.id, svgSha256: createHash('sha256').update(asset.svg).digest('hex'), pngSha256: createHash('sha256').update(bytes).digest('hex'), ...metrics });
  }
  assert.equal(results.length, 24);
  assert.equal(new Set(results.map(item => item.pngSha256)).size, 24);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ renderer: 'Chromium', passed: results.length, actualStudioRoundTrip: false, results }, null, 2) + '\n');
  console.log('Chromium illustration decode/canvas checks passed:', results.length);
} finally { await browser.close(); }
