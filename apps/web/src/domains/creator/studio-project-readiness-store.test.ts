import { describe, expect, it } from "vitest";

import {
  parseStudioProjectReadinessSnapshot,
  readStudioProjectReadinessSnapshot,
  removeStudioProjectReadinessSnapshot,
  studioProjectReadinessStorageKey,
  writeStudioProjectReadinessSnapshot,
  type StudioProjectReadinessSnapshot,
  type StudioProjectReadinessStorage,
} from "./studio-project-readiness-store";

const SNAPSHOT: StudioProjectReadinessSnapshot = Object.freeze({
  schemaVersion: 1,
  projectId: "project-1",
  updatedAt: "2026-09-11T00:00:00.000Z",
  report: {
    status: "warning",
    completion: 0.75,
    blockingCount: 0,
    warningCount: 2,
    sections: [
      { id: "story", status: "ready", completion: 1, blockingCount: 0, warningCount: 0 },
      { id: "production", status: "warning", completion: 0.5, blockingCount: 0, warningCount: 1 },
      { id: "assets", status: "ready", completion: 1, blockingCount: 0, warningCount: 0 },
      { id: "review", status: "warning", completion: 0.5, blockingCount: 0, warningCount: 1 },
      { id: "localization", status: "ready", completion: 1, blockingCount: 0, warningCount: 0 },
      { id: "export", status: "ready", completion: 0.5, blockingCount: 0, warningCount: 0 },
    ],
    actions: [{
      id: "collect-approvals",
      section: "review",
      priority: "medium",
      messageKo: "필수 검토자의 승인을 받으세요.",
      messageEn: "Collect approvals from required reviewers.",
    }],
  },
});

function memoryStorage(): StudioProjectReadinessStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("Studio project readiness snapshot store", () => {
  it("persists and restores a validated project report", () => {
    const storage = memoryStorage();
    writeStudioProjectReadinessSnapshot(storage, SNAPSHOT);
    expect(readStudioProjectReadinessSnapshot(storage, "project-1")).toEqual(SNAPSHOT);
    expect(studioProjectReadinessStorageKey("project-1")).toContain("project-1");
    removeStudioProjectReadinessSnapshot(storage, "project-1");
    expect(readStudioProjectReadinessSnapshot(storage, "project-1")).toBeNull();
  });

  it("rejects a report whose aggregate status contradicts its sections", () => {
    expect(parseStudioProjectReadinessSnapshot({
      ...SNAPSHOT,
      report: { ...SNAPSHOT.report, status: "ready" },
    })).toBeNull();
  });

  it("rejects missing sections, cross-project reads and malformed dates", () => {
    expect(parseStudioProjectReadinessSnapshot({
      ...SNAPSHOT,
      report: { ...SNAPSHOT.report, sections: SNAPSHOT.report.sections.slice(1) },
    })).toBeNull();
    expect(parseStudioProjectReadinessSnapshot(SNAPSHOT, "another-project")).toBeNull();
    expect(parseStudioProjectReadinessSnapshot({ ...SNAPSHOT, updatedAt: "invalid" })).toBeNull();
  });

  it("fails closed for corrupted storage", () => {
    const storage = memoryStorage();
    storage.setItem(studioProjectReadinessStorageKey("project-1"), "{broken");
    expect(readStudioProjectReadinessSnapshot(storage, "project-1")).toBeNull();
  });
});
