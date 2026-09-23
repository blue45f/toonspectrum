import { describe, expect, it } from "vitest";

import { studioSpatialActions } from "./studio-virtual-space-spatial-actions";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  type StudioWorldInteractionDefinition,
} from "./studio-virtual-space-world-manifest";

function interaction(id: string): StudioWorldInteractionDefinition {
  const found = DEFAULT_STUDIO_WORLD_MANIFEST.interactions.find((item) => item.id === id);
  if (!found) throw new Error(`Missing fixture interaction: ${id}`);
  return found;
}

describe("Virtual Studio spatial action orchestration", () => {
  it("offers explicit creation choices without duplicate or automatic execution", () => {
    const value = interaction("drawing-atelier-desk");
    const room = DEFAULT_STUDIO_WORLD_MANIFEST.rooms.find((item) => item.id === value.zoneId);
    const actions = studioSpatialActions(value, room);
    expect(actions.map((item) => item.id)).toEqual([
      "primary", "board", "sessions", "work-inbox", "project-settings",
    ]);
    expect(actions[0]).toMatchObject({ recommended: true, risk: "inspect" });
    expect(new Set(actions.map((item) => item.id)).size).toBe(actions.length);
    expect(actions.length).toBeLessThanOrEqual(6);
  });

  it("makes meeting consent and devices an explicit collaborative choice", () => {
    const value = interaction("meeting-room-console");
    const room = DEFAULT_STUDIO_WORLD_MANIFEST.rooms.find((item) => item.id === value.zoneId);
    const actions = studioSpatialActions(value, room);
    expect(actions.map((item) => item.id)).toEqual(expect.arrayContaining([
      "primary", "huddle", "sessions", "people", "board",
    ]));
    expect(actions.find((item) => item.id === "huddle")?.risk).toBe("collaborative");
    expect(actions.filter((item) => item.id === "huddle")).toHaveLength(1);
  });

  it("keeps release and team changes behind authority-labelled actions", () => {
    const release = interaction("release-delivery-console");
    const releaseRoom = DEFAULT_STUDIO_WORLD_MANIFEST.rooms.find((item) => item.id === release.zoneId);
    const releaseActions = studioSpatialActions(release, releaseRoom);
    expect(releaseActions.find((item) => item.id === "release-center"))
      .toMatchObject({ risk: "authority" });

    const team = interaction("team-commons-directory");
    const teamRoom = DEFAULT_STUDIO_WORLD_MANIFEST.rooms.find((item) => item.id === team.zoneId);
    const teamActions = studioSpatialActions(team, teamRoom);
    expect(teamActions.find((item) => item.id === "team-hub"))
      .toMatchObject({ risk: "authority" });
  });
});
