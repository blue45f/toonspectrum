import { useEffect } from "react";

import {
  STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT,
  STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
  parseStudioProjectDiagnosticSource,
  readStudioProjectDiagnosticSource,
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
  readonly code: "source-missing" | "source-invalid" | "diagnostics-failed" | "storage-unavailable";
  readonly message: string;
}

function dispatchFailure(detail: StudioProjectDiagnosticsFailedDetail): void {
  window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT, {
    detail: Object.freeze(detail),
  }));
}

function runDiagnostics(projectId: string): StudioProjectReadinessSnapshot | null {
  let source;
  try {
    source = readStudioProjectDiagnosticSource(window.localStorage, projectId);
  } catch (error) {
    dispatchFailure({
      projectId,
      code: "storage-unavailable",
      message: error instanceof Error ? error.message : "Project diagnostics storage is unavailable.",
    });
    return null;
  }
  if (!source) {
    dispatchFailure({
      projectId,
      code: "source-missing",
      message: "Project diagnostic data has not been collected yet.",
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

export function StudioProjectDiagnosticsBridge({
  projectId,
}: {
  readonly projectId: string;
}) {
  useEffect(() => {
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
      if (!next) return;
      try {
        window.localStorage.setItem(
          `toonstudio:project-diagnostic-source:v1:${encodeURIComponent(projectId)}`,
          JSON.stringify(next),
        );
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
