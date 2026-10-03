import { describe, expect, it } from "vitest";

import {
  EMPTY_BOARD_ORDER,
  applyColumnOrder,
  neighborBeforeId,
  parseBoardOrder,
  placeInColumnOrder,
  pruneBoardOrder,
  readStoredBoardOrder,
  withColumnOrder,
  writeStoredBoardOrder,
} from "./board-order";

const cards = (...ids: string[]) => ids.map((id) => ({ id }));

describe("열 안 카드 순서", () => {
  it("저장한 순서를 앞에 두고 목록에 없는 카드는 원래 순서 그대로 아래에 붙인다", () => {
    expect(applyColumnOrder(cards("a", "b", "c", "d"), ["c", "a"]).map((card) => card.id)).toEqual(["c", "a", "b", "d"]);
    const original = cards("a", "b");
    expect(applyColumnOrder(original, undefined)).toBe(original);
    expect(applyColumnOrder(original, [])).toBe(original);
  });

  it("지정한 카드 바로 앞에 놓고, 대상이 없거나 열에 없으면 맨 아래에 놓는다", () => {
    expect(placeInColumnOrder(["a", "b", "c"], ["c"], "a")).toEqual(["c", "a", "b"]);
    expect(placeInColumnOrder(["a", "b", "c"], ["a"], null)).toEqual(["b", "c", "a"]);
    expect(placeInColumnOrder(["a", "b"], ["x"], "없는-카드")).toEqual(["a", "b", "x"]);
    expect(placeInColumnOrder(["a", "b", "c"], ["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("여러 장을 한꺼번에 옮겨도 중복 없이 순서를 유지한다", () => {
    expect(placeInColumnOrder(["a", "b", "c", "d"], ["d", "b"], "a")).toEqual(["d", "b", "a", "c"]);
    expect(placeInColumnOrder(["a"], ["b", "b"], null)).toEqual(["a", "b"]);
  });

  it("키보드로 한 칸 옮길 때 필터에 가려진 카드는 건너뛰고 가장자리에서는 멈춘다", () => {
    const visible = ["a", "b", "c"];
    expect(neighborBeforeId(visible, "b", -1)).toBe("a");
    expect(neighborBeforeId(visible, "a", -1)).toBeUndefined();
    expect(neighborBeforeId(visible, "a", 1)).toBe("c");
    expect(neighborBeforeId(visible, "b", 1)).toBeNull();
    expect(neighborBeforeId(visible, "c", 1)).toBeUndefined();
    expect(neighborBeforeId(visible, "없음", 1)).toBeUndefined();
  });

  it("없어진 카드를 순서에서 지우되 바뀐 것이 없으면 같은 객체를 돌려준다", () => {
    const order = { queue: ["a", "b"], working: ["c"] };
    expect(pruneBoardOrder(order, new Set(["a", "b", "c"]))).toBe(order);
    expect(pruneBoardOrder(order, new Set(["a"]))).toEqual({ queue: ["a"] });
  });

  it("카드가 다른 열로 옮겨 가면 이전 열의 순서 목록에서 지운다", () => {
    expect(withColumnOrder({ queue: ["a", "b"] }, "working", ["b"])).toEqual({ queue: ["a"], working: ["b"] });
    expect(withColumnOrder(EMPTY_BOARD_ORDER, "queue", ["a"])).toEqual({ queue: ["a"] });
  });
});

describe("직접 정렬 저장", () => {
  it("손상된 값·잘못된 모양은 무시하고 올바른 열만 읽는다", () => {
    expect(parseBoardOrder(null)).toBe(EMPTY_BOARD_ORDER);
    expect(parseBoardOrder("{깨짐")).toBe(EMPTY_BOARD_ORDER);
    expect(parseBoardOrder("[]")).toBe(EMPTY_BOARD_ORDER);
    expect(parseBoardOrder(JSON.stringify({ queue: ["a", "b"], working: [1, 2], review: "x" }))).toEqual({ queue: ["a", "b"] });
  });

  it("프로젝트별로 저장하고 비우면 항목을 지운다", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    writeStoredBoardOrder("project-a", { queue: ["a"] }, storage);
    writeStoredBoardOrder("project-b", { queue: ["x"] }, storage);
    expect(readStoredBoardOrder("project-a", storage)).toEqual({ queue: ["a"] });
    expect(readStoredBoardOrder("project-b", storage)).toEqual({ queue: ["x"] });
    writeStoredBoardOrder("project-a", {}, storage);
    expect(store.size).toBe(1);
  });

  it("저장소가 막혀 있어도 오류 없이 빈 순서를 돌려준다", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredBoardOrder("p", broken)).toBe(EMPTY_BOARD_ORDER);
    expect(() => writeStoredBoardOrder("p", { queue: ["a"] }, broken)).not.toThrow();
  });
});
