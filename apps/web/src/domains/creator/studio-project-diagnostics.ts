import {
  evaluateStudioProjectReadiness,
  type StudioProjectReadinessReport,
} from "./studio-project-readiness";
import {
  analyzeStudioProductionPipeline,
  type StudioProductionTask,
} from "./studio-production-pipeline";
import {
  studioReviewReadiness,
  type StudioReviewSession,
} from "./studio-review-workflow";
import {
  analyzeStudioStoryContinuity,
  validateStudioStoryBible,
  type StudioCharacterContinuityState,
  type StudioContinuityTransition,
  type StudioStoryBible,
} from "./studio-story-bible";

import type { StudioExportPreflightResult } from "./studio-export-preflight";

export type StudioDiagnosticAssetStatus = "allowed" | "warning" | "blocked";
export type StudioDiagnosticLocalizationStatus = "complete" | "review" | "blocked";

export interface StudioProjectDiagnosticAsset {
  readonly id: string;
  readonly status: StudioDiagnosticAssetStatus;
}

export interface StudioProjectDiagnosticLocalization {
  readonly locale: string;
  readonly status: StudioDiagnosticLocalizationStatus;
  readonly blockingIssueCount: number;
  readonly warningIssueCount: number;
}

export interface StudioProjectDiagnosticSource {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly capturedAt: string;
  readonly story: {
    readonly bible: StudioStoryBible;
    readonly states: readonly StudioCharacterContinuityState[];
    readonly transitions: readonly StudioContinuityTransition[];
  };
  readonly productionTasks: readonly StudioProductionTask[];
  readonly assets: readonly StudioProjectDiagnosticAsset[];
  readonly reviewSession: StudioReviewSession;
  readonly localization: readonly StudioProjectDiagnosticLocalization[];
  readonly exportPreflights: readonly StudioExportPreflightResult[];
}

export interface StudioProjectDiagnosticFinding {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly source: "story" | "production" | "assets" | "review" | "localization" | "export";
  readonly affectedIds: readonly string[];
}

export interface StudioProjectDiagnosticResult {
  readonly projectId: string;
  readonly capturedAt: string;
  readonly status: "ready" | "warning" | "blocked";
  readonly report: StudioProjectReadinessReport;
  readonly findings: readonly StudioProjectDiagnosticFinding[];
}

function diagnosticFinding(
  code: string,
  severity: StudioProjectDiagnosticFinding["severity"],
  source: StudioProjectDiagnosticFinding["source"],
  affectedIds: readonly string[],
): StudioProjectDiagnosticFinding {
  return Object.freeze({
    code,
    severity,
    source,
    affectedIds: Object.freeze([...affectedIds]),
  });
}

function nonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateStudioProjectDiagnosticSource(
  source: StudioProjectDiagnosticSource,
): readonly StudioProjectDiagnosticFinding[] {
  const findings: StudioProjectDiagnosticFinding[] = [];
  if (
    source.schemaVersion !== 1
    || !source.projectId.trim()
    || !Number.isFinite(Date.parse(source.capturedAt))
  ) {
    findings.push(diagnosticFinding("source-required", "error", "story", []));
  }
  if (source.story.bible.projectId !== source.projectId) {
    findings.push(diagnosticFinding(
      "story-project-mismatch",
      "error",
      "story",
      [source.story.bible.projectId, source.projectId],
    ));
  }
  for (const issue of validateStudioStoryBible(source.story.bible)) {
    findings.push(diagnosticFinding(
      `story-bible:${issue.code}`,
      issue.severity,
      "story",
      issue.affectedIds,
    ));
  }

  const assetIds = source.assets.map((asset) => asset.id);
  if (
    assetIds.some((id) => !id.trim())
    || new Set(assetIds).size !== assetIds.length
  ) {
    findings.push(diagnosticFinding("asset-id", "error", "assets", assetIds));
  }

  const localeNames = source.localization.map((item) => item.locale);
  if (
    localeNames.some((locale) => !locale.trim())
    || new Set(localeNames.map((locale) => locale.toLowerCase())).size !== localeNames.length
  ) {
    findings.push(diagnosticFinding("localization-locale", "error", "localization", localeNames));
  }
  for (const locale of source.localization) {
    if (
      !nonNegativeInteger(locale.blockingIssueCount)
      || !nonNegativeInteger(locale.warningIssueCount)
      || (locale.status === "complete"
        && (locale.blockingIssueCount > 0 || locale.warningIssueCount > 0))
      || (locale.status === "blocked" && locale.blockingIssueCount === 0)
    ) {
      findings.push(diagnosticFinding(
        "localization-status",
        "error",
        "localization",
        [locale.locale],
      ));
    }
  }

  if (source.reviewSession.documentId.trim().length === 0) {
    findings.push(diagnosticFinding("review-document", "error", "review", []));
  }
  const exportKeys = source.exportPreflights.map(
    (preflight) => `${preflight.target}\u0000${preflight.policyVersion}`,
  );
  if (new Set(exportKeys).size !== exportKeys.length) {
    findings.push(diagnosticFinding("export-preflight-duplicate", "error", "export", exportKeys));
  }
  return Object.freeze(findings);
}

export function diagnoseStudioProject(
  source: StudioProjectDiagnosticSource,
): StudioProjectDiagnosticResult {
  const validation = [...validateStudioProjectDiagnosticSource(source)];
  if (validation.some((finding) => finding.severity === "error")) {
    throw new Error("A valid Studio project diagnostic source is required.");
  }

  const continuity = analyzeStudioStoryContinuity(
    source.story.bible,
    source.story.states,
    source.story.transitions,
  );
  const production = analyzeStudioProductionPipeline(source.productionTasks);
  const review = studioReviewReadiness(source.reviewSession);
  const assets = {
    allowedCount: source.assets.filter((asset) => asset.status === "allowed").length,
    warningCount: source.assets.filter((asset) => asset.status === "warning").length,
    blockedCount: source.assets.filter((asset) => asset.status === "blocked").length,
  };
  const localization = {
    totalLocales: source.localization.length,
    completedLocales: source.localization.filter((item) => item.status === "complete").length,
    blockingIssues: source.localization.reduce(
      (sum, item) => sum + item.blockingIssueCount,
      0,
    ),
    warningIssues: source.localization.reduce(
      (sum, item) => sum + item.warningIssueCount,
      0,
    ),
  };
  const report = evaluateStudioProjectReadiness({
    continuity,
    production,
    assets,
    review,
    localization,
    exports: source.exportPreflights,
  });

  const findings: StudioProjectDiagnosticFinding[] = [...validation];
  for (const issue of continuity.issues) {
    findings.push(diagnosticFinding(
      `continuity:${issue.code}`,
      issue.severity,
      "story",
      [issue.characterId, issue.fromSceneId, issue.toSceneId, ...issue.affectedIds],
    ));
  }
  for (const issue of production.issues) {
    findings.push(diagnosticFinding(
      `production:${issue.code}`,
      issue.severity,
      "production",
      issue.taskIds,
    ));
  }
  for (const asset of source.assets) {
    if (asset.status !== "allowed") {
      findings.push(diagnosticFinding(
        `asset:${asset.status}`,
        asset.status === "blocked" ? "error" : "warning",
        "assets",
        [asset.id],
      ));
    }
  }
  for (const locale of source.localization) {
    if (locale.status !== "complete") {
      findings.push(diagnosticFinding(
        `localization:${locale.status}`,
        locale.status === "blocked" ? "error" : "warning",
        "localization",
        [locale.locale],
      ));
    }
  }
  for (const preflight of source.exportPreflights) {
    if (preflight.status !== "pass") {
      findings.push(diagnosticFinding(
        `export:${preflight.status}`,
        preflight.status === "blocked" ? "error" : "warning",
        "export",
        [preflight.target, preflight.policyVersion],
      ));
    }
  }

  return Object.freeze({
    projectId: source.projectId,
    capturedAt: source.capturedAt,
    status: report.status,
    report,
    findings: Object.freeze(findings),
  });
}
