import { describe, expect, it } from "vitest";
import {
  buildCloneLink,
  createSpaceSnapshot,
  parseCloneLink,
  parseSpaceSnapshot,
  serializeSpaceSnapshot,
  summarizeSpaceSnapshot,
  STUDIO_SPACE_CLONE_MAX_PAYLOAD_LENGTH,
  STUDIO_SPACE_SNAPSHOT_FORMAT_VERSION,
  type StudioSpaceSnapshot,
} from "./studio-virtual-space-clone";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  type StudioVirtualSpaceWorldManifest,
} from "./studio-virtual-space-world-manifest";
import {
  createTileEffect,
  type StudioTileEffectDefinition,
} from "./studio-virtual-space-tile-effects";

const world: StudioVirtualSpaceWorldManifest = DEFAULT_STUDIO_WORLD_MANIFEST;
const labels = { name: "아카데미 기초 스페이스", description: "수업용으로 복제한 공간", author: "툰스튜디오 팀" };
const snapshot = (): StudioSpaceSnapshot =>
  createSpaceSnapshot(world, labels, new Date("2026-09-30T01:00:00.000Z"));

const validTileEffects = (): StudioTileEffectDefinition[] => {
  const spawn = createTileEffect({ kind: "spawn", id: "spawn-1", name: "입구", tileX: 0, tileY: 0, width: 2, height: 2 });
  const zone = createTileEffect({ kind: "zone", id: "zone-1", tileX: 4, tileY: 4, width: 3, height: 3, zoneTag: "silent" });
  if (!spawn.ok || !zone.ok) throw new Error("tile effect fixture is invalid");
  return [spawn.effect, zone.effect];
};

describe("createSpaceSnapshot", () => {
  it("freezes a validated world with labels and the snapshot format version", () => {
    const created = snapshot();
    expect(created.formatVersion).toBe(STUDIO_SPACE_SNAPSHOT_FORMAT_VERSION);
    expect(created.name).toBe(labels.name);
    expect(created.description).toBe(labels.description);
    expect(created.author).toBe(labels.author);
    expect(created.createdAt).toBe("2026-09-30T01:00:00.000Z");
    expect(created.world).toBe(world);
    expect(Object.isFrozen(created)).toBe(true);
  });
  it("rejects an empty snapshot name", () => {
    expect(() => createSpaceSnapshot(world, { name: "  " })).toThrow("name");
  });
  it("rejects a world that fails manifest validation", () => {
    expect(() => createSpaceSnapshot({ ...world, rooms: [] }, labels)).toThrow();
  });
  it("rejects an invalid injected manifest id", () => {
    expect(() => createSpaceSnapshot({ ...world, id: "bad id!" }, labels)).toThrow();
  });
});

describe("serializeSpaceSnapshot / parseSpaceSnapshot round trip", () => {
  it("round-trips a snapshot through base64url without a server", () => {
    const payload = serializeSpaceSnapshot(snapshot());
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    const parsed = parseSpaceSnapshot(payload);
    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe(labels.name);
    expect(parsed?.world.props).toHaveLength(world.props.length);
    expect(parsed?.createdAt).toBe("2026-09-30T01:00:00.000Z");
  });
  it("serializes without labels and keeps optional fields empty", () => {
    const parsed = parseSpaceSnapshot(serializeSpaceSnapshot(createSpaceSnapshot(world, { name: "이름" })));
    expect(parsed?.description).toBe("");
    expect(parsed?.author).toBe("");
  });
});

describe("parseSpaceSnapshot rejects invalid input", () => {
  const cases: Array<[string, unknown]> = [
    ["empty string", ""],
    ["non-string", 42],
    ["null", null],
    ["not base64url", "!!!not-base64!!!"],
    ["valid base64 of non-json", "bm90LWpzb24"],
    ["json without a version", Buffer.from(JSON.stringify({ name: "x" })).toString("base64url")],
    ["wrong format version", Buffer.from(JSON.stringify({ formatVersion: 999, name: "x" })).toString("base64url")],
    ["missing world", Buffer.from(JSON.stringify({ formatVersion: 1, name: "x", createdAt: "2026-09-30T01:00:00Z" })).toString("base64url")],
    ["world with no rooms", Buffer.from(JSON.stringify({ formatVersion: 1, name: "x", createdAt: "2026-09-30T01:00:00Z", world: { ...world, rooms: [] } })).toString("base64url")],
    ["invalid createdAt", Buffer.from(JSON.stringify({ formatVersion: 1, name: "x", createdAt: "yesterday", world })).toString("base64url")],
    ["oversized payload", "A".repeat(STUDIO_SPACE_CLONE_MAX_PAYLOAD_LENGTH + 1)],
  ];
  for (const [title, payload] of cases) it(`rejects ${title}`, () => {
    expect(parseSpaceSnapshot(payload)).toBeNull();
  });
  it("rejects an unknown extra format version even with a valid world", () => {
    const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(serializeSpaceSnapshot(snapshot()), "base64url").toString()), formatVersion: 2 })).toString("base64url");
    expect(parseSpaceSnapshot(tampered)).toBeNull();
  });
});

describe("serializeSpaceSnapshot rejects invalid input", () => {
  it("throws for a wrong format version", () => {
    expect(() => serializeSpaceSnapshot({ ...snapshot(), formatVersion: 7 })).toThrow("version");
  });
  it("throws for a broken world inside a snapshot", () => {
    expect(() => serializeSpaceSnapshot({ ...snapshot(), world: { ...world, id: "bad id!" } })).toThrow();
  });
});

describe("buildCloneLink / parseCloneLink", () => {
  it("builds a #clone= link and parses it back", () => {
    const link = buildCloneLink("https://toon.studio/spaces/current#ignored", snapshot());
    expect(link.startsWith("https://toon.studio/spaces/current#clone=")).toBe(true);
    const parsed = parseCloneLink(link);
    expect(parsed?.name).toBe(labels.name);
    expect(parsed?.world.npcs).toHaveLength(world.npcs.length);
  });
  it("keeps an existing query string and drops the old fragment", () => {
    const link = buildCloneLink("https://toon.studio/spaces?a=1#old", snapshot());
    expect(link.startsWith("https://toon.studio/spaces?a=1#clone=")).toBe(true);
  });
  it("parses a bare fragment and a bare payload", () => {
    const payload = serializeSpaceSnapshot(snapshot());
    expect(parseCloneLink(`#clone=${payload}`)?.name).toBe(labels.name);
    expect(parseCloneLink(payload)?.name).toBe(labels.name);
  });
  it("rejects links without a clone payload", () => {
    expect(parseCloneLink("https://toon.studio/spaces#other=1")).toBeNull();
    expect(parseCloneLink("https://toon.studio/spaces")).toBeNull();
    expect(parseCloneLink("")).toBeNull();
    expect(parseCloneLink("#clone=")).toBeNull();
  });
  it("rejects an empty base url", () => {
    expect(() => buildCloneLink("  ", snapshot())).toThrow();
  });
});

describe("summarizeSpaceSnapshot", () => {
  it("counts rooms, props, npcs, interactions, portals and spawns", () => {
    const summary = summarizeSpaceSnapshot(snapshot());
    expect(summary.name).toBe(labels.name);
    expect(summary.rooms).toBe(world.rooms.length);
    expect(summary.props).toBe(world.props.length);
    expect(summary.npcs).toBe(world.npcs.length);
    expect(summary.tileEffects).toBe(0);
    expect(summary.objects).toBe(
      world.rooms.length + world.props.length + world.npcs.length
      + world.interactions.length + world.portals.length + world.spawns.length,
    );
  });
});

describe("tile effects in snapshots", () => {
  it("carries tile effects and round-trips them through serialize/parse", () => {
    const effects = validTileEffects();
    const created = createSpaceSnapshot(world, labels, new Date("2026-09-30T01:00:00.000Z"), { tileEffects: effects });
    expect(created.tileEffects).toHaveLength(2);
    expect(Object.isFrozen(created.tileEffects)).toBe(true);
    const parsed = parseSpaceSnapshot(serializeSpaceSnapshot(created));
    expect(parsed?.tileEffects.map((effect) => effect.id)).toEqual(["spawn-1", "zone-1"]);
    expect(parsed?.tileEffects.map((effect) => effect.kind)).toEqual(["spawn", "zone"]);
  });
  it("defaults tile effects to an empty list when omitted", () => {
    const parsed = parseSpaceSnapshot(serializeSpaceSnapshot(snapshot()));
    expect(parsed?.tileEffects).toEqual([]);
  });
  it("counts tile effects in the summary and the objects total", () => {
    const summary = summarizeSpaceSnapshot(
      createSpaceSnapshot(world, labels, new Date("2026-09-30T01:00:00.000Z"), { tileEffects: validTileEffects() }),
    );
    expect(summary.tileEffects).toBe(2);
    expect(summary.objects).toBe(
      world.rooms.length + world.props.length + world.npcs.length
      + world.interactions.length + world.portals.length + world.spawns.length + 2,
    );
  });
  it("rejects an unknown tile effect kind on create", () => {
    expect(() => createSpaceSnapshot(world, labels, new Date(), {
      tileEffects: [{ kind: "nope", id: "bad-1", name: "", tileX: 0, tileY: 0, width: 1, height: 1 } as unknown as StudioTileEffectDefinition],
    })).toThrow("tile effect");
  });
  it("rejects duplicate tile effect ids on create", () => {
    const [first, second] = validTileEffects();
    if (!first || !second) throw new Error("tile effect fixture is invalid");
    expect(() => createSpaceSnapshot(world, labels, new Date(), {
      tileEffects: [first, { ...second, id: first.id }],
    })).toThrow("tile effect");
  });
  it("rejects a tampered payload with invalid tile effects", () => {
    const base = JSON.parse(Buffer.from(serializeSpaceSnapshot(snapshot()), "base64url").toString());
    const tampered = Buffer.from(JSON.stringify({ ...base, tileEffects: [{ kind: "nope" }] })).toString("base64url");
    expect(parseSpaceSnapshot(tampered)).toBeNull();
    const notArray = Buffer.from(JSON.stringify({ ...base, tileEffects: "spawn-1" })).toString("base64url");
    expect(parseSpaceSnapshot(notArray)).toBeNull();
  });
  it("throws when serializing a snapshot with invalid tile effects", () => {
    expect(() => serializeSpaceSnapshot({
      ...snapshot(),
      tileEffects: [{ kind: "nope" } as unknown as StudioTileEffectDefinition],
    })).toThrow("tile effect");
  });
});
