import { describe, expect, it } from "vitest";

import {
  ALL_AVAILABLE_CAPABILITIES,
  ALL_UNAVAILABLE_CAPABILITIES,
  APPEARANCE_SLOT_KINDS,
  CHARACTER_SLOT_KINDS,
  SLOT_GROUPS,
  SLOT_LABELS_KO,
  isPresetId,
  makePresetId,
  presetName,
  presetSlot,
} from "./slots";

describe("contracts/slots", () => {
  it("15슬롯 스냅샷이 SHAPER 구성과 같다", () => {
    expect(CHARACTER_SLOT_KINDS).toEqual([
      "face-shape",
      "eyes",
      "irises",
      "nose",
      "mouth",
      "ears",
      "hair",
      "body",
      "top",
      "bottom",
      "shoes",
      "accessory",
      "expression",
      "pose",
      "hand-pose",
    ]);
  });

  it("모든 슬롯에 한글 라벨이 있다", () => {
    for (const slot of CHARACTER_SLOT_KINDS) {
      expect(SLOT_LABELS_KO[slot]).toMatch(/[가-힣]/u);
    }
  });

  it("그룹 분할이 완전하고 겹치지 않는다", () => {
    const union = [...SLOT_GROUPS.identity, ...SLOT_GROUPS.figure, ...SLOT_GROUPS.performance];
    expect(new Set(union).size).toBe(union.length);
    expect([...union].sort()).toEqual([...CHARACTER_SLOT_KINDS].sort());
    expect(APPEARANCE_SLOT_KINDS).toHaveLength(12);
  });

  it("presetSlot·presetName·isPresetId가 형식을 판별한다", () => {
    expect(presetSlot("hair/soft-bob")).toBe("hair");
    expect(presetName("hair/soft-bob")).toBe("soft-bob");
    expect(makePresetId("eyes", "almond")).toBe("eyes/almond");
    expect(isPresetId("hair/soft-bob")).toBe(true);
    expect(isPresetId("unknown/x")).toBe(false);
    expect(isPresetId("hair/")).toBe(false);
    expect(isPresetId("hair/Soft Bob")).toBe(false);
    expect(isPresetId(42)).toBe(false);
    expect(() => presetSlot("nope/x" as never)).toThrow(/어휘 밖/u);
  });

  it("기본 능력 맵은 15슬롯을 모두 덮는다", () => {
    expect(Object.keys(ALL_AVAILABLE_CAPABILITIES)).toHaveLength(15);
    expect(ALL_AVAILABLE_CAPABILITIES.hair.status).toBe("available");
    expect(ALL_UNAVAILABLE_CAPABILITIES.hair.status).toBe("unavailable");
    expect(ALL_UNAVAILABLE_CAPABILITIES.hair.reasonKo).toMatch(/[가-힣]/u);
  });
});
