import { describe, expect, it } from "vitest";

import {
  CREATOR_MARKETPLACE_RESOURCE_KINDS,
  CreatorMarketplaceResourceRecordSchema,
} from "./creator-marketplace-resource-contract";
import {
  CREATOR_MARKETPLACE_STARTER_RECORDS,
  filterStarterMarketplaceResources,
  findStarterMarketplaceResourceById,
} from "./creator-marketplace-starter-catalog";

describe("creator-marketplace-starter-catalog", () => {
  it("provides valid starter records that satisfy the strict marketplace record schema", () => {
    expect(CREATOR_MARKETPLACE_STARTER_RECORDS.length).toBeGreaterThanOrEqual(10);
    for (const record of CREATOR_MARKETPLACE_STARTER_RECORDS) {
      expect(() => CreatorMarketplaceResourceRecordSchema.parse(record)).not.toThrow();
    }
  });

  it("covers every single supported resource kind including 3d-asset", () => {
    const coveredKinds = new Set(CREATOR_MARKETPLACE_STARTER_RECORDS.map((r) => r.kind));
    for (const kind of CREATOR_MARKETPLACE_RESOURCE_KINDS) {
      expect(coveredKinds.has(kind)).toBe(true);
    }
  });

  it("filters starter resources by kind, tag, search, and license", () => {
    const assets3d = filterStarterMarketplaceResources({ kind: "3d-asset" });
    expect(assets3d.items.length).toBeGreaterThanOrEqual(2);
    expect(assets3d.items.every((r) => r.kind === "3d-asset")).toBe(true);

    const searched = filterStarterMarketplaceResources({ search: "교실" });
    expect(searched.items.length).toBeGreaterThanOrEqual(1);

    const tagFiltered = filterStarterMarketplaceResources({ tag: "3D" });
    expect(tagFiltered.items.length).toBeGreaterThanOrEqual(2);
  });

  it("ships a diversified reviewed CC0 visual library before example-only fallback records", () => {
    const cc0 = CREATOR_MARKETPLACE_STARTER_RECORDS.filter((record) => record.license === "cc0-1.0");
    expect(cc0).toHaveLength(100);
    expect(new Set(cc0.map((record) => record.kind))).toEqual(new Set(["asset", "3d-asset"]));
    expect(cc0.some((record) => record.tags.includes("배경"))).toBe(true);
    expect(cc0.some((record) => record.tags.includes("2D 소품"))).toBe(true);
    expect(cc0.some((record) => record.tags.includes("3D PBR"))).toBe(true);
    expect(cc0.some((record) => record.tags.includes("재질"))).toBe(true);
    expect(cc0.some((record) => record.tags.includes("연출 효과"))).toBe(true);
    const firstPage = filterStarterMarketplaceResources({ limit: 24 }).items;
    expect(firstPage.filter((record) => record.license === "cc0-1.0")).toHaveLength(24);
    for (const tag of ["배경", "2D 소품", "3D PBR", "재질", "연출 효과"]) {
      expect(firstPage.some((record) => record.tags.includes(tag))).toBe(true);
    }
  });

  it("finds starter resource by ID", () => {
    const first = CREATOR_MARKETPLACE_STARTER_RECORDS[0]!;
    const found = findStarterMarketplaceResourceById(first.id);
    expect(found).toEqual(first);
    expect(findStarterMarketplaceResourceById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
