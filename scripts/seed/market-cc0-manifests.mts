import { buildMarketCc0ReleaseManifests } from "./market-cc0-release-manifests";

import type { StudioCc0Asset } from "../../apps/web/src/domains/creator/studio-cc0-asset-delivery";

/** Compatibility export for existing tests and seed callers; canonical release preparation is single-sourced. */
export const MARKET_CC0_MANIFESTS = buildMarketCc0ReleaseManifests();

export function buildMarketCc0Manifest(asset: StudioCc0Asset) {
  const manifest = MARKET_CC0_MANIFESTS.find((candidate) =>
    candidate.entries[0]?.id === asset.id,
  );
  if (!manifest) throw new Error(`등록되지 않은 CC0 마켓 에셋입니다: ${asset.id}`);
  return manifest;
}
