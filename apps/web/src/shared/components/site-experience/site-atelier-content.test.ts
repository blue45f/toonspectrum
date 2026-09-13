import { describe, expect, it } from "vitest";
import { ATELIER_SCENES, ATELIER_SCENE_IDS, atelierChapterForPath, DESTINATION_ART } from "./site-atelier-content";
import { EXPERIENCE_DESTINATIONS, nextExperienceDestinations } from "./site-experience-model";

describe("public atelier route contracts", () => {
  it.each(["/studio", "/studio/comic", "/studio/projects", "/studio/character", "/shaper", "/brush-lab", "/music", "/admin", "/settings", "/login", "/auth/callback", "/market/publish", "/market/manage", "/market/checkout", "/market/library", "/create/promo", "/create/work/123", "/showcase/work/123", "/terms", "/privacy", "/does-not-exist"])("never adds a promotional chapter to %s", (path) => {
    expect(atelierChapterForPath(path)).toBeNull();
  });
  it.each([
    ["/", "ink"], ["/about", "ink"], ["/make", "ink"], ["/research", "layers"],
    ["/research/assets", "layers"], ["/insights/resources", "layers"], ["/insights/resources/", "layers"],
    ["/learn", "ink"], ["/learn/lessons/example", "ink"], ["/market", "materials"],
    ["/market/browse", "materials"], ["/community", "motion"], ["/showcase", "motion"],
    ["/discover", "panels"], ["/calendar", "panels"], ["/library", "panels"],
  ])("maps %s to a relevant %s demonstration", (path, scene) => {
    expect(atelierChapterForPath(path)?.scene).toBe(scene);
  });
  it("keeps every preview actionable and every card on a first-party asset", () => {
    expect(ATELIER_SCENE_IDS.length).toBe(5);
    for (const scene of Object.values(ATELIER_SCENES)) {
      expect(scene.href).toMatch(/^\/(studio(?:\/comic)?|create\/promo|market\/browse)$/u);
      expect(scene.ko).toHaveLength(4);
      expect(scene.en).toHaveLength(4);
    }
    expect(Object.keys(DESTINATION_ART).sort()).toEqual(Object.keys(EXPERIENCE_DESTINATIONS).sort());
    expect(nextExperienceDestinations("/insights/resources")).toEqual(["learn", "showcase", "community"]);
  });
});
