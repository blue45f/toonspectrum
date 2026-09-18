import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CREATOR_MARKETPLACE_GPT25_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-gpt25-starter.generated";

import { GENERATED_GPT25_ASSET_METADATA } from "./studio-2d-generated-backgrounds";
import {
  createStudioMarketplaceImageRecord,
  findStudioMarketplaceImageAsset,
} from "./studio-marketplace-assets";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reviewed GPT25 marketplace assets", () => {
  it("resolves every reviewed background only through the gpt25 trusted namespace", () => {
    expect(GENERATED_GPT25_ASSET_METADATA).toHaveLength(20);
    for (const asset of GENERATED_GPT25_ASSET_METADATA) {
      expect(findStudioMarketplaceImageAsset(`gpt25/${asset.id}`)).toBe(asset);
    }
    expect(findStudioMarketplaceImageAsset("gpt25/not-registered")).toBeNull();

    const runtimeRefs = CREATOR_MARKETPLACE_GPT25_STARTER_RECORDS.map((record) => {
      const [entry] = record.entries;
      return entry?.delivery.mode === "builtin-ref" ? entry.delivery.runtimeRef : null;
    });
    expect(runtimeRefs).toEqual(
      GENERATED_GPT25_ASSET_METADATA.map((asset) => `studio-asset:gpt25/${asset.id}`),
    );
  });

  it("verifies bytes, sha256 and decoded dimensions before returning an insertable Studio asset", async () => {
    const asset = GENERATED_GPT25_ASSET_METADATA[0]!;
    const bytes = readFileSync(new URL(`../../../public${asset.src}`, import.meta.url));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { "content-length": String(bytes.byteLength) },
    })));
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({
      width: asset.width,
      height: asset.height,
      close: vi.fn(),
    })));

    const record = await createStudioMarketplaceImageRecord(asset);
    expect(record).toMatchObject({
      id: `gpt25:${asset.id}`,
      name: asset.title,
      width: 1152,
      height: 2048,
      kind: "ai",
      contentHash: `sha256:${asset.sha256}`,
      rights: {
        sourceKind: "ai-generated",
        sourceId: asset.id,
        rightsConfirmed: true,
        attributionRequired: false,
      },
    });
    expect(record.dataUrl).toMatch(/^data:image\/png;base64,/u);
  });
});
