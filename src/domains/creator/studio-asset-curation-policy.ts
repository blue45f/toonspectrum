/** Selection policy only. Historic IDs, original bytes and saved works stay intact. */
export const STUDIO_CC0_ROTATED_VARIANTS: Readonly<Record<string, string>> = Object.freeze({
  "kenney-particles-flame-05-rotated": "kenney-particles-flame-05",
  "kenney-particles-flame-06-rotated": "kenney-particles-flame-06",
  "kenney-particles-muzzle-01-rotated": "kenney-particles-muzzle-01",
  "kenney-particles-muzzle-02-rotated": "kenney-particles-muzzle-02",
  "kenney-particles-muzzle-03-rotated": "kenney-particles-muzzle-03",
  "kenney-particles-muzzle-04-rotated": "kenney-particles-muzzle-04",
  "kenney-particles-muzzle-05-rotated": "kenney-particles-muzzle-05",
  "kenney-particles-side-01-rotated": "kenney-particles-side-01",
  "kenney-particles-side-02-rotated": "kenney-particles-side-02",
  "kenney-particles-side-03-rotated": "kenney-particles-side-03",
  "kenney-particles-trace-06-rotated": "kenney-particles-trace-06",
  "kenney-particles-trace-07-rotated": "kenney-particles-trace-07",
});

export const STUDIO_CC0_QUARANTINE_REASONS: Readonly<Record<string, string>> = Object.freeze({
  "kenney-food-glass-wine": "투명 표면의 불규칙한 검은 반점·경계 노이즈: 새 배치에서 제외, 기존 참조 유지",
  "polyhaven-wine-bottles-01": "유리 표면에 과도한 흰색·검은색 얼룩: 렌더 호환성을 재검토할 때까지 새 배치 제외",
});

export const STUDIO_RETIRED_ATMOSPHERE_IDS: readonly string[] = Object.freeze([
  "original-golden-dust",
  "original-night-bokeh",
  "original-soft-snow-overlay",
  "original-layered-fog-overlay",
]);

export function isStudioCc0AssetSelectable(id: string): boolean {
  return !Object.hasOwn(STUDIO_CC0_ROTATED_VARIANTS, id)
    && !Object.hasOwn(STUDIO_CC0_QUARANTINE_REASONS, id);
}

export function getStudioCc0StyleLabel(asset: { readonly kind: string; readonly provider: string }): string {
  if (asset.kind === "surface-texture") return "PBR 표면 재질";
  if (asset.kind === "effect-mask") return "투명 효과 마스크";
  return asset.provider === "Poly Haven" ? "텍스처 포함 PBR 모델" : "스타일화 로우폴리";
}
