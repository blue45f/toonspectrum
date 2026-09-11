import { describe, expect, it } from "vitest";

import { createInitialStudioProjectDiagnosticSource } from "./studio-project-diagnostic-source-defaults";
import { diagnoseStudioProject, validateStudioProjectDiagnosticSource } from "./studio-project-diagnostics";

describe("initial Studio project diagnostics", () => {
  it("creates a valid conservative diagnostic source for a new project", () => {
    const source = createInitialStudioProjectDiagnosticSource(
      "project-42",
      "2026-09-11T03:30:00.000Z",
    );

    expect(source.projectId).toBe("project-42");
    expect(source.story.bible.projectId).toBe("project-42");
    expect(source.reviewSession.status).toBe("draft");
    expect(source.assets).toEqual([]);
    expect(source.localization).toEqual([]);
    expect(source.exportPreflights).toEqual([]);
    expect(validateStudioProjectDiagnosticSource(source)).toEqual([]);

    const result = diagnoseStudioProject(source);
    expect(result.projectId).toBe("project-42");
    expect(result.status).not.toBe("ready");
  });

  it("rejects unsafe or empty project ids", () => {
    expect(() => createInitialStudioProjectDiagnosticSource("  ")).toThrow();
    expect(() => createInitialStudioProjectDiagnosticSource("..")).toThrow();
    expect(() => createInitialStudioProjectDiagnosticSource("a\\b")).toThrow();
  });
});
