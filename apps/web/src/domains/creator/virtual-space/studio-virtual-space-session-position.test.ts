import { describe, expect, it } from "vitest";

import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import {
  readStudioVirtualSpaceSessionPoint,
  resolveStudioVirtualSpaceSessionPoint,
  studioVirtualSpacePositionScope,
  studioVirtualSpacePositionStorageKey,
  writeStudioVirtualSpaceSessionPoint,
} from "./studio-virtual-space-session-position";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";

function storageFixture() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

function worldFixture(
  colliders: StudioVirtualSpaceWorldManifest["colliders"] = [],
): StudioVirtualSpaceWorldManifest {
  return {
    id: "session-position-test",
    version: 1,
    width: 200,
    height: 160,
    backgroundAssetKey: "session-position-background",
    backgroundUrl: "/test.webp",
    rooms: [],
    colliders,
    interactions: [],
    portals: [],
    spawns: [{ id: "main", point: { x: 40, y: 40 }, facing: "down" }],
    props: [],
    npcs: [],
  };
}

describe("virtual studio session positions", () => {
  it("keeps production and local authoring preview positions isolated", () => {
    const storage = storageFixture();
    const world = worldFixture();
    const production = studioVirtualSpacePositionScope("project-7", false);
    const preview = studioVirtualSpacePositionScope("project-7", true);
    writeStudioVirtualSpaceSessionPoint(production, { x: 80, y: 90 }, storage);
    writeStudioVirtualSpaceSessionPoint(preview, { x: 120, y: 110 }, storage);

    expect(readStudioVirtualSpaceSessionPoint(production, { x: 40, y: 40 }, world, storage))
      .toEqual({ x: 80, y: 90 });
    expect(readStudioVirtualSpaceSessionPoint(
      preview,
      { x: 40, y: 40 },
      world,
      storage,
    )).toEqual({ x: 120, y: 110 });
    expect(storage.values.size).toBe(2);
    expect(studioVirtualSpacePositionStorageKey(production))
      .not.toBe(studioVirtualSpacePositionStorageKey(preview));
  });

  it("cannot collide when a production project id resembles the old preview suffix", () => {
    const storage = storageFixture();
    const world = worldFixture();
    const production = studioVirtualSpacePositionScope("demo:local-world-preview", false);
    const preview = studioVirtualSpacePositionScope("demo", true);
    expect(studioVirtualSpacePositionStorageKey(production))
      .not.toBe(studioVirtualSpacePositionStorageKey(preview));
    storage.setItem(
      "toonspectrum:virtual-space-position:v2:demo:local-world-preview",
      JSON.stringify({ x: 120, y: 110 }),
    );
    expect(readStudioVirtualSpaceSessionPoint(
      production,
      { x: 40, y: 40 },
      world,
      storage,
    )).toEqual({ x: 40, y: 40 });
  });

  it("keeps v3 structured keys outside every raw v2 project namespace", () => {
    const storage = storageFixture();
    const world = worldFixture();
    const ordinary = studioVirtualSpacePositionScope("demo", false);
    const legacyLookalike = studioVirtualSpacePositionScope("production:4:demo", false);
    writeStudioVirtualSpaceSessionPoint(ordinary, { x: 120, y: 110 }, storage);

    expect(readStudioVirtualSpaceSessionPoint(
      legacyLookalike,
      { x: 40, y: 40 },
      world,
      storage,
    )).toEqual({ x: 40, y: 40 });
    expect(studioVirtualSpacePositionStorageKey(ordinary)).toContain(":v3:");
  });

  it("reads the legacy production key without exposing it to authoring previews", () => {
    const storage = storageFixture();
    const world = worldFixture();
    storage.setItem(
      "toonspectrum:virtual-space-position:v2:project-7",
      JSON.stringify({ x: 80, y: 90 }),
    );
    expect(readStudioVirtualSpaceSessionPoint(
      studioVirtualSpacePositionScope("project-7", false),
      { x: 40, y: 40 },
      world,
      storage,
    )).toEqual({ x: 80, y: 90 });
    expect(readStudioVirtualSpaceSessionPoint(
      studioVirtualSpacePositionScope("project-7", true),
      { x: 40, y: 40 },
      world,
      storage,
    )).toEqual({ x: 40, y: 40 });
  });

  it("falls back to a safe spawn before exposing a remembered collider point", () => {
    const storage = storageFixture();
    const world = worldFixture([{ x: 70, y: 70, width: 50, height: 50 }]);
    storage.setItem(
      studioVirtualSpacePositionStorageKey(studioVirtualSpacePositionScope("project-7", false)),
      JSON.stringify({ x: 90, y: 90 }),
    );

    const resolved = resolveStudioVirtualSpaceSessionPoint(
      studioVirtualSpacePositionScope("project-7", false),
      world,
      { x: 90, y: 90 },
      storage,
    );
    expect(resolved).not.toBeNull();
    expect(resolved).not.toEqual({ x: 90, y: 90 });
    expect(studioWorldCanOccupy(world, resolved!)).toBe(true);
  });

  it("fails closed when the authored world has no occupiable floor", () => {
    const storage = storageFixture();
    const world = worldFixture([{ x: 0, y: 0, width: 200, height: 160 }]);

    expect(resolveStudioVirtualSpaceSessionPoint(
      studioVirtualSpacePositionScope("project-7", false),
      world,
      { x: 40, y: 40 },
      storage,
    )).toBeNull();
  });
});
