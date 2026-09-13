import { describe, expect, it } from "vitest";

import {
  MARKET_RESOURCE_FAMILIES,
  marketResourceBrowseHref,
} from "./market-resource-taxonomy";

describe("market-resource-taxonomy", () => {
  it("does not deep-link template niches that the public catalog cannot fill", () => {
    const templates = MARKET_RESOURCE_FAMILIES.find((family) => family.id === "template");
    expect(templates).toBeDefined();
    for (const subcategory of templates!.subcategories) {
      expect(subcategory.kind).toBe("template");
      expect(subcategory.tag).toBeUndefined();
      expect(marketResourceBrowseHref(subcategory)).toBe("/market/browse?kind=template");
      expect(subcategory.tag).not.toBe("회차");
    }
  });

  it("keeps 2d/3d discovery on tags present in the live public catalog", () => {
    const twoD = MARKET_RESOURCE_FAMILIES.find((family) => family.id === "2d")!;
    const threeD = MARKET_RESOURCE_FAMILIES.find((family) => family.id === "3d")!;
    const twoDTags = twoD.subcategories.map((item) => item.tag).filter(Boolean);
    const threeDTags = threeD.subcategories.map((item) => item.tag).filter(Boolean);
    expect(twoDTags).toEqual(expect.arrayContaining(["배경", "소품", "학교"]));
    expect(threeDTags).toEqual(expect.arrayContaining(["소품", "3D"]));
    expect(twoDTags).not.toContain("오버레이");
    expect(threeDTags).not.toContain("인체");
  });
});
