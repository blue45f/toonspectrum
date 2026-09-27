import { buildProductionWorkflowTasks, transitionProductionTaskBatch, validateProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { type ProductionProjectAggregate } from "../../../../../packages/core/src/production";
import type { ProductionCommand } from "./production-collaboration.dto";

type WorkflowCommand = Extract<
  ProductionCommand,
  { type: "configure-workflow" | "instantiate-workflow" | "transition-task-batch" }
>;
export function applyProductionWorkflowCommand(
  aggregate: ProductionProjectAggregate,
  command: WorkflowCommand,
  at: string,
): ProductionProjectAggregate {
  if (command.type === "configure-workflow") {
    if ((aggregate.workflowProfile?.revision ?? 0) !== command.expectedWorkflowRevision) {
      throw new ConflictException("공정 설정이 변경되었습니다. 최신 설정을 확인한 뒤 다시 저장하세요.");
    }
    const issues = validateProductionWorkflowProfile(aggregate, command.profile);
    if (issues.length) throw new BadRequestException({ message: "공정 설정을 저장할 수 없습니다.", issues });
    return { ...aggregate, workflowProfile: { ...command.profile, updatedAt: at } };
  }
  if (
    command.type === "instantiate-workflow" &&
    aggregate.workflowProfile?.revision !== command.workflowRevision
  ) {
    throw new ConflictException("작업 생성 전에 최신 공정 설정을 확인하세요.");
  }
  try {
    const changed =
      command.type === "instantiate-workflow"
        ? buildProductionWorkflowTasks(aggregate, command.episodeId, command.instanceId, at)
        : transitionProductionTaskBatch(aggregate, command.transitions, at);
    const ids = new Set(aggregate.tasks.map((task) => task.id));
    const tasks = [
      ...aggregate.tasks.map((task) => changed.find((entry) => entry.id === task.id) ?? task),
      ...changed.filter((task) => !ids.has(task.id)),
    ];
    return { ...aggregate, tasks };
  } catch (error) {
    if (error instanceof Error && error.message === "workflow-task-conflict")
      throw new ConflictException("작업 상태가 변경되었습니다. 최신 상태에서 다시 이동하세요.");
    throw new BadRequestException(error instanceof Error ? error.message : "작업을 변경할 수 없습니다.");
  }
}
