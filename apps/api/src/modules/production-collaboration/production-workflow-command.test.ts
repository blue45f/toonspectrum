import { createProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { createProductionProjectAggregate } from "@toonstudio/core/production";
import { ProductionCommandSchema } from "./production-collaboration.dto";
import { applyProductionWorkflowCommand } from "./production-workflow-command";

const at = "2026-09-27T09:00:00.000Z";
const project = () =>
  createProductionProjectAggregate({
    projectId: "p",
    workId: "w",
    title: "공정 테스트",
    collaborationModel: "solo",
    ownerPartyId: "owner",
    ownerUserId: "user",
    ownerDisplayName: "작가",
    at,
  });
function configuration(revision = 0) {
  const command = ProductionCommandSchema.parse({
    type: "configure-workflow",
    profile: { ...createProductionWorkflowProfile("p", "studio", at), revision: revision + 1 },
    expectedWorkflowRevision: revision,
  });
  if (command.type !== "configure-workflow") throw new Error("fixture");
  return command;
}
describe("제작 공정 서버 명령", () => {
  it("서버 시각과 독립 설정 버전을 사용하며 작업을 변경하지 않는다", () => {
    const before = project();
    const after = applyProductionWorkflowCommand(before, configuration(), "2026-09-27T10:00:00.000Z");
    expect(after.workflowProfile).toMatchObject({ revision: 1, updatedAt: "2026-09-27T10:00:00.000Z" });
    expect(after.tasks).toBe(before.tasks);
    expect(before.workflowProfile).toBeUndefined();
  });
  it("낡은 공정 버전과 무효한 순환 공정을 거절한다", () => {
    const before = applyProductionWorkflowCommand(project(), configuration(), at);
    expect(() => applyProductionWorkflowCommand(before, configuration(), at)).toThrow(ConflictException);
    const command = configuration(1);
    command.profile.steps[0].dependsOn = [command.profile.steps[1].key];
    expect(() => applyProductionWorkflowCommand(before, command, at)).toThrow(BadRequestException);
  });
  it("외부 필드와 크기 한도를 controller 계약에서 차단한다", () => {
    expect(ProductionCommandSchema.safeParse({ ...configuration(), actorUserId: "other" }).success).toBe(
      false,
    );
    const command = configuration();
    expect(
      ProductionCommandSchema.safeParse({
        ...command,
        profile: { ...command.profile, steps: Array(33).fill(command.profile.steps[0]) },
      }).success,
    ).toBe(false);
    expect(
      ProductionCommandSchema.safeParse({
        type: "transition-task-batch",
        transitions: Array(201).fill({ taskId: "a", fromStatus: "ready", toStatus: "in-progress" }),
      }).success,
    ).toBe(false);
    expect(
      ProductionCommandSchema.safeParse({
        type: "transition-task-batch",
        transitions: [{ taskId: "a", fromStatus: "ready", toStatus: "imaginary-state" }],
      }).success,
    ).toBe(false);
  });
  it("실제 상태가 달라졌으면 원자 이동 대신 409를 반환한다", () => {
    const command = ProductionCommandSchema.parse({
      type: "transition-task-batch",
      transitions: [{ taskId: "missing", fromStatus: "ready", toStatus: "in-progress" }],
    });
    if (command.type !== "transition-task-batch") throw new Error("fixture");
    expect(() => applyProductionWorkflowCommand(project(), command, at)).toThrow(ConflictException);
  });
  it("회차 공정 생성 전에 저장된 설정 버전을 확인한다", () => {
    const command = ProductionCommandSchema.parse({
      type: "instantiate-workflow",
      workflowRevision: 1,
      episodeId: "episode-1",
      instanceId: "00000000-0000-4000-8000-000000000001",
    });
    if (command.type !== "instantiate-workflow") throw new Error("fixture");
    expect(() => applyProductionWorkflowCommand(project(), command, at)).toThrow(ConflictException);
  });
});

describe("작업 생성 사전 조건 계약", () => {
  it("기존 작업을 덮어쓰지 않도록 부재 조건을 전달하고 보존한다", () => {
    const base = project();
    const task = {
      id: "new-task",
      projectId: "p",
      scope: { kind: "project", id: "p", ancestors: [] },
      processKey: "story-lock",
      title: "새 작업",
      status: "draft",
      assignmentIds: [],
      reviewerAssignmentIds: [],
      inputRevisionRefs: [],
      outputDeliverableIds: [],
      dependencyTaskIds: [],
      dueAt: null,
      estimateHours: null,
      completionCriteria: [],
      sourceAgreementMilestoneId: null,
    };
    const command = ProductionCommandSchema.parse({
      type: "upsert-task-batch",
      tasks: [task],
      expectedAbsentTaskIds: ["new-task"],
    });
    expect(command).toMatchObject({ type: "upsert-task-batch", expectedAbsentTaskIds: ["new-task"] });
    expect(base.tasks).toEqual([]);
  });
});
