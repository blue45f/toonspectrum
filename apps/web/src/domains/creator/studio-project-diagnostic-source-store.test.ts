import { describe, expect, it } from "vitest";

import {
  parseStudioProjectDiagnosticSource,
  readStudioProjectDiagnosticSource,
  removeStudioProjectDiagnosticSource,
  studioProjectDiagnosticSourceStorageKey,
  writeStudioProjectDiagnosticSource,
  type StudioProjectDiagnosticSourceStorage,
} from "./studio-project-diagnostic-source-store";

import type { StudioProjectDiagnosticSource } from "./studio-project-diagnostics";

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
      status: "draft",
      requiredReviewerIds: [],
      threads: [],
      decisions: [],
      submittedAt: null,
      approvedAt: null,
      updatedAt: "2026-09-11T00:00:00.000Z",
    },
    localization: [],
    exportPreflights: [],
  };
}

function memoryStorage(): StudioProjectDiagnosticSourceStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("Studio project diagnostic source store", () => {
  it("stores and restores a source under the project identity", () => {
    const storage = memoryStorage();
    const value = source();
    writeStudioProjectDiagnosticSource(storage, value);
    expect(readStudioProjectDiagnosticSource(storage, "project-1")).toEqual(value);
    expect(studioProjectDiagnosticSourceStorageKey("project-1")).toContain("project-1");
    removeStudioProjectDiagnosticSource(storage, "project-1");
    expect(readStudioProjectDiagnosticSource(storage, "project-1")).toBeNull();
  });

  it("rejects cross-project and malformed structural data", () => {
    expect(parseStudioProjectDiagnosticSource(source(), "another-project")).toBeNull();
    expect(parseStudioProjectDiagnosticSource({
      ...source(),
      story: { bible: source().story.bible, states: "not-an-array", transitions: [] },
    })).toBeNull();
    expect(parseStudioProjectDiagnosticSource({ ...source(), capturedAt: "invalid" })).toBeNull();
  });

  it("fails closed for corrupted JSON", () => {
    const storage = memoryStorage();
    storage.setItem(studioProjectDiagnosticSourceStorageKey("project-1"), "{broken");
    expect(readStudioProjectDiagnosticSource(storage, "project-1")).toBeNull();
  });
});
