import { TILE_SIZE } from "./tile-binning";

/** 획 레이어 → 문서 합성 모드. */
export type BlendMode = "normal" | "multiply" | "erase" | "max";

export const BLEND_MODES: readonly BlendMode[] = ["normal", "multiply", "erase", "max"];

const f = Math.fround;

/**
 * 타일 1개(16×16)를 문서에 합성한다. 모두 선형 premultiplied f32.
 * - normal: doc = over(stroke × opacity, doc)
 * - multiply: 색은 곱, 알파는 over
 * - erase: doc.a·rgb × (1 − stroke.a × opacity)
 * - max: 채널별 max(획 알파 상한 비교용)
 * `docOffset`은 문서 버퍼 시작 오프셋(float 단위), `width`는 문서 px 폭.
 */
export function compositeTile(
  doc: Float32Array,
  docOffset: number,
  stroke: Float32Array,
  opacity: number,
  mode: BlendMode,
  width: number,
  tileX: number,
  tileY: number,
): void {
  const op = opacity < 0 ? 0 : opacity > 1 ? 1 : opacity;
  for (let ly = 0; ly < TILE_SIZE; ly += 1) {
    const py = tileY * TILE_SIZE + ly;
    for (let lx = 0; lx < TILE_SIZE; lx += 1) {
      const px = tileX * TILE_SIZE + lx;
      const s = (ly * TILE_SIZE + lx) * 4;
      const d = docOffset + (py * width + px) * 4;
      const sr = f((stroke[s] ?? 0) * op);
      const sg = f((stroke[s + 1] ?? 0) * op);
      const sb = f((stroke[s + 2] ?? 0) * op);
      const sa = f((stroke[s + 3] ?? 0) * op);
      const dr = doc[d] ?? 0;
      const dg = doc[d + 1] ?? 0;
      const db = doc[d + 2] ?? 0;
      const da = doc[d + 3] ?? 0;
      switch (mode) {
        case "normal": {
          const k = f(1 - sa);
          doc[d] = f(sr + dr * k);
          doc[d + 1] = f(sg + dg * k);
          doc[d + 2] = f(sb + db * k);
          doc[d + 3] = f(sa + da * k);
          break;
        }
        case "multiply": {
          // premultiplied multiply: result = src·dst + src·(1−da) + dst·(1−sa)
          const k = f(1 - sa);
          const j = f(1 - da);
          doc[d] = f(sr * dr + sr * j + dr * k);
          doc[d + 1] = f(sg * dg + sg * j + dg * k);
          doc[d + 2] = f(sb * db + sb * j + db * k);
          doc[d + 3] = f(sa + da * k);
          break;
        }
        case "erase": {
          const k = f(1 - sa);
          doc[d] = f(dr * k);
          doc[d + 1] = f(dg * k);
          doc[d + 2] = f(db * k);
          doc[d + 3] = f(da * k);
          break;
        }
        case "max": {
          doc[d] = Math.max(dr, sr);
          doc[d + 1] = Math.max(dg, sg);
          doc[d + 2] = Math.max(db, sb);
          doc[d + 3] = Math.max(da, sa);
          break;
        }
      }
    }
  }
}
