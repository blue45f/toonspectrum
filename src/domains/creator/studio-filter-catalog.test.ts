import { describe, expect, it } from "vitest";

import { STUDIO_ADJUSTMENT_ENGINE_IDS } from "./studio-adjustment-stack";
import {
  STUDIO_FILTER_CATALOG,
  STUDIO_FILTER_GROUP_ORDER,
  searchStudioFilterCatalog,
} from "./studio-filter-catalog";

describe("studio filter catalog", () => {
  it("covers every smart-filter engine exactly once", () => {
    const catalogIds = STUDIO_FILTER_CATALOG.map((entry) => entry.engine);
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect([...catalogIds].sort()).toEqual([...STUDIO_ADJUSTMENT_ENGINE_IDS].sort());
    for (const entry of STUDIO_FILTER_CATALOG) {
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.description.trim().length).toBeGreaterThan(10);
      expect(entry.keywords.length).toBeGreaterThan(0);
      expect(STUDIO_FILTER_GROUP_ORDER).toContain(entry.group);
    }
  });

  it("searches Korean, English aliases, descriptions, and multiple terms locally", () => {
    expect(searchStudioFilterCatalog("감마").map((entry) => entry.engine))
      .toEqual(expect.arrayContaining(["levels", "exposure"]));
    expect(searchStudioFilterCatalog("dilate").map((entry) => entry.engine)).toEqual(["morphology"]);
    expect(searchStudioFilterCatalog("사용자 커널").map((entry) => entry.engine))
      .toEqual(["custom-convolution"]);
    expect(searchStudioFilterCatalog("구름 시드").map((entry) => entry.engine)).toEqual(["clouds"]);
  });

  it("honors an allowed-engine boundary without changing catalog order", () => {
    expect(searchStudioFilterCatalog("", ["clouds", "blur"]).map((entry) => entry.engine))
      .toEqual(["blur", "clouds"]);
  });
});
