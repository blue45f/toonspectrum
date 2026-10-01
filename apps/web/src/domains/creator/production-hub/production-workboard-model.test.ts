import { describe, expect, it } from "vitest";
import { createProductionDemoProject } from "./production-demo";
import { PRODUCTION_DEFAULT_PROCESS_ORDER } from "./production-labels";
import {
  filterProductionBoardTasks,
  moveProductionItem,
  productionProcessColumns,
  productionTaskIsOverdue,
  readProductionBoardFilters,
  readProductionBoardLayout,
} from "./production-workboard-model";

const now = Date.parse("2026-09-27T09:00:00.000Z");
describe("제작 보드의 URL 필터와 정렬", () => {
  it("잘못된 상태를 안전한 기본값으로 정규화하고 검색 길이를 제한한다", () => {
    const params = new URLSearchParams({
      boardFocus: "unknown",
      boardSort: "unknown",
      boardQuery: "가".repeat(300),
    });
    const result = readProductionBoardFilters(params);
    expect(result.focus).toBe("all");
    expect(result.sort).toBe("priority");
    expect(result.query).toHaveLength(200);
  });
  it("우선순위와 마감일을 함께 정렬하며 원본 순서를 변경하지 않는다", () => {
    const aggregate = createProductionDemoProject();
    const task = aggregate.tasks[0];
    if (!task) throw new Error("fixture");
    const tasks = [
      { ...task, id: "a", title: "보통", priority: "normal" as const, dueAt: "2026-09-01T00:00:00Z" },
      { ...task, id: "b", title: "긴급", priority: "urgent" as const, dueAt: null },
    ];
    const result = filterProductionBoardTasks(
      { ...aggregate, tasks },
      readProductionBoardFilters(new URLSearchParams()),
      now,
    );
    expect(result.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(tasks.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
  it("본문 검색에 포함된 태그 모양 텍스트도 평문으로 취급한다", () => {
    const aggregate = createProductionDemoProject();
    const task = aggregate.tasks[0];
    if (!task) throw new Error("fixture");
    const tasks = [
      { ...task, briefBlocks: [{ id: "b", kind: "paragraph" as const, text: "<script>참고</script>" }] },
    ];
    const result = filterProductionBoardTasks(
      { ...aggregate, tasks },
      readProductionBoardFilters(new URLSearchParams({ boardQuery: "참고" })),
      now,
    );
    expect(result).toHaveLength(1);
  });
  it("완료·취소 작업은 기한이 지나도 지연 작업으로 집계하지 않는다", () => {
    const task = createProductionDemoProject().tasks[0];
    if (!task) throw new Error("fixture");
    for (const status of ["approved", "done", "cancelled", "out-of-scope"] as const) {
      expect(productionTaskIsOverdue({ ...task, status, dueAt: "2020-01-01T00:00:00Z" }, now)).toBe(false);
    }
  });
  it("보관 필터는 취소 작업을 숨기되 영구 삭제하지 않는다", () => {
    const aggregate = createProductionDemoProject();
    const task = aggregate.tasks[0];
    if (!task) throw new Error("fixture");
    const value = { ...aggregate, tasks: [{ ...task, status: "cancelled" as const }] };
    expect(filterProductionBoardTasks(value, readProductionBoardFilters(new URLSearchParams()), now)).toEqual(
      [],
    );
    expect(
      filterProductionBoardTasks(
        value,
        readProductionBoardFilters(new URLSearchParams({ boardArchived: "1" })),
        now,
      ),
    ).toHaveLength(1);
    expect(value.tasks).toHaveLength(1);
  });
  it("잘못된 이동 위치는 무시하고 유효한 재배치는 원본을 유지한다", () => {
    const items = ["a", "b", "c"];
    expect(moveProductionItem(items, -1, 2)).toBe(items);
    expect(moveProductionItem(items, 0, 3)).toBe(items);
    expect(moveProductionItem(items, 0, 2)).toEqual(["b", "c", "a"]);
    expect(items).toEqual(["a", "b", "c"]);
  });
});

describe("productionProcessColumns", () => {
  it("orders process columns by the webtoon default and counts work in progress", () => {
    const aggregate = createProductionDemoProject();
    const columns = productionProcessColumns(aggregate, aggregate.tasks, PRODUCTION_DEFAULT_PROCESS_ORDER);
    expect(columns.map((column) => column.key)).toEqual([
      "story-lock", "storyboard", "line-art", "background", "color", "lettering", "rights-preflight", "joint-proof", "publication",
    ]);
    expect(columns.reduce((sum, column) => sum + column.tasks.length, 0)).toBe(aggregate.tasks.length);
    expect(columns.find((column) => column.key === "rights-preflight")?.wip).toBe(1);
    expect(columns.every((column) => column.wipLimit === null)).toBe(true);
  });

  it("keeps a configured process visible even without tasks and applies its limit", () => {
    const aggregate = createProductionDemoProject();
    const workflowProfile = {
      id: "profile",
      projectId: aggregate.projectId,
      name: "팀 공정",
      scale: "team" as const,
      revision: 1,
      steps: [{ key: "storyboard", name: "콘티", description: "", defaultRole: "storyboard-artist" as const, estimateHours: 8, dependsOn: [], wipLimit: 2, reviewRequired: true, completionCriteria: [] }],
      updatedAt: aggregate.updatedAt,
    };
    const columns = productionProcessColumns({ ...aggregate, workflowProfile }, [], []);
    expect(columns.map((column) => [column.key, column.wipLimit])).toEqual([["storyboard", 2]]);
  });
});

describe("readProductionBoardLayout", () => {
  it("accepts board, list and process layouts and falls back to the board", () => {
    expect(readProductionBoardLayout(new URLSearchParams("boardLayout=process"))).toBe("process");
    expect(readProductionBoardLayout(new URLSearchParams("boardLayout=list"))).toBe("list");
    expect(readProductionBoardLayout(new URLSearchParams("boardLayout=unknown"))).toBe("board");
  });
});
