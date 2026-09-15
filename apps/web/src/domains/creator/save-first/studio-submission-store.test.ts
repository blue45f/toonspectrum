import { describe, expect, it } from "vitest";

import {
  createStudioSubmission,
  studioSubmissionsForProject,
  updateStudioSubmission,
  type StudioSubmissionStorage,
} from "./studio-submission-store";

class MemoryStorage implements StudioSubmissionStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("studio submission store", () => {
  it("keeps an external upload as an explicit state transition", () => {
    const storage = new MemoryStorage();
    const created = createStudioSubmission(storage, {
      projectId: "project-1",
      platform: "naver-challenge",
      presetId: "naver-challenge",
      presetVersion: "2026.09",
      sourceRevision: 4,
      packageName: "project-1-naver.zip",
    }, { now: "2026-09-15T00:00:00.000Z" });

    expect(created.status).toBe("package-ready");
    const uploaded = updateStudioSubmission(storage, created.id, {
      status: "uploaded-externally",
      externalUrl: "https://example.test/work/1",
    }, { now: "2026-09-15T01:00:00.000Z" });
    expect(uploaded.status).toBe("uploaded-externally");
    expect(studioSubmissionsForProject(storage, "project-1")).toHaveLength(1);
  });
});
