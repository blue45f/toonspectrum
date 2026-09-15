import { scopeContains } from "./scope";

import type {
  CompensationPlan,
  ContributionRecord,
  CreditManifest,
  CreditPreflightResult,
  RightsInterest,
  RevisionRef,
} from "./types";

export function validateCompensationPlan(plan: CompensationPlan): readonly string[] {
  const issues: string[] = [];
  for (const rule of plan.revenueShareRules) {
    const entries = Object.entries(rule.partySharesBasisPoints);
    if (entries.length === 0) issues.push(`empty-revenue-share:${rule.id}`);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    if (entries.some(([, value]) => !Number.isInteger(value) || value < 0 || value > 10_000)) {
      issues.push(`invalid-revenue-share:${rule.id}`);
    }
    if (total > 10_000) issues.push(`revenue-share-over-100-percent:${rule.id}`);
    if (rule.basis === "net" && rule.deductions.length === 0) {
      issues.push(`net-revenue-deductions-missing:${rule.id}`);
    }
  }
  if ((plan.status === "agreed" || plan.status === "active") && !plan.agreementRevisionRef) {
    issues.push("active-compensation-plan-without-agreement");
  }
  return Object.freeze(issues);
}

function revisionsMatch(
  manifestRefs: readonly RevisionRef[],
  contentRefs: readonly RevisionRef[],
): boolean {
  const expected = new Set(contentRefs.map((reference) => `${reference.lineage}:${reference.id}:${reference.digest}`));
  const actual = new Set(manifestRefs.map((reference) => `${reference.lineage}:${reference.id}:${reference.digest}`));
  return expected.size === actual.size && [...expected].every((entry) => actual.has(entry));
}

export function preflightCreditManifest(input: {
  readonly manifest: CreditManifest | null;
  readonly contentRevisionRefs: readonly RevisionRef[];
  readonly contributions: readonly ContributionRecord[];
  readonly rightsInterests: readonly RightsInterest[];
  readonly requiredApproverAssignmentIds: readonly string[];
}): CreditPreflightResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const manifest = input.manifest;
  if (!manifest) return Object.freeze({ passed: false, blockers: Object.freeze(["승인된 크레딧 manifest가 없습니다."]), warnings: [] });
  if (manifest.status !== "approved") blockers.push("크레딧 manifest가 승인 상태가 아닙니다.");
  if (!revisionsMatch(manifest.contentRevisionRefs, input.contentRevisionRefs)) {
    blockers.push("크레딧 manifest가 게시 후보 revision과 일치하지 않습니다.");
  }
  for (const assignmentId of input.requiredApproverAssignmentIds) {
    if (!manifest.approvedByAssignmentIds.includes(assignmentId)) blockers.push(`필수 크레딧 승인자 ${assignmentId}의 승인이 없습니다.`);
  }
  const entriesByParty = new Set(manifest.entries.map((entry) => entry.partyId));
  for (const contribution of input.contributions.filter((entry) => entry.approvedAt !== null)) {
    if (!entriesByParty.has(contribution.partyId)) warnings.push(`승인된 기여 ${contribution.id}의 당사자가 공개 크레딧에 없습니다.`);
    const covered = manifest.entries.some(
      (entry) => entry.partyId === contribution.partyId && entry.scopes.some((scope) => scopeContains(scope, contribution.scope)),
    );
    if (!covered) warnings.push(`기여 ${contribution.id}의 범위를 포함하는 크레딧 항목이 없습니다.`);
  }
  const disputed = input.rightsInterests.filter((interest) => interest.status === "disputed");
  if (disputed.length > 0) blockers.push(`분쟁 중인 권리 항목 ${disputed.length}개가 있습니다.`);
  const expired = input.rightsInterests.filter((interest) => interest.status === "expired");
  if (expired.length > 0) blockers.push(`만료된 권리 항목 ${expired.length}개가 있습니다.`);
  return Object.freeze({
    passed: blockers.length === 0,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
  });
}
