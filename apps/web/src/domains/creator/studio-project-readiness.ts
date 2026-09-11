import type { StudioExportPreflightResult } from "./studio-export-preflight";
import type { StudioProductionPipelineReport } from "./studio-production-pipeline";
import type { StudioReviewReadiness } from "./studio-review-workflow";
import type { StudioContinuityReport } from "./studio-story-bible";

export const STUDIO_PROJECT_READINESS_SECTIONS = [
  "story",
  "production",
  "assets",
  "review",
  "localization",
  "export",
] as const;

export type StudioProjectReadinessSectionId =
  (typeof STUDIO_PROJECT_READINESS_SECTIONS)[number];
export type StudioProjectReadinessStatus = "ready" | "warning" | "blocked";

export interface StudioProjectAssetReadiness {
  readonly allowedCount: number;
  readonly warningCount: number;
  readonly blockedCount: number;
}

export interface StudioProjectLocalizationReadiness {
  readonly totalLocales: number;
  readonly completedLocales: number;
  readonly blockingIssues: number;
  readonly warningIssues: number;
}

export interface StudioProjectReadinessInput {
  readonly continuity: StudioContinuityReport;
  readonly production: StudioProductionPipelineReport;
  readonly assets: StudioProjectAssetReadiness;
  readonly review: StudioReviewReadiness;
  readonly localization: StudioProjectLocalizationReadiness;
  readonly exports: readonly StudioExportPreflightResult[];
}

export interface StudioProjectReadinessSection {
  readonly id: StudioProjectReadinessSectionId;
  readonly status: StudioProjectReadinessStatus;
  readonly completion: number;
  readonly blockingCount: number;
  readonly warningCount: number;
}

export interface StudioProjectReadinessAction {
  readonly id: string;
  readonly section: StudioProjectReadinessSectionId;
  readonly priority: "high" | "medium" | "low";
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioProjectReadinessReport {
  readonly status: StudioProjectReadinessStatus;
  readonly completion: number;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly sections: readonly StudioProjectReadinessSection[];
  readonly actions: readonly StudioProjectReadinessAction[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function statusFor(blockingCount: number, warningCount: number): StudioProjectReadinessStatus {
  return blockingCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready";
}

function section(
  id: StudioProjectReadinessSectionId,
  completion: number,
  blockingCount: number,
  warningCount: number,
): StudioProjectReadinessSection {
  return Object.freeze({
    id,
    status: statusFor(blockingCount, warningCount),
    completion: clamp01(completion),
    blockingCount,
    warningCount,
  });
}

function action(
  id: string,
  sectionId: StudioProjectReadinessSectionId,
  priority: StudioProjectReadinessAction["priority"],
  messageKo: string,
  messageEn: string,
): StudioProjectReadinessAction {
  return Object.freeze({ id, section: sectionId, priority, messageKo, messageEn });
}

function validateNonNegative(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

export function evaluateStudioProjectReadiness(
  input: StudioProjectReadinessInput,
): StudioProjectReadinessReport {
  for (const [label, value] of [
    ["Allowed assets", input.assets.allowedCount],
    ["Warning assets", input.assets.warningCount],
    ["Blocked assets", input.assets.blockedCount],
    ["Total locales", input.localization.totalLocales],
    ["Completed locales", input.localization.completedLocales],
    ["Localization blocking issues", input.localization.blockingIssues],
    ["Localization warning issues", input.localization.warningIssues],
  ] as const) {
    validateNonNegative(value, label);
  }
  if (input.localization.completedLocales > input.localization.totalLocales) {
    throw new Error("Completed locales cannot exceed total locales.");
  }

  const sections: StudioProjectReadinessSection[] = [];
  const actions: StudioProjectReadinessAction[] = [];

  sections.push(section(
    "story",
    input.continuity.status === "pass" ? 1 : input.continuity.status === "warning" ? 0.8 : 0.45,
    input.continuity.blockingCount,
    input.continuity.warningCount,
  ));
  if (input.continuity.blockingCount > 0) {
    actions.push(action(
      "resolve-continuity",
      "story",
      "high",
      "설명되지 않은 연속성 오류를 해결하세요.",
      "Resolve unexplained continuity errors.",
    ));
  }

  const productionBlocked = input.production.valid
    ? input.production.stages.reduce((sum, stage) => sum + stage.blockedCount, 0)
    : 1;
  sections.push(section(
    "production",
    input.production.progress,
    productionBlocked,
    input.production.dependencyBlockedTaskIds.length,
  ));
  if (!input.production.valid) {
    actions.push(action(
      "repair-production-graph",
      "production",
      "high",
      "제작 작업의 누락된 의존성이나 순환을 해결하세요.",
      "Repair missing or cyclic production dependencies.",
    ));
  } else if (productionBlocked > 0) {
    actions.push(action(
      "unblock-production",
      "production",
      "high",
      "막힌 제작 작업의 필요한 조건을 해결하세요.",
      "Resolve the requirements blocking production tasks.",
    ));
  }

  const assetTotal = input.assets.allowedCount
    + input.assets.warningCount
    + input.assets.blockedCount;
  const assetCompletion = assetTotal === 0
    ? 1
    : (input.assets.allowedCount + input.assets.warningCount * 0.6) / assetTotal;
  sections.push(section(
    "assets",
    assetCompletion,
    input.assets.blockedCount,
    input.assets.warningCount,
  ));
  if (input.assets.blockedCount > 0) {
    actions.push(action(
      "replace-blocked-assets",
      "assets",
      "high",
      "사용 권리가 맞지 않거나 누락된 에셋을 교체하세요.",
      "Replace assets with missing or incompatible usage rights.",
    ));
  } else if (input.assets.warningCount > 0) {
    actions.push(action(
      "review-asset-conditions",
      "assets",
      "medium",
      "출처 표시·좌석·용도 조건을 확인하세요.",
      "Review attribution, seat and usage conditions.",
    ));
  }

  const reviewBlocking = input.review.openChangeRequestCount;
  const reviewWarnings = input.review.missingApprovalReviewerIds.length;
  sections.push(section(
    "review",
    input.review.canApprove ? 1 : reviewBlocking > 0 ? 0.35 : 0.75,
    reviewBlocking,
    reviewWarnings,
  ));
  if (reviewBlocking > 0) {
    actions.push(action(
      "resolve-review-requests",
      "review",
      "high",
      "열린 수정 요청을 해결하세요.",
      "Resolve open change requests.",
    ));
  } else if (reviewWarnings > 0) {
    actions.push(action(
      "collect-approvals",
      "review",
      "medium",
      "필수 검토자의 승인을 받으세요.",
      "Collect approvals from required reviewers.",
    ));
  }

  const localeCompletion = input.localization.totalLocales === 0
    ? 1
    : input.localization.completedLocales / input.localization.totalLocales;
  sections.push(section(
    "localization",
    localeCompletion,
    input.localization.blockingIssues,
    input.localization.warningIssues
      + Math.max(0, input.localization.totalLocales - input.localization.completedLocales),
  ));
  if (input.localization.blockingIssues > 0) {
    actions.push(action(
      "fix-localization",
      "localization",
      "high",
      "번역·레터링·말풍선 맞춤 오류를 해결하세요.",
      "Resolve translation, lettering and balloon-fit errors.",
    ));
  }

  const exportBlocking = input.exports.length === 0
    ? 0
    : input.exports.every((result) => result.status === "blocked") ? 1 : 0;
  const exportWarnings = input.exports.length === 0
    ? 1
    : input.exports.filter((result) => result.status === "warning").length;
  const exportCompletion = input.exports.some((result) => result.status === "pass")
    ? 1
    : input.exports.some((result) => result.status === "warning") ? 0.8 : 0;
  sections.push(section(
    "export",
    exportCompletion,
    exportBlocking,
    exportWarnings,
  ));
  if (input.exports.length === 0) {
    actions.push(action(
      "choose-export-target",
      "export",
      "low",
      "사용할 플랫폼이나 출력 목적을 선택하세요.",
      "Choose a publishing platform or output destination.",
    ));
  } else if (exportBlocking > 0) {
    actions.push(action(
      "resolve-export-preflight",
      "export",
      "high",
      "선택한 출력 대상의 사전검사 오류를 해결하세요.",
      "Resolve preflight errors for the selected output target.",
    ));
  }

  const blockingCount = sections.reduce((sum, item) => sum + item.blockingCount, 0);
  const warningCount = sections.reduce((sum, item) => sum + item.warningCount, 0);
  const completion = sections.length === 0
    ? 0
    : sections.reduce((sum, item) => sum + item.completion, 0) / sections.length;
  const priorityOrder: Readonly<Record<StudioProjectReadinessAction["priority"], number>> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  actions.sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]);

  return Object.freeze({
    status: statusFor(blockingCount, warningCount),
    completion,
    blockingCount,
    warningCount,
    sections: Object.freeze(sections),
    actions: Object.freeze(actions),
  });
}
