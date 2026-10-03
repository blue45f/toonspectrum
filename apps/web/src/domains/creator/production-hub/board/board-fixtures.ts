/** 보드 테스트 전용 자료: 샘플 프로젝트에서 작은 보드(준비 2장)를 만들어 쓴다. */
import { createProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";

import { createProductionDemoProject } from "../production-demo";

export function boardTask(overrides: Partial<ProductionTask> & Pick<ProductionTask, "id">): ProductionTask {
  const aggregate = createProductionDemoProject();
  const source = aggregate.tasks[0];
  if (!source) throw new Error("샘플 작업이 없습니다.");
  return {
    ...source,
    title: overrides.id,
    status: "ready",
    processKey: "story-lock",
    dependencyTaskIds: [],
    outputDeliverableIds: [],
    briefBlocks: [],
    priority: "normal",
    ...overrides,
  };
}

/** 콘티 작업(준비·입력 고정·담당 있음)과 배경 원고(초안)가 있고, 한 명씩만 동시에 작업하는 개인 제작 공정이 설정된 보드. */
export function smallBoardFixture(): ProductionProjectAggregate {
  const aggregate = createProductionDemoProject();
  const source = aggregate.tasks[0];
  const assignment = aggregate.assignments.find((entry) => entry.status === "active");
  if (!source || !assignment) throw new Error("샘플 데이터가 없습니다.");
  const task: ProductionTask = {
    ...source,
    id: "board-ready",
    title: "콘티 작업",
    processKey: "story-lock",
    status: "ready",
    assignmentIds: [assignment.id],
    reviewerAssignmentIds: [],
    dependencyTaskIds: [],
    outputDeliverableIds: [],
    inputRevisionRefs: [
      {
        id: "board-input",
        revision: 1,
        lineage: "narrative",
        digest: `sha256:${"b".repeat(64)}`,
        createdAt: "2026-09-27T09:00:00.000Z",
      },
    ],
    briefBlocks: [],
    priority: "normal",
  };
  return {
    ...aggregate,
    tasks: [task, { ...task, id: "board-draft", title: "배경 원고", status: "draft" }],
    workflowProfile: createProductionWorkflowProfile(aggregate.projectId, "solo", "2026-09-27T09:00:00.000Z"),
  };
}
