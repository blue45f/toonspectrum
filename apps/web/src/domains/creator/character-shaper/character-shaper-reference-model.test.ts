import { describe, expect, it } from "vitest";
import { CHARACTER_SLOT_KINDS } from "./character-shaper-contract";
import { CHARACTER_EDIT_CATEGORIES, characterEditCategory, discoverCharacterLibrary } from "./character-shaper-reference-model";
import type { VrmLibraryEntry } from "../vrm/vrm-library";

const model = (id: string, name: string, source: VrmLibraryEntry["source"] = "sample", updatedAt = 0): VrmLibraryEntry =>
  ({ id, name, source, thumbnail: null, createdAt: 0, updatedAt });

describe("참조 디자인의 캐릭터 탐색 모델", () => {
  it("여섯 카테고리에 기존 15개 슬롯을 중복이나 누락 없이 배치한다", () => {
    expect(CHARACTER_EDIT_CATEGORIES).toHaveLength(6);
    const slots = CHARACTER_EDIT_CATEGORIES.flatMap((category) => [...category.slots]);
    expect(slots.toSorted()).toEqual([...CHARACTER_SLOT_KINDS].sort());
    for (const slot of CHARACTER_SLOT_KINDS) expect(characterEditCategory(slot).slots).toContain(slot);
  });
  it("내 캐릭터를 먼저, 검증된 번들 캐릭터를 지정 순서로 보여준다", () => {
    const entries = [model("other", "기타"), model("avatar-b", "세라"), model("sample-vrm", "루미"), model("custom", "내 모델", "sqlite-opfs", 2)];
    expect(discoverCharacterLibrary(entries, "", "all").map((entry) => entry.id)).toEqual(["custom", "sample-vrm", "avatar-b", "other"]);
    expect(entries[0]?.id).toBe("other");
  });
  it("내 캐릭터 필터와 정규화된 이름 검색을 함께 적용한다", () => {
    const entries = [model("a", "Ａｌｉｃｅ", "memory"), model("b", "Alice"), model("c", "루미", "sqlite-opfs")];
    expect(discoverCharacterLibrary(entries, " alice ", "mine").map((entry) => entry.id)).toEqual(["a"]);
    expect(discoverCharacterLibrary(entries, "없는 이름", "all")).toEqual([]);
  });
  it("입력 목록에 없는 캐릭터나 차단된 원본 카탈로그를 보충하지 않는다", () => {
    expect(discoverCharacterLibrary([], "", "all")).toEqual([]);
    expect(discoverCharacterLibrary([model("avatar-b", "세라")], "", "all")).toHaveLength(1);
  });
});
