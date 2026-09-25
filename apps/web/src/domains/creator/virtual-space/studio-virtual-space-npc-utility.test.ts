import { describe, expect, it } from "vitest";

import { selectStudioNpcUtilityChoice } from "./studio-virtual-space-npc-utility";
import type { StudioWorldNpcActivityAnchor } from "./studio-virtual-space-npc-activity";

const anchor = (id: string, roomId: string, activity: StudioWorldNpcActivityAnchor["activity"], animation: StudioWorldNpcActivityAnchor["animation"]): StudioWorldNpcActivityAnchor => ({
  id, roomId, activity, animation, facing: "down",
  approachPoint: { x: 20, y: 20 }, anchorPoint: { x: 22, y: 20 }, exitPoint: { x: 24, y: 20 },
  minDurationMs: 3000, maxDurationMs: 6000,
});

const choices = [
  { index: 0, anchor: anchor("desk", "drawing", "work", "draw") },
  { index: 1, anchor: anchor("meeting", "meeting", "inspect", "talk") },
  { index: 2, anchor: anchor("review", "review", "inspect", "review") },
  { index: 3, anchor: anchor("break", "lounge", "rest", "sit") },
];

describe("NPC utility AI", () => {
  it("prefers role and day-period appropriate work", () => {
    expect(selectStudioNpcUtilityChoice("artist", choices, {
      role: "artist", period: "work", nearbyPeople: 0, scheduledIndex: 0,
    })?.anchor.id).toBe("desk");
    expect(selectStudioNpcUtilityChoice("editor", choices, {
      role: "editor", period: "review", nearbyPeople: 0, scheduledIndex: 2,
    })?.anchor.id).toBe("review");
  });

  it("moves meetings and breaks ahead when their context becomes active", () => {
    expect(selectStudioNpcUtilityChoice("producer", choices, {
      role: "producer", period: "meeting", nearbyPeople: 4, scheduledIndex: 1,
    })?.intent).toBe("meeting");
    expect(selectStudioNpcUtilityChoice("cafe", choices, {
      role: "cafe", period: "break", nearbyPeople: 1, scheduledIndex: 3,
    })?.intent).toBe("break");
  });
});
