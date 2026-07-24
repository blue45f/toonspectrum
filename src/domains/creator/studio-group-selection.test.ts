import { describe, expect, it } from "vitest";

import {
  EMPTY_GROUP_SELECTION,
  currentSelectionIds,
  groupMemberIds,
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
