import { wardrobeFabricById, type WardrobeFabricId } from "./studio-vrm-wardrobe";

/** Enough texels per thread to avoid the 48px/20-cycle aliasing of the old tile. */
export const STUDIO_VRM_GARMENT_WEAVE_SIZE = 256;

/** Tile-periodic height field, not a colour texture. Integer cycles keep repeat seams continuous. */
export function sampleStudioVrmGarmentWeave(fabricId: WardrobeFabricId, u: number, v: number): number {
  const fabric = wardrobeFabricById(fabricId);
  if (!fabric || !Number.isFinite(u) || !Number.isFinite(v) || fabric.weaveStrength <= 0) return 0.5;
  const frequency = Math.max(1, Math.round(fabric.weaveFrequency));
  const tau = Math.PI * 2;
  const warp = Math.sin(u * tau * frequency);
  const weft = Math.sin(v * tau * Math.max(1, frequency - 1));
  const diagonal = fabricId === "denim" ? Math.sin((u + v) * tau * frequency) * 0.55 : 0;
  const knit = fabricId === "knit" ? Math.cos((u - v) * tau * frequency) * 0.38 : 0;
  return Math.max(0, Math.min(1, (128 + warp * 34 + weft * 26 + diagonal * 28 + knit * 28) / 255));
}

/** Calibrate the catalog strength to submillimetre relief for metre-scale character geometry. */
export function studioVrmGarmentWeaveReliefM(fabricId: WardrobeFabricId): number {
  const strength = wardrobeFabricById(fabricId)?.weaveStrength ?? 0;
  return Number.isFinite(strength) ? Math.max(0, Math.min(0.0005, strength * 0.01)) : 0;
}

export function buildStudioVrmGarmentWeaveTile(fabricId: WardrobeFabricId): Uint8Array | null {
  if (studioVrmGarmentWeaveReliefM(fabricId) === 0) return null;
  const size = STUDIO_VRM_GARMENT_WEAVE_SIZE;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      data[y * size + x] = Math.round(sampleStudioVrmGarmentWeave(fabricId, x / size, y / size) * 255);
    }
  }
  return data;
}
