import { describe, expect, it } from "vitest";

import { EMPTY_BOARD_ORDER } from "./board-order";
import {
  boardOrderEquals,
  needsBoardOrderMigration,
  resolveInitialBoardOrder,
} from "./board-order-sync";

describe("boardOrderEquals", () => {
  it("열 구성과 id 순서가 같으면 값으로 같다고 본다", () => {
    expect(boardOrderEquals(
      { queue: ["a", "b"], doing: ["c"] },
      { queue: ["a", "b"], doing: ["c"] },
    )).toBe(true);
  });

  it("순서·열·개수가 다르면 다르다고 본다", () => {
    expect(boardOrderEquals({ queue: ["a", "b"] }, { queue: ["b", "a"] })).toBe(false);
    expect(boardOrderEquals({ queue: ["a"] }, { doing: ["a"] })).toBe(false);
    expect(boardOrderEquals({ queue: ["a"] }, { queue: ["a"], doing: [] })).toBe(false);
    expect(boardOrderEquals(EMPTY_BOARD_ORDER, {})).toBe(true);
  });
});

describe("resolveInitialBoardOrder", () => {
  it("서버 순서가 있으면 로컬보다 서버가 이긴다", () => {
    const server = { queue: ["server-a"] };
    const result = resolveInitialBoardOrder(server, { queue: ["local-a"] });
    expect(result).toEqual({ order: server, source: "server" });
  });

  it("서버가 비어 있으면(null) 로컬 저장값이 출발점이 된다", () => {
    const local = { queue: ["local-a"] };
    expect(resolveInitialBoardOrder(null, local)).toEqual({ order: local, source: "local" });
    expect(resolveInitialBoardOrder(null, EMPTY_BOARD_ORDER).order).toBe(EMPTY_BOARD_ORDER);
  });

  it("서버 순서가 빈 문서로 존재하면 그것도 정본이다 (이전 대상 아님)", () => {
    expect(resolveInitialBoardOrder({}, { queue: ["local-a"] }).source).toBe("server");
  });
});

describe("needsBoardOrderMigration", () => {
  it("서버가 없고 로컬에만 순서가 있을 때만 이전 대상이다", () => {
    expect(needsBoardOrderMigration(null, { queue: ["a"] })).toBe(true);
    expect(needsBoardOrderMigration(null, EMPTY_BOARD_ORDER)).toBe(false);
    expect(needsBoardOrderMigration({ queue: ["a"] }, { queue: ["b"] })).toBe(false);
    expect(needsBoardOrderMigration({}, { queue: ["b"] })).toBe(false);
  });
});
