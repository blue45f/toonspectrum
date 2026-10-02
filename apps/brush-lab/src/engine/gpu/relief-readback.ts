import { IMPASTO_LIGHT, IMPASTO_RELIEF_GAIN, IMPASTO_SPECULAR } from "../raster/reference-renderer";
import { impastoLighting, impastoSpecular, impastoSpecularFlat } from "../wet/impasto";
import { WET_CH } from "../wet/state";

import { SLOT_NONE, SLOT_RESERVED, WET_FLOATS_PER_TILE } from "./layout";

/**
 * GPU `readbackLinear()`용 호스트 보조: 습식 풀 height 채널을 문서 크기 배열로 모으고(CPU `Surface.heightMap` 미러),
 * 표시 시점 릴리프 조명(CPU `Surface.displayDocument` 미러)을 적용한다. GPU 문서 버퍼는 임파스토 높이를 굽지 않고
 * composite 패스가 표시 시점에만 조명하므로, CPU `toLinear()`와 같은 값을 얻으려면 같은 조명을 호스트에서 한 번 더 적용해야 한다.
 * (present 텍스처 `readbackImage()`는 composite가 이미 조명한 값이다.)
 */
const TILE = 16;
const TILE_PIXELS = TILE * TILE;

/**
 * 습식 코어 풀(앞 `usedSlots`개 슬롯, 1벌)과 슬롯 표에서 높이 맵을 만든다. 미할당·예약 타일은 0.
 * `pool`은 슬롯 s의 height 채널이 `s·WET_FLOATS_PER_TILE + WET_CH_HEIGHT·TILE_PIXELS` 위치에 있는 배열이다.
 */
export function heightMapFromWetPool(slots: Uint32Array, pool: Float32Array, usedSlots: number, width: number, height: number, tilesX: number): Float32Array {
  const out = new Float32Array(width * height);
  const tilesY = Math.ceil(height / TILE);
  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const slot = slots[ty * tilesX + tx] ?? SLOT_NONE;
      if (slot === SLOT_NONE || slot === SLOT_RESERVED || slot >= usedSlots) continue;
      const base = slot * WET_FLOATS_PER_TILE + WET_CH.height * TILE_PIXELS;
      for (let ly = 0; ly < TILE; ly += 1) {
        const py = ty * TILE + ly;
        if (py >= height) continue;
        for (let lx = 0; lx < TILE; lx += 1) {
          const px = tx * TILE + lx;
          if (px >= width) continue;
          out[py * width + px] = pool[base + ly * TILE + lx] ?? 0;
        }
      }
    }
  }
  return out;
}

/**
 * 임파스토 릴리프 조명(램버트 배율 + Blinn-Phong 하이라이트, 베타)을 선형 premultiplied 문서 복사본에 적용한다.
 * `Surface.displayDocument`와 같은 식·f32 연산 순서이며(`relief-readback.test.ts`가 CPU 표면과 대조한다),
 * 높이 ≤ 0 픽셀은 그대로 둔다. 채널은 premultiplied 불변식(rgb ≤ alpha)을 지키도록 [0, alpha]에 클램프한다.
 */
export function applyReliefLighting(document: Float32Array, heightMap: Float32Array, width: number): Float32Array {
  const lit = impastoLighting(heightMap, width, IMPASTO_LIGHT, IMPASTO_RELIEF_GAIN);
  const spec = impastoSpecular(heightMap, width, IMPASTO_LIGHT, IMPASTO_RELIEF_GAIN);
  const specFlat = impastoSpecularFlat(IMPASTO_LIGHT);
  const ll = Math.hypot(IMPASTO_LIGHT[0], IMPASTO_LIGHT[1], IMPASTO_LIGHT[2]);
  const flat = IMPASTO_LIGHT[2] / ll;
  const doc = new Float32Array(document);
  for (let i = 0; i < heightMap.length; i += 1) {
    if ((heightMap[i] ?? 0) <= 0) continue;
    const factor = Math.fround(Math.min(1.5, (lit[i] ?? flat) / flat));
    const o = i * 4;
    const alpha = doc[o + 3] ?? 0;
    const highlight = Math.fround(IMPASTO_SPECULAR * Math.max(0, (spec[i] ?? specFlat) - specFlat) * alpha);
    for (let c = 0; c < 3; c += 1) {
      const v = Math.fround((doc[o + c] ?? 0) * factor + highlight);
      doc[o + c] = v < 0 ? 0 : v > alpha ? alpha : v;
    }
  }
  return doc;
}
