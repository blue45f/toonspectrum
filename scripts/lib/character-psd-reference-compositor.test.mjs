import { initializeCanvas, readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { buildCharacterSemanticPsd } from '../../apps/web/src/domains/creator/character-shaper/character-shaper-psd-assembly.ts';
import { deriveCharacterShadingLayers } from '../../apps/web/src/domains/creator/character-shaper/character-shaper-image-math.ts';

import { compositeCharacterPsdLayers } from './character-psd-reference-compositor.mjs';

initializeCanvas(() => { throw new Error('No DOM canvas'); }, (width, height) => ({
  width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb',
}));
const pass = (id, pixels) => ({ id, width: pixels.length / 4, height: 1, rgba: new Uint8ClampedArray(pixels) });
async function roundTrip(passes) {
  const { blob } = buildCharacterSemanticPsd(passes, [], { title: 'Actual layer reconstruction' });
  return readPsd(await blob.arrayBuffer(), { useImageData: true, skipCompositeImageData: true });
}
function expectPixels(actual, expected) {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    // Ignore undefined RGB under zero alpha, preserve every alpha byte exactly.
    if (i % 4 !== 3 && expected[i - i % 4 + 3] === 0) continue;
    expect(Math.abs(actual[i] - expected[i]), `channel ${i}: ${actual[i]} != ${expected[i]}`)
      .toBeLessThanOrEqual(i % 4 === 3 ? 0 : 1);
  }
}

describe('independent Character PSD layer recomposition', () => {
  it.each([['normal', 128], ['multiply', 107], ['screen', 149]])(
    'matches hand-calculated W3C source-over %s for two half-covered gray layers', (blendMode, gray) => {
      const imageData = { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 128]) };
      expect([...compositeCharacterPsdLayers({ width: 1, height: 1,
        children: [{ blendMode, imageData }, { imageData }] })]).toEqual([gray, gray, gray, 192]);
    });

  it('uses visible layers rather than the stored merged image and applies isolated group masks once', () => {
    const red = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) };
    const blue = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 255, 255]) };
    const mask = { width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255]) };
    const actual = compositeCharacterPsdLayers({ width: 1, height: 1, imageData: blue,
      children: [{ blendMode: 'normal', mask: { imageData: mask }, children: [{ imageData: red }, { imageData: blue }] }] });
    expect([...actual]).toEqual([255, 0, 0, 128]);
  });

  it('reconstructs darkening, brightening, mixed-channel shading and unequal translucent coverage', async () => {
    const flat = pass('flat', [160, 160, 160, 128, 100, 100, 100, 64, 200, 80, 100, 255, 0, 0, 0, 0]);
    const beauty = pass('beauty', [80, 160, 160, 128, 180, 100, 100, 96, 100, 160, 100, 32, 30, 90, 150, 20]);
    const { shadow, highlight } = deriveCharacterShadingLayers(flat.rgba, beauty.rgba);
    const psd = await roundTrip([flat, beauty, { ...flat, id: 'shadow', rgba: shadow }, { ...flat, id: 'highlight', rgba: highlight }]);
    expect(psd.imageData).toBeUndefined();
    expectPixels(compositeCharacterPsdLayers(psd), beauty.rgba);
    // Real edits must affect the result: the visible stack cannot be a hidden Beauty shortcut.
    const character = psd.children.find((layer) => layer.name === '캐릭터');
    character.children.find((layer) => layer.name === '음영').hidden = true;
    expect([...compositeCharacterPsdLayers(psd).subarray(0, 4)]).toEqual([160, 160, 160, 128]);
  });

  it('retains partial-mask edges, overlapping ownership, unclassified pixels and color boundaries', async () => {
    const flat = pass('flat', [210, 40, 30, 128, 10, 200, 40, 255, 20, 40, 220, 64, 80, 90, 100, 255]);
    const mask = (id, alpha) => pass(id, alpha.flatMap((a) => [255, 255, 255, a]));
    const psd = await roundTrip([flat, { ...flat, id: 'beauty' },
      mask('mask-face', [128, 80, 0, 0]), mask('mask-skin', [128, 100, 0, 0])]);
    expectPixels(compositeCharacterPsdLayers(psd), flat.rgba);
    const parts = psd.children.find((layer) => layer.name === '캐릭터').children[0].children;
    expect(parts.map((layer) => layer.name)).toEqual(['얼굴', '피부', '미분류 영역']);
    parts[0].imageData.data[0] = 50;
    expect(compositeCharacterPsdLayers(psd)[0]).toBe(50);
    expect(compositeCharacterPsdLayers(psd)[8]).toBe(flat.rgba[8]);
  });

  it('round-trips all 256 alpha levels with mixed shading and eight overlapping semantic masks', async () => {
    let seed = 0x19af031;
    const byte = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 24; };
    const flat = pass('flat', Array.from({ length: 256 }, () => [byte(), byte(), byte(), byte()]).flat());
    const beauty = pass('beauty', Array.from({ length: 256 }, (_, alpha) => [byte(), byte(), byte(), alpha]).flat());
    const masks = ['face', 'eyes', 'hair', 'accessory', 'top', 'bottom', 'shoes', 'skin'].map((name) =>
      pass(`mask-${name}`, Array.from({ length: 256 }, () => [255, 255, 255, byte()]).flat()));
    const originals = [flat, beauty, ...masks].map((item) => item.rgba.slice());
    const { shadow, highlight } = deriveCharacterShadingLayers(flat.rgba, beauty.rgba);
    const psd = await roundTrip([flat, beauty, { ...flat, id: 'shadow', rgba: shadow }, { ...flat, id: 'highlight', rgba: highlight }, ...masks]);
    expectPixels(compositeCharacterPsdLayers(psd), beauty.rgba);
    [flat, beauty, ...masks].forEach((item, index) => expect(item.rgba).toEqual(originals[index]));
  });

  it('preserves extracted line and paint for editing without applying their already-baked contribution twice', async () => {
    const beauty = pass('beauty', [80, 100, 120, 128, 140, 80, 30, 255, 0, 0, 0, 0]);
    const line = pass('line', [20, 20, 20, 255, 20, 20, 20, 255, 20, 20, 20, 255]);
    const paint = pass('surface-paint', [240, 10, 20, 255, 240, 10, 20, 255, 240, 10, 20, 255]);
    const psd = await roundTrip([beauty, { ...beauty, id: 'flat' }, line, paint]);
    expectPixels(compositeCharacterPsdLayers(psd), beauty.rgba);
    const hidden = psd.children.filter((layer) => layer.hidden && layer.children);
    expect(hidden).toHaveLength(2);
    expect(hidden.every((layer) => layer.name.includes('추출 참고'))).toBe(true);
    expect(hidden.map((layer) => [...layer.children[0].imageData.data])).toEqual([[...line.rgba], [...paint.rgba]]);
  });
});
