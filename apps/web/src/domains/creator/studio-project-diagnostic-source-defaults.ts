import { createStudioReviewSession } from "./studio-review-workflow";

import type { StudioProjectDiagnosticSource } from "./studio-project-diagnostics";

function requireProjectId(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\\")) {
    throw new Error("A valid Studio project id is required.");
  }
  return normalized;
}

function requireTimestamp(capturedAt: string): string {
  if (!Number.isFinite(Date.parse(capturedAt))) {
    throw new Error("A valid Studio diagnostic timestamp is required.");
  }
  return capturedAt;
}

/**
 * Creates the smallest valid project diagnostic source for a project that has not yet emitted
 * editor/runtime diagnostics. This keeps readiness useful from the first project visit while
 * preserving the rule that unknown work is never reported as completed.
 */
export function createInitialStudioProjectDiagnosticSource(
  projectId: string,
  capturedAt = new Date().toISOString(),
): StudioProjectDiagnosticSource {
  const normalizedProjectId = requireProjectId(projectId);
  const timestamp = requireTimestamp(capturedAt);
  const documentId = `${normalizedProjectId}:draft-document`;
  const versionId = `${normalizedProjectId}:draft-v1`;

  return Object.freeze({
    schemaVersion: 1,
    projectId: normalizedProjectId,
    capturedAt: timestamp,
    story: Object.freeze({
      bible: Object.freeze({
        projectId: normalizedProjectId,
        characters: Object.freeze([]),
        locations: Object.freeze([]),
        facts: Object.freeze([]),
      }),
      states: Object.freeze([]),
      transitions: Object.freeze([]),
    }),
    productionTasks: Object.freeze([]),
    assets: Object.freeze([]),
    reviewSession: createStudioReviewSession({
      documentId,
      versionId,
      requiredReviewerIds: [],
      createdAt: timestamp,
    }),
    localization: Object.freeze([]),
    exportPreflights: Object.freeze([]),
  });
}
