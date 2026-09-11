import { describe, expect, it } from "vitest";

import {
  STUDIO_TEMPLATE_FAVORITES_KEY,
  STUDIO_TEMPLATE_HANDOFF_KEY,
  createStudioTemplateHandoff,
  defaultStudioTemplateValues,
  readStudioTemplateFavorites,
  readStudioTemplateHandoff,
  searchStudioTemplates,
  studioTemplateById,
  studioTemplateStartHref,
  writeStudioTemplateFavorites,
  writeStudioTemplateHandoff,
} from "./studio-template-catalog";
import { planStudioTemplateApplication } from "./studio-template-system";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("Studio template catalog", () => {
  it("searches by Korean, English, category and favorites", () => {
    expect(searchStudioTemplates({ text: "피칭" }).map((item) => item.id))
      .toEqual(["presentation-webtoon-pitch"]);
    expect(searchStudioTemplates({ text: "animatic" }).map((item) => item.id))
      .toEqual(["storyboard-animatic"]);
    expect(searchStudioTemplates({ category: "webtoon" })).toHaveLength(2);
    expect(searchStudioTemplates({
      category: "all",
      favoritesOnly: true,
      favoriteIds: ["webtoon-four-panel"],
    }).map((item) => item.id)).toEqual(["webtoon-four-panel"]);
  });

  it("validates every catalog template with its safe defaults", () => {
    for (const template of searchStudioTemplates()) {
      expect(planStudioTemplateApplication(
        template.definition,
        defaultStudioTemplateValues(template),
      ).status).not.toBe("blocked");
    }
  });

  it("persists only known unique favorites", () => {
    const storage = new MemoryStorage();
    expect(writeStudioTemplateFavorites(storage, [
      "webtoon-four-panel",
      "unknown",
      "webtoon-four-panel",
    ])).toEqual(["webtoon-four-panel"]);
    expect(storage.values.has(STUDIO_TEMPLATE_FAVORITES_KEY)).toBe(true);
    expect(readStudioTemplateFavorites(storage)).toEqual(["webtoon-four-panel"]);
  });

  it("creates an expiring one-time creation handoff", () => {
    const storage = new MemoryStorage();
    const handoff = createStudioTemplateHandoff(
      "storyboard-animatic",
      "2026-09-12T00:00:00.000Z",
      60_000,
    );
    writeStudioTemplateHandoff(storage, handoff);
    expect(storage.values.has(STUDIO_TEMPLATE_HANDOFF_KEY)).toBe(true);
    expect(readStudioTemplateHandoff(storage, "2026-09-12T00:00:30.000Z"))
      .toMatchObject({ templateId: "storyboard-animatic", workspace: "storyboard" });
    expect(readStudioTemplateHandoff(storage, "2026-09-12T00:01:01.000Z")).toBeNull();
    expect(storage.values.has(STUDIO_TEMPLATE_HANDOFF_KEY)).toBe(false);
  });

  it("builds a canonical new-project URL and rejects unknown templates", () => {
    expect(studioTemplateById("webtoon-vertical-episode")?.recommendedWorkspace).toBe("comic");
    expect(studioTemplateStartHref("webtoon-vertical-episode"))
      .toBe("/studio/new?template=webtoon-vertical-episode&workspace=comic");
    expect(() => studioTemplateStartHref("unknown")).toThrow("known Studio template");
  });
});
