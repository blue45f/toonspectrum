/**
 * 렌더 패스 식별자. 캡처 요청은 이 중 일부를 요구하고, 엔진은 요청한 패스만 돌려준다.
 */
export const RENDER_PASS_IDS = ["flat", "lit", "normal", "depth", "part-id", "material-id"] as const;
export type RenderPassId = (typeof RENDER_PASS_IDS)[number];

/** depth를 제외한 래스터 패스 */
export type RasterPassId = Exclude<RenderPassId, "depth">;

export const RENDER_PASS_LABELS_KO: Readonly<Record<RenderPassId, string>> = {
  flat: "밑색",
  lit: "조명",
  normal: "법선",
  depth: "깊이",
  "part-id": "부위 ID",
  "material-id": "재질 ID",
};

const PASS_SET: ReadonlySet<string> = new Set(RENDER_PASS_IDS);

export function isRenderPassId(value: string): value is RenderPassId {
  return PASS_SET.has(value);
}

/** ID 패스 인코딩: R = partId & 255, G = partId >> 8, B = materialId, A = 255 */
export function encodeIdPixel(partId: number, materialId: number): readonly [number, number, number, number] {
  return [partId & 255, (partId >> 8) & 255, materialId & 255, 255];
}

export function decodeIdPixel(r: number, g: number, b: number): { partId: number; materialId: number } {
  return { partId: r | (g << 8), materialId: b };
}
