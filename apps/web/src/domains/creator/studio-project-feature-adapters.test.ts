import { describe, expect, it } from "vitest";

import { createStudioLocalizationUnit } from "./studio-localization-workflow";
import {
  updateStudioProjectAssets,
  updateStudioProjectLocalization,
  updateStudioProjectStory,
} from "./studio-project-feature-adapters";
import { ensureStudioProjectWorkspaceState } from "./studio-project-workspace-store";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("Studio project feature adapters", () => {
  it("persists story and asset updates through one project authority", () => {
    const storage = new MemoryStorage();
    updateStudioProjectStory(storage, "p1", {
      bible: {
        projectId: "p1",
        characters: [{ id: "c1", name: "Hero", aliases: [], defaultCostumeId: null, defaultAppearanceId: null }],
        locations: [],
        facts: [],
      },
      states: [],
      transitions: [],
    }, { updatedAt: "2026-09-11T05:00:00.000Z" });
    updateStudioProjectAssets(storage, "p1", [
      { id: "brush-1", status: "allowed" },
      { id: "font-1", status: "warning" },
    ], { updatedAt: "2026-09-11T05:05:00.000Z" });

    const state = ensureStudioProjectWorkspaceState(storage, "p1");
    expect(state.story.bible.characters[0]?.name).toBe("Hero");
    expect(state.assets.map((asset) => asset.status)).toEqual(["allowed", "warning"]);
  });

  it("summarizes detailed localization by target language", () => {
    const storage = new MemoryStorage();
    const unit = createStudioLocalizationUnit({
      id: "line-1",
      sourceLocale: "ko-KR",
      targetLocale: "en-US",
      kind: "dialogue",
      sourceText: "안녕",
      translatedText: "Hello",
      glossary: [],
      sourceRemoved: false,
      backgroundRestored: false,
      letteringApplied: false,
      readingOrderAssigned: false,
      fontAvailable: true,
      updatedAt: "2026-09-11T05:10:00.000Z",
    });

    const state = updateStudioProjectLocalization(storage, "p2", [unit], {
      updatedAt: "2026-09-11T05:11:00.000Z",
    });
    expect(state.localization).toEqual([
      expect.objectContaining({ locale: "en-US", status: "blocked" }),
    ]);
  });
});
