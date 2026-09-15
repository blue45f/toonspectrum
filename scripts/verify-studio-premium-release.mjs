#!/usr/bin/env node
/** Read-only release checks. No acquisition, approval or publication happens here. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Usage: verify-studio-premium-release.mjs ISOLATED_TOOLS_DIRECTORY');
const release = process.argv[3] ?? 'premium-20260913';
assert(['premium-20260913', 'diversity-20260913'].includes(release), 'Unknown reviewed release');
const toolRoot = path.resolve(process.argv[2]);
const tools = createRequire(path.join(toolRoot, 'package.json'));
const { chromium } = tools('playwright');
// pnpm isolates transitive packages; resolve the bundler from its declared owner.
const { build } = createRequire(tools.resolve('tsx'))('esbuild');
const publicRoot = path.join(root, 'apps/web/public');
const delivery = path.join(publicRoot, 'assets/studio/cc0-20260906');
const manifest = JSON.parse(await readFile(path.join(delivery, 'manifest.json'), 'utf8'));
const decisions = JSON.parse(await readFile(path.join(root, `data/studio-assets/${release}-decisions.json`), 'utf8'));
const expected = decisions.assets.filter(row => row.decision === 'admit');
assert(expected.length > 0, 'No reviewed assets have been delivered');
const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
assert.equal(byId.size, manifest.assets.length);
const assets = expected.map(decision => {
  const asset = byId.get(decision.id);
  assert(asset, `Approved asset missing: ${decision.id}`);
  assert.equal(asset.sha256, decision.sha256);
  assert.equal(asset.visualReviewed, true);
  assert.equal(asset.curationStatus, 'selected-after-visual-triage');
  assert.equal(asset.allAnglesArtisticallyApproved, false);
  return asset;
});
for (const kind of ['model', 'surface-texture', 'background', 'prop-image']) assert(assets.some(asset => asset.kind === kind), `Missing actual ${kind} delivery`);
for (const decision of decisions.assets.filter(row => row.decision === 'exclude')) assert(!byId.has(decision.id), `Excluded candidate was published: ${decision.id}`);
for (const decision of decisions.assets.filter(row => row.decision === 'component')) {
  const asset = byId.get(decision.id);
  assert(asset, `Reviewed assembly component missing: ${decision.id}`);
  assert.equal(asset.sha256, decision.sha256);
  assert.equal(asset.role, 'assembly-component');
  assert.equal(asset.visualReviewSource, decision.evidence);
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let totalBytes = 0;
for (const asset of assets) {
  assert(/^assets\/[a-z0-9-]+\/[a-zA-Z0-9_.-]+\.(?:glb|webp)$/u.test(asset.path));
  const bytes = await readFile(path.join(delivery, asset.path));
  assert.equal(bytes.length, asset.bytes); assert.equal(hash(bytes), asset.sha256);
  totalBytes += bytes.length;
  const receipt = JSON.parse(await readFile(path.join(delivery, path.dirname(asset.path), 'SOURCE.json'), 'utf8'));
  assert.equal(receipt.license.id, 'CC0-1.0');
  assert.equal(receipt.license.sourceUrl, asset.license.sourceUrl);
  if (asset.kind === 'model') {
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8').trim());
    assert(gltf.images?.length > 0);
    assert(gltf.images.every(image => Number.isInteger(image.bufferView) && !image.uri));
    assert(asset.technicalChecks.includes('production-GLB-admission-mobile-profile'));
  } else if (asset.kind === 'background') {
    assert.deepEqual([asset.width, asset.height], [2048, 1152]);
    assert(asset.sourceDimensions[0] >= 4 * asset.width);
  } else if (asset.kind === 'prop-image') {
    assert.deepEqual([asset.width, asset.height], [1536, 1536]);
    assert.equal(asset.independentOriginal, false);
    assert.equal(byId.get(asset.derivedFrom)?.sha256, asset.sourceModelSha256);
  }
  for (const map of asset.pbrMaps ?? []) {
    const bytes = await readFile(path.join(delivery, map.path));
    assert.equal(hash(bytes), map.sha256); assert.equal(bytes.length, map.bytes);
  }
}

const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {StudioCc0AssetLibraryPanel} from './apps/web/src/domains/creator/StudioCc0AssetLibraryPanel.tsx';
import * as api from './apps/web/src/domains/creator/studio-cc0-asset-delivery.ts';
window.assetApi=api;
createRoot(document.getElementById('app')).render(<StudioCc0AssetLibraryPanel onUseAsset={asset=>{window.lastInserted={id:asset.id,width:asset.width,height:asset.height,rights:asset.rights};return true;}}/>);`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false,
  platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic',
  alias: { '@': path.join(root, 'apps/web/src') }, nodePaths: [path.join(toolRoot, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' } });
const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px system-ui;margin:20px;max-width:980px}button,input,select,summary{padding:10px;cursor:pointer}img{max-width:100%;height:auto}article{display:inline-block;width:220px;vertical-align:top;padding:10px;border:1px solid #ccc}article img{width:200px}div[role=dialog]{position:fixed;inset:5%;background:white;overflow:auto;padding:20px;border:2px solid}div[role=dialog] img{max-height:50vh;width:auto}</style><div id="app"></div><script type="module" src="/entry.js"></script>';
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
    if (pathname === '/entry.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text); return; }
    const file = path.resolve(publicRoot, '.' + pathname);
    if (!file.startsWith(publicRoot + path.sep) || !(await stat(file)).isFile()) throw new Error('Invalid file');
    response.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : file.endsWith('.webp') ? 'image/webp' : 'application/octet-stream');
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const reportRoot = path.join(root, release === 'premium-20260913' ? 'artifacts/studio-premium-release-qa' : 'artifacts/studio-diversity-release-qa');
await mkdir(reportRoot, { recursive: true });
let browser;
const imageChecks = [], errors = [];
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(base); await page.waitForFunction(() => Boolean(window.assetApi));
  for (const asset of assets.filter(asset => asset.kind !== 'model')) {
    const result = await page.evaluate(async id => {
      const catalog = await window.assetApi.loadStudioCc0Catalog();
      const asset = catalog.find(asset => asset.id === id);
      const record = await window.assetApi.createStudioCc0ImageRecord(asset);
      const image = new Image(); image.src = record.dataUrl; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = record.width; canvas.height = record.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!png || png.size < 1000) throw new Error('Blank or failed canvas export');
      let transparent = false;
      if (asset.kind === 'prop-image') {
        const pixel = context.getImageData(0, 0, 1, 1).data;
        transparent = pixel[3] === 0;
        if (!transparent) throw new Error('Transparent prop lost its alpha');
      }
      image.src = ''; canvas.width = canvas.height = 1;
      return { id, width: record.width, height: record.height, pngBytes: png.size, transparent, rightsConfirmed: record.rights.rightsConfirmed };
    }, asset.id);
    imageChecks.push(result);
  }
  await page.locator('summary').click();
  await page.getByRole('button', { name: '2D 배경', exact: true }).click();
  await page.locator('article').first().waitFor();
  await page.locator('article').first().getByRole('button', { name: /확대 미리보기/u }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.locator('article').first().getByRole('button', { name: '캔버스에 삽입', exact: true }).click();
  await page.waitForFunction(() => window.lastInserted?.width === 2048);
  await page.getByRole('button', { name: '2D 투명 소품', exact: true }).click();
  await page.getByRole('searchbox', { name: '에셋 검색' }).fill('의자');
  await page.waitForTimeout(200);
  await page.locator('article').first().getByRole('button', { name: '캔버스에 삽입', exact: true }).click();
  await page.waitForFunction(() => window.lastInserted?.width === 1536);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(reportRoot, 'library-mobile-functional.png'), fullPage: true });
  const negativeChecks = await page.evaluate(async id => {
    const asset = (await window.assetApi.loadStudioCc0Catalog()).find(asset => asset.id === id);
    let hashRejected = false, abortRejected = false;
    try { await window.assetApi.createStudioCc0ImageRecord({ ...asset, sha256: '0'.repeat(64) }); } catch { hashRejected = true; }
    const controller = new AbortController(); controller.abort();
    try { await window.assetApi.createStudioCc0ImageRecord(asset, controller.signal); } catch { abortRejected = true; }
    return { hashRejected, abortRejected };
  }, assets.find(asset => asset.kind === 'background').id);
  assert.deepEqual(negativeChecks, { hashRejected: true, abortRejected: true });
  assert.equal(errors.length, 0, errors.join('\n'));
  const report = { approvedAssets: assets.length, independentOriginals: assets.filter(asset => !asset.derivedFrom).length,
    derivatives: assets.filter(asset => asset.derivedFrom).length, totalBytes,
    byKind: Object.fromEntries([...new Set(assets.map(asset => asset.kind))].map(kind => [kind, assets.filter(asset => asset.kind === kind).length])),
    imageChecks, componentChecks: ['kind-filters', 'Korean-search', 'preview-Escape-focus-contract', 'background-insertion-callback', 'prop-insertion-callback', 'mobile-viewport'],
    negativeChecks, fullStudioProjectRoundTrip: false, errors };
  await writeFile(path.join(reportRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
