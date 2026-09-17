import { stableProductionFingerprint } from "./procurement";
import { scopeContains } from "./scope";

import type {
  AssetRequirement,
  CutPlan,
  DecisionRecord,
  EpisodePlan,
  PlanningDocumentStatus,
  PlanningSnapshot,
  ProductionRisk,
  ProjectBrief,
  ScenePlan,
  SeasonPlan,
  SeriesMaster,
} from "./types";

const TERMINAL_PLANNING_STATUSES = new Set<PlanningDocumentStatus>([
  "superseded",
  "archived",
]);

export function validatePlanningRevision(
  current: { readonly id: string; readonly projectId: string; readonly revision: number; readonly status: PlanningDocumentStatus } | null,
  next: { readonly id: string; readonly projectId: string; readonly revision: number; readonly status: PlanningDocumentStatus },
): readonly string[] {
  const issues: string[] = [];
  if (next.revision < 1) issues.push("planning-revision-invalid");
  if (!current) return Object.freeze(issues);
  if (current.id !== next.id || current.projectId !== next.projectId) issues.push("planning-identity-changed");
  if (TERMINAL_PLANNING_STATUSES.has(current.status)) issues.push("planning-terminal-document-mutated");
  if (next.revision !== current.revision + 1) issues.push("planning-revision-not-sequential");
  if ((current.status === "approved" || current.status === "locked") && next.status !== "superseded") {
    issues.push("approved-planning-document-requires-supersession");
  }
  return Object.freeze(issues);
}

function approvalIssues(
  status: PlanningDocumentStatus,
  approvers: readonly string[],
): string[] {
  return (status === "approved" || status === "locked") && approvers.length === 0
    ? ["planning-approval-missing"]
    : [];
}

export function validateProjectBrief(brief: ProjectBrief): readonly string[] {
  const issues = approvalIssues(brief.status, brief.approvedByAssignmentIds);
  if (!brief.title.trim()) issues.push("brief-title-missing");
  if (!brief.logline.trim()) issues.push("brief-logline-missing");
  if ((brief.status === "approved" || brief.status === "locked") && !brief.synopsis.trim()) {
    issues.push("brief-synopsis-missing");
  }
  if ((brief.status === "approved" || brief.status === "locked") && brief.audience.length === 0) {
    issues.push("brief-audience-missing");
  }
  if ((brief.status === "approved" || brief.status === "locked") && brief.platformProfileRefs.length === 0) {
    issues.push("brief-platform-missing");
  }
  return Object.freeze(issues);
}

export function validateSeriesMaster(master: SeriesMaster): readonly string[] {
  const issues = approvalIssues(master.status, master.approvedByAssignmentIds);
  if (!master.premise.trim()) issues.push("series-premise-missing");
  if ((master.status === "approved" || master.status === "locked") && master.worldRules.length === 0) {
    issues.push("series-world-rules-missing");
  }
  if ((master.status === "approved" || master.status === "locked") && master.styleRules.length === 0) {
    issues.push("series-style-rules-missing");
  }
  return Object.freeze(issues);
}

export function validateSeasonPlan(plan: SeasonPlan): readonly string[] {
  const issues = approvalIssues(plan.status, plan.approvedByAssignmentIds);
  if (!plan.title.trim()) issues.push("season-title-missing");
  if (!plan.goal.trim()) issues.push("season-goal-missing");
  if (!Number.isInteger(plan.targetEpisodeCount) || plan.targetEpisodeCount < 1) {
    issues.push("season-episode-count-invalid");
  }
  if (plan.episodeOrder.length > plan.targetEpisodeCount) issues.push("season-order-exceeds-target");
  if (plan.releaseCadenceDays !== null && (!Number.isInteger(plan.releaseCadenceDays) || plan.releaseCadenceDays < 1)) {
    issues.push("season-cadence-invalid");
  }
  if (plan.budgetCapMinor !== null && plan.budgetCapMinor < 0) issues.push("season-budget-invalid");
  if ((plan.budgetCapMinor === null) !== (plan.currency === null)) issues.push("season-budget-currency-incomplete");
  return Object.freeze(issues);
}

export function validateEpisodePlan(plan: EpisodePlan): readonly string[] {
  const issues = approvalIssues(plan.status, plan.approvedByAssignmentIds);
  if (!Number.isInteger(plan.episodeNumber) || plan.episodeNumber < 0) issues.push("episode-number-invalid");
  if (!plan.title.trim()) issues.push("episode-title-missing");
  if (!plan.logline.trim()) issues.push("episode-logline-missing");
  if (plan.targetCutCount < 1 || !Number.isInteger(plan.targetCutCount)) issues.push("episode-cut-count-invalid");
  if (plan.targetScrollHeightPx < 1 || !Number.isInteger(plan.targetScrollHeightPx)) issues.push("episode-scroll-height-invalid");
  if ((plan.status === "approved" || plan.status === "locked") && !plan.openingHook.trim()) issues.push("episode-hook-missing");
  if ((plan.status === "approved" || plan.status === "locked") && !plan.coreConflict.trim()) issues.push("episode-conflict-missing");
  if ((plan.status === "approved" || plan.status === "locked") && !plan.cliffhanger.trim()) issues.push("episode-cliffhanger-missing");
  if ((plan.status === "approved" || plan.status === "locked") && !plan.narrativeRevisionRef) issues.push("episode-narrative-revision-missing");
  return Object.freeze(issues);
}

export function validateScenePlan(
  plan: ScenePlan,
  episodePlan: EpisodePlan | null,
): readonly string[] {
  const issues = approvalIssues(plan.status, plan.approvedByAssignmentIds);
  if (!episodePlan || episodePlan.episodeId !== plan.episodeId) issues.push("scene-episode-plan-missing");
  if (!Number.isInteger(plan.order) || plan.order < 0) issues.push("scene-order-invalid");
  if (!plan.purpose.trim()) issues.push("scene-purpose-missing");
  if (!plan.emotionalBeat.trim()) issues.push("scene-emotional-beat-missing");
  if (!Number.isFinite(plan.estimatedMinutes) || plan.estimatedMinutes < 0) issues.push("scene-estimate-invalid");
  return Object.freeze(issues);
}

export function validateCutPlan(
  plan: CutPlan,
  scenePlan: ScenePlan | null,
): readonly string[] {
  const issues = approvalIssues(plan.status, plan.approvedByAssignmentIds);
  if (!scenePlan || scenePlan.sceneId !== plan.sceneId || scenePlan.episodeId !== plan.episodeId) {
    issues.push("cut-scene-plan-missing");
  }
  if (!Number.isInteger(plan.order) || plan.order < 0) issues.push("cut-order-invalid");
  if (!plan.framing.trim()) issues.push("cut-framing-missing");
  if (!plan.camera.trim()) issues.push("cut-camera-missing");
  if (!Number.isFinite(plan.estimatedHours) || plan.estimatedHours < 0) issues.push("cut-estimate-invalid");
  return Object.freeze(issues);
}

export function createPlanningSnapshot(
  input: Omit<PlanningSnapshot, "digest">,
): PlanningSnapshot {
  if (input.sourceRevisionRefs.length === 0) {
    throw new Error("Planning snapshot requires source revisions.");
  }
  if (input.documentRefs.length === 0) {
    throw new Error("Planning snapshot requires source documents.");
  }
  if (input.approvedByAssignmentIds.length === 0) {
    throw new Error("Planning snapshot requires approvers.");
  }
  return Object.freeze({
    ...input,
    digest: stableProductionFingerprint({
      projectId: input.projectId,
      scope: input.scope,
      type: input.type,
      sourceRevisionRefs: input.sourceRevisionRefs.map((entry) => entry.digest),
      documentRefs: input.documentRefs,
      approvedByAssignmentIds: input.approvedByAssignmentIds,
      createdAt: input.createdAt,
    }),
  });
}

export function verifyPlanningSnapshot(snapshot: PlanningSnapshot): boolean {
  const { digest: _digest, ...input } = snapshot;
  return createPlanningSnapshot(input).digest === snapshot.digest;
}

export function validateAssetRequirement(requirement: AssetRequirement): readonly string[] {
  const issues: string[] = [];
  if (!requirement.title.trim()) issues.push("asset-requirement-title-missing");
  if (!requirement.specification.trim()) issues.push("asset-requirement-specification-missing");
  if (requirement.sourcePlanRefs.length === 0) issues.push("asset-requirement-source-missing");
  if (requirement.sourcing !== "internal" && requirement.rightsRequirements.length === 0) {
    issues.push("asset-requirement-rights-missing");
  }
  return Object.freeze(issues);
}

export function validateProductionRisk(risk: ProductionRisk): readonly string[] {
  const issues: string[] = [];
  if (!risk.title.trim()) issues.push("risk-title-missing");
  if (!risk.description.trim()) issues.push("risk-description-missing");
  if (!Number.isInteger(risk.revision) || risk.revision < 1) issues.push("risk-revision-invalid");
  if (risk.exposureScore !== risk.probability * risk.impact) issues.push("risk-exposure-mismatch");
  if (risk.priorityScore < 0 || risk.priorityScore > 100) issues.push("risk-priority-invalid");
  if (!risk.mitigation.trim() && ["open", "monitoring", "mitigating", "occurred"].includes(risk.status)) {
    issues.push("risk-mitigation-missing");
  }
  if (risk.status === "accepted" && !risk.acceptedReason?.trim()) issues.push("accepted-risk-reason-missing");
  if (risk.status === "dismissed" && !risk.dismissedReason?.trim()) issues.push("dismissed-risk-reason-missing");
  if (["resolved", "closed"].includes(risk.status) && !risk.resolutionSummary?.trim()) issues.push("resolved-risk-summary-missing");
  if (risk.source === "automatic" && risk.signalIds.length === 0) issues.push("automatic-risk-signal-missing");
  return Object.freeze(issues);
}

export function validateDecisionRecord(
  decision: DecisionRecord,
  authorityAssignmentIds: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  if (!decision.question.trim()) issues.push("decision-question-missing");
  if (!decision.decision.trim()) issues.push("decision-value-missing");
  if (!decision.rationale.trim()) issues.push("decision-rationale-missing");
  if (!authorityAssignmentIds.includes(decision.decidedByAssignmentId)) {
    issues.push("decision-maker-not-authorized");
  }
  if (decision.consultedAssignmentIds.includes(decision.decidedByAssignmentId)) {
    issues.push("decision-maker-listed-as-consulted");
  }
  return Object.freeze(issues);
}

export function planningScopeContains(
  container: ProjectBrief | SeriesMaster | SeasonPlan | EpisodePlan | ScenePlan | CutPlan,
  requirement: AssetRequirement,
): boolean {
  if (container.projectId !== requirement.projectId) return false;
  if ("episodeId" in container) {
    return scopeContains({
      kind: "episode",
      id: container.episodeId,
      ancestors: [{ kind: "project", id: container.projectId }],
    }, requirement.scope);
  }
  return true;
}
