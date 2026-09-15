// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  deleteCustomPublishedResource,
  findMergedMarketResourceById,
  getAllMergedMarketResources,
  getCustomPublishedResources,
  saveCustomPublishedResource,
  updateCustomPublishedResource,
} from "./market-custom-registry";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

describe("market-custom-registry", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const sample: CreatorMarketplaceResourceRecord = {
    ...CREATOR_MARKETPLACE_STARTER_RECORDS[0],
    id: "123e4567-e89b-42d3-a456-426614174333",
    name: "테스트용 G펜",
    isOwner: true,
  };

  it("saves, updates, and deletes custom published resource", () => {
    saveCustomPublishedResource(sample);
    const list = getCustomPublishedResources();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("테스트용 G펜");

    // Update
    const updated = updateCustomPublishedResource(sample.id, {
      name: "업데이트된 G펜",
      resourceVersion: "1.1.0",
    });
    expect(updated?.name).toBe("업데이트된 G펜");
    expect(updated?.resourceVersion).toBe("1.1.0");

    // Retrieve via merged finder
    const found = findMergedMarketResourceById(sample.id);
    expect(found?.name).toBe("업데이트된 G펜");

    // Delete
    deleteCustomPublishedResource(sample.id);
    expect(getCustomPublishedResources()).toHaveLength(0);
  });

  it("merges custom resources with starter catalog", () => {
    saveCustomPublishedResource(sample);
    const all = getAllMergedMarketResources();
    expect(all.length).toBeGreaterThan(1);
    expect(all[0].id).toBe(sample.id); // prepended
  });
});
