import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  analyzeProductionChangeImpact,
  applySubmissionToDeliverable,
  commitProductionAggregate,
  createImmutableScopePackage,
  createScopePackageAddendum,
  createPlanningSnapshot,
  createProductionProjectAggregate,
  detectTaskDependencyCycles,
  evaluateHandoffReadiness,
  evaluateReviewApproval,
  resolveDecisionAuthority,
  preflightCreditManifest,
  stableProductionFingerprint,
  transitionEpisodeCollaboration,
  transitionHandoff,
  validateCollaborationGraph,
  validateAssetRequirement,
  validateContractChangeOrder,
  validateContractMilestones,
  validateCutPlan,
  validateDecisionRecord,
  validateDeliveryRevision,
  validateEpisodePlan,
  validateInvoice,
  validatePaymentRecord,
  validatePlanningRevision,
  validateProcurementProposal,
  validateProductionAgreement,
  validateProductionDispute,
  validateProductionRisk,
  validateProjectBrief,
  validateCompensationPlan,
  validateCreativeBranch,
  validateCreativeMergeRequest,
  validateCreativeCharter,
  validateDeliverable,
  validateReviewDecision,
  validateScenePlan,
  validateSeasonPlan,
  validateSeriesMaster,
  validateSubmission,
  type CompensationPlan,
  type ContributionRecord,
  type CreditManifest,
  type EpisodeCollaboration,
  type ProductionProjectAggregate,
  type RightsInterest,
  type ScopePackage,
  type StoryToArtHandoffPackage,
} from "@toonspectrum/core/production";

import {
  CreateProductionProjectSchema,
  ExecuteProductionCommandSchema,
  ProductionProjectByWorkParamsSchema,
  ProductionProjectParamsSchema,
  type ExecuteProductionCommand,
  type ProductionCommand, CreateProductionProjectDto 
} from "./production-collaboration.dto";
import {
  ProductionCollaborationRepository,
  ProductionProjectForbiddenError,
  ProductionProjectIdentityConflictError,
  ProductionProjectMutationConflictError,
  ProductionProjectNotFoundError,
  ProductionProjectRevisionConflictError,
  type ProductionMutationResponse,
  type ProductionProjectRecord,
} from "./production-collaboration.repository";


function upsertById<T extends { readonly id: string }>(
  values: readonly T[],
  value: T,
): readonly T[] {
  const index = values.findIndex((entry) => entry.id === value.id);
  if (index < 0) return Object.freeze([...values, value]);
  return Object.freeze(values.map((entry, currentIndex) => currentIndex === index ? value : entry));
}

function actorPartyId(
  aggregate: ProductionProjectAggregate,
  actorUserId: string,
): string | null {
  return aggregate.parties.find((party) => party.accountUserId === actorUserId)?.id ?? null;
}

function assertProjectIdentity(
  aggregate: ProductionProjectAggregate,
  value: { readonly projectId: string },
): void {
  if (value.projectId !== aggregate.projectId) {
    throw new BadRequestException("명령의 프로젝트 식별자가 현재 프로젝트와 일치하지 않습니다.");
  }
}

function assertAssignmentCanAct(
  aggregate: ProductionProjectAggregate,
  actorUserId: string,
  assignmentId: string,
): void {
  const partyId = actorPartyId(aggregate, actorUserId);
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  if (!partyId || !assignment || assignment.partyId !== partyId || assignment.status !== "active") {
    throw new ForbiddenException("현재 사용자의 활성 역할 배정으로만 이 결정을 기록할 수 있습니다.");
  }
}

function eventTarget(command: ProductionCommand): { type: string; id: string } {
  switch (command.type) {
    case "upsert-planning-record":
      return { type: `planning-${command.record.kind}`, id: command.record.value.id };
    case "create-planning-snapshot":
      return { type: "planning-snapshot", id: command.snapshot.id };
    case "upsert-commercial-record":
      return { type: `commercial-${command.record.kind}`, id: command.record.value.id };
    case "configure-collaboration":
      return { type: "collaboration", id: command.charter?.id ?? "collaboration-graph" };
    case "upsert-episode":
      return { type: "episode", id: command.episode.id };
    case "upsert-handoff":
      return { type: "handoff", id: command.handoff.id };
    case "upsert-clarification":
      return { type: "clarification", id: command.clarification.id };
    case "upsert-branch":
      return { type: "creative-branch", id: command.branch.id };
    case "upsert-merge-request":
      return { type: "merge-request", id: command.mergeRequest.id };
    case "upsert-deliverable":
      return { type: "deliverable", id: command.deliverable.id };
    case "upsert-submission":
      return { type: "submission", id: command.submission.id };
    case "upsert-review-policy":
      return { type: "review-policy", id: command.policy.id };
    case "record-review-decision":
      return { type: "review-decision", id: command.decision.id };
    case "upsert-task":
      return { type: "task", id: command.task.id };
    case "upsert-change-request":
      return { type: "change-request", id: command.request.id };
    case "publish-scope-package":
      return { type: "scope-package", id: command.scopePackage.id };
    case "amend-scope-package":
      return { type: "scope-package-addendum", id: command.addendumId };
    case "upsert-contribution":
      return { type: "contribution", id: command.contribution.id };
    case "upsert-credit-manifest":
      return { type: "credit-manifest", id: command.manifest.id };
    case "upsert-rights-interest":
      return { type: "rights-interest", id: command.interest.id };
    case "upsert-compensation-plan":
      return { type: "compensation-plan", id: command.plan.id };
  }
}

function commandCapability(command: ProductionCommand): "comment" | "edit" | "manage" {
  if (command.type === "record-review-decision") return "comment";
  if (command.type === "upsert-commercial-record") {
    const record = command.record;
    if (record.kind === "proposal") {
      return ["draft", "submitted", "clarification", "withdrawn"].includes(record.value.status)
        ? "comment"
        : "manage";
    }
    if (record.kind === "delivery-revision") {
      return ["draft", "submitted"].includes(record.value.status) ? "comment" : "manage";
    }
    if (record.kind === "invoice") {
      return ["draft", "issued"].includes(record.value.status) ? "comment" : "manage";
    }
    if (record.kind === "dispute") {
      return ["open", "response"].includes(record.value.status) ? "comment" : "manage";
    }
    return "manage";
  }
  if (
    command.type === "configure-collaboration"
    || command.type === "publish-scope-package"
    || command.type === "amend-scope-package"
    || command.type === "upsert-rights-interest"
    || command.type === "upsert-compensation-plan"
  ) {
    return "manage";
  }
  return "edit";
}

function applyEpisodeCommand(
  aggregate: ProductionProjectAggregate,
  episode: EpisodeCollaboration,
): ProductionProjectAggregate {
  assertProjectIdentity(aggregate, episode);
  const current = aggregate.episodes.find((entry) => entry.id === episode.id);
  let nextEpisode = episode;
  if (!current) {
    if (episode.revision !== 0 || !["episode-planning", "story-drafting"].includes(episode.state)) {
      throw new BadRequestException("새 회차 협업은 기획 또는 스토리 초안 상태의 revision 0으로 시작해야 합니다.");
    }
  } else if (current.state !== episode.state) {
    nextEpisode = transitionEpisodeCollaboration(current, episode.state, {
      at: episode.updatedAt,
      narrativeRevisionRef: episode.narrativeRevisionRef,
      visualRevisionRef: episode.visualRevisionRef,
      integratedRevisionRef: episode.integratedRevisionRef,
      activeHandoffId: episode.activeHandoffId,
      openBlockerCount: episode.openBlockerCount,
      storyLockApproved: episode.storyLockApproved,
      thumbnailLockApproved: episode.thumbnailLockApproved,
      jointProofApproved: episode.jointProofApproved,
      creditPreflightPassed: episode.creditPreflightPassed,
      publicationPreflightPassed: episode.publicationPreflightPassed,
    });
  } else {
    nextEpisode = Object.freeze({ ...episode, revision: current.revision + 1 });
  }
  return { ...aggregate, episodes: upsertById(aggregate.episodes, nextEpisode) };
}

function applyHandoffCommand(
  aggregate: ProductionProjectAggregate,
  handoff: StoryToArtHandoffPackage,
): { aggregate: ProductionProjectAggregate; derived: unknown } {
  assertProjectIdentity(aggregate, handoff);
  const readiness = evaluateHandoffReadiness({
    package: handoff,
    clarifications: aggregate.clarifications.filter((thread) => thread.handoffId === handoff.id),
  });
  const current = aggregate.handoffs.find((entry) => entry.id === handoff.id);
  let next = handoff;
  if (current && current.status !== handoff.status) {
    next = transitionHandoff(current, handoff.status, {
      readiness,
      assignmentId: handoff.acceptedByAssignmentId ?? undefined,
      at: handoff.acceptedAt ?? handoff.createdAt,
    });
    next = Object.freeze({ ...handoff, ...next, handoffRevision: current.handoffRevision + 1 });
  }
  if (["accepted-by-art", "production-started"].includes(next.status) && !readiness.ready) {
    throw new BadRequestException({
      message: "인수인계 준비 조건이 충족되지 않았습니다.",
      readiness,
    });
  }
  return {
    aggregate: { ...aggregate, handoffs: upsertById(aggregate.handoffs, next) },
    derived: { readiness },
  };
}

type PlanningRecordCommand = Extract<ProductionCommand, { readonly type: "upsert-planning-record" }>["record"];
type CommercialRecordCommand = Extract<ProductionCommand, { readonly type: "upsert-commercial-record" }>["record"];

function activeActorAssignmentIds(
  aggregate: ProductionProjectAggregate,
  actorUserId: string,
): readonly string[] {
  const partyId = actorPartyId(aggregate, actorUserId);
  if (!partyId) return Object.freeze([]);
  return Object.freeze(aggregate.assignments
    .filter((assignment) => assignment.partyId === partyId && assignment.status === "active")
    .map((assignment) => assignment.id));
}

function assertPlanningProject(
  aggregate: ProductionProjectAggregate,
  value: { readonly projectId: string },
): void {
  assertProjectIdentity(aggregate, value);
}

function applyPlanningRecord(
  aggregate: ProductionProjectAggregate,
  record: PlanningRecordCommand,
  actorUserId: string,
): ProductionProjectAggregate {
  assertPlanningProject(aggregate, record.value);
  if (
    "approvedByAssignmentIds" in record.value
    && "status" in record.value
    && (record.value.status === "approved" || record.value.status === "locked")
  ) {
    const activeIds = new Set(aggregate.assignments
      .filter((assignment) => assignment.status === "active")
      .map((assignment) => assignment.id));
    const inactive = record.value.approvedByAssignmentIds.filter(
      (assignmentId) => !activeIds.has(assignmentId),
    );
    const approvals = new Set(aggregate.reviewDecisions
      .filter((decision) => decision.reviewRoundId === record.value.id
        && (decision.value === "approve" || decision.value === "approve-with-conditions"))
      .map((decision) => decision.assignmentId));
    const missingEvidence = record.value.approvedByAssignmentIds.filter(
      (assignmentId) => !approvals.has(assignmentId),
    );
    if (inactive.length > 0 || missingEvidence.length > 0) {
      throw new BadRequestException({
        message: "승인된 기획 문서의 역할·검수 증빙이 부족합니다.",
        inactiveAssignmentIds: inactive,
        missingApprovalEvidenceAssignmentIds: missingEvidence,
      });
    }
  }
  switch (record.kind) {
    case "project-brief": {
      const current = aggregate.projectBriefs.find((entry) => entry.id === record.value.id) ?? null;
      const issues = [
        ...validatePlanningRevision(current, record.value),
        ...validateProjectBrief(record.value),
      ];
      if (issues.length > 0) throw new BadRequestException({ message: "Project Brief를 저장할 수 없습니다.", issues });
      return { ...aggregate, projectBriefs: upsertById(aggregate.projectBriefs, record.value) };
    }
    case "series-master": {
      const current = aggregate.seriesMasters.find((entry) => entry.id === record.value.id) ?? null;
      const issues = [
        ...validatePlanningRevision(current, record.value),
        ...validateSeriesMaster(record.value),
      ];
      if (issues.length > 0) throw new BadRequestException({ message: "Series Master를 저장할 수 없습니다.", issues });
      return { ...aggregate, seriesMasters: upsertById(aggregate.seriesMasters, record.value) };
    }
    case "season-plan": {
      const current = aggregate.seasonPlans.find((entry) => entry.id === record.value.id) ?? null;
      const issues = [
        ...validatePlanningRevision(current, record.value),
        ...validateSeasonPlan(record.value),
      ];
      if (issues.length > 0) throw new BadRequestException({ message: "시즌 계획을 저장할 수 없습니다.", issues });
      return { ...aggregate, seasonPlans: upsertById(aggregate.seasonPlans, record.value) };
    }
    case "episode-plan": {
      const current = aggregate.episodePlans.find((entry) => entry.id === record.value.id) ?? null;
      const issues = [
        ...validatePlanningRevision(current, record.value),
        ...validateEpisodePlan(record.value),
      ];
      if (issues.length > 0) throw new BadRequestException({ message: "회차 계획을 저장할 수 없습니다.", issues });
      return { ...aggregate, episodePlans: upsertById(aggregate.episodePlans, record.value) };
    }
    case "scene-plan": {
      const current = aggregate.scenePlans.find((entry) => entry.id === record.value.id) ?? null;
      const episodePlan = [...aggregate.episodePlans]
        .filter((entry) => entry.episodeId === record.value.episodeId)
        .sort((left, right) => right.revision - left.revision)[0] ?? null;
      const issues = [
        ...validatePlanningRevision(current, record.value),
        ...validateScenePlan(record.value, episodePlan),
      ];
      if (issues.length > 0) throw new BadRequestException({ message: "장면 계획을 저장할 수 없습니다.", issues });
      return { ...aggregate, scenePlans: upsertById(aggregate.scenePlans, record.value) };
    }
    case "cut-plan": {
      const current = aggregate.cutPlans.find((entry) => entry.id === record.value.id) ?? null;
      const scenePlan = [...aggregate.scenePlans]
        .filter((entry) => entry.sceneId === record.value.sceneId && entry.episodeId === record.value.episodeId)
        .sort((left, right) => right.revision - left.revision)[0] ?? null;
      const issues = [
        ...validatePlanningRevision(current, record.value),
        ...validateCutPlan(record.value, scenePlan),
      ];
      if (issues.length > 0) throw new BadRequestException({ message: "컷 계획을 저장할 수 없습니다.", issues });
      return { ...aggregate, cutPlans: upsertById(aggregate.cutPlans, record.value) };
    }
    case "asset-requirement": {
      const issues = validateAssetRequirement(record.value);
      if (issues.length > 0) throw new BadRequestException({ message: "에셋 요구사항을 저장할 수 없습니다.", issues });
      return { ...aggregate, assetRequirements: upsertById(aggregate.assetRequirements, record.value) };
    }
    case "risk": {
      if (record.value.ownerAssignmentId) {
        const owner = aggregate.assignments.find((entry) => entry.id === record.value.ownerAssignmentId);
        if (!owner || owner.status !== "active") {
          throw new BadRequestException("위험 담당자는 활성 역할 배정이어야 합니다.");
        }
      }
      const issues = validateProductionRisk(record.value);
      if (issues.length > 0) throw new BadRequestException({ message: "위험 항목을 저장할 수 없습니다.", issues });
      return { ...aggregate, risks: upsertById(aggregate.risks, record.value) };
    }
    case "decision": {
      assertAssignmentCanAct(aggregate, actorUserId, record.value.decidedByAssignmentId);
      const authority = resolveDecisionAuthority({
        assignmentId: record.value.decidedByAssignmentId,
        domain: record.value.domain,
        scope: record.value.scope,
        at: record.value.createdAt,
        assignments: aggregate.assignments,
        rules: aggregate.authorityRules,
      });
      const mayDecide = authority.levels.includes("decide") || authority.levels.includes("mediate");
      const issues = [...validateDecisionRecord(
        record.value,
        mayDecide ? [record.value.decidedByAssignmentId] : [],
      )];
      if (record.value.supersedesDecisionId) {
        const superseded = aggregate.decisions.find((entry) => entry.id === record.value.supersedesDecisionId);
        if (!superseded || superseded.domain !== record.value.domain) {
          issues.push("superseded-decision-missing-or-domain-mismatch");
        }
      }
      if (issues.length > 0) throw new BadRequestException({ message: "결정 기록을 저장할 수 없습니다.", issues });
      return { ...aggregate, decisions: upsertById(aggregate.decisions, record.value) };
    }
  }
}

function commercialActorParty(
  aggregate: ProductionProjectAggregate,
  actorUserId: string,
): string {
  const partyId = actorPartyId(aggregate, actorUserId);
  if (!partyId) throw new ForbiddenException("프로젝트 당사자만 상업 기록을 작성할 수 있습니다.");
  return partyId;
}

function applyCommercialRecord(
  aggregate: ProductionProjectAggregate,
  record: CommercialRecordCommand,
  actorUserId: string,
): ProductionProjectAggregate {
  assertProjectIdentity(aggregate, record.value);
  const actorParty = commercialActorParty(aggregate, actorUserId);
  switch (record.kind) {
    case "proposal": {
      if (["draft", "submitted", "clarification", "withdrawn"].includes(record.value.status)
        && record.value.proposerPartyId !== actorParty) {
        throw new ForbiddenException("제안 당사자만 제안서를 작성·제출·철회할 수 있습니다.");
      }
      const scopePackage = aggregate.scopePackages.find(
        (entry) => entry.id === record.value.scopePackageId
          && entry.revision === record.value.scopePackageRevision,
      ) ?? null;
      const issues = validateProcurementProposal(record.value, scopePackage);
      if (issues.length > 0) throw new BadRequestException({ message: "제안서를 저장할 수 없습니다.", issues });
      return { ...aggregate, proposals: upsertById(aggregate.proposals, record.value) };
    }
    case "agreement": {
      const scopePackage = aggregate.scopePackages.find(
        (entry) => entry.id === record.value.scopePackageId
          && entry.revision === record.value.scopePackageRevision,
      ) ?? null;
      const proposal = record.value.selectedProposalId
        ? aggregate.proposals.find((entry) => entry.id === record.value.selectedProposalId) ?? null
        : null;
      const current = aggregate.agreements.find((entry) => entry.id === record.value.id) ?? null;
      const issues = [...validateProductionAgreement({ agreement: record.value, scopePackage, proposal })];
      if (record.value.partyIds.some((partyId) => !aggregate.parties.some((party) => party.id === partyId))) {
        issues.push("agreement-party-missing");
      }
      if (proposal && proposal.status !== "selected") issues.push("agreement-proposal-not-selected");
      if (current) {
        if (record.value.revision !== current.revision + 1) issues.push("agreement-revision-not-sequential");
        const transitions: Readonly<Record<typeof current.status, readonly typeof record.value.status[]>> = {
          draft: ["party-review", "signed", "superseded"],
          "party-review": ["draft", "signed", "superseded"],
          signed: ["active", "terminated", "superseded"],
          active: ["paused", "completed", "terminated", "superseded"],
          paused: ["active", "terminated", "superseded"],
          completed: [],
          terminated: [],
          superseded: [],
        };
        if (current.status !== record.value.status && !transitions[current.status].includes(record.value.status)) {
          issues.push(`illegal-agreement-transition:${current.status}:${record.value.status}`);
        }
      }
      if (issues.length > 0) throw new BadRequestException({ message: "계약 기록을 저장할 수 없습니다.", issues });
      return { ...aggregate, agreements: upsertById(aggregate.agreements, record.value) };
    }
    case "change-order": {
      const agreement = aggregate.agreements.find((entry) => entry.id === record.value.agreementId) ?? null;
      const issues = [...validateContractChangeOrder(
        record.value,
        agreement,
        aggregate.changeRequests.map((entry) => entry.id),
        aggregate.scopePackageAddenda.map((entry) => entry.id),
      )];
      if (record.value.approvedByAssignmentIds.some((assignmentId) =>
        !aggregate.assignments.some((assignment) => assignment.id === assignmentId && assignment.status === "active"))) {
        issues.push("change-order-approver-inactive");
      }
      if (issues.length > 0) throw new BadRequestException({ message: "ChangeOrder를 저장할 수 없습니다.", issues });
      return { ...aggregate, changeOrders: upsertById(aggregate.changeOrders, record.value) };
    }
    case "milestone": {
      const agreement = aggregate.agreements.find((entry) => entry.id === record.value.agreementId);
      if (!agreement) throw new BadRequestException("마일스톤의 계약을 찾을 수 없습니다.");
      const milestones = upsertById(aggregate.contractMilestones, record.value);
      const issues = [...validateContractMilestones(agreement, milestones)];
      if (record.value.acceptedSubmissionIds.some((submissionId) =>
        !aggregate.submissions.some((submission) => submission.id === submissionId && submission.status === "approved"))) {
        issues.push("milestone-approved-submission-missing");
      }
      if (issues.length > 0) throw new BadRequestException({ message: "계약 마일스톤을 저장할 수 없습니다.", issues });
      return { ...aggregate, contractMilestones: milestones };
    }
    case "delivery-revision": {
      assertAssignmentCanAct(aggregate, actorUserId, record.value.submittedByAssignmentId);
      const milestone = aggregate.contractMilestones.find((entry) => entry.id === record.value.milestoneId) ?? null;
      const current = aggregate.deliveryRevisions.find((entry) => entry.id === record.value.id) ?? null;
      const issues = [...validateDeliveryRevision({
        delivery: record.value,
        milestone,
        submissions: aggregate.submissions,
        activeAssignmentIds: aggregate.assignments
          .filter((assignment) => assignment.status === "active")
          .map((assignment) => assignment.id),
      })];
      if (current && record.value.revision !== current.revision + 1) {
        issues.push("delivery-revision-not-sequential");
      }
      if (current?.status === "accepted" && record.value.status !== "superseded") {
        issues.push("accepted-delivery-requires-supersession");
      }
      if (issues.length > 0) throw new BadRequestException({ message: "납품 revision을 저장할 수 없습니다.", issues });
      return { ...aggregate, deliveryRevisions: upsertById(aggregate.deliveryRevisions, record.value) };
    }
    case "invoice": {
      if (["draft", "issued"].includes(record.value.status) && record.value.issuerPartyId !== actorParty) {
        throw new ForbiddenException("청구 발행 당사자만 청구서를 작성·발행할 수 있습니다.");
      }
      const agreement = aggregate.agreements.find((entry) => entry.id === record.value.agreementId) ?? null;
      const milestone = record.value.milestoneId
        ? aggregate.contractMilestones.find((entry) => entry.id === record.value.milestoneId) ?? null
        : null;
      const issues = validateInvoice(record.value, agreement, milestone);
      if (issues.length > 0) throw new BadRequestException({ message: "청구 기록을 저장할 수 없습니다.", issues });
      return { ...aggregate, invoices: upsertById(aggregate.invoices, record.value) };
    }
    case "payment": {
      const invoice = aggregate.invoices.find((entry) => entry.id === record.value.invoiceId) ?? null;
      const issues = validatePaymentRecord(
        record.value,
        invoice,
        aggregate.assignments.filter((assignment) => assignment.status === "active").map((assignment) => assignment.id),
      );
      if (issues.length > 0) throw new BadRequestException({ message: "지급 기록을 저장할 수 없습니다.", issues });
      return { ...aggregate, paymentRecords: upsertById(aggregate.paymentRecords, record.value) };
    }
    case "dispute": {
      if (["open", "response"].includes(record.value.status) && record.value.openedByPartyId !== actorParty) {
        throw new ForbiddenException("분쟁 제기 당사자만 이 진술을 기록할 수 있습니다.");
      }
      const agreement = aggregate.agreements.find((entry) => entry.id === record.value.agreementId) ?? null;
      const issues = [...validateProductionDispute(record.value, agreement)];
      if (record.value.respondentPartyIds.some((partyId) =>
        !aggregate.parties.some((party) => party.id === partyId))) {
        issues.push("dispute-respondent-party-missing");
      }
      if (issues.length > 0) throw new BadRequestException({ message: "분쟁 기록을 저장할 수 없습니다.", issues });
      return { ...aggregate, disputes: upsertById(aggregate.disputes, record.value) };
    }
  }
}

function applyPlanningSnapshot(
  aggregate: ProductionProjectAggregate,
  input: Extract<ProductionCommand, { readonly type: "create-planning-snapshot" }>["snapshot"],
  actorUserId: string,
): { readonly aggregate: ProductionProjectAggregate; readonly derived: unknown } {
  assertProjectIdentity(aggregate, input);
  if (aggregate.planningSnapshots.some((entry) => entry.id === input.id)) {
    throw new BadRequestException("동일한 기획 snapshot 식별자가 이미 존재합니다.");
  }
  const activeIds = new Set(aggregate.assignments
    .filter((assignment) => assignment.status === "active")
    .map((assignment) => assignment.id));
  if (input.approvedByAssignmentIds.some((assignmentId) => !activeIds.has(assignmentId))) {
    throw new BadRequestException("기획 snapshot 승인자는 모두 활성 역할 배정이어야 합니다.");
  }
  const actorAssignments = activeActorAssignmentIds(aggregate, actorUserId);
  if (!actorAssignments.some((assignmentId) => input.approvedByAssignmentIds.includes(assignmentId))) {
    throw new ForbiddenException("snapshot 승인자 중 한 명만 snapshot을 확정할 수 있습니다.");
  }
  const approvalAssignments = new Set(aggregate.reviewDecisions
    .filter((decision) => decision.reviewRoundId === input.id
      && (decision.value === "approve" || decision.value === "approve-with-conditions"))
    .map((decision) => decision.assignmentId));
  const missingApprovalEvidence = input.approvedByAssignmentIds.filter(
    (assignmentId) => !approvalAssignments.has(assignmentId),
  );
  if (missingApprovalEvidence.length > 0) {
    throw new BadRequestException({
      message: "snapshot 승인 결정 증빙이 부족합니다.",
      missingApprovalAssignmentIds: missingApprovalEvidence,
    });
  }
  const snapshot = createPlanningSnapshot(input);
  let episodes = aggregate.episodes;
  if (["story-lock", "thumbnail-lock", "joint-proof", "publication"].includes(snapshot.type)) {
    if (snapshot.scope.kind !== "episode") {
      throw new BadRequestException("회차 잠금 snapshot은 episode scope여야 합니다.");
    }
    const episode = episodes.find((entry) => entry.episodeId === snapshot.scope.id);
    if (!episode) throw new BadRequestException("snapshot 대상 회차를 찾을 수 없습니다.");
    let next = { ...episode, revision: episode.revision + 1, updatedAt: snapshot.createdAt };
    if (snapshot.type === "story-lock") {
      const revision = [...snapshot.sourceRevisionRefs].reverse().find((entry) => entry.lineage === "narrative");
      if (!revision) throw new BadRequestException("StoryLock에는 narrative revision이 필요합니다.");
      next = { ...next, storyLockApproved: true, narrativeRevisionRef: revision };
    } else if (snapshot.type === "thumbnail-lock") {
      const revision = [...snapshot.sourceRevisionRefs].reverse().find((entry) => entry.lineage === "visual");
      if (!revision) throw new BadRequestException("ThumbnailLock에는 visual revision이 필요합니다.");
      next = { ...next, thumbnailLockApproved: true, visualRevisionRef: revision };
    } else if (snapshot.type === "joint-proof") {
      const revision = [...snapshot.sourceRevisionRefs].reverse().find((entry) => entry.lineage === "integrated");
      if (!revision) throw new BadRequestException("JointProof에는 integrated revision이 필요합니다.");
      next = { ...next, jointProofApproved: true, integratedRevisionRef: revision };
    } else {
      if (!episode.jointProofApproved) throw new BadRequestException("게시 snapshot 전에 JointProof 승인이 필요합니다.");
      const manifest = [...aggregate.creditManifests]
        .filter((entry) => entry.episodeId === episode.episodeId)
        .sort((left, right) => right.revision - left.revision)[0] ?? null;
      const preflight = preflightCreditManifest({
        manifest,
        contentRevisionRefs: snapshot.sourceRevisionRefs,
        contributions: aggregate.contributions,
        rightsInterests: aggregate.rightsInterests,
        requiredApproverAssignmentIds: input.approvedByAssignmentIds,
      });
      if (!preflight.passed) {
        throw new BadRequestException({ message: "게시 snapshot의 크레딧·권리 preflight가 실패했습니다.", preflight });
      }
      next = { ...next, creditPreflightPassed: true, publicationPreflightPassed: true };
    }
    episodes = upsertById(episodes, Object.freeze(next));
  }
  return {
    aggregate: {
      ...aggregate,
      episodes,
      planningSnapshots: Object.freeze([...aggregate.planningSnapshots, snapshot]),
    },
    derived: { snapshot },
  };
}

function applyCommand(
  aggregate: ProductionProjectAggregate,
  command: ProductionCommand,
  actorUserId: string,
): { aggregate: ProductionProjectAggregate; derived?: unknown } {
  switch (command.type) {
    case "upsert-planning-record":
      return { aggregate: applyPlanningRecord(aggregate, command.record, actorUserId) };
    case "create-planning-snapshot":
      return applyPlanningSnapshot(aggregate, command.snapshot, actorUserId);
    case "upsert-commercial-record":
      return { aggregate: applyCommercialRecord(aggregate, command.record, actorUserId) };
    case "configure-collaboration": {
      const issues = validateCollaborationGraph({
        parties: command.parties,
        assignments: command.assignments,
        authorityRules: command.authorityRules,
      });
      if (issues.length > 0) {
        throw new BadRequestException({ message: "협업 역할·권한 그래프가 올바르지 않습니다.", issues });
      }
      for (const party of aggregate.parties.filter((entry) => entry.accountUserId === actorUserId)) {
        if (!command.parties.some((entry) => entry.id === party.id && entry.accountUserId === actorUserId)) {
          throw new BadRequestException("프로젝트 소유 당사자는 협업 설정에서 제거할 수 없습니다.");
        }
      }
      const charters = command.charter
        ? upsertById(aggregate.charters, command.charter)
        : aggregate.charters;
      if (command.charter) {
        assertProjectIdentity(aggregate, command.charter);
        const criticalAssignments = command.assignments
          .filter((assignment) => assignment.lead && ["story-lead", "art-lead", "producer"].includes(assignment.roleType))
          .map((assignment) => assignment.id);
        const charterIssues = validateCreativeCharter(command.charter, criticalAssignments);
        if (charterIssues.length > 0) {
          throw new BadRequestException({ message: "Creative Charter가 완료되지 않았습니다.", issues: charterIssues });
        }
      }
      return {
        aggregate: {
          ...aggregate,
          parties: Object.freeze([...command.parties]),
          assignments: Object.freeze([...command.assignments]),
          authorityRules: Object.freeze([...command.authorityRules]),
          charters,
        },
      };
    }
    case "upsert-episode":
      return { aggregate: applyEpisodeCommand(aggregate, command.episode) };
    case "upsert-handoff":
      return applyHandoffCommand(aggregate, command.handoff);
    case "upsert-clarification": {
      const clarification = command.clarification;
      if (!aggregate.handoffs.some((handoff) => handoff.id === clarification.handoffId)) {
        throw new BadRequestException("질문이 참조하는 인수인계 패키지가 없습니다.");
      }
      assertAssignmentCanAct(aggregate, actorUserId, clarification.askedByAssignmentId);
      return {
        aggregate: {
          ...aggregate,
          clarifications: upsertById(aggregate.clarifications, clarification),
        },
      };
    }
    case "upsert-branch": {
      assertProjectIdentity(aggregate, command.branch);
      assertAssignmentCanAct(aggregate, actorUserId, command.branch.ownerAssignmentId);
      const current = aggregate.branches.find((entry) => entry.id === command.branch.id) ?? null;
      const issues = validateCreativeBranch({
        branch: command.branch,
        current,
        aggregate,
      });
      if (issues.length > 0) {
        throw new BadRequestException({ message: "창작 branch를 저장할 수 없습니다.", issues });
      }
      return {
        aggregate: {
          ...aggregate,
          branches: upsertById(aggregate.branches, command.branch),
        },
      };
    }
    case "upsert-merge-request": {
      assertProjectIdentity(aggregate, command.mergeRequest);
      assertAssignmentCanAct(aggregate, actorUserId, command.mergeRequest.createdByAssignmentId);
      const branch = aggregate.branches.find((entry) => entry.id === command.mergeRequest.sourceBranchId) ?? null;
      const current = aggregate.mergeRequests.find((entry) => entry.id === command.mergeRequest.id) ?? null;
      const issues = validateCreativeMergeRequest({
        request: command.mergeRequest,
        current,
        branch,
      });
      if (issues.length > 0) {
        throw new BadRequestException({ message: "병합 요청을 저장할 수 없습니다.", issues });
      }
      if (["approved", "merged"].includes(command.mergeRequest.status)) {
        const policy = aggregate.reviewPolicies.find((entry) => entry.id === command.mergeRequest.mergePolicyId);
        if (!policy) throw new BadRequestException("병합 승인 정책을 찾을 수 없습니다.");
        const requiredLanes = new Set(command.mergeRequest.requiredReviewLanes);
        const scopedPolicy = {
          ...policy,
          lanes: policy.lanes.filter((lane) => requiredLanes.has(lane.lane)),
        };
        if (scopedPolicy.lanes.length !== requiredLanes.size) {
          throw new BadRequestException("병합 요청의 필수 검수 lane이 정책에 모두 포함되지 않았습니다.");
        }
        const approval = evaluateReviewApproval(
          scopedPolicy,
          aggregate.reviewDecisions.filter(
            (decision) => decision.reviewRoundId === command.mergeRequest.id,
          ),
        );
        if (!approval.approved) {
          throw new BadRequestException({ message: "필수 검수 lane이 승인되지 않았습니다.", approval });
        }
      }
      let branches = aggregate.branches;
      let episodes = aggregate.episodes;
      if (command.mergeRequest.status === "merged") {
        if (!branch || !command.mergeRequest.mergedRevisionRef) {
          throw new BadRequestException("병합 결과 revision과 source branch가 필요합니다.");
        }
        branches = upsertById(branches, Object.freeze({ ...branch, status: "merged" as const }));
        const episode = episodes.find((entry) => entry.episodeId === command.mergeRequest.episodeId);
        if (!episode) throw new BadRequestException("병합 대상 회차를 찾을 수 없습니다.");
        const revision = command.mergeRequest.mergedRevisionRef;
        const nextEpisode = command.mergeRequest.targetLineage === "narrative"
          ? { ...episode, narrativeRevisionRef: revision, revision: episode.revision + 1 }
          : command.mergeRequest.targetLineage === "visual"
            ? { ...episode, visualRevisionRef: revision, revision: episode.revision + 1 }
            : { ...episode, integratedRevisionRef: revision, revision: episode.revision + 1 };
        episodes = upsertById(episodes, Object.freeze(nextEpisode));
      }
      return {
        aggregate: {
          ...aggregate,
          branches,
          episodes,
          mergeRequests: upsertById(aggregate.mergeRequests, command.mergeRequest),
        },
      };
    }
    case "upsert-deliverable": {
      assertProjectIdentity(aggregate, command.deliverable);
      const current = aggregate.deliverables.find((entry) => entry.id === command.deliverable.id) ?? null;
      const issues = [...validateDeliverable(command.deliverable, aggregate.projectId)];
      if (current?.approvedSubmissionId && (
        current.scope.kind !== command.deliverable.scope.kind
        || current.scope.id !== command.deliverable.scope.id
        || current.type !== command.deliverable.type
        || current.expectedFormat !== command.deliverable.expectedFormat
      )) {
        issues.push("approved-deliverable-contract-mutated");
      }
      if (issues.length > 0) {
        throw new BadRequestException({ message: "산출물 정의를 저장할 수 없습니다.", issues });
      }
      return {
        aggregate: {
          ...aggregate,
          deliverables: upsertById(aggregate.deliverables, command.deliverable),
        },
      };
    }
    case "upsert-submission": {
      assertProjectIdentity(aggregate, command.submission);
      assertAssignmentCanAct(aggregate, actorUserId, command.submission.submittedByAssignmentId);
      const deliverable = aggregate.deliverables.find((entry) => entry.id === command.submission.deliverableId) ?? null;
      const current = aggregate.submissions.find((entry) => entry.id === command.submission.id) ?? null;
      const issues = validateSubmission({
        submission: command.submission,
        current,
        deliverable,
        activeAssignmentIds: aggregate.assignments
          .filter((assignment) => assignment.status === "active")
          .map((assignment) => assignment.id),
      });
      if (issues.length > 0) {
        throw new BadRequestException({ message: "제출본을 저장할 수 없습니다.", issues });
      }
      if (!deliverable) throw new BadRequestException("제출본의 산출물을 찾을 수 없습니다.");
      return {
        aggregate: {
          ...aggregate,
          submissions: upsertById(aggregate.submissions, command.submission),
          deliverables: upsertById(
            aggregate.deliverables,
            applySubmissionToDeliverable(deliverable, command.submission),
          ),
        },
      };
    }
    case "upsert-review-policy": {
      assertProjectIdentity(aggregate, command.policy);
      return {
        aggregate: {
          ...aggregate,
          reviewPolicies: upsertById(aggregate.reviewPolicies, command.policy),
        },
      };
    }
    case "record-review-decision": {
      const policy = aggregate.reviewPolicies.find((entry) => entry.id === command.policyId);
      if (!policy) throw new BadRequestException("검수 정책을 찾을 수 없습니다.");
      assertAssignmentCanAct(aggregate, actorUserId, command.decision.assignmentId);
      const issues = validateReviewDecision(policy, command.decision);
      if (issues.length > 0) {
        throw new BadRequestException({ message: "검수 결정을 기록할 수 없습니다.", issues });
      }
      const reviewDecisions = upsertById(aggregate.reviewDecisions, command.decision);
      return {
        aggregate: { ...aggregate, reviewDecisions },
        derived: {
          approval: evaluateReviewApproval(
            policy,
            reviewDecisions.filter((decision) => decision.reviewRoundId === command.decision.reviewRoundId),
          ),
        },
      };
    }
    case "upsert-task": {
      assertProjectIdentity(aggregate, command.task);
      const tasks = upsertById(aggregate.tasks, command.task);
      const cycles = detectTaskDependencyCycles(tasks);
      if (cycles.length > 0) {
        throw new BadRequestException({ message: "작업 의존성에 순환이 있습니다.", cycles });
      }
      return { aggregate: { ...aggregate, tasks } };
    }
    case "upsert-change-request": {
      assertProjectIdentity(aggregate, command.request);
      const impact = analyzeProductionChangeImpact({
        request: command.request,
        ...command.impactHints,
      });
      return {
        aggregate: {
          ...aggregate,
          changeRequests: upsertById(aggregate.changeRequests, command.request),
        },
        derived: { impact },
      };
    }
    case "publish-scope-package": {
      assertProjectIdentity(aggregate, command.scopePackage);
      if (aggregate.scopePackages.some((entry) => entry.id === command.scopePackage.id)) {
        throw new BadRequestException("기존 발주 범위는 Addendum 명령으로만 변경할 수 있습니다.");
      }
      const scopePackage = createImmutableScopePackage(command.scopePackage) as ScopePackage;
      return {
        aggregate: {
          ...aggregate,
          scopePackages: Object.freeze([...aggregate.scopePackages, scopePackage]),
        },
        derived: { digest: scopePackage.digest },
      };
    }
    case "amend-scope-package": {
      const previous = aggregate.scopePackages.find((entry) => entry.id === command.previousPackageId);
      if (!previous) throw new BadRequestException("변경할 발주 범위를 찾을 수 없습니다.");
      assertProjectIdentity(aggregate, command.replacement);
      const replacement = createImmutableScopePackage(command.replacement) as ScopePackage;
      const addendum = createScopePackageAddendum({
        previous,
        replacement,
        reason: command.reason,
        createdAt: command.createdAt,
        id: command.addendumId,
        previousAddenda: aggregate.scopePackageAddenda,
      });
      return {
        aggregate: {
          ...aggregate,
          scopePackages: upsertById(aggregate.scopePackages, replacement),
          scopePackageRevisionArchive: Object.freeze([
            ...aggregate.scopePackageRevisionArchive,
            previous,
          ]),
          scopePackageAddenda: upsertById(aggregate.scopePackageAddenda, addendum),
        },
        derived: { addendum, digest: replacement.digest },
      };
    }
    case "upsert-contribution": {
      assertProjectIdentity(aggregate, command.contribution);
      assertAssignmentCanAct(aggregate, actorUserId, command.contribution.assignmentId);
      return {
        aggregate: {
          ...aggregate,
          contributions: upsertById(aggregate.contributions, command.contribution as ContributionRecord),
        },
      };
    }
    case "upsert-credit-manifest": {
      assertProjectIdentity(aggregate, command.manifest);
      const preflight = preflightCreditManifest({
        manifest: command.manifest as CreditManifest,
        contentRevisionRefs: command.manifest.contentRevisionRefs,
        contributions: aggregate.contributions,
        rightsInterests: aggregate.rightsInterests,
        requiredApproverAssignmentIds: command.requiredApproverAssignmentIds,
      });
      if (command.manifest.status === "approved" && !preflight.passed) {
        throw new BadRequestException({ message: "크레딧 승인 조건이 충족되지 않았습니다.", preflight });
      }
      return {
        aggregate: {
          ...aggregate,
          creditManifests: upsertById(aggregate.creditManifests, command.manifest as CreditManifest),
        },
        derived: { preflight },
      };
    }
    case "upsert-rights-interest": {
      assertProjectIdentity(aggregate, command.interest);
      return {
        aggregate: {
          ...aggregate,
          rightsInterests: upsertById(aggregate.rightsInterests, command.interest as RightsInterest),
        },
      };
    }
    case "upsert-compensation-plan": {
      assertProjectIdentity(aggregate, command.plan);
      const issues = validateCompensationPlan(command.plan as CompensationPlan);
      if (issues.length > 0) {
        throw new BadRequestException({ message: "보상·수익 배분 계획이 올바르지 않습니다.", issues });
      }
      return {
        aggregate: {
          ...aggregate,
          compensationPlans: upsertById(aggregate.compensationPlans, command.plan as CompensationPlan),
        },
      };
    }
  }
}

@Injectable()
export class ProductionCollaborationService {
  constructor(private readonly repository: ProductionCollaborationRepository) {}

  async getProject(actorUserId: string, projectIdValue: string): Promise<ProductionProjectRecord> {
    const { projectId } = ProductionProjectParamsSchema.parse({ projectId: projectIdValue });
    return this.run(() => this.repository.getProject(actorUserId, projectId));
  }

  async getProjectByWork(actorUserId: string, workIdValue: string): Promise<ProductionProjectRecord> {
    const { workId } = ProductionProjectByWorkParamsSchema.parse({ workId: workIdValue });
    return this.run(() => this.repository.getProjectByWork(actorUserId, workId));
  }

  async createProject(
    actorUserId: string,
    body: CreateProductionProjectDto,
  ): Promise<ProductionMutationResponse> {
    const input = CreateProductionProjectSchema.parse(body);
    const now = new Date().toISOString();
    const initial = createProductionProjectAggregate({
      projectId: input.projectId,
      workId: input.workId,
      organizationId: input.organizationId ?? null,
      title: input.title,
      collaborationModel: input.collaborationModel,
      ownerPartyId: input.ownerPartyId,
      ownerUserId: actorUserId,
      ownerDisplayName: input.ownerDisplayName,
      at: now,
    });
    const aggregate = commitProductionAggregate(initial, {
      expectedRevision: 0,
      actorPartyId: input.ownerPartyId,
      action: "project-created",
      targetType: "project",
      targetId: input.projectId,
      beforeDigest: null,
      afterDigest: stableProductionFingerprint(initial),
      at: now,
      eventId: randomUUID(),
      mutate: (current) => current,
    });
    return this.run(() => this.repository.createProject({
      actorUserId,
      aggregate,
      mutationId: input.clientMutationId,
      requestDigest: stableProductionFingerprint(input),
    }));
  }

  async executeCommand(
    actorUserId: string,
    projectIdValue: string,
    body: ExecuteProductionCommand,
  ): Promise<ProductionMutationResponse> {
    const { projectId } = ProductionProjectParamsSchema.parse({ projectId: projectIdValue });
    const input = ExecuteProductionCommandSchema.parse(body);
    const target = eventTarget(input.command);
    const requestDigest = stableProductionFingerprint(input);
    return this.run(() => this.repository.mutateProject({
      actorUserId,
      projectId,
      expectedRevision: input.expectedRevision,
      mutationId: input.mutationId,
      requestDigest,
      requiredCapability: commandCapability(input.command),
      mutate: (current) => {
        const beforeDigest = stableProductionFingerprint(current);
        const mutation = applyCommand(current, input.command, actorUserId);
        const at = new Date().toISOString();
        const aggregate = commitProductionAggregate(current, {
          expectedRevision: input.expectedRevision,
          actorPartyId: actorPartyId(current, actorUserId),
          action: input.command.type,
          targetType: target.type,
          targetId: target.id,
          beforeDigest,
          afterDigest: stableProductionFingerprint(mutation.aggregate),
          at,
          eventId: randomUUID(),
          mutate: () => mutation.aggregate,
        });
        return mutation.derived === undefined
          ? { aggregate }
          : { aggregate, derived: mutation.derived };
      },
    }));
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ProductionProjectNotFoundError) {
        throw new NotFoundException(error.target === "work"
          ? "연결할 작품을 찾을 수 없습니다."
          : "제작 프로젝트를 찾을 수 없습니다.");
      }
      if (error instanceof ProductionProjectForbiddenError) {
        throw new ForbiddenException(
          error.operation === "create"
            ? "작품 소유자만 제작 프로젝트를 만들 수 있습니다."
            : error.operation === "manage"
              ? "프로젝트 운영 권한이 필요합니다."
              : error.operation === "view"
                ? "이 제작 프로젝트를 볼 권한이 없습니다."
                : "이 제작 프로젝트를 변경할 권한이 없습니다.",
        );
      }
      if (error instanceof ProductionProjectRevisionConflictError) {
        throw new ConflictException({
          message: "제작 프로젝트가 다른 사용자에 의해 변경되었습니다.",
          currentRevision: error.currentRevision,
        });
      }
      if (error instanceof ProductionProjectMutationConflictError) {
        throw new ConflictException("같은 명령 식별자가 다른 내용에 이미 사용되었습니다.");
      }
      if (error instanceof ProductionProjectIdentityConflictError) {
        throw new ConflictException(
          error.code === "work_already_linked"
            ? "이 작품에는 이미 제작 프로젝트가 연결되어 있습니다."
            : "같은 제작 프로젝트 식별자가 이미 사용 중입니다.",
        );
      }
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      if (error instanceof Error && /Illegal .* transition|requires|cannot|invalid|incomplete|missing/iu.test(error.message)) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
