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
 * `docOffset`은 문서 버퍼 시작 오프셋(float 단위), `width`·`height`는 문서 px 크기.
 *
 * 캔버스 밖 픽셀은 쓰지 않는다. 폭·높이가 16의 배수가 아니면 마지막 타일 열·행은 일부만 캔버스 안이고, 획 레이어의
 * 타일 데이터(`rasterizeTile`)는 캔버스로 자르지 않아 밖 픽셀에도 값이 있다. 가드가 없으면 `px >= width` 픽셀이
 * 문서 버퍼에서 다음 행의 x = px − width 위치로 감겨 들어가 왼쪽 가장자리를 오염시키고(`py >= height`는 버퍼 뒤쪽
 * 영역을 오염시킨다), GPU `bake_stroke`·`composite_pixel`(캔버스 밖 건너뜀)과 결과가 달라진다.
 */
export function compositeTile(
  doc: Float32Array,
  docOffset: number,
  stroke: Float32Array,
  opacity: number,
  mode: BlendMode,
  width: number,
  height: number,
  tileX: number,
  tileY: number,
): void {
  const op = opacity < 0 ? 0 : opacity > 1 ? 1 : opacity;
  const x0 = tileX * TILE_SIZE;
  const y0 = tileY * TILE_SIZE;
  // 부분 타일은 캔버스 안쪽 행·열만 순회한다(타일이 통째로 밖이면 상한이 0 이하라 루프가 돌지 않는다).
  const lyEnd = Math.min(TILE_SIZE, height - y0);
  const lxEnd = Math.min(TILE_SIZE, width - x0);
  for (let ly = 0; ly < lyEnd; ly += 1) {
    const py = y0 + ly;
    for (let lx = 0; lx < lxEnd; lx += 1) {
      const px = x0 + lx;
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
