import { describe, expect, it } from "vitest";

import {
  buildLayerTree,
  createLayerGroup,
  emptyGroupIds,
  findGroup,
  groupItems,
  groupOfItem,
  isEffectivelyHidden,
  isEffectivelyLocked,
  itemBelowId,
  setItemGroup,
  ungroupItems,
  type LayerGroup,
  type LayerItemLike,
} from "./studio-layers";

// 테스트용 z-order 배열 빌더(인덱스 0=BACK … 마지막=FRONT). 각 id는 동명 요소.
function makeItems(spec: Array<string | LayerItemLike>): LayerItemLike[] {
  return spec.map((s) => (typeof s === "string" ? { id: s } : s));
}

// 배열 요소를 id로 매핑(순서 검증용).
function ids(items: LayerItemLike[]): string[] {
  return items.map((i) => i.id);
}

// 그룹 멤버 id → groupId 매핑(검증용).
function groupIdOf(items: LayerItemLike[], id: string): string | undefined {
  return items.find((i) => i.id === id)?.groupId;
}

describe("createLayerGroup", () => {
  it("creates an expanded, visible, unlocked group with id/name", () => {
    expect(createLayerGroup("g1", "배경")).toEqual({
      id: "g1",
      name: "배경",
      collapsed: false,
      hidden: false,
      locked: false,
    });
  });

  it("returns a fresh object each call", () => {
    expect(createLayerGroup("g1", "a")).not.toBe(createLayerGroup("g1", "a"));
  });
});

describe("findGroup", () => {
  const groups: LayerGroup[] = [createLayerGroup("g1", "back"), createLayerGroup("g2", "front")];

  it("finds an existing group by id", () => {
    expect(findGroup(groups, "g2")).toBe(groups[1]);
  });

  it("returns null for a missing id", () => {
    expect(findGroup(groups, "nope")).toBeNull();
  });

  it("returns null for undefined/null groupId", () => {
    expect(findGroup(groups, undefined)).toBeNull();
    expect(findGroup(groups, null)).toBeNull();
  });

  it("returns null when there are no groups", () => {
    expect(findGroup([], "g1")).toBeNull();
  });
});

describe("groupOfItem", () => {
  const groups: LayerGroup[] = [createLayerGroup("g1", "a")];

  it("returns the group an item belongs to", () => {
    expect(groupOfItem({ id: "x", groupId: "g1" }, groups)).toBe(groups[0]);
  });

  it("returns null for an item with no groupId", () => {
    expect(groupOfItem({ id: "x" }, groups)).toBeNull();
  });

  it("returns null for an item with an unknown groupId", () => {
    expect(groupOfItem({ id: "x", groupId: "ghost" }, groups)).toBeNull();
  });
});

describe("groupItems", () => {
  it("moves members together to the frontmost member's slot (spec'd [a,b,c,d,e]+[b,d])", () => {
    const input = makeItems(["a", "b", "c", "d", "e"]);
    const out = groupItems(input, ["b", "d"], "g");
    // b,d 를 d 자리로 모음 → [a, c, b, d, e]. b가 d보다 앞(순서 보존).
    expect(ids(out)).toEqual(["a", "c", "b", "d", "e"]);
    // 멤버에 groupId 설정.
    expect(groupIdOf(out, "b")).toBe("g");
    expect(groupIdOf(out, "d")).toBe("g");
    // 비멤버는 groupId 없음.
    expect(groupIdOf(out, "a")).toBeUndefined();
    expect(groupIdOf(out, "c")).toBeUndefined();
    expect(groupIdOf(out, "e")).toBeUndefined();
  });

  it("keeps already-contiguous members in place and tags them", () => {
    const input = makeItems(["a", "b", "c", "d"]);
    const out = groupItems(input, ["b", "c"], "g");
    expect(ids(out)).toEqual(["a", "b", "c", "d"]);
    expect(groupIdOf(out, "b")).toBe("g");
    expect(groupIdOf(out, "c")).toBe("g");
  });

  it("grouping all ids preserves the whole order and tags everything", () => {
    const input = makeItems(["a", "b", "c"]);
    const out = groupItems(input, ["a", "b", "c"], "g");
    expect(ids(out)).toEqual(["a", "b", "c"]);
    for (const id of ["a", "b", "c"]) expect(groupIdOf(out, id)).toBe("g");
  });

  it("ignores ids that do not exist", () => {
    const input = makeItems(["a", "b", "c", "d", "e"]);
    const out = groupItems(input, ["b", "ghost", "d"], "g");
    // 존재하지 않는 ghost 는 무시 — [a,b,d]+["b","d"] 와 동일 결과.
    expect(ids(out)).toEqual(["a", "c", "b", "d", "e"]);
    expect(groupIdOf(out, "b")).toBe("g");
    expect(groupIdOf(out, "d")).toBe("g");
  });

  it("returns a copy (no members matched) when ids are all unknown", () => {
    const input = makeItems(["a", "b"]);
    const out = groupItems(input, ["ghost"], "g");
    expect(out).not.toBe(input);
    expect(ids(out)).toEqual(["a", "b"]);
    expect(groupIdOf(out, "a")).toBeUndefined();
  });

  it("handles a single id (sets groupId, position unchanged)", () => {
    const input = makeItems(["a", "b", "c"]);
    const out = groupItems(input, ["b"], "g");
    expect(ids(out)).toEqual(["a", "b", "c"]);
    expect(groupIdOf(out, "b")).toBe("g");
  });

  it("moves a back member up to a frontmost member ([a,b,c,d,e]+[a,c,e])", () => {
    const input = makeItems(["a", "b", "c", "d", "e"]);
    const out = groupItems(input, ["a", "c", "e"], "g");
    // 멤버 a,c,e 를 e 자리로 모음, 순서 보존 → 비멤버 b,d 먼저, 그 뒤 a,c,e.
    expect(ids(out)).toEqual(["b", "d", "a", "c", "e"]);
    for (const id of ["a", "c", "e"]) expect(groupIdOf(out, id)).toBe("g");
  });

  it("does NOT mutate the input array or its objects (deep check)", () => {
    const input = makeItems(["a", "b", "c", "d", "e"]);
    const snapshotIds = ids(input);
    const objA = input[0]!;
    const objB = input[1]!;
    const out = groupItems(input, ["b", "d"], "g");
    expect(out).not.toBe(input);
    // 원본 순서 유지.
    expect(ids(input)).toEqual(snapshotIds);
    // 원본 객체 그대로(groupId가 박히지 않음).
    expect(input[0]).toBe(objA);
    expect(input[1]).toBe(objB);
    expect(objB.groupId).toBeUndefined();
    // 바뀐 멤버는 새 객체.
    expect(out.find((i) => i.id === "b")).not.toBe(objB);
    // 바뀌지 않은 비멤버는 동일 참조.
    expect(out.find((i) => i.id === "a")).toBe(objA);
  });
});

describe("ungroupItems", () => {
  it("clears groupId for the named group and leaves others untouched", () => {
    const input = makeItems([
      { id: "a", groupId: "g1" },
      { id: "b", groupId: "g1" },
      { id: "c", groupId: "g2" },
      { id: "d" },
    ]);
    const out = ungroupItems(input, "g1");
    expect(groupIdOf(out, "a")).toBeUndefined();
    expect(groupIdOf(out, "b")).toBeUndefined();
    // 다른 그룹/무그룹은 그대로.
    expect(groupIdOf(out, "c")).toBe("g2");
    expect(groupIdOf(out, "d")).toBeUndefined();
  });

  it("keeps positions unchanged", () => {
    const input = makeItems([
      { id: "a", groupId: "g1" },
      { id: "b" },
      { id: "c", groupId: "g1" },
    ]);
    const out = ungroupItems(input, "g1");
    expect(ids(out)).toEqual(["a", "b", "c"]);
  });

  it("is immutable: new array, changed-only new objects, unchanged identity kept", () => {
    const objA: LayerItemLike = { id: "a", groupId: "g1" };
    const objB: LayerItemLike = { id: "b", groupId: "g2" };
    const input = [objA, objB];
    const out = ungroupItems(input, "g1");
    expect(out).not.toBe(input);
    // 원본 객체 변형 없음.
    expect(objA.groupId).toBe("g1");
    // 바뀐 a 는 새 객체.
    expect(out[0]).not.toBe(objA);
    // 안 바뀐 b 는 동일 참조.
    expect(out[1]).toBe(objB);
  });

  it("returns an equivalent copy when no item has the group", () => {
    const input = makeItems([{ id: "a", groupId: "g2" }, { id: "b" }]);
    const out = ungroupItems(input, "g1");
    expect(out).not.toBe(input);
    expect(ids(out)).toEqual(["a", "b"]);
    expect(groupIdOf(out, "a")).toBe("g2");
  });
});

describe("setItemGroup", () => {
  it("into an empty group: sets groupId, position unchanged", () => {
    const input = makeItems(["a", "b", "c"]);
    const out = setItemGroup(input, "b", "g");
    expect(ids(out)).toEqual(["a", "b", "c"]);
    expect(groupIdOf(out, "b")).toBe("g");
  });

  it("into an existing group: moves the item adjacent to the group block (contiguous)", () => {
    // a 가 그룹 g, c 를 g 로 옮기면 c 가 a(가장 앞 멤버) 바로 뒤로.
    const input = makeItems([
      { id: "a", groupId: "g" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
    ]);
    const out = setItemGroup(input, "c", "g");
    expect(ids(out)).toEqual(["a", "c", "b", "d"]);
    expect(groupIdOf(out, "c")).toBe("g");
    expect(groupIdOf(out, "a")).toBe("g");
  });

  it("places the moved item after the FRONTMOST existing member", () => {
    // 멤버가 a(0), c(2). b(1)를 g 로 옮기면 가장 앞 멤버 c 뒤로 → [a, c, b, d].
    const input = makeItems([
      { id: "a", groupId: "g" },
      { id: "b" },
      { id: "c", groupId: "g" },
      { id: "d" },
    ]);
    const out = setItemGroup(input, "b", "g");
    expect(ids(out)).toEqual(["a", "c", "b", "d"]);
    expect(groupIdOf(out, "b")).toBe("g");
  });

  it("moving a front item back to a group lands right after its frontmost member", () => {
    // 멤버 a(0). d(3)를 g 로 → a 뒤로 → [a, d, b, c].
    const input = makeItems([
      { id: "a", groupId: "g" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
    ]);
    const out = setItemGroup(input, "d", "g");
    expect(ids(out)).toEqual(["a", "d", "b", "c"]);
    expect(groupIdOf(out, "d")).toBe("g");
  });

  it("to undefined: clears groupId, position kept", () => {
    const input = makeItems([
      { id: "a", groupId: "g" },
      { id: "b", groupId: "g" },
      { id: "c" },
    ]);
    const out = setItemGroup(input, "b", undefined);
    expect(ids(out)).toEqual(["a", "b", "c"]);
    expect(groupIdOf(out, "b")).toBeUndefined();
    // 다른 멤버는 그대로.
    expect(groupIdOf(out, "a")).toBe("g");
  });

  it("returns an equivalent copy when the id does not exist", () => {
    const input = makeItems(["a", "b"]);
    const out = setItemGroup(input, "ghost", "g");
    expect(out).not.toBe(input);
    expect(ids(out)).toEqual(["a", "b"]);
  });

  it("is immutable: new array, original objects untouched", () => {
    const objA: LayerItemLike = { id: "a", groupId: "g" };
    const objC: LayerItemLike = { id: "c" };
    const input = [objA, { id: "b" }, objC, { id: "d" }];
    const out = setItemGroup(input, "c", "g");
    expect(out).not.toBe(input);
    // 원본 순서/객체 유지.
    expect(ids(input)).toEqual(["a", "b", "c", "d"]);
    expect(objC.groupId).toBeUndefined();
    // 옮겨진 c 는 새 객체, 안 옮긴 a 는 동일 참조.
    expect(out.find((i) => i.id === "c")).not.toBe(objC);
    expect(out.find((i) => i.id === "a")).toBe(objA);
  });
});

describe("buildLayerTree", () => {
  const groups: LayerGroup[] = [createLayerGroup("g1", "배경"), createLayerGroup("g2", "인물")];

  it("returns [] for empty input", () => {
    expect(buildLayerTree([], groups)).toEqual([]);
  });

  it("mixes ungrouped items and one contiguous group into the right node sequence", () => {
    // 표시순서: top, [g1, g1], bottom.
    const items = makeItems([
      { id: "top" },
      { id: "m1", groupId: "g1" },
      { id: "m2", groupId: "g1" },
      { id: "bottom" },
    ]);
    const tree = buildLayerTree(items, groups);
    expect(tree).toHaveLength(3);
    expect(tree[0]).toEqual({ kind: "item", item: items[0] });
    expect(tree[1]!.kind).toBe("group");
    const groupNode = tree[1] as { kind: "group"; group: LayerGroup; items: LayerItemLike[] };
    expect(groupNode.group).toBe(groups[0]);
    expect(ids(groupNode.items)).toEqual(["m1", "m2"]);
    expect(tree[2]).toEqual({ kind: "item", item: items[3] });
  });

  it("emits two separate group nodes for two different contiguous groups", () => {
    const items = makeItems([
      { id: "a", groupId: "g1" },
      { id: "b", groupId: "g1" },
      { id: "c", groupId: "g2" },
      { id: "d", groupId: "g2" },
    ]);
    const tree = buildLayerTree(items, groups);
    expect(tree).toHaveLength(2);
    const n0 = tree[0] as { kind: "group"; group: LayerGroup; items: LayerItemLike[] };
    const n1 = tree[1] as { kind: "group"; group: LayerGroup; items: LayerItemLike[] };
    expect(n0.group.id).toBe("g1");
    expect(ids(n0.items)).toEqual(["a", "b"]);
    expect(n1.group.id).toBe("g2");
    expect(ids(n1.items)).toEqual(["c", "d"]);
  });

  it("splits the same group id into two nodes when interrupted by an ungrouped item", () => {
    // 같은 g1 이지만 중간에 무그룹 x 로 끊기면 그룹 노드가 둘로 갈린다.
    const items = makeItems([
      { id: "a", groupId: "g1" },
      { id: "x" },
      { id: "b", groupId: "g1" },
    ]);
    const tree = buildLayerTree(items, groups);
    expect(tree.map((n) => n.kind)).toEqual(["group", "item", "group"]);
  });

  it("treats an unknown groupId as a plain item node", () => {
    const items = makeItems([
      { id: "a" },
      { id: "ghost", groupId: "no-such-group" },
      { id: "b", groupId: "g1" },
    ]);
    const tree = buildLayerTree(items, groups);
    expect(tree[0]).toEqual({ kind: "item", item: items[0] });
    // 알 수 없는 그룹은 item 노드.
    expect(tree[1]).toEqual({ kind: "item", item: items[1] });
    expect(tree[2]!.kind).toBe("group");
  });

  it("groups a single-member group as a one-item group node", () => {
    const items = makeItems([{ id: "only", groupId: "g1" }]);
    const tree = buildLayerTree(items, groups);
    expect(tree).toHaveLength(1);
    const node = tree[0] as { kind: "group"; group: LayerGroup; items: LayerItemLike[] };
    expect(node.kind).toBe("group");
    expect(ids(node.items)).toEqual(["only"]);
  });

  it("preserves the given display order inside a group node", () => {
    const items = makeItems([
      { id: "front", groupId: "g1" },
      { id: "back", groupId: "g1" },
    ]);
    const tree = buildLayerTree(items, groups);
    const node = tree[0] as { kind: "group"; group: LayerGroup; items: LayerItemLike[] };
    expect(ids(node.items)).toEqual(["front", "back"]);
  });
});

describe("isEffectivelyHidden", () => {
  const groups: LayerGroup[] = [
    { id: "vis", name: "v", hidden: false },
    { id: "hid", name: "h", hidden: true },
  ];

  it("is hidden when the item itself is hidden", () => {
    expect(isEffectivelyHidden({ id: "a", hidden: true }, groups)).toBe(true);
  });

  it("is hidden when the group is hidden", () => {
    expect(isEffectivelyHidden({ id: "a", groupId: "hid" }, groups)).toBe(true);
  });

  it("is visible when neither item nor group is hidden", () => {
    expect(isEffectivelyHidden({ id: "a", groupId: "vis" }, groups)).toBe(false);
    expect(isEffectivelyHidden({ id: "a" }, groups)).toBe(false);
  });

  it("is hidden when both item and group are hidden", () => {
    expect(isEffectivelyHidden({ id: "a", hidden: true, groupId: "hid" }, groups)).toBe(true);
  });

  it("ignores an unknown groupId (falls back to item flag only)", () => {
    expect(isEffectivelyHidden({ id: "a", groupId: "ghost" }, groups)).toBe(false);
  });
});

describe("isEffectivelyLocked", () => {
  const groups: LayerGroup[] = [
    { id: "open", name: "o", locked: false },
    { id: "lock", name: "l", locked: true },
  ];

  it("is locked when the item itself is locked", () => {
    expect(isEffectivelyLocked({ id: "a", locked: true }, groups)).toBe(true);
  });

  it("is locked when the group is locked", () => {
    expect(isEffectivelyLocked({ id: "a", groupId: "lock" }, groups)).toBe(true);
  });

  it("is unlocked when neither is locked", () => {
    expect(isEffectivelyLocked({ id: "a", groupId: "open" }, groups)).toBe(false);
    expect(isEffectivelyLocked({ id: "a" }, groups)).toBe(false);
  });

  it("is locked when both item and group are locked", () => {
    expect(isEffectivelyLocked({ id: "a", locked: true, groupId: "lock" }, groups)).toBe(true);
  });
});

describe("emptyGroupIds", () => {
  const groups: LayerGroup[] = [
    createLayerGroup("g1", "a"),
    createLayerGroup("g2", "b"),
    createLayerGroup("g3", "c"),
  ];

  it("lists groups with zero members", () => {
    const items = makeItems([
      { id: "x", groupId: "g1" },
      { id: "y" },
    ]);
    // g2, g3 는 멤버 없음.
    expect(emptyGroupIds(items, groups).sort()).toEqual(["g2", "g3"]);
  });

  it("omits groups that still have members", () => {
    const items = makeItems([
      { id: "x", groupId: "g1" },
      { id: "y", groupId: "g2" },
      { id: "z", groupId: "g3" },
    ]);
    expect(emptyGroupIds(items, groups)).toEqual([]);
  });

  it("returns all group ids when there are no items", () => {
    expect(emptyGroupIds([], groups).sort()).toEqual(["g1", "g2", "g3"]);
  });

  it("returns [] when there are no groups", () => {
    expect(emptyGroupIds(makeItems(["a"]), [])).toEqual([]);
  });
});

describe("itemBelowId", () => {
  const order = ["back", "mid", "front"];

  it("returns the id directly below a middle item", () => {
    expect(itemBelowId(order, "mid")).toBe("back");
    expect(itemBelowId(order, "front")).toBe("mid");
  });

  it("returns null for the bottom (back) item", () => {
    expect(itemBelowId(order, "back")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(itemBelowId(order, "ghost")).toBeNull();
  });

  it("returns null for an empty order array", () => {
    expect(itemBelowId([], "anything")).toBeNull();
  });
});
