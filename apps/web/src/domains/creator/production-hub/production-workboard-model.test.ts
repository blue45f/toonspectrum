import { describe, expect, it } from "vitest";
import { createProductionDemoProject } from "./production-demo";
import { PRODUCTION_DEFAULT_PROCESS_ORDER } from "./production-labels";
import {
  filterProductionBoardTasks,
  moveProductionItem,
  productionBoardFocusCounts,
  productionProcessColumns,
  productionTaskDueInfo,
  productionTaskIsMine,
  productionTaskIsOverdue,
  readProductionBoardFilters,
  readProductionBoardGroup,
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

describe("빠른 필터·마감·우선순위 필터", () => {
  const local = new Date(2026, 8, 27, 12, 0).getTime();
  const at = (day: number, hour = 9) => new Date(2026, 8, day, hour, 0).toISOString();
  function board() {
    const aggregate = createProductionDemoProject();
    const base = aggregate.tasks[0];
    if (!base) throw new Error("fixture");
    const make = (id: string, changes: Partial<typeof base>) => ({ ...base, id, title: id, assignmentIds: [], reviewerAssignmentIds: [], status: "ready" as const, priority: "normal" as const, dueAt: null, ...changes });
    const tasks = [
      make("mine-open", { assignmentIds: ["me"], dueAt: at(27, 18) }),
      make("mine-review", { status: "internal-review", reviewerAssignmentIds: ["me"], assignmentIds: ["other"], dueAt: at(26) }),
      make("others", { assignmentIds: ["other"], dueAt: at(29), priority: "urgent" }),
      make("nobody", { assignmentIds: [], dueAt: null, priority: "high" }),
      make("mine-done", { status: "done", assignmentIds: ["me"], dueAt: at(1) }),
      make("later", { assignmentIds: ["other"], dueAt: new Date(2026, 9, 30, 9).toISOString(), status: "blocked" }),
    ];
    return { ...aggregate, tasks };
  }
  const read = (query: string) => readProductionBoardFilters(new URLSearchParams(query));
  const ids = (query: string, mineAssignmentIds: readonly string[] = ["me"]) =>
    filterProductionBoardTasks(board(), read(query), local, { mineAssignmentIds }).map((task) => task.id).sort();

  it("마감 구간을 사용자의 달력 날짜 기준으로 나눈다", () => {
    const tasks = board().tasks;
    const info = (id: string) => {
      const found = tasks.find((entry) => entry.id === id);
      if (!found) throw new Error(id);
      return productionTaskDueInfo(found, local);
    };
    expect(info("mine-open")).toEqual({ state: "today", days: 0 });
    expect(info("mine-review")).toEqual({ state: "overdue", days: -1 });
    expect(info("others")).toEqual({ state: "week", days: 2 });
    expect(info("later").state).toBe("later");
    expect(info("nobody").state).toBe("none");
    expect(info("mine-done").state).toBe("closed");
  });

  it("내 카드는 내가 담당하거나 검수 단계에서 내가 검수자인 열린 카드만이다", () => {
    expect(ids("boardFocus=mine")).toEqual(["mine-open", "mine-review"]);
    expect(ids("boardFocus=mine", [])).toEqual([]);
    const task = board().tasks[0];
    if (!task) throw new Error("fixture");
    expect(productionTaskIsMine({ ...task, status: "done", assignmentIds: ["me"] }, new Set(["me"]))).toBe(false);
  });

  it("마감 필터는 오늘·이번 주·마감 없음을 가르고 지난 카드는 빠른 필터가 맡는다", () => {
    expect(ids("boardDue=today")).toEqual(["mine-open"]);
    expect(ids("boardDue=week")).toEqual(["mine-open", "others"]);
    expect(ids("boardDue=none")).toEqual(["nobody"]);
    expect(ids("boardFocus=overdue")).toEqual(["mine-review"]);
  });

  it("우선순위 라벨 필터와 빠른 필터를 함께 적용한다", () => {
    expect(ids("boardPriority=urgent")).toEqual(["others"]);
    expect(ids("boardPriority=high&boardFocus=unassigned")).toEqual(["nobody"]);
    expect(ids("boardPriority=nonsense")).toHaveLength(6);
  });

  it("빠른 필터별 카드 수를 보관·완료 카드를 빼고 센다", () => {
    expect(productionBoardFocusCounts(board(), local, { mineAssignmentIds: ["me"] })).toEqual({
      all: 6,
      mine: 2,
      overdue: 1,
      blocked: 1,
      review: 1,
      unassigned: 1,
    });
  });

  it("새 주소 값도 안전한 기본값으로 정규화한다", () => {
    expect(read("boardDue=zzz").due).toBe("any");
    expect(read("boardSort=manual").sort).toBe("manual");
    expect(read("boardSort=zzz").sort).toBe("priority");
    expect(readProductionBoardGroup(new URLSearchParams("boardGroup=episode"))).toBe("episode");
    expect(readProductionBoardGroup(new URLSearchParams("boardGroup=zzz"))).toBe("none");
  });
});
