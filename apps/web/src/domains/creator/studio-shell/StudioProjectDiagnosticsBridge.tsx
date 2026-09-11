import { useEffect } from "react";

import { createInitialStudioProjectDiagnosticSource } from "../studio-project-diagnostic-source-defaults";
import {
  STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT,
  STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
  parseStudioProjectDiagnosticSource,
  readStudioProjectDiagnosticSource,
  writeStudioProjectDiagnosticSource,
} from "../studio-project-diagnostic-source-store";
import { diagnoseStudioProject } from "../studio-project-diagnostics";
import {
  STUDIO_PROJECT_READINESS_REQUEST_EVENT,
  STUDIO_PROJECT_READINESS_UPDATED_EVENT,
  writeStudioProjectReadinessSnapshot,
  type StudioProjectReadinessSnapshot,
} from "../studio-project-readiness-store";

interface StudioProjectDiagnosticsFailedDetail {
  readonly projectId: string;
  readonly code: "source-invalid" | "diagnostics-failed" | "storage-unavailable";
  readonly message: string;
}

function dispatchFailure(detail: StudioProjectDiagnosticsFailedDetail): void {
  window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT, {
    detail: Object.freeze(detail),
  }));
}

function ensureDiagnosticSource(projectId: string) {
  const current = readStudioProjectDiagnosticSource(window.localStorage, projectId);
  if (current) return current;
  const initial = createInitialStudioProjectDiagnosticSource(projectId);
  writeStudioProjectDiagnosticSource(window.localStorage, initial);
  return initial;
}

function runDiagnostics(projectId: string): StudioProjectReadinessSnapshot | null {
  let source;
  try {
    source = ensureDiagnosticSource(projectId);
  } catch (error) {
    dispatchFailure({
      projectId,
      code: "storage-unavailable",
      message: error instanceof Error ? error.message : "Project diagnostics storage is unavailable.",
    });
    return null;
  }

  try {
    const result = diagnoseStudioProject(source);
    const snapshot: StudioProjectReadinessSnapshot = Object.freeze({
      schemaVersion: 1,
      projectId,
      updatedAt: result.capturedAt,
      report: result.report,
    });
    writeStudioProjectReadinessSnapshot(window.localStorage, snapshot);
    window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_READINESS_UPDATED_EVENT, {
      detail: snapshot,
    }));
    return snapshot;
  } catch (error) {
    dispatchFailure({
      projectId,
      code: "diagnostics-failed",
      message: error instanceof Error ? error.message : "Project diagnostics failed.",
    });
    return null;
  }
}

/** Keeps one persisted readiness source in sync with editor/project events. */
export function StudioProjectDiagnosticsBridge({
  projectId,
}: {
  readonly projectId: string;
}) {
  useEffect(() => {
    runDiagnostics(projectId);

    const onReadinessRequest = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail;
      if (!detail || typeof detail !== "object") return;
      const requestedProjectId = Object.getOwnPropertyDescriptor(detail, "projectId")?.value;
      if (requestedProjectId !== projectId) return;
      runDiagnostics(projectId);
    };
    const onSourceUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = parseStudioProjectDiagnosticSource(event.detail, projectId);
      if (!next) {
        dispatchFailure({
          projectId,
          code: "source-invalid",
          message: "Project diagnostic data could not be understood.",
        });
        return;
      }
      try {
        writeStudioProjectDiagnosticSource(window.localStorage, next);
      } catch (error) {
        dispatchFailure({
          projectId,
          code: "storage-unavailable",
          message: error instanceof Error ? error.message : "Project diagnostics storage is unavailable.",
        });
        return;
      }
      runDiagnostics(projectId);
    };

    window.addEventListener(STUDIO_PROJECT_READINESS_REQUEST_EVENT, onReadinessRequest);
    window.addEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, onSourceUpdated);
    return () => {
      window.removeEventListener(STUDIO_PROJECT_READINESS_REQUEST_EVENT, onReadinessRequest);
      window.removeEventListener(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, onSourceUpdated);
    };
  }, [projectId]);

  return null;
}
