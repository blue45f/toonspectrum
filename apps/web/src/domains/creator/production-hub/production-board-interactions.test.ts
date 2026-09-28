import { describe, expect, it } from "vitest";
import { orderedProductionColumns, collapsedProductionColumns, reorderProductionColumn } from "./production-board-columns";
import { previewProductionBoardMove } from "./production-board-move-preview";
import { createProductionDemoProject } from "./production-demo";

describe("보드 보기 입력과 이동 검증", () => {
  it("손상되거나 중복된 URL 값으로 실제 상태 열을 숨길 수 없다", () => {
    const columns = orderedProductionColumns("unknown,review,review,working");
    expect(columns.map((column) => column.id)).toEqual(["review", "working", "queue", "complete", "blocked", "archive"]);
    expect(collapsedProductionColumns("review,unknown,review")).toEqual(["review"]);
    expect(reorderProductionColumn(null, "working", 0)).toBe("working,queue,review,complete,blocked,archive");
  });
  it("없는 작업이나 중복 ID가 섞인 이동은 일부만 적용하지 않는다", () => {
    const aggregate = createProductionDemoProject();
    const id = aggregate.tasks[0]!.id;
    const snapshot = JSON.stringify(aggregate);
    for (const ids of [[], [id, "deleted-task"], [id, id], Array.from({ length: 201 }, (_, index) => `${index}`)]) {
      const preview = previewProductionBoardMove(aggregate, ids, "in-progress", "2026-09-28T10:00:00.000Z");
      expect(preview.allowed).toBe(false);
      expect(preview.transitions).toHaveLength(0);
    }
    expect(JSON.stringify(aggregate)).toBe(snapshot);
  });
});
