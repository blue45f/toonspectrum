import { describe, expect, it } from "vitest";

import {
  buildProductionRoleWorkcellBoard,
  createProductionProjectAggregate,
  eligibleAssignmentsForTask,
  episodeScope,
  evaluateProductionTaskGate,
  inferProductionTaskDepartment,
  projectScope,
  type ProductionProjectAggregate,
  type ProductionTask,
  type RoleAssignment,
} from "./index";

const AT = "2026-09-16T08:00:00.000Z";
const project = projectScope("project-role-workflow");
const episode = episodeScope("project-role-workflow", "episode-12");
const revision = {
  id: "story-r1",
  lineage: "narrative" as const,
  revision: 1,
  digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  createdAt: AT,
};

function assignment(
  id: string,
  roleType: RoleAssignment["roleType"],
  lead = false,
): RoleAssignment {  return {
    id,
    projectId: "project-role-workflow",
    partyId: `party-${id}`,
    roleType,
    scope: project,
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: null,
    capabilities: [],
    agreementRevisionRef: null,
    publicCreditRole: null,
    status: "active",
    lead,
  };
}

function task(input: Partial<ProductionTask> & Pick<ProductionTask, "id" | "processKey">): ProductionTask {
  return {
    id: input.id,
    projectId: "project-role-workflow",
    scope: episode,
    processKey: input.processKey,
    title: input.title ?? input.id,
    status: input.status ?? "ready",
    assignmentIds: input.assignmentIds ?? [],
    reviewerAssignmentIds: input.reviewerAssignmentIds ?? [],
    inputRevisionRefs: input.inputRevisionRefs ?? [revision],
    outputDeliverableIds: input.outputDeliverableIds ?? [`deliverable-${input.id}`],
    dependencyTaskIds: input.dependencyTaskIds ?? [],
    dueAt: input.dueAt ?? null,    estimateHours: input.estimateHours ?? { optimistic: 4, likely: 8, pessimistic: 12 },
    completionCriteria: input.completionCriteria ?? ["완료 기준"],
    sourceAgreementMilestoneId: input.sourceAgreementMilestoneId ?? null,
  };
}

function aggregate(
  assignments: readonly RoleAssignment[],
  tasks: readonly ProductionTask[],
): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({
    projectId: "project-role-workflow",
    workId: "work-role-workflow",
    title: "직군 분업 테스트",
    collaborationModel: "studio-production",
    ownerPartyId: "party-owner",
    ownerUserId: "owner",
    ownerDisplayName: "테스트 PD",
    at: AT,
  });
  return {
    ...base,
    assignments: [...base.assignments, ...assignments],
    tasks,
  };
}

describe("production role workcells", () => {
  it("uses the production process before a generic vendor role", () => {
    const vendor = assignment("vendor", "vendor");
    const background = task({
      id: "background-12",
      processKey: "background",
      assignmentIds: [vendor.id],
    });    expect(inferProductionTaskDepartment(background, [vendor])).toBe("background");
  });

  it("explains every start gate instead of only returning a boolean", () => {
    const lineArtist = assignment("line", "line-artist");
    const storyboard = task({
      id: "storyboard-12",
      processKey: "storyboard",
      status: "in-progress",
    });
    const lineArt = task({
      id: "line-art-12",
      processKey: "line-art",
      assignmentIds: [lineArtist.id],
      reviewerAssignmentIds: [],
      inputRevisionRefs: [],
      outputDeliverableIds: [],
      dependencyTaskIds: [storyboard.id],
    });
    const gate = evaluateProductionTaskGate({
      task: lineArt,
      tasks: [storyboard, lineArt],
      assignments: [lineArtist],
      at: AT,
    });
    expect(gate.canStart).toBe(false);
    expect(gate.missingDependencyTaskIds).toEqual([storyboard.id]);
    expect(gate.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("선행 작업"),
      expect.stringContaining("입력 revision"),
    ]));
    expect(gate.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("검수 가능한 담당자"),
      expect.stringContaining("산출물"),
    ]));
  });

  it("keeps future crew out of current assignment and approval gates", () => {
    const futureLineArtist = {
      ...assignment("future-line", "line-artist", true),
      startsAt: "2026-10-01T00:00:00.000Z",
    };
    const editor = assignment("editor", "editor", true);
    const lineArt = task({
      id: "line-art-review-12",
      processKey: "line-art",
      status: "internal-review",
      assignmentIds: [futureLineArtist.id],
      reviewerAssignmentIds: [editor.id],
      inputRevisionRefs: [],
    });
    const gate = evaluateProductionTaskGate({
      task: lineArt,
      tasks: [lineArt],
      assignments: [futureLineArtist, editor],
      at: AT,
    });
    expect(gate.missingAssignee).toBe(true);
    expect(gate.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("현재 작업 가능한 주 담당자"),
      expect.stringContaining("입력 revision"),
    ]));
    expect(gate.canApprove).toBe(false);
  });

  it("shows scheduled crew coverage without using it for automatic assignment", () => {
    const futureColorist = {
      ...assignment("future-color", "colorist", true),
      startsAt: "2026-10-01T00:00:00.000Z",
    };
    const color = task({ id: "color-12", processKey: "color" });
    expect(eligibleAssignmentsForTask({
      task: color,
      assignments: [futureColorist],
      kind: "owner",
      at: AT,
    })).toEqual([]);

    const board = buildProductionRoleWorkcellBoard({
      aggregate: aggregate([futureColorist], [color]),
      at: AT,
    });
    const colorCell = board.workcells.find((entry) => entry.department.key === "color");
    expect(colorCell?.coverage).toBe("scheduled");
    expect(colorCell?.assignmentIds).toEqual([]);
    expect(colorCell?.scheduledAssignmentIds).toEqual([futureColorist.id]);
    expect(board.coverageGapDepartmentKeys).toContain("color");
  });

  it("builds coverage, review and bottleneck metrics by department", () => {
    const storyboardArtist = assignment("storyboard", "storyboard-artist", true);
    const editor = assignment("editor", "editor", true);
    const storyboard = task({
      id: "storyboard-12",
      processKey: "thumbnail",
      status: "internal-review",
      assignmentIds: [storyboardArtist.id],
      reviewerAssignmentIds: [editor.id],
    });
    const color = task({
      id: "color-12",
      processKey: "color",
      status: "blocked",
      dependencyTaskIds: [storyboard.id],
    });
    const board = buildProductionRoleWorkcellBoard({
      aggregate: aggregate([storyboardArtist, editor], [storyboard, color]),
      at: AT,
    });
    const storyboardCell = board.workcells.find((entry) =>
      entry.department.key === "storyboard");
    const colorCell = board.workcells.find((entry) => entry.department.key === "color");
    expect(storyboardCell?.reviewTaskCount).toBe(1);
    expect(storyboardCell?.coverage).toBe("covered");
    expect(colorCell?.health).toBe("unfilled");
    expect(board.coverageGapDepartmentKeys).toContain("color");
    expect(board.bottleneckDepartmentKeys).toContain("color");
  });

  it("limits owner and reviewer suggestions by role and scope", () => {
    const lineArtist = assignment("line", "line-artist", true);
    const editor = assignment("editor", "editor", true);
    const backgroundArtist = assignment("background", "background-artist", true);
    const lineArt = task({ id: "line-art-12", processKey: "line-art" });
    expect(eligibleAssignmentsForTask({
      task: lineArt,
      assignments: [lineArtist, editor, backgroundArtist],
      kind: "owner",
      at: AT,
    }).map((entry) => entry.id)).toEqual([lineArtist.id]);    expect(eligibleAssignmentsForTask({
      task: lineArt,
      assignments: [lineArtist, editor, backgroundArtist],
      kind: "reviewer",
      at: AT,
    }).map((entry) => entry.id)).toEqual([editor.id]);
  });
});
