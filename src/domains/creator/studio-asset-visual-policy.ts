/**
 * Selection-only decisions from actual rendered contact sheets and close-ups.
 * A retired asset remains addressable in old documents; this never deletes data.
 * A style label is not a claim that every runtime pose/material combination passed.
 */
export const STUDIO_VISUAL_RETIREMENTS: Readonly<Record<string, string>> = Object.freeze({
  "kenney-food-glass-wine": "실제 렌더에서 유리잔 표면에 심한 점무늬가 보여 신규 선택에서 제외합니다.",
  "original-night-bokeh": "보케의 부드러운 광원 표현 대신 단단한 반복 원형이 두드러져 신규 선택에서 제외합니다.",
  "original-golden-dust": "입자의 반복 배치와 좁은 분포가 두드러져 신규 선택에서 제외합니다.",
  "original-soft-snow-overlay": "눈 입자의 반복 위치가 두드러지고 장면에 자연스럽게 합성하기 어려워 신규 선택에서 제외합니다.",
  "original-layered-fog-overlay": "안개보다 평평한 띠 모양으로 보여 신규 선택에서 제외합니다.",
});

export function isStudioAssetVisuallySelectable(id: string): boolean {
  return !Object.hasOwn(STUDIO_VISUAL_RETIREMENTS, id);
}

export type StudioAssetVisualStyle = "all" | "pbr" | "stylized" | "image";

export function studioAssetVisualStyle(asset: {
  readonly kind: string;
  readonly provider: string;
}): Exclude<StudioAssetVisualStyle, "all"> {
  if (asset.kind !== "model") return "image";
  return asset.provider === "Poly Haven" ? "pbr" : "stylized";
}

export const STUDIO_ASSET_VISUAL_STYLE_LABELS: Readonly<Record<StudioAssetVisualStyle, string>> = Object.freeze({
  all: "모든 스타일",
  pbr: "정밀 PBR 3D",
  stylized: "스타일화 3D",
  image: "효과 · 재질 이미지",
});
