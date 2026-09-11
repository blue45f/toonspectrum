// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioProjectDiagnosticsBridge } from "./StudioProjectDiagnosticsBridge";
import {
  STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT,
  STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT,
  writeStudioProjectDiagnosticSource,
} from "../studio-project-diagnostic-source-store";
import {
  STUDIO_PROJECT_READINESS_REQUEST_EVENT,
  STUDIO_PROJECT_READINESS_UPDATED_EVENT,
  readStudioProjectReadinessSnapshot,
} from "../studio-project-readiness-store";

import type { StudioProjectDiagnosticSource } from "../studio-project-diagnostics";

function source(): StudioProjectDiagnosticSource {
  return {
    schemaVersion: 1,
    projectId: "project-1",
    capturedAt: "2026-09-11T00:00:00.000Z",
    story: {
      bible: {
        projectId: "project-1",
        characters: [],
        locations: [],
        facts: [],
      },
      states: [],
      transitions: [],
    },
    productionTasks: [],
    assets: [],
    reviewSession: {
      documentId: "document-1",
      versionId: "v1",
      basedOnVersionId: null,
      status: "approved",
      requiredReviewerIds: [],
      threads: [],
      decisions: [],
      submittedAt: "2026-09-11T00:00:00.000Z",
      approvedAt: "2026-09-11T00:00:00.000Z",
      updatedAt: "2026-09-11T00:00:00.000Z",
    },
    localization: [],
    exportPreflights: [],
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioProjectDiagnosticsBridge", () => {
  it("runs a stored diagnostic source when the readiness panel requests it", () => {
    writeStudioProjectDiagnosticSource(window.localStorage, source());
    const updated = vi.fn();
    window.addEventListener(STUDIO_PROJECT_READINESS_UPDATED_EVENT, updated);
    render(<StudioProjectDiagnosticsBridge projectId="project-1" />);

    // The bridge performs one eager projection on mount. Isolate the explicit
    // readiness request so this assertion measures only the requested rerun.
    updated.mockClear();
    act(() => {
      window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_READINESS_REQUEST_EVENT, {
        detail: { projectId: "project-1" },
      }));
    });

    expect(readStudioProjectReadinessSnapshot(window.localStorage, "project-1")).toMatchObject({
      projectId: "project-1",
      updatedAt: "2026-09-11T00:00:00.000Z",
      report: { status: "warning" },
    });
    expect(updated).toHaveBeenCalledOnce();
    window.removeEventListener(STUDIO_PROJECT_READINESS_UPDATED_EVENT, updated);
  });

  it("does not let one project request rerun another project's diagnostics", () => {
    writeStudioProjectDiagnosticSource(window.localStorage, source());
    const failed = vi.fn();
    window.addEventListener(STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT, failed);
    render(<StudioProjectDiagnosticsBridge projectId="project-2" />);

    const beforeRequest = readStudioProjectReadinessSnapshot(window.localStorage, "project-2");
    expect(beforeRequest).not.toBeNull();
    failed.mockClear();

    act(() => {
      window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_READINESS_REQUEST_EVENT, {
        detail: { projectId: "project-1" },
      }));
    });

    expect(failed).not.toHaveBeenCalled();
    expect(readStudioProjectReadinessSnapshot(window.localStorage, "project-2")).toEqual(beforeRequest);
    window.removeEventListener(STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT, failed);
  });

  it("publishes a clear failure event for an invalid diagnostic source update", () => {
    const failed = vi.fn();
    window.addEventListener(STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT, failed);
    render(<StudioProjectDiagnosticsBridge projectId="project-1" />);
    failed.mockClear();

    act(() => {
      window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT, {
        detail: { projectId: "project-1" },
      }));
    });

    expect(failed).toHaveBeenCalledOnce();
    expect((failed.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({
      projectId: "project-1",
      code: "source-invalid",
    });
    window.removeEventListener(STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT, failed);
  });
});
