import { describe, expect, it } from "vitest";

import { canonicalJson, studioWorldManifestSchema, studioWorldPublishSchema } from "../index";

const world = () => ({ id: "world", version: 1, width: 100, height: 100, backgroundAssetKey: "background", backgroundUrl: "/assets/world.png",
  rooms: [{ id: "room", x: 0, y: 0, width: 100, height: 100, labelKo: "방", labelEn: "Room" }],
  props: [], colliders: [], interactions: [], portals: [], spawns: [{ id: "spawn", point: { x: 10, y: 10 } }], npcs: [],
  acousticZones: [{ id: "private-room", roomId: "room", x: 0, y: 0, width: 50, height: 100, policy: "private", doorId: "door" }] });

describe("published world graph-asset contract", () => {
  it("preserves private policy, door identity and every explicit pixel without injecting access grants", () => {
    expect(studioWorldManifestSchema.parse(world())).toEqual(world());
    expect(studioWorldPublishSchema.parse({ manifest: world(), expectedPublishedRevisionId: null })).toEqual({ manifest: world(), expectedPublishedRevisionId: null });
    expect(studioWorldManifestSchema.safeParse({ ...world(), grants: ["self"] }).success).toBe(false);
  });
  it("requires an explicit nullable CAS value and rejects a client-supplied publication hash", () => {
    expect(studioWorldPublishSchema.safeParse({ manifest: world() }).success).toBe(false);
    expect(studioWorldPublishSchema.safeParse({ manifest: world(), expectedPublishedRevisionId: null, contentHash: "a".repeat(64) }).success).toBe(false);
  });
  it.each(["javascript:alert(1)", "//evil.example/img.png", "https://user:password@example.com/a", "/\\evil.example/a", "/path\nnext"])("rejects unsafe asset URL %s", (backgroundUrl) => {
    expect(studioWorldManifestSchema.safeParse({ ...world(), backgroundUrl }).success).toBe(false);
  });
  it("rejects missing, overlapping and out-of-room acoustic definitions", () => {
    const source = world();
    for (const acousticZones of [
      [{ ...source.acousticZones[0], roomId: "missing" }],
      [{ ...source.acousticZones[0], width: 101 }],
      [source.acousticZones[0], { ...source.acousticZones[0], id: "second" }],
      [{ ...source.acousticZones[0], grant: true }],
    ]) expect(studioWorldManifestSchema.safeParse({ ...source, acousticZones }).success).toBe(false);
  });
  it("bounds hostile geometry, strings, arrays and nonfinite values before rendering", () => {
    for (const value of [{ ...world(), width: Infinity }, { ...world(), rooms: [] },
      { ...world(), rooms: [...world().rooms, ...world().rooms] }, { ...world(), backgroundUrl: "/" + "a".repeat(2048) },
      { ...world(), npcs: [{ id: "npc", skinKey: "skin", roomId: "missing", point: { x: 5, y: 5 } }] },
      { ...world(), colliders: Array.from({ length: 4096 }, () => ({ x: 0, y: 0, width: 1, height: 1 })) },
    ]) expect(studioWorldManifestSchema.safeParse(value).success).toBe(false);
  });
  it("retains no-zone legacy manifests without inventing a public zone", () => {
    const { acousticZones: _zones, ...legacy } = world();
    expect(studioWorldManifestSchema.parse(legacy)).not.toHaveProperty("acousticZones");
    expect(canonicalJson(studioWorldManifestSchema.parse(legacy))).toBe(canonicalJson(legacy));
  });
});
