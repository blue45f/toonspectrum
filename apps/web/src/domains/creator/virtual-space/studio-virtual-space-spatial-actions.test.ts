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
  it("개인 공간에서는 동료·프로젝트가 필요한 동작을 빼고, 근처에 사람이 없으면 소그룹 대화를 제안하지 않는다", () => {
    const meeting = interaction("meeting-room-console");
    const room = DEFAULT_STUDIO_WORLD_MANIFEST.rooms.find((item) => item.id === meeting.zoneId);
    const personal = studioSpatialActions(meeting, room, { personal: true, nearbyPeerCount: 3 }).map((item) => item.id);
    expect(personal).toContain("primary");
    expect(personal).not.toContain("huddle");
    expect(personal).not.toContain("people");
    expect(personal).not.toContain("board");
    const alone = studioSpatialActions(meeting, room, { personal: false, nearbyPeerCount: 0 }).map((item) => item.id);
    expect(alone).not.toContain("bubble");
    expect(alone).toContain("huddle");
    const together = studioSpatialActions(meeting, room, { personal: false, nearbyPeerCount: 2 }).map((item) => item.id);
    expect(together).toEqual(studioSpatialActions(meeting, room).map((item) => item.id));
  });

  it("아케이드·화이트보드·고양이는 대상에 맞는 동작을 먼저 제안한다", () => {
    const fixture = (id: string, zoneId: string): StudioWorldInteractionDefinition => ({
      id, zoneId, point: { x: 10, y: 10 }, radius: 48, labelKo: id, labelEn: id, action: "community",
    });
    expect(studioSpatialActions(fixture("arcade-cabinet-1", "arcade"), undefined).map((item) => item.id))
      .toEqual(["mini-game", "take-photo", "town-hub"]);
    expect(studioSpatialActions(fixture("plaza-whiteboard", "plaza"), undefined).map((item) => item.id))
      .toEqual(["primary", "board", "sessions", "live-annotation"]);
    expect(studioSpatialActions(fixture("garden-cat", "garden"), undefined).map((item) => item.id))
      .toEqual(["pet-animal", "take-photo"]);
    expect(studioSpatialActions(fixture("arcade-cabinet-1", "arcade"), undefined, { personal: true, nearbyPeerCount: 0 })[0])
      .toMatchObject({ id: "mini-game", recommended: true });
  });
});
