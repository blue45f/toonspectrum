import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { studioMarketplaceCc0EntrySourceMatches } from "./studio-marketplace-cc0-provenance";
import { projectCreatorMarketplaceRecordToAssets, projectCreatorMarketplaceRecordToStudioPack } from "./studio-community-marketplace";
import { MARKET_CC0_MANIFESTS } from "../../../../../scripts/seed/market-cc0-manifests.mjs";
import { recipePreviewData } from "@/domains/market/models/market-preview";
import { CreatorMarketplaceResourceRecordSchema, canonicalizeCreatorMarketplaceJson, creatorMarketplaceJsonByteSize } from "@/shared/lib/creator-marketplace-resource-contract";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

const records = MARKET_CC0_MANIFESTS.map((manifest) => {
  const { rightsConfirmed: _rights, ...publicManifest } = manifest;
  return CreatorMarketplaceResourceRecordSchema.parse({
    ...publicManifest,
    id: randomUUID(),
    manifestHash: createHash("sha256").update(canonicalizeCreatorMarketplaceJson(manifest)).digest("hex"),
    manifestByteSize: creatorMarketplaceJsonByteSize(manifest),
    publisher: { id: "qa", name: "QA", avatar: null },
    createdAt: "2026-09-13T00:00:00.000Z",
    updatedAt: "2026-09-13T00:00:00.000Z",
    isOwner: false,
    access: "free",
  });
});

const invalidSources: readonly {
  name: string;
  change: (record: CreatorMarketplaceResourceRecord) => unknown;
}[] = [
  { name: "different license", change: (record) => ({ ...record, license: "cc-by-4.0" }) },
  { name: "original origin", change: (record) => ({ ...record, provenance: { ...record.provenance, origin: "original" } }) },
  { name: "publisher authorship", change: (record) => ({ ...record, provenance: { ...record.provenance, authoredByPublisher: true } }) },
  { name: "different source", change: (record) => ({ ...record, provenance: { ...record.provenance, sourceUrl: "https://example.com/unrelated" } }) },
  { name: "missing source", change: (record) => ({ ...record, provenance: { ...record.provenance, sourceUrl: undefined } }) },
  { name: "different source license", change: (record) => ({ ...record, provenance: { ...record.provenance, sourceLicenseUrl: "https://creativecommons.org/licenses/by/4.0/" } }) },
];

describe("reconciled market CC0 source identity", () => {
  it.each(records)("preserves the canonical delivery for $name", (record) => {
    expect(studioMarketplaceCc0EntrySourceMatches(record, record.entries[0]!)).toBe(true);
    expect(recipePreviewData(record)).toHaveLength(1);
    if (record.kind === "asset") {
      expect(projectCreatorMarketplaceRecordToAssets(record).assets).toHaveLength(1);
    } else {
      expect(projectCreatorMarketplaceRecordToStudioPack(record).status).toBe("installable");
    }
  });

  it.each(records.flatMap((record) => invalidSources.map(({ name, change }) => ({
    label: `${record.kind} / ${record.name} / ${name}`,
    // Deliberately malformed wire data must be rejected even before a caller applies its schema.
    record: change(record) as CreatorMarketplaceResourceRecord,
  }))))("rejects relabelled preview and installation: $label", ({ record }) => {
    expect(studioMarketplaceCc0EntrySourceMatches(record, record.entries[0]!)).toBe(false);
    expect(recipePreviewData(record)).toBeNull();
    if (record.kind === "asset") {
      const projection = projectCreatorMarketplaceRecordToAssets(record);
      expect(projection.assets).toEqual([]);
      expect(projection.unsupportedCount).toBe(1);
    } else {
      expect(projectCreatorMarketplaceRecordToStudioPack(record).status).toBe("unsupported");
    }
  });

  it.each(records)("rejects a mismatched entry kind for $name", (record) => {
    const entry = { ...record.entries[0]!, kind: record.kind === "asset" ? "3d-asset" as const : "asset" as const };
    expect(studioMarketplaceCc0EntrySourceMatches(record, entry)).toBe(false);
  });
});
