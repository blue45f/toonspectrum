import { describe, expect, it } from "vitest";

import { presetEntryFixture, vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { catalogInvariants, createPresetCatalog } from "./catalog";

describe("contracts/catalog", () => {
  it("어휘 전체 fixture는 불변식을 통과한다", () => {
    const catalog = createPresetCatalog(vocabularyCatalogEntries());
    expect(catalog.entries).toHaveLength(94);
    expect(catalog.bySlot("hair")).toHaveLength(7);
    expect(catalog.get("hair/soft-bob")?.labelKo).toMatch(/[가-힣]/u);
    expect(catalogInvariants(catalog)).toEqual([]);
  });

  it("빈 카탈로그는 슬롯별 최소 개수 위반 15건을 낸다", () => {
    const failures = catalogInvariants(createPresetCatalog([]));
    expect(failures).toHaveLength(15);
    expect(failures.every((f) => f.code === "catalog-slot-min")).toBe(true);
  });

  it("중복 id·어휘 밖 id·슬롯 불일치·자기 충돌·잘못된 requires를 잡는다", () => {
    const entries = vocabularyCatalogEntries();
    entries.push(presetEntryFixture("hair/soft-bob"));
    entries.push(presetEntryFixture("hair/mohawk" as never));
    entries.push({ ...presetEntryFixture("eyes/round"), slot: "hair", id: "eyes/round-x" as never });
    entries.push(presetEntryFixture("nose/small", { conflictsWith: ["nose/small", "nose/missing" as never], requires: ["bogus"] }));
    const codes = catalogInvariants(createPresetCatalog(entries)).map((f) => f.code);
    expect(codes).toContain("catalog-id-duplicate");
    expect(codes).toContain("catalog-id-vocabulary");
    expect(codes).toContain("catalog-slot-mismatch");
    expect(codes).toContain("catalog-conflict-self");
    expect(codes).toContain("catalog-conflict-ref");
    expect(codes).toContain("catalog-requires-format");
  });

  it("포즈 본 이름·손가락 본·쿼터니언 정규화를 검사한다", () => {
    const entries = vocabularyCatalogEntries();
    entries.push(presetEntryFixture("pose/idle", { patch: { pose: { head: [0, 0, 0, 2] } } }));
    entries.push(presetEntryFixture("hand-pose/fist", { patch: { handPose: { left: { leftHand: [0, 0, 0, 1] }, right: {} } } }));
    entries.push(presetEntryFixture("pose/wave", { patch: { pose: { notABone: [0, 0, 0, 1] } as never } }));
    const codes = catalogInvariants(createPresetCatalog(entries)).map((f) => f.code);
    expect(codes).toContain("catalog-quat-normalized");
    expect(codes).toContain("catalog-hand-pose-bone");
    expect(codes).toContain("catalog-pose-bone");
    expect(codes).toContain("catalog-patch-schema");
  });
});
