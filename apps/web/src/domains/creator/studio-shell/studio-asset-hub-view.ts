export const ASSET_HUB_VIEWS = [
  "overview",
  "series-kit",
  "library",
  "market",
  "safety",
  "seller",
] as const;

export type AssetHubView = (typeof ASSET_HUB_VIEWS)[number];

/** Resolve a user-supplied query value without allowing unknown asset-hub surfaces. */
export function resolveStudioAssetHubView(value: string | null): AssetHubView {
  return ASSET_HUB_VIEWS.includes(value as AssetHubView)
    ? value as AssetHubView
    : "overview";
}
