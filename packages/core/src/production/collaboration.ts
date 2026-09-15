import { productionScopeDepth, scopeContains } from "./scope";

import type {
  AuthorityLevel,
  CollaborationParty,
  CreativeCharter,
  DecisionAuthorityRule,
  DecisionDomain,
  RoleAssignment,
  ScopeRef,
} from "./types";

export interface AuthorityResolution {
  readonly rule: DecisionAuthorityRule | null;
  readonly levels: readonly AuthorityLevel[];
  readonly eligible: boolean;
}

function activeAt(
  startsAt: string,
  endsAt: string | null,
  at: string,
): boolean {
  const instant = Date.parse(at);
  const start = Date.parse(startsAt);
  const end = endsAt === null ? Number.POSITIVE_INFINITY : Date.parse(endsAt);
  return Number.isFinite(instant) && Number.isFinite(start) && instant >= start && instant <= end;
}

export function activeAssignments(
  assignments: readonly RoleAssignment[],
  at: string,
): readonly RoleAssignment[] {
  return assignments.filter(
    (assignment) =>
      (assignment.status === "active" || assignment.status === "onboarding")
      && activeAt(assignment.startsAt, assignment.endsAt, at),
  );
}

export function validateCollaborationGraph(input: {
  readonly parties: readonly CollaborationParty[];
  readonly assignments: readonly RoleAssignment[];
  readonly authorityRules: readonly DecisionAuthorityRule[];
}): readonly string[] {
  const issues: string[] = [];
  const partyIds = new Set<string>();
  const assignmentIds = new Set<string>();
  for (const party of input.parties) {
    if (partyIds.has(party.id)) issues.push(`duplicate-party:${party.id}`);
    partyIds.add(party.id);
    if (!party.publicDisplayName.trim()) issues.push(`missing-public-name:${party.id}`);
  }
  for (const assignment of input.assignments) {
    if (assignmentIds.has(assignment.id)) issues.push(`duplicate-assignment:${assignment.id}`);
    assignmentIds.add(assignment.id);
    if (!partyIds.has(assignment.partyId)) issues.push(`unknown-assignment-party:${assignment.id}`);
    if (assignment.endsAt && Date.parse(assignment.endsAt) < Date.parse(assignment.startsAt)) {
      issues.push(`invalid-assignment-range:${assignment.id}`);
    }
  }
  for (const rule of input.authorityRules) {
    const referenced = [
      ...rule.proposerAssignmentIds,
      ...rule.requiredConsultAssignmentIds,
      ...rule.requiredApproverAssignmentIds,
      ...rule.vetoAssignmentIds,
      ...(rule.decisionAssignmentId ? [rule.decisionAssignmentId] : []),
      ...(rule.mediatorAssignmentId ? [rule.mediatorAssignmentId] : []),
    ];
    for (const assignmentId of referenced) {
      if (!assignmentIds.has(assignmentId)) issues.push(`unknown-authority-assignment:${rule.id}:${assignmentId}`);
    }
    if (rule.quorum && (
      rule.quorum.approvals < 1
      || rule.quorum.eligible < rule.quorum.approvals
      || rule.quorum.eligible !== rule.requiredApproverAssignmentIds.length
    )) {
      issues.push(`invalid-authority-quorum:${rule.id}`);
    }
  }
  return Object.freeze(issues);
}

function matchingRules(
  rules: readonly DecisionAuthorityRule[],
  domain: DecisionDomain,
  scope: ScopeRef,
  at: string,
): readonly DecisionAuthorityRule[] {
  return rules
    .filter((rule) =>
      rule.domain === domain
      && scopeContains(rule.scope, scope)
      && activeAt(rule.effectiveFrom, rule.expiresAt, at))
    .sort((left, right) => productionScopeDepth(right.scope) - productionScopeDepth(left.scope));
}

export function resolveDecisionAuthority(input: {
  readonly assignmentId: string;
  readonly domain: DecisionDomain;
  readonly scope: ScopeRef;
  readonly at: string;
  readonly assignments: readonly RoleAssignment[];
  readonly rules: readonly DecisionAuthorityRule[];
}): AuthorityResolution {
  const active = activeAssignments(input.assignments, input.at).some(
    (assignment) => assignment.id === input.assignmentId && scopeContains(assignment.scope, input.scope),
  );
  if (!active) return Object.freeze({ rule: null, levels: [], eligible: false });
  const rule = matchingRules(input.rules, input.domain, input.scope, input.at)[0] ?? null;
  if (!rule) return Object.freeze({ rule: null, levels: Object.freeze(["observe"] as const), eligible: true });
  const levels = new Set<AuthorityLevel>();
  if (rule.proposerAssignmentIds.includes(input.assignmentId)) levels.add("propose");
  if (rule.requiredConsultAssignmentIds.includes(input.assignmentId)) levels.add("consult");
  if (rule.requiredApproverAssignmentIds.includes(input.assignmentId)) levels.add("approve");
  if (rule.vetoAssignmentIds.includes(input.assignmentId)) levels.add("veto");
  if (rule.decisionAssignmentId === input.assignmentId) levels.add("decide");
  if (rule.mediatorAssignmentId === input.assignmentId) levels.add("mediate");
  if (levels.size === 0) levels.add("observe");
  levels.add("comment");
  return Object.freeze({ rule, levels: Object.freeze([...levels]), eligible: true });
}

export function validateCreativeCharter(
  charter: CreativeCharter,
  criticalAssignmentIds: readonly string[],
): readonly string[] {
  const issues: string[] = [];
  if (!charter.coreExperience.trim()) issues.push("missing-core-experience");
  if (charter.immutablePrinciples.length === 0) issues.push("missing-immutable-principles");
  if (charter.feedbackPrinciples.length === 0) issues.push("missing-feedback-principles");
  if (charter.communicationRules.length === 0) issues.push("missing-communication-rules");
  if (charter.status === "active" || charter.status === "agreed") {
    for (const assignmentId of criticalAssignmentIds) {
      if (!charter.confirmedByAssignmentIds.includes(assignmentId)) {
        issues.push(`missing-charter-confirmation:${assignmentId}`);
      }
    }
  }
  return Object.freeze(issues);
}
