import { describe, expect, it } from "vitest";
import {
  createProductionProjectAggregate,
  episodeScope,
  projectScope,
  type ProductionTask,
} from "@toonstudio/core/production";
import {
  buildProductionBulkEditPlan,
  commonProductionBulkAssignees,
  INITIAL_PRODUCTION_BULK_EDIT,
} from "./production-bulk-task-edit";

const at = "2026-09-27T10:00:00.000Z";
function fixture() {
  const base = createProductionProjectAggregate({
    projectId: "p",
    workId: "w",
    title: "제작",
    collaborationModel: "solo",
    ownerPartyId: "o",
    ownerUserId: "u",
    ownerDisplayName: "담당",
    at,
  });
  const task: ProductionTask = {
    id: "t",
    projectId: "p",
    scope: projectScope("p"),
    processKey: "story",
    title: "작업",
    status: "in-progress",
    assignmentIds: [],
    reviewerAssignmentIds: [base.assignments[0].id],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: null,
    estimateHours: null,
    completionCriteria: ["보존"],
    briefBlocks: [
      { id: "memo", kind: "paragraph", text: "변경하지 않을 원고" },
    ],
    sourceAgreementMilestoneId: null,
  };
  return { ...base, tasks: [task, { ...task, id: "t2", title: "다음 작업" }] };
}
describe("선택 작업 필드 일괄 편집", () => {
  it("선택 필드만 바꾸고 상태·원고·검수자를 보존한다", () => {
    const aggregate = fixture();
    const plan = buildProductionBulkEditPlan(
      aggregate,
      aggregate.tasks,
      { ...INITIAL_PRODUCTION_BULK_EDIT, priority: "urgent" },
      at
    );
    expect(plan.tasks).toHaveLength(2);
    expect(plan.expectedTasks).toEqual(aggregate.tasks);
    expect(plan.tasks[0]).toEqual({
      ...aggregate.tasks[0],
      priority: "urgent",
    });
    expect(aggregate.tasks[0].priority).toBeUndefined();
  });
  it("변경하지 않음과 기본 보통 우선순위를 실제 쓰기로 만들지 않는다", () => {
    const aggregate = fixture();
    for (const priority of ["keep", "normal"] as const)
      expect(
        buildProductionBulkEditPlan(
          aggregate,
          aggregate.tasks,
          { ...INITIAL_PRODUCTION_BULK_EDIT, priority },
          at
        )
      ).toMatchObject({ tasks: [], expectedTasks: [], unchangedCount: 2 });
  });
  it("담당자를 명시적으로 교체하고 마감을 UTC로 정규화한다", () => {
    const aggregate = fixture();
    const plan = buildProductionBulkEditPlan(
      aggregate,
      aggregate.tasks,
      {
        ...INITIAL_PRODUCTION_BULK_EDIT,
        assigneeMode: "replace",
        assignmentId: aggregate.assignments[0].id,
        deadlineMode: "set",
        dueAt: "2026-10-01T18:30:00+09:00",
      },
      at
    );
    expect(
      plan.tasks.every(
        (task) =>
          task.assignmentIds[0] === aggregate.assignments[0].id &&
          task.dueAt === "2026-10-01T09:30:00.000Z"
      )
    ).toBe(true);
  });
  it("일부 작업이 변경되면 묶음 전체를 거절한다", () => {
    const original = fixture();
    const updated = {
      ...original,
      tasks: original.tasks.map((task, index) =>
        index ? { ...task, title: "다른 팀원의 변경" } : task
      ),
    };
    expect(() =>
      buildProductionBulkEditPlan(
        updated,
        original.tasks,
        { ...INITIAL_PRODUCTION_BULK_EDIT, priority: "urgent" },
        at
      )
    ).toThrow("작업이 변경");
    expect(updated.tasks[0].priority).toBeUndefined();
  });
  it.each(["approved", "done", "cancelled", "out-of-scope"] as const)(
    "%s 작업은 편집 대상에서 보호한다",
    (status) => {
      const base = fixture();
      const aggregate = { ...base, tasks: [{ ...base.tasks[0], status }] };
      expect(() =>
        buildProductionBulkEditPlan(
          aggregate,
          aggregate.tasks,
          { ...INITIAL_PRODUCTION_BULK_EDIT, priority: "urgent" },
          at
        )
      ).toThrow("일괄 편집할 수 없습니다");
    }
  );
  it("기한 해제와 유지의 의미를 구분한다", () => {
    const base = fixture();
    const aggregate = {
      ...base,
      tasks: base.tasks.map((task) => ({
        ...task,
        dueAt: at,
        assignmentIds: [base.assignments[0].id],
      })),
    };
    expect(
      buildProductionBulkEditPlan(
        aggregate,
        aggregate.tasks,
        INITIAL_PRODUCTION_BULK_EDIT,
        at
      ).tasks
    ).toEqual([]);
    expect(
      buildProductionBulkEditPlan(
        aggregate,
        aggregate.tasks,
        {
          ...INITIAL_PRODUCTION_BULK_EDIT,
          deadlineMode: "clear",
          assigneeMode: "clear",
        },
        at
      ).tasks[0]
    ).toMatchObject({ dueAt: null, assignmentIds: [], status: "in-progress" });
  });
  it("활동 기간과 모든 작업의 범위를 검사한다", () => {
    const base = fixture();
    const active = base.assignments[0];
    const assignment = {
      ...active,
      id: "episode-owner",
      scope: episodeScope("p", "e1"),
    };
    const aggregate = {
      ...base,
      assignments: [
        assignment,
        { ...active, id: "future", startsAt: "2027-01-01T00:00:00Z" },
        { ...active, id: "expired", endsAt: "2026-09-26T00:00:00Z" },
      ],
      tasks: [
        { ...base.tasks[0], scope: episodeScope("p", "e1") },
        { ...base.tasks[1], scope: episodeScope("p", "e2") },
      ],
    };
    expect(
      commonProductionBulkAssignees(aggregate, aggregate.tasks, at)
    ).toEqual([]);
    expect(
      commonProductionBulkAssignees(aggregate, [aggregate.tasks[0]], at).map(
        (entry) => entry.id
      )
    ).toEqual(["episode-owner"]);
    expect(() =>
      buildProductionBulkEditPlan(
        aggregate,
        aggregate.tasks,
        {
          ...INITIAL_PRODUCTION_BULK_EDIT,
          assigneeMode: "replace",
          assignmentId: "episode-owner",
        },
        at
      )
    ).toThrow("모든 작업");
  });
  it("중복 선택과 잘못된 마감을 거절한다", () => {
    const aggregate = fixture();
    expect(() =>
      buildProductionBulkEditPlan(
        aggregate,
        [aggregate.tasks[0], aggregate.tasks[0]],
        INITIAL_PRODUCTION_BULK_EDIT,
        at
      )
    ).toThrow("중복");
    expect(() =>
      buildProductionBulkEditPlan(
        aggregate,
        aggregate.tasks,
        {
          ...INITIAL_PRODUCTION_BULK_EDIT,
          deadlineMode: "set",
          dueAt: "invalid",
        },
        at
      )
    ).toThrow("마감 일시");
  });
});
