import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STUDIO_VIRTUAL_ART_STYLES } from "./studio-virtual-space-art-style";
import { STUDIO_NPC_CAST } from "./studio-virtual-space-npc-cast";
import { DEFAULT_STUDIO_VIRTUAL_EXPERIENCE } from "./studio-virtual-space-experience-preference";
import { EMPTY_STUDIO_SPATIAL_INTERACTION_STATE, reduceStudioSpatialInteraction } from "./studio-virtual-space-interaction-state";
import { STUDIO_VIRTUAL_REWARDS } from "./studio-virtual-space-rewards";
import { studioSemanticWorldGraph } from "./studio-virtual-space-semantic-world";
import {
  STUDIO_TOWN_BLUEPRINTS,
  STUDIO_TOWN_DESK_PODS,
  studioTownEvents,
  studioTownQuests,
} from "./studio-virtual-space-town-program";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

const entrySource = readFileSync(new URL("./StudioVirtualSpaceEntryLobby.tsx", import.meta.url), "utf8");
const orchestratorSource = readFileSync(new URL("./studio-virtual-space-interaction-orchestrator.ts", import.meta.url), "utf8");
const photoSource = readFileSync(new URL("./studio-virtual-space-photo-mode.ts", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("./StudioVirtualSpacePage.tsx", import.meta.url), "utf8");

describe("Virtual Studio complete enhancement contract", () => {
  it("keeps a production-sized semantic town, independent art directions, NPC cast, desks, events and blueprints", () => {
    expect(DEFAULT_STUDIO_WORLD_MANIFEST.rooms.length).toBeGreaterThanOrEqual(14);
    expect(STUDIO_VIRTUAL_ART_STYLES.length).toBeGreaterThanOrEqual(6);
    expect(STUDIO_NPC_CAST.length).toBeGreaterThanOrEqual(8);
    expect(STUDIO_TOWN_DESK_PODS.length).toBeGreaterThanOrEqual(4);
    expect(STUDIO_TOWN_BLUEPRINTS.length).toBeGreaterThanOrEqual(4);
    expect(STUDIO_VIRTUAL_REWARDS).toHaveLength(12);
    expect(studioTownEvents(Date.UTC(2026, 8, 25, 6))).toHaveLength(5);
    expect(studioTownQuests({ phase: "ready", project: null, inbox: [], calendar: [], error: null }, DEFAULT_STUDIO_WORLD_MANIFEST, 3).length).toBeGreaterThanOrEqual(5);
    const graph = studioSemanticWorldGraph(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(DEFAULT_STUDIO_WORLD_MANIFEST.rooms.length);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it("keeps low-priority convenience features inside explicit privacy and execution boundaries", () => {
    expect(DEFAULT_STUDIO_VIRTUAL_EXPERIENCE.ttsEnabled).toBe(false);
    expect(DEFAULT_STUDIO_VIRTUAL_EXPERIENCE.qualityPreset).toBe("auto");
    expect(entrySource).not.toContain("getUserMedia(");
    expect(orchestratorSource).not.toMatch(/\beval\s*\(/u);
    expect(orchestratorSource).not.toMatch(/new\s+Function\s*\(/u);
    expect(photoSource).not.toContain("getDisplayMedia(");
    expect(photoSource).not.toContain("getUserMedia(");
    expect(pageSource).toContain("const confirmSpatialAction");
    expect(pageSource).toMatch(/if \(guarded\) \{[\s\S]*?dispatchInteraction\(\{ type: "confirm" \}\);[\s\S]*?return;/u);
    expect(STUDIO_VIRTUAL_REWARDS.every((reward) => Object.keys(reward.cosmetic).length === 1)).toBe(true);
    const nearby = reduceStudioSpatialInteraction(EMPTY_STUDIO_SPATIAL_INTERACTION_STATE, {
      type: "nearby", interactionId: "review-monitor",
    });
    expect(nearby.phase).toBe("nearby");
  });
});
