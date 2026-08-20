import { describe, it, expect } from "vitest";

import {
  applyStudioLayerBorderEffect,
  type StudioLayerBorderEffectSettings,
} from "./studio-layer-border-effect";

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  } as any;
}

describe('StudioLayerBorderEffect', () => {
  it('returns identity if disabled or thickness 0', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    const img = new ImageData(data, 4, 4);
    const settings: StudioLayerBorderEffectSettings = {
      enabled: false,
      thickness: 2,
      color: '#ff0000',
      type: 'outer'
    };
    const res = applyStudioLayerBorderEffect(img, settings);
    expect(res.data).toEqual(img.data);
    expect(res).not.toBe(img);
  });

  it('applies outer border', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    // 1 pixel in center
    data[(1 * 4 + 1) * 4 + 3] = 255; 
    
    const img = new ImageData(data, 4, 4);
    const settings: StudioLayerBorderEffectSettings = {
      enabled: true,
      thickness: 1,
      color: '#ff0000',
      type: 'outer'
    };
    
    const res = applyStudioLayerBorderEffect(img, settings);
    // The pixel to the right should be red
    const rightPixel = (1 * 4 + 2) * 4;
    expect(res.data[rightPixel]).toBe(255);
    expect(res.data[rightPixel + 1]).toBe(0);
    expect(res.data[rightPixel + 2]).toBe(0);
    expect(res.data[rightPixel + 3]).toBe(255);
  });

  it('applies inner border', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    // Fill 2x2 block in the center (x=1..2, y=1..2)
    for (let y = 1; y < 3; y++) {
      for (let x = 1; x < 3; x++) {
        const idx = (y * 4 + x) * 4;
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 255;
      }
    }
    const img = new ImageData(data, 4, 4);
    const settings: StudioLayerBorderEffectSettings = {
      enabled: true,
      thickness: 1,
      color: '#00ff00',
      type: 'inner'
    };
    
    const res = applyStudioLayerBorderEffect(img, settings);
    // Corner of the block (1,1) should be green (since it touches outside)
    const blockCornerIdx = (1 * 4 + 1) * 4;
    expect(res.data[blockCornerIdx]).toBe(0);
    expect(res.data[blockCornerIdx + 1]).toBe(255);
    expect(res.data[blockCornerIdx + 2]).toBe(0);
    expect(res.data[blockCornerIdx + 3]).toBe(255);
  });
});

