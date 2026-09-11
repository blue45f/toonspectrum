import { describe, expect, it } from "vitest";

import {
  ensureStudioProjectWorkspaceState,
  updateStudioProjectWorkspaceState,
} from "./studio-project-workspace-store";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("Studio project workspace store", () => {
  it("creates one persistent initial project state", () => {
    const storage = new MemoryStorage();
    const first = ensureStudioProjectWorkspaceState(storage, "project-1", "2026-09-11T04:00:00.000Z");
    const second = ensureStudioProjectWorkspaceState(storage, "project-1", "2026-09-11T05:00:00.000Z");

    expect(second).toEqual(first);
    expect(second.projectId).toBe("project-1");
  });

  it("updates one domain without losing the rest of project state", () => {
    const storage = new MemoryStorage();
    const next = updateStudioProjectWorkspaceState(
      storage,
      "project-2",
      (current) => ({
        ...current,
        story: {
          ...current.story,
          bible: {
            ...current.story.bible,
            characters: [{
              id: "hero",
              name: "Hero",
              aliases: [],
              defaultCostumeId: null,
              defaultAppearanceId: null,
            }],
          },
        },
      }),
      { updatedAt: "2026-09-11T04:30:00.000Z" },
    );

    expect(next.story.bible.characters).toHaveLength(1);
    expect(next.reviewSession.documentId).toContain("project-2");
    expect(next.capturedAt).toBe("2026-09-11T04:30:00.000Z");
  });
});
