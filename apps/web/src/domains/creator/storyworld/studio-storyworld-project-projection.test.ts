import { describe, expect, it } from "vitest";

import { projectStoryworldToStudioProjectStory } from "./studio-storyworld-project-projection";
import { STUDIO_STORYWORLD_SCHEMA_VERSION, type StoryworldProject } from "./studio-storyworld-causality";

describe("Storyworld project readiness projection", () => {
  it("projects characters, locations, facts, knowledge and scene transitions into the project authority", () => {
    const project: StoryworldProject = {
      schemaVersion: STUDIO_STORYWORLD_SCHEMA_VERSION,
      id: "story-authoring-id",
      title: "Story",
      characters: [{ id: "hero", name: "Hero", initialFactIds: ["fact-a"] }],
      facts: [
        { id: "fact-a", label: "Known", subjectId: "hero", key: "known" },
        { id: "fact-b", label: "Reveal", subjectId: "station", key: "open" },
      ],
      scenes: [
        { id: "scene-1", title: "Start", order: 1, locationId: "station", participantIds: ["hero"] },
        { id: "scene-2", title: "Move", order: 2, locationId: "roof", participantIds: ["hero"], reveals: [{ factId: "fact-b", audiences: ["hero"] }] },
      ],
    };

    const projection = projectStoryworldToStudioProjectStory(project, "work-1");

    expect(projection.bible.projectId).toBe("work-1");
    expect(projection.bible.characters.map((item) => item.id)).toEqual(["hero"]);
    expect(projection.bible.locations.map((item) => item.id)).toEqual(["roof", "station"]);
    expect(projection.states).toHaveLength(2);
    expect(projection.states[1]?.knownFactIds).toEqual(["fact-a", "fact-b"]);
    expect(projection.transitions).toEqual([
      expect.objectContaining({
        characterId: "hero",
        fromSceneId: "scene-1",
        toSceneId: "scene-2",
        allowedCategories: ["location"],
      }),
    ]);
  });
});
