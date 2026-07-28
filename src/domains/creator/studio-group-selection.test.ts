import { describe, expect, it } from "vitest";

import {
  EMPTY_GROUP_SELECTION,
  currentSelectionIds,
  expandSelectionIdsToGroupUnits,
  groupMemberIds,
  planAtomicSelectionAffineTransform,
  planAtomicSelectionTranslation,
  planGroupClickSelection,
  planGroupEnter,
  planGroupEscape,
  resolveClickUnit,
  selectionShapeForIds,
  type GroupSelectionGroupLike,
  type GroupSelectionItemLike,
  type GroupSelectionState,
} from "./studio-group-selection";

// z-order 배열 빌더 — "a" 또는 "a:g1"(그룹) 표기.
function items(spec: string[]): GroupSelectionItemLike[] {
  return spec.map((token) => {
    const [id, groupId] = token.split(":");
    return groupId ? { id: id!, groupId } : { id: id! };
  });
}

function groups(...ids: string[]): GroupSelectionGroupLike[] {
  return ids.map((id) => ({ id }));
}

function single(id: string): GroupSelectionState {
  return { selectedId: id, marqueeIds: [], activeGroupId: null };
}

function multi(ids: string[], activeGroupId: string | null = null): GroupSelectionState {
  return { selectedId: null, marqueeIds: ids, activeGroupId };
}

describe("selectionShapeForIds", () => {
  it("정규화: 0/1/2+ → 없음/단일/마퀴 (내비게이터 규약과 동일)", () => {
    expect(selectionShapeForIds([])).toEqual({ selectedId: null, marqueeIds: [] });
    expect(selectionShapeForIds(["a"])).toEqual({ selectedId: "a", marqueeIds: [] });
    expect(selectionShapeForIds(["a", "b"])).toEqual({ selectedId: null, marqueeIds: ["a", "b"] });
  });

  it("입력 배열을 변형하지 않고 새 배열을 반환한다", () => {
    const src = ["a", "b"];
    const out = selectionShapeForIds(src);
    expect(out.marqueeIds).not.toBe(src);
    expect(src).toEqual(["a", "b"]);
  });
});

describe("currentSelectionIds", () => {
  it("마퀴가 있으면 마퀴, 없으면 단일, 둘 다 없으면 빈 배열", () => {
    expect(currentSelectionIds(multi(["a", "b"]))).toEqual(["a", "b"]);
    expect(currentSelectionIds(single("a"))).toEqual(["a"]);
    expect(currentSelectionIds(EMPTY_GROUP_SELECTION)).toEqual([]);
  });
});

describe("groupMemberIds", () => {
  it("같은 groupId 멤버를 z-order 순서로 모은다", () => {
    const list = items(["a:g1", "b", "c:g1", "d:g1"]);
    expect(groupMemberIds(list, "g1")).toEqual(["a", "c", "d"]);
  });
});

describe("resolveClickUnit", () => {
  const list = items(["a:g1", "b:g1", "c", "d:g2", "e:g2"]);
  const known = new Set(["g1", "g2"]);

  it("그룹 밖에서 그룹 멤버 클릭 → 그룹 전체(진입 해제)", () => {
    expect(resolveClickUnit(list, known, "a", null)).toEqual({
      unit: ["a", "b"],
      nextActiveGroupId: null,
    });
  });

  it("무그룹 요소 클릭 → 단일(진입 해제)", () => {
    expect(resolveClickUnit(list, known, "c", null)).toEqual({
      unit: ["c"],
      nextActiveGroupId: null,
    });
  });

  it("진입 중 그 그룹의 자식 클릭 → 개별 자식(진입 유지)", () => {
    expect(resolveClickUnit(list, known, "b", "g1")).toEqual({
      unit: ["b"],
      nextActiveGroupId: "g1",
    });
  });

  it("진입 중 다른 그룹의 멤버 클릭 → 그 그룹 전체(진입 해제)", () => {
    expect(resolveClickUnit(list, known, "d", "g1")).toEqual({
      unit: ["d", "e"],
      nextActiveGroupId: null,
    });
  });

  it("삭제된(유령) 그룹 참조는 무그룹으로 취급 → 단일", () => {
    const orphan = items(["x:ghost", "y"]);
    expect(resolveClickUnit(orphan, new Set<string>(), "x", null)).toEqual({
      unit: ["x"],
      nextActiveGroupId: null,
    });
  });
});

describe("planGroupClickSelection — 일반 클릭", () => {
  const list = items(["a:g1", "b:g1", "c", "d:g2", "e:g2"]);
  const gs = groups("g1", "g2");

  it("그룹 멤버 클릭 → 그룹 전체를 마퀴로 선택", () => {
    const next = planGroupClickSelection({
      items: list,
      groups: gs,
      clickedId: "a",
      current: EMPTY_GROUP_SELECTION,
    });
    expect(next).toEqual({ selectedId: null, marqueeIds: ["a", "b"], activeGroupId: null });
  });

  it("무그룹 요소 클릭 → 단일 선택", () => {
    const next = planGroupClickSelection({
      items: list,
      groups: gs,
      clickedId: "c",
      current: single("a"),
    });
    expect(next).toEqual({ selectedId: "c", marqueeIds: [], activeGroupId: null });
  });

  it("다른 그룹 멤버 클릭 → 이전 그룹 선택을 대체", () => {
    const next = planGroupClickSelection({
      items: list,
      groups: gs,
      clickedId: "d",
      current: multi(["a", "b"]),
    });
    expect(next).toEqual({ selectedId: null, marqueeIds: ["d", "e"], activeGroupId: null });
  });

  it("진입 중 자식 클릭 → 개별 선택하며 진입 유지", () => {
    const next = planGroupClickSelection({
      items: list,
      groups: gs,
      clickedId: "b",
      current: multi(["a", "b"], "g1"),
    });
    expect(next).toEqual({ selectedId: "b", marqueeIds: [], activeGroupId: "g1" });
  });

  it("단일 요소만 있는 그룹은 단일 선택으로 정규화된다", () => {
    const solo = items(["a:g1", "b"]);
    const next = planGroupClickSelection({
      items: solo,
      groups: groups("g1"),
      clickedId: "a",
      current: EMPTY_GROUP_SELECTION,
    });
    expect(next).toEqual({ selectedId: "a", marqueeIds: [], activeGroupId: null });
  });
});

describe("planGroupClickSelection — Shift 가산", () => {
  const list = items(["a:g1", "b:g1", "c", "d:g2", "e:g2"]);
  const gs = groups("g1", "g2");

  it("그룹 단위로 추가(z-order 유지)", () => {
    const next = planGroupClickSelection({
      items: list,
      groups: gs,
      clickedId: "d",
      current: multi(["a", "b"]),
      additive: true,
    });
    expect(next).toEqual({ selectedId: null, marqueeIds: ["a", "b", "d", "e"], activeGroupId: null });
  });

  it("이미 전부 선택된 그룹을 Shift 클릭 → 그룹 단위 제거", () => {
    const next = planGroupClickSelection({
      items: list,
      groups: gs,
      clickedId: "d",
      current: multi(["a", "b", "d", "e"]),
      additive: true,
    });
    expect(next).toEqual({ selectedId: null, marqueeIds: ["a", "b"], activeGroupId: null });
  });

  it("단일 선택에 무그룹 요소를 Shift 추가 → 마퀴로 승격", () => {
    const next = planGroupClickSelection({
      items: list,
      groups: gs,
      clickedId: "c",
      current: single("a"),
      additive: true,
    });
    // "a"는 g1 소속이지만 가산의 기준은 현재 선택 집합이다 — 클릭 대상 c(무그룹)만 단위.
    expect(next).toEqual({ selectedId: null, marqueeIds: ["a", "c"], activeGroupId: null });
  });

  it("가산 결과가 1개면 단일로 정규화", () => {
    const next = planGroupClickSelection({
      items: list,
      groups: gs,
      clickedId: "c",
      current: single("c"),
      additive: true,
    });
    expect(next).toEqual({ selectedId: null, marqueeIds: [], activeGroupId: null });
  });

  it("가산 선택은 진입 상태를 해제한다(최상위 작업)", () => {
    const next = planGroupClickSelection({
      items: list,
      groups: gs,
      clickedId: "d",
      current: multi(["a"], "g1"),
      additive: true,
    });
    expect(next.activeGroupId).toBeNull();
  });
});

describe("planGroupEnter — 더블클릭 진입", () => {
  const list = items(["a:g1", "b:g1", "c"]);
  const gs = groups("g1");

  it("그룹 멤버 더블클릭 → 진입 + 개별 자식 선택", () => {
    expect(planGroupEnter({ items: list, groups: gs, clickedId: "a" })).toEqual({
      selectedId: "a",
      marqueeIds: [],
      activeGroupId: "g1",
    });
  });

  it("무그룹 요소 더블클릭 → 진입 없이 단일 선택", () => {
    expect(planGroupEnter({ items: list, groups: gs, clickedId: "c" })).toEqual({
      selectedId: "c",
      marqueeIds: [],
      activeGroupId: null,
    });
  });
});

describe("planGroupEscape — 한 단계 위로", () => {
  const list = items(["a:g1", "b:g1", "c"]);

  it("진입 중이면 진입 해제 + 그룹 전체 재선택", () => {
    expect(
      planGroupEscape({ items: list, current: { selectedId: "a", marqueeIds: [], activeGroupId: "g1" } })
    ).toEqual({ selectedId: null, marqueeIds: ["a", "b"], activeGroupId: null });
  });

  it("진입 상태가 아니면 null(호출부가 기본 Escape 처리)", () => {
    expect(planGroupEscape({ items: list, current: single("c") })).toBeNull();
  });
});

describe("planAtomicSelectionTranslation — 그룹 드래그 원자 계획", () => {
  type Movable =
    | { id: string; type: "image"; x: number; y: number; locked?: boolean }
    | { id: string; type: "draw"; points: number[]; locked?: boolean }
    | { id: string; type: "meta"; locked?: boolean };

  it("좌표형 요소와 선화를 같은 delta로 옮기고 선택 밖 참조를 보존한다", () => {
    const coordinate: Movable = { id: "image", type: "image", x: 10, y: 20 };
    const draw: Movable = { id: "ink", type: "draw", points: [1, 2, 5, 8] };
    const outside: Movable = { id: "outside", type: "image", x: 100, y: 120 };
    const next = planAtomicSelectionTranslation({
      items: [coordinate, draw, outside],
      selectedIds: ["image", "ink"],
      deltaX: 7,
      deltaY: -3,
      isLocked: () => false,
    });

    expect(next).toEqual([
      { id: "image", type: "image", x: 17, y: 17 },
      { id: "ink", type: "draw", points: [8, -1, 12, 5] },
      outside,
    ]);
    expect(next[2]).toBe(outside);
  });

  it("잠긴 그룹/자식이 하나라도 있으면 일부만 옮기지 않고 전체를 fail-closed 한다", () => {
    const locked: Movable = { id: "locked", type: "image", x: 2, y: 3, locked: true };
    const free: Movable = { id: "free", type: "draw", points: [4, 5, 6, 7] };
    const next = planAtomicSelectionTranslation({
      items: [locked, free],
      selectedIds: ["locked", "free"],
      deltaX: 10,
      deltaY: 20,
      isLocked: (item) => item.locked === true,
    });

    expect(next[0]).toBe(locked);
    expect(next[1]).toBe(free);
  });

  it("선택 멤버가 사라졌거나 이동 기하가 없으면 전체를 fail-closed 한다", () => {
    const free: Movable = { id: "free", type: "image", x: 2, y: 3 };
    const unsupported: Movable = { id: "meta", type: "meta" };

    const missing = planAtomicSelectionTranslation({
      items: [free],
      selectedIds: ["free", "missing"],
      deltaX: 10,
      deltaY: 20,
      isLocked: () => false,
    });
    const invalid = planAtomicSelectionTranslation({
      items: [free, unsupported],
      selectedIds: ["free", "meta"],
      deltaX: 10,
      deltaY: 20,
      isLocked: () => false,
    });

    expect(missing[0]).toBe(free);
    expect(invalid[0]).toBe(free);
    expect(invalid[1]).toBe(unsupported);
  });

  it("0 delta는 빈 undo 후보를 만들지 않도록 모든 요소 참조를 보존한다", () => {
    const source: Movable[] = [
      { id: "image", type: "image", x: 10, y: 20 },
      { id: "ink", type: "draw", points: [1, 2] },
    ];
    const next = planAtomicSelectionTranslation({
      items: source,
      selectedIds: ["image", "ink"],
      deltaX: 0,
      deltaY: 0,
      isLocked: () => false,
    });

    expect(next).not.toBe(source);
    expect(next[0]).toBe(source[0]);
    expect(next[1]).toBe(source[1]);
  });
});

describe("expandSelectionIdsToGroupUnits — 마퀴/우클릭 그룹 단위 확장", () => {
  const list = [
    { id: "a", groupId: "g" },
    { id: "b", groupId: "g" },
    { id: "c" },
    { id: "d", groupId: "ghost" },
  ];
  const knownGroups = [{ id: "g" }];

  it("그룹 밖에서는 자식 하나만 hit돼도 전체 그룹을 z-order로 선택한다", () => {
    expect(
      expandSelectionIdsToGroupUnits(list, knownGroups, ["b", "c"], null)
    ).toEqual(["a", "b", "c"]);
  });

  it("그룹 내부 편집 중에는 해당 그룹 자식을 개별 선택으로 유지한다", () => {
    expect(expandSelectionIdsToGroupUnits(list, knownGroups, ["b"], "g")).toEqual([
      "b",
    ]);
  });

  it("유령 그룹과 알 수 없는 hit id는 단일/무시로 결정론적으로 처리한다", () => {
    expect(
      expandSelectionIdsToGroupUnits(list, knownGroups, ["unknown", "d", "d"], null)
    ).toEqual(["d"]);
  });
});

describe("planAtomicSelectionAffineTransform — 혼합 그룹 전체 변형", () => {
  type AffineItem =
    | {
        id: string;
        type: "image";
        x: number;
        y: number;
        width: number;
        height: number;
        locked?: boolean;
      }
    | { id: string; type: "draw"; points: number[]; locked?: boolean }
    | { id: string; type: "meta"; locked?: boolean };

  const sourceBounds = { x: 10, y: 20, width: 40, height: 20 };

  it("object box와 draw points를 같은 translation+scale로 한 번에 변환한다", () => {
    const outside: AffineItem = {
      id: "outside",
      type: "image",
      x: 100,
      y: 120,
      width: 30,
      height: 40,
    };
    const result = planAtomicSelectionAffineTransform({
      items: [
        { id: "box", type: "image", x: 10, y: 20, width: 10, height: 5 },
        { id: "ink", type: "draw", points: [20, 25, 30, 35] },
        outside,
      ],
      selectedIds: ["box", "ink"],
      sourceBounds,
      translateX: 5,
      translateY: -10,
      scaleX: 2,
      scaleY: 3,
      isLocked: () => false,
    });

    expect(result).toEqual({
      kind: "applied",
      orderedSelectedIds: ["box", "ink"],
      items: [
        { id: "box", type: "image", x: 15, y: 10, width: 20, height: 15 },
        { id: "ink", type: "draw", points: [35, 25, 55, 55] },
        outside,
      ],
    });
    expect(result.items[2]).toBe(outside);
  });

  it("선택 멤버 하나라도 잠기면 unlocked 멤버까지 포함해 전체를 fail-closed no-op한다", () => {
    const free: AffineItem = {
      id: "free",
      type: "image",
      x: 10,
      y: 20,
      width: 10,
      height: 5,
    };
    const locked: AffineItem = {
      id: "locked",
      type: "draw",
      points: [20, 25, 30, 35],
      locked: true,
    };
    const result = planAtomicSelectionAffineTransform({
      items: [free, locked],
      selectedIds: ["free", "locked"],
      sourceBounds,
      translateX: 10,
      translateY: 10,
      scaleX: 2,
      scaleY: 2,
      isLocked: (item) => item.locked === true,
    });

    expect(result).toEqual({
      kind: "no-op",
      reason: "locked-selection-member",
      items: [free, locked],
      orderedSelectedIds: ["free", "locked"],
    });
    expect(result.items[0]).toBe(free);
    expect(result.items[1]).toBe(locked);
  });

  it("0 크기 source bounds 축은 이동은 허용하지만 해당 축의 scale은 no-op한다", () => {
    const pointBox: AffineItem = {
      id: "point-box",
      type: "image",
      x: 10,
      y: 20,
      width: 0,
      height: 0,
    };
    const scaled = planAtomicSelectionAffineTransform({
      items: [pointBox],
      selectedIds: ["point-box"],
      sourceBounds: { x: 10, y: 20, width: 0, height: 0 },
      translateX: 0,
      translateY: 0,
      scaleX: 2,
      scaleY: 1,
      isLocked: () => false,
    });
    const translated = planAtomicSelectionAffineTransform({
      items: [pointBox],
      selectedIds: ["point-box"],
      sourceBounds: { x: 10, y: 20, width: 0, height: 0 },
      translateX: 4,
      translateY: -6,
      scaleX: 1,
      scaleY: 1,
      isLocked: () => false,
    });

    expect(scaled).toMatchObject({
      kind: "no-op",
      reason: "zero-size-source-bounds",
    });
    expect(translated).toEqual({
      kind: "applied",
      orderedSelectedIds: ["point-box"],
      items: [
        {
          id: "point-box",
          type: "image",
          x: 14,
          y: 14,
          width: 0,
          height: 0,
        },
      ],
    });
  });

  it("음수 scale은 draw 좌표를 반전하고 object box는 양수 크기의 canonical box로 만든다", () => {
    const result = planAtomicSelectionAffineTransform({
      items: [
        { id: "box", type: "image", x: 12, y: 22, width: 6, height: 4 },
        { id: "ink", type: "draw", points: [12, 22, 18, 26] },
      ],
      selectedIds: ["box", "ink"],
      sourceBounds,
      translateX: 30,
      translateY: 0,
      scaleX: -2,
      scaleY: -0.5,
      isLocked: () => false,
    });

    expect(result).toEqual({
      kind: "applied",
      orderedSelectedIds: ["box", "ink"],
      items: [
        { id: "box", type: "image", x: 24, y: 17, width: 12, height: 2 },
        { id: "ink", type: "draw", points: [36, 19, 24, 17] },
      ],
    });
  });

  it("selectedIds 순서·중복과 무관하게 items z-order의 동일 결과를 만든다", () => {
    const source: AffineItem[] = [
      { id: "box", type: "image", x: 10, y: 20, width: 10, height: 5 },
      { id: "ink", type: "draw", points: [20, 25, 30, 35] },
    ];
    const plan = (selectedIds: readonly string[]) =>
      planAtomicSelectionAffineTransform({
        items: source,
        selectedIds,
        sourceBounds,
        translateX: 8,
        translateY: -3,
        scaleX: 1.5,
        scaleY: 0.5,
        isLocked: () => false,
      });

    const forward = plan(["box", "ink"]);
    const reverseWithDuplicate = plan(["ink", "box", "ink"]);

    expect(reverseWithDuplicate).toEqual(forward);
    expect(forward.orderedSelectedIds).toEqual(["box", "ink"]);
  });

  it("지원하지 않는 멤버가 섞이면 일부만 변형하지 않는다", () => {
    const box: AffineItem = {
      id: "box",
      type: "image",
      x: 10,
      y: 20,
      width: 10,
      height: 5,
    };
    const meta: AffineItem = { id: "meta", type: "meta" };
    const result = planAtomicSelectionAffineTransform({
      items: [box, meta],
      selectedIds: ["box", "meta"],
      sourceBounds,
      translateX: 1,
      translateY: 1,
      scaleX: 2,
      scaleY: 2,
      isLocked: () => false,
    });

    expect(result).toEqual({
      kind: "no-op",
      reason: "unsupported-member-geometry",
      items: [box, meta],
      orderedSelectedIds: ["box", "meta"],
    });
  });
});

describe("무그룹 문서 하위호환", () => {
  it("그룹이 하나도 없으면 항상 단일 선택으로 동작(회귀 방지)", () => {
    const list = items(["a", "b", "c"]);
    const next = planGroupClickSelection({
      items: list,
      groups: [],
      clickedId: "b",
      current: single("a"),
    });
    expect(next).toEqual({ selectedId: "b", marqueeIds: [], activeGroupId: null });
  });
});
