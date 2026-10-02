import { describe, expect, it } from "vitest";

import { applyOptimisticOps, statusPatch } from "./board-optimistic";
import { boardTask, smallBoardFixture } from "./board-fixtures";

describe("낙관적 덧씌움", () => {
  it("덧씌움이 없으면 같은 객체를 돌려주고 원본은 바꾸지 않는다", () => {
    const aggregate = smallBoardFixture();
    expect(applyOptimisticOps(aggregate, [])).toBe(aggregate);
    const view = applyOptimisticOps(aggregate, [{ id: 1, patches: new Map([["board-ready", { title: "새 제목" }]]), added: [] }]);
    expect(view.tasks.find((task) => task.id === "board-ready")?.title).toBe("새 제목");
    expect(aggregate.tasks.find((task) => task.id === "board-ready")?.title).toBe("콘티 작업");
  });

  it("등록 순서대로 쌓이고 같은 카드의 부분 변경은 합쳐진다", () => {
    const aggregate = smallBoardFixture();
    const view = applyOptimisticOps(aggregate, [
      { id: 1, patches: new Map([["board-ready", { title: "첫 번째" }]]), added: [] },
      { id: 2, patches: new Map([["board-ready", { status: "in-progress" as const }]]), added: [] },
      { id: 3, patches: new Map([["board-ready", { title: "마지막" }]]), added: [] },
    ]);
    const task = view.tasks.find((entry) => entry.id === "board-ready");
    expect(task?.title).toBe("마지막");
    expect(task?.status).toBe("in-progress");
  });

  it("새 카드를 덧붙이되 이미 데이터에 있으면 중복하지 않는다", () => {
    const aggregate = smallBoardFixture();
    const fresh = boardTask({ id: "board-new", status: "draft", title: "새 카드" });
    const view = applyOptimisticOps(aggregate, [{ id: 1, patches: new Map(), added: [fresh] }]);
    expect(view.tasks.map((task) => task.id)).toEqual(["board-ready", "board-draft", "board-new"]);
    const saved = { ...aggregate, tasks: [...aggregate.tasks, fresh] };
    expect(applyOptimisticOps(saved, [{ id: 1, patches: new Map(), added: [fresh] }]).tasks).toHaveLength(3);
  });

  it("상태 전환 결과에서 상태·시각 필드만 덧씌움으로 옮긴다", () => {
    const task = boardTask({ id: "x", status: "in-progress", statusChangedAt: "2026-09-27T10:00:00.000Z", startedAt: "2026-09-27T10:00:00.000Z", completedAt: null });
    expect(statusPatch(task)).toEqual({ status: "in-progress", statusChangedAt: "2026-09-27T10:00:00.000Z", startedAt: "2026-09-27T10:00:00.000Z", completedAt: null });
  });
});
