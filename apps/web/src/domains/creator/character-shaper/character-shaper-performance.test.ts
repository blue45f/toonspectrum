import { describe, expect, it } from "vitest";

import { projectCharacterAxes } from "./character-shaper-axis";
import { characterPoseGroupForOrder, listCharacterPerformanceEntries } from "./character-shaper-performance";

import type { CharacterSlotEntry } from "./character-shaper-contract";

function entry(id: string, slot: CharacterSlotEntry["slot"], order: number, featured = false): CharacterSlotEntry {
  return {
    id, slot, order, featured, label: id, hint: "", tags: [], keywords: [],
    preview: { kind: "glyph", icon: "Eye", caption: "" }, apply: { kind: "none" }, requires: [],
    exportLayer: "none", license: "toonstudio-original",
  };
}

const ENTRIES = [
  entry("expression:neutral", "expression", 0),
  entry("expression:joy", "expression", 1, true),
  entry("expression:sad", "expression", 2, true),
  entry("pose:idle", "pose", 100, true),
  entry("pose:lean", "pose", 101),
  entry("pose:sprint", "pose", 300, true),
  entry("pose:sit", "pose", 400),
  entry("hand-pose:peace", "hand-pose", 0),
  entry("hair:bob", "hair", 0, true),
];

describe("표정·포즈 스트립 목록", () => {
  it("추천 표정을 앞에 두고 카탈로그 순서를 지킨다", () => {
    expect(listCharacterPerformanceEntries(ENTRIES, "expression").map((item) => item.id))
      .toEqual(["expression:joy", "expression:sad", "expression:neutral"]);
  });

  it("포즈는 추천 또는 한 묶음만 보여 준다", () => {
    expect(listCharacterPerformanceEntries(ENTRIES, "pose").map((item) => item.id)).toEqual(["pose:idle", "pose:sprint"]);
    expect(listCharacterPerformanceEntries(ENTRIES, "pose", "daily").map((item) => item.id)).toEqual(["pose:idle", "pose:lean"]);
    expect(listCharacterPerformanceEntries(ENTRIES, "pose", "sitting").map((item) => item.id)).toEqual(["pose:sit"]);
    expect(listCharacterPerformanceEntries(ENTRIES, "hand-pose").map((item) => item.id)).toEqual(["hand-pose:peace"]);
  });

  it("포즈 순서 대역에서 묶음을 찾는다", () => {
    expect(characterPoseGroupForOrder(100)).toBe("daily");
    expect(characterPoseGroupForOrder(199)).toBe("daily");
    expect(characterPoseGroupForOrder(305)).toBe("action");
    expect(characterPoseGroupForOrder(42)).toBeNull();
  });
});

describe("축 방향 표시", () => {
  it("정면 카메라에서는 X가 오른쪽, Y가 위, Z가 카메라 쪽(맨 앞)이다", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const axes = projectCharacterAxes(identity);
    const byAxis = Object.fromEntries(axes.map((item) => [item.axis, item]));
    expect(byAxis.x?.x).toBeGreaterThan(32);
    expect(byAxis.x?.y).toBeCloseTo(32);
    expect(byAxis.y?.y).toBeLessThan(32);
    expect(axes.at(-1)?.axis).toBe("z");
  });

  it("뒤에서 보면 X가 왼쪽으로 뒤집히고 Z가 가장 먼저(뒤에) 그려진다", () => {
    const behind = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
    const axes = projectCharacterAxes(behind);
    expect(axes[0]?.axis).toBe("z");
    expect(axes.find((item) => item.axis === "x")?.x).toBeLessThan(32);
  });
});
