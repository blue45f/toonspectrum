import { isDeepStrictEqual } from "node:util";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { deriveProductionAutomationExecutionPlan, type ProductionProjectAggregate } from "@toonspectrum/core/production";
import type { ProductionCommand } from "./production-collaboration.dto";

/** The client previews changes; the server derives them again from the current stored rules. */
export function verifyProductionAutomationCommand(aggregate: ProductionProjectAggregate,
  command: Extract<ProductionCommand, { type: "apply-automation-execution" }>, serverTime: string): void {
  const supplied = command.evaluatedRules;
  if (!supplied.length || supplied.length > 50 || command.tasks.length > 100 || command.notifications.length > 500
    || new Set(supplied.map((rule) => rule.id)).size !== supplied.length) throw new BadRequestException("automation_execution_limit");
  const evaluationTime = supplied[0]!.lastEvaluatedAt;
  const timestamp = evaluationTime ? Date.parse(evaluationTime) : Number.NaN;
  const age = Date.parse(serverTime) - timestamp;
  if (!Number.isFinite(age) || age < -30_000 || age > 300_000
    || supplied.some((rule) => rule.lastEvaluatedAt !== evaluationTime || rule.updatedAt !== evaluationTime)) {
    throw new ConflictException("automation_preview_expired");
  }
  const rules = supplied.map((entry) => (aggregate.automationRules ?? []).find((rule) => rule.id === entry.id));
  if (rules.some((rule) => !rule?.enabled)) throw new ConflictException("automation_rule_changed");
  let plan: ReturnType<typeof deriveProductionAutomationExecutionPlan>;
  try { plan = deriveProductionAutomationExecutionPlan(aggregate, rules.filter((rule) => rule !== undefined), new Date(timestamp)); }
  catch { throw new BadRequestException("automation_execution_not_safe"); }
  if (!isDeepStrictEqual(command.tasks, plan.tasks) || !isDeepStrictEqual(command.notifications, plan.notifications)
    || !isDeepStrictEqual(command.evaluatedRules, plan.evaluatedRules)) throw new ConflictException("automation_preview_changed");
}
