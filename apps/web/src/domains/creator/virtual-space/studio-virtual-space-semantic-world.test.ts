import { describe, expect, it } from "vitest";

import {
  studioProjectTownPoint,
  studioSemanticLineCanTraverse,
  studioSemanticSurfaceAt,
  studioSemanticWorldGraph,
  studioSemanticWorldGraphIssues,
  studioSemanticWorldInterestKey,
  studioTownDepthForPoint,
} from "./studio-virtual-space-semantic-world";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

describe("Virtual Studio semantic world graph", () => {
  it("uses one connected graph for authored rooms and path elevation", () => {
    const graph = studioSemanticWorldGraph(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(studioSemanticWorldGraphIssues(graph)).toEqual([]);
    expect(graph.nodes.some((node) => node.roomId === "lobby" && node.elevation === 0)).toBe(true);
    expect(graph.nodes.some((node) => node.roomId === "release" && node.elevation === 3)).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === "bridge")).toBe(true);
    expect(graph.edges.some((edge) => edge.kind === "stairs")).toBe(true);
  });

  it("distinguishes rooms, roads, water and blocked scenery", () => {
    expect(studioSemanticSurfaceAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 780, y: 887 })).toMatchObject({ walkable: true });
    expect(studioSemanticSurfaceAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 580, y: 550 })).toMatchObject({ kind: "shallow-water", npcWalkable: false });
    expect(studioSemanticSurfaceAt(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 20, y: 20 })).toMatchObject({ kind: "scenery", walkable: false });
  });

  it("projects presentation without mutating physical ground coordinates", () => {
    const ground = { x: 1080, y: 160 };
    const visual = studioProjectTownPoint(DEFAULT_STUDIO_WORLD_MANIFEST, ground);
    expect(visual.x).toBe(ground.x);
    expect(visual.y).toBeLessThan(ground.y);
    expect(studioTownDepthForPoint(DEFAULT_STUDIO_WORLD_MANIFEST, ground)).toBeGreaterThan(ground.y + 1_000);
  });

  it("rejects direct travel across scenery while preserving authored routes", () => {
    expect(studioSemanticLineCanTraverse(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 780, y: 887 }, { x: 780, y: 700 })).toBe(true);
    expect(studioSemanticLineCanTraverse(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 20, y: 20 }, { x: 100, y: 100 })).toBe(false);
  });

  it("produces stable interest-management keys from semantic chunks", () => {
    const first = studioSemanticWorldInterestKey(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 780, y: 887 });
    const second = studioSemanticWorldInterestKey(DEFAULT_STUDIO_WORLD_MANIFEST, { x: 790, y: 890 });
    expect(first).toBe(second);
    expect(first).toContain("lobby");
  });
});
