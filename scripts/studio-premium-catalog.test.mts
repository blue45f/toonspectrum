import assert from 'node:assert/strict';

import { filterStudioCc0Assets, parseStudioCc0Catalog, studioCc0AssetUrl } from '../apps/web/src/domains/creator/studio-cc0-asset-delivery';
import { curateStudioCc0Selection, studioCc0StyleLabel } from '../apps/web/src/domains/creator/studio-cc0-curation';

const test: (name: string, body: () => void) => unknown = process.env.VITEST
  ? (await import("vitest")).test
  : (await import("node:test")).test;

function image(kind = 'background', changes: Record<string, unknown> = {}) {
  return { id: 'polyhaven-background-test', name: '골목 거리 · Alley', kind,
    category: 'background-street', path: 'assets/polyhaven-background-test/background.webp',
    bytes: 1024, sha256: 'a'.repeat(64), width: 2048, height: 1152,
    license: { id: 'CC0-1.0', commercialUse: true, redistributionAllowed: true,
      provider: 'Poly Haven', sourceUrl: 'https://polyhaven.com/a/test' }, ...changes };
}
const parse = (rows: unknown[]) => parseStudioCc0Catalog({ schema: 'toonspectrum.asset-delivery.v1', assets: rows });

test('accepts real background dimensions without treating them as surface textures', () => {
  const [asset] = parse([image()]);
  assert.equal(asset.kind, 'background');
  assert.equal(asset.width, 2048);
  assert.equal(studioCc0StyleLabel(asset), '실사 레퍼런스 배경');
});
test('identifies high-resolution transparent props as derivatives', () => {
  const [asset] = parse([image('prop-image', { category: 'rendered-prop', width: 1536, height: 1536 })]);
  assert.match(studioCc0StyleLabel(asset), /3D 원본의 렌더/u);
});
test('Korean and English searches select the same background', () => {
  const catalog = parse([image()]);
  for (const query of ['골목', '거리', 'Alley', '골목 alley', '건축']) {
    assert.equal(filterStudioCc0Assets(catalog, query, 'background').length, 1);
  }
  assert.equal(filterStudioCc0Assets(catalog, '골목', 'model').length, 0);
});
test('retains old texture and effect kinds', () => {
  for (const kind of ['surface-texture', 'effect-mask']) assert.equal(parse([image(kind)])[0].kind, kind);
});
test('rejects unknown kinds, MIME aliases, invalid size and excessive decoding', () => {
  for (const row of [image('unknown'), image('background', { path: 'assets/test/test.png' }),
    image('background', { bytes: 17 * 1024 * 1024 }), image('background', { width: 0 }),
    image('background', { width: 10000, height: 10000 }), image('background', { width: 1.5 })]) {
    assert.throws(() => parse([row]), TypeError);
  }
});
test('rejects missing redistribution rights and forged provider origins', () => {
  const base = image();
  assert.throws(() => parse([{ ...base, license: { ...base.license, redistributionAllowed: false } }]), TypeError);
  assert.throws(() => parse([{ ...base, license: { ...base.license, sourceUrl: 'https://polyhaven.com.evil.example/a/test' } }]), TypeError);
});
test('does not weaken 3D render admission while adding image kinds', () => {
  assert.throws(() => parse([image('model', { path: 'assets/test/model.glb' })]), TypeError);
  const [unreviewed] = parse([image('model', { path: 'assets/test/model.glb', browserRenderVerified: true, previewPath: 'previews/test.png' })]);
  assert.equal(curateStudioCc0Selection([unreviewed]).length, 0);
});
test('keeps quarantine effective for the new image kinds', () => {
  const [asset] = parse([image('background', { curationStatus: 'quarantined' })]);
  assert.equal(curateStudioCc0Selection([asset]).length, 0);
});
test('rejects duplicate IDs and unsafe delivery paths', () => {
  assert.throws(() => parse([image(), image()]), TypeError);
  for (const path of ['assets/../test.webp', 'https://example.com/image.webp', 'assets//test.webp']) {
    assert.throws(() => studioCc0AssetUrl(path), TypeError);
  }
});
