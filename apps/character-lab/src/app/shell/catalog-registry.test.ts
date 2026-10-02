import { describe, expect, it } from "vitest";

import { presetEntryFixture, vocabularyCatalogEntries } from "../../testing/recipe-fixtures";

import { CatalogInvariantError, createCatalog, tryCreateCatalog } from "./catalog-registry";

function split() {
  const entries = vocabularyCatalogEntries();
  return {
    appearance: entries.filter((entry) => !["expression", "pose", "hand-pose"].includes(entry.slot)),
    performance: entries.filter((entry) => ["expression", "pose", "hand-pose"].includes(entry.slot)),
  };
}

describe("app/shell/catalog-registry", () => {
  it("외형·연기 프리셋을 병합하고 불변식을 통과한다", () => {
    const sources = split();
    const result = tryCreateCatalog(sources, 0);
    expect(result.ok).toBe(true);
    expect(result.catalog.entries).toHaveLength(sources.appearance.length + sources.performance.length);
    expect(result.catalog.bySlot("hair").length).toBeGreaterThanOrEqual(4);
    expect(result.catalog.get("hair/soft-bob")?.slot).toBe("hair");
  });

  it("중복 id는 실패 목록으로 돌려주고 createCatalog는 throw한다", () => {
    const sources = split();
    const duplicated = { ...sources, appearance: [...sources.appearance, presetEntryFixture("hair/soft-bob")] };
    const result = tryCreateCatalog(duplicated, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures.some((failure) => failure.code === "catalog-id-duplicate")).toBe(true);
    expect(() => createCatalog(duplicated)).toThrow(CatalogInvariantError);
  });

  it("슬롯 최소 개수 미달도 사유로 노출한다", () => {
    const sources = split();
    const result = tryCreateCatalog({ ...sources, performance: [] }, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures.map((failure) => failure.code)).toContain("catalog-slot-min");
  });
});
