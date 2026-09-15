import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildMarketCc0ReleaseManifests } from "../../../../../../scripts/seed/market-cc0-release-manifests";
import { MarketCc0AssetPreview } from "./MarketCc0AssetPreview";
import { STUDIO_MARKETPLACE_CC0_ASSETS } from "@/domains/creator/studio-marketplace-cc0-catalog.generated";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

const manifests = buildMarketCc0ReleaseManifests();
describe("actual marketplace source previews", () => {
  it.each(manifests)("renders the verified file and download for $name", manifest => {
    const record = manifest as unknown as CreatorMarketplaceResourceRecord;
    const asset = STUDIO_MARKETPLACE_CC0_ASSETS.find(item => item.id === record.entries[0].id)!;
    const html = renderToStaticMarkup(<MarketCc0AssetPreview record={record} />);
    expect(html).toContain(`data-market-cc0-preview="${asset.id}"`);
    expect(html).toContain(`/assets/studio/cc0-20260906/${asset.path}`);
    expect(html).toContain("Poly Haven");
    expect(html).toContain("CC0");
    const compact = renderToStaticMarkup(<MarketCc0AssetPreview record={record} compact />);
    expect(compact).toContain(`/assets/studio/cc0-20260906/${asset.previewPath}`);
    expect(compact).not.toContain("<a ");
  });
  it("does not turn a wrong source or arbitrary entry index into a preview", () => {
    const source = manifests[0] as unknown as CreatorMarketplaceResourceRecord;
    expect(renderToStaticMarkup(<MarketCc0AssetPreview record={{ ...source, license: "toonspectrum-standard" }} />)).toBe("");
    expect(renderToStaticMarkup(<MarketCc0AssetPreview record={source} entryIndex={99} />)).toBe("");
  });
});
