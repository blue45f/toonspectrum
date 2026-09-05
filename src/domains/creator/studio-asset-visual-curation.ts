/** Selection-only curation. Never deletes a file or rewrites a saved user work. */
export interface StudioAssetCurationDecision {
  readonly id: string;
  readonly disposition: "quarantine" | "variant";
  readonly reason: string;
  readonly canonicalId?: string;
}

const ROTATED_MASKS = [
  "flame-05", "flame-06",
  "muzzle-01", "muzzle-02", "muzzle-03", "muzzle-04", "muzzle-05",
  "spark-05", "spark-06",
  "trace-01", "trace-02", "trace-03", "trace-04", "trace-05", "trace-06", "trace-07",
] as const;

export const STUDIO_ASSET_VISUAL_CURATION: readonly StudioAssetCurationDecision[] = Object.freeze([
  Object.freeze({
    id: "kenney-food-glass-wine",
    disposition: "quarantine" as const,
    reason: "실제 미리보기에서 검은 점무늬 렌더링 결함 확인. 원본 파일과 기존 작품 참조는 유지합니다.",
  }),
  ...ROTATED_MASKS.map(name => Object.freeze({
    id: `kenney-particles-${name}-rotated`,
    disposition: "variant" as const,
    canonicalId: `kenney-particles-${name}`,
    reason: "회전 파생본은 독립 원본으로 중복 노출하지 않습니다. 원본을 회전해서 사용하며 기존 URL은 유지합니다.",
  })),
]);

const DECISIONS = new Map(STUDIO_ASSET_VISUAL_CURATION.map(decision => [decision.id, decision]));

export function getStudioAssetCurationDecision(id: string): StudioAssetCurationDecision | undefined {
  return DECISIONS.get(id);
}

export function selectStudioCuratedAssets<T extends { readonly id: string }>(assets: readonly T[]): readonly T[] {
  return Object.freeze(assets.filter(asset => !DECISIONS.has(asset.id)));
}

/** Only for repository-authored props. This is not an SVG sanitizer for uploads. */
export function removeTrustedStarterBackdrop(body: string, width: number, height: number): string {
  for (const fill of ["#f5efe4", "#272836"]) {
    const backdrop = `<rect width="${width}" height="${height}" fill="${fill}"/>`;
    if (body.startsWith(backdrop)) return body.slice(backdrop.length);
  }
  return body;
}

/** Deterministic stratified scatter avoids the previous correlated diagonal bands. */
export function createStarterDotPositions(count: number, width: number, height: number, seed: string): readonly (readonly [number, number])[] {
  if (!Number.isInteger(count) || count < 0 || count > 5000 || !Number.isFinite(width) || !Number.isFinite(height)
    || width <= 40 || height <= 40) throw new RangeError("Invalid trusted starter scatter dimensions");
  if (count === 0) return [];
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  function random(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  const columns = Math.ceil(Math.sqrt(count * width / height));
  const rows = Math.ceil(count / columns);
  const cellWidth = (width - 40) / columns;
  const cellHeight = (height - 40) / rows;
  return Object.freeze(Array.from({length: count}, (_, index) => Object.freeze([
    Number((20 + ((index % columns) + 0.25 + random() * 0.5) * cellWidth).toFixed(2)),
    Number((20 + (Math.floor(index / columns) + 0.25 + random() * 0.5) * cellHeight).toFixed(2)),
  ] as const)));
}
