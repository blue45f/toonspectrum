import { describe, expect, it } from "vitest";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import {
  STUDIO_VIRTUAL_SPACE_APPEARANCE_CLIPS,
  createStudioVirtualSpaceAppearance,
  parseStudioVirtualSpaceAppearance,
  resolveStudioVirtualSpaceAppearance,
  type StudioVirtualSpaceAppearanceRegistry,
} from "./studio-virtual-space-appearance";
import { studioVirtualSpaceState } from "./studio-virtual-space-model";
import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldPresenceState } from "./studio-virtual-space-world-manifest";
import {
  STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES,
  STUDIO_VIRTUAL_SPACE_WIRE,
  StudioVirtualSpacePresenceController,
  parseStudioVirtualSpacePacket,
} from "./studio-virtual-space-presence";

const registry: StudioVirtualSpaceAppearanceRegistry = {
  revision: "drawn-characters-v1",
  fallbackSkinKey: "pink",
  skins: [
    { key: "pink", capabilities: STUDIO_VIRTUAL_SPACE_APPEARANCE_CLIPS },
    { key: "silver", capabilities: ["idle", "walk-down", "wave", "sit"] },
  ],
};
const reordered: StudioVirtualSpaceAppearanceRegistry = { ...registry, skins: [...registry.skins].reverse() };
const packet = (appearance?: unknown) => JSON.stringify({
  wire: STUDIO_VIRTUAL_SPACE_WIRE,
  kind: "presence",
  sequence: 1,
  at: 100,
  state: { ...studioVirtualSpaceState({ x: 400, y: 400 }, "down", "available", false, 1), ...(appearance === undefined ? {} : { appearance }) },
});

describe("Virtual Studio appearance compatibility", () => {
  it("preserves a validated stable descriptor while adapting presence into a loaded world", () => {
    const appearance = createStudioVirtualSpaceAppearance(registry, 1);
    const adapted = studioWorldPresenceState(DEFAULT_STUDIO_WORLD_MANIFEST, {
      ...studioVirtualSpaceState(), x: -10, avatarIndex: 1, appearance,
    });
    expect(adapted.x).toBe(9);
    expect(adapted.appearance).toEqual(appearance);
    expect(resolveStudioVirtualSpaceAppearance(reordered, adapted).skinKey).toBe("silver");
    expect(Object.isFrozen(adapted.appearance?.capabilities)).toBe(true);
  });

  it("does not propagate an invalid appearance through the world adapter", () => {
    const invalid = { skinKey: "https://outsider.test/a.png", registryRevision: "v1", capabilities: ["idle"] as const };
    const adapted = studioWorldPresenceState(DEFAULT_STUDIO_WORLD_MANIFEST, {
      ...studioVirtualSpaceState(), appearance: invalid,
    });
    expect(adapted.appearance).toBeUndefined();
    expect(adapted.x).toBeGreaterThan(0);
  });
  it("resolves the advertised stable key when the receiver registry uses a different order", () => {
    const appearance = createStudioVirtualSpaceAppearance(registry, 1);
    expect(reordered.skins[1]?.key).toBe("pink");
    expect(resolveStudioVirtualSpaceAppearance(reordered, { avatarIndex: 1, appearance })).toMatchObject({
      skinKey: "silver", clip: "idle", source: "stable-key", issues: [],
    });
  });

  it("preserves legacy selection and identifies its version limitation", () => {
    expect(resolveStudioVirtualSpaceAppearance(registry, { avatarIndex: 1 })).toMatchObject({
      skinKey: "silver", source: "legacy-index", issues: ["legacy-index"],
    });
    const automatic = createStudioVirtualSpaceAppearance(registry, -1, "creator-identity");
    expect(resolveStudioVirtualSpaceAppearance(registry, { avatarIndex: -1 }, "creator-identity").skinKey).toBe(automatic.skinKey);
    expect(resolveStudioVirtualSpaceAppearance(reordered, { avatarIndex: -1, appearance: automatic }, "creator-identity").skinKey).toBe(automatic.skinKey);
  });

  it("uses the configured fallback for unknown skins regardless of remote index or local order", () => {
    const appearance = { ...createStudioVirtualSpaceAppearance(registry, 1), skinKey: "future-skin" };
    expect(resolveStudioVirtualSpaceAppearance(reordered, { avatarIndex: 0, appearance })).toMatchObject({
      skinKey: "pink", source: "stable-key", issues: ["unknown-skin"],
    });
  });

  it("keeps a known stable skin across a registry revision mismatch and reports it", () => {
    const appearance = { ...createStudioVirtualSpaceAppearance(registry, 1), registryRevision: "drawn-characters-v2" };
    expect(resolveStudioVirtualSpaceAppearance(registry, { avatarIndex: 0, appearance }, undefined, "wave")).toMatchObject({
      skinKey: "silver", clip: "wave", issues: ["registry-mismatch"],
    });
  });

  it("falls back to idle when the local skin has no advertised remote clip", () => {
    const appearance = { ...createStudioVirtualSpaceAppearance(registry, 1), capabilities: STUDIO_VIRTUAL_SPACE_APPEARANCE_CLIPS };
    expect(resolveStudioVirtualSpaceAppearance(registry, { avatarIndex: 1, appearance }, undefined, "draw")).toMatchObject({
      skinKey: "silver", clip: "idle", issues: ["unsupported-clip"],
    });
  });

  it("requires the sender to support a clip even when the receiver has its local asset", () => {
    const appearance = { ...createStudioVirtualSpaceAppearance(registry, 0), capabilities: ["idle"] as const };
    const resolved = resolveStudioVirtualSpaceAppearance(registry, { avatarIndex: 0, appearance }, undefined, "sit");
    expect(resolved).toMatchObject({ clip: "idle", capabilities: ["idle"], issues: ["unsupported-clip"] });
  });

  it("strips unknown capability flags without granting actions or losing understood presentation", () => {
    const parsed = parseStudioVirtualSpaceAppearance({
      skinKey: "pink", registryRevision: registry.revision, capabilities: ["idle", "wave", "camera", "seat-owner", "wave"],
    });
    expect(parsed?.capabilities).toEqual(["idle", "wave"]);
    expect(Object.keys(parsed ?? {})).toEqual(["skinKey", "registryRevision", "capabilities"]);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.capabilities)).toBe(true);
  });

  it("round-trips bounded character cosmetics without accepting arbitrary values", () => {
    const appearance = createStudioVirtualSpaceAppearance(registry, 0, "creator", {
      accessoryKey: "beret", auraKey: "sparkle", trailKey: "petal", nameplateKey: "rose",
    });
    expect(parseStudioVirtualSpaceAppearance(appearance)).toMatchObject({
      accessoryKey: "beret", auraKey: "sparkle", trailKey: "petal", nameplateKey: "rose",
    });
    expect(resolveStudioVirtualSpaceAppearance(registry, { avatarIndex: 0, appearance })).toMatchObject({
      accessoryKey: "beret", auraKey: "sparkle", trailKey: "petal", nameplateKey: "rose",
    });
    expect(parseStudioVirtualSpaceAppearance({ ...appearance, accessoryKey: "https://outside.invalid/a.png" })).toBeNull();
  });

  it.each([
    { skinKey: "https://outsider.test/a.png", registryRevision: "v1", capabilities: ["idle"] },
    { skinKey: "pink", registryRevision: "v1", capabilities: ["idle"], textureUrl: "https://outsider.test/a.png" },
    { skinKey: "pink", registryRevision: "v1", capabilities: ["https://outsider.test/a.png"] },
    { skinKey: "pink", registryRevision: "v1", capabilities: Array.from({ length: 17 }, () => "idle") },
  ])("rejects a malformed or URL-bearing descriptor at the packet boundary (%j)", (appearance) => {
    expect(parseStudioVirtualSpaceAppearance(appearance)).toBeNull();
    expect(parseStudioVirtualSpacePacket(packet(appearance))).toBeNull();
  });

  it("retains old packets and a bounded additive descriptor without changing the wire version", () => {
    const old = parseStudioVirtualSpacePacket(packet());
    const raw = packet(createStudioVirtualSpaceAppearance(registry, 0));
    const current = parseStudioVirtualSpacePacket(raw);
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThan(STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES);
    expect(old?.kind === "presence" && old.state.appearance).toBeUndefined();
    expect(current?.kind === "presence" && current.state.appearance?.skinKey).toBe("pink");
    expect(current?.wire).toBe(STUDIO_VIRTUAL_SPACE_WIRE);
    expect(current?.kind === "presence" && current.state.avatarIndex).toBe(1);
  });
});

describe("Virtual Studio direct appearance exchange", () => {
  it("advertises actual selection on join and change, retains it during movement, and drops departed peers", () => {
    const participants: StudioLiveParticipant[] = [
      { sessionId: "appearance-a", displayName: "A", role: "editor" },
      { sessionId: "appearance-b", displayName: "B", role: "editor" },
    ];
    const aParticipant = participants[0]!;
    const bParticipant = participants[1]!;
    const listeners = new Map<string, (sender: StudioLiveParticipant, payload: string) => void>();
    const sent: string[] = [];
    const port = (self: StudioLiveParticipant): StudioLiveDirectPort => ({
      getPeers: () => participants.filter((peer) => peer.sessionId !== self.sessionId),
      subscribe(listener) {
        listeners.set(self.sessionId, listener);
        return () => { listeners.delete(self.sessionId); };
      },
      send(target, payload) {
        sent.push(payload);
        listeners.get(target)?.(self, payload);
        return true;
      },
    });
    const dependencies = { setInterval: () => 1, clearInterval: () => undefined };
    const a = new StudioVirtualSpacePresenceController(aParticipant, port(aParticipant), studioVirtualSpaceState(undefined, "down", "available", false, 1), {
      ...dependencies,
      appearanceForAvatarIndex: (index, identity) => createStudioVirtualSpaceAppearance(registry, index, identity),
    });
    const b = new StudioVirtualSpacePresenceController(bParticipant, port(bParticipant), { x: 400, y: 400 }, {
      ...dependencies,
      appearanceForAvatarIndex: (index, identity) => createStudioVirtualSpaceAppearance(reordered, index, identity),
    });
    try {
      b.start();
      a.start();
      const initial = b.snapshot().peers[0]!.state;
      expect(initial.avatarIndex).toBe(1);
      expect(resolveStudioVirtualSpaceAppearance(reordered, initial).skinKey).toBe("silver");

      a.update({ x: 450, y: 500 }, "left", "focused", true, 1, "custom-room");
      a.refresh();
      const moved = b.snapshot().peers[0]!.state;
      expect(moved.appearance).toEqual(initial.appearance);
      expect(moved).toMatchObject({ x: 450, y: 500, activity: "focused", zoneId: "custom-room" });

      a.setAvatarIndex(0);
      a.refresh();
      expect(resolveStudioVirtualSpaceAppearance(reordered, b.snapshot().peers[0]!.state).skinKey).toBe("pink");
      expect(a.snapshot().self.appearance?.skinKey).toBe("pink");
      expect(sent.every((raw) => new TextEncoder().encode(raw).byteLength <= STUDIO_VIRTUAL_SPACE_PACKET_MAX_BYTES)).toBe(true);

      a.close();
      expect(b.snapshot().peers).toEqual([]);
    } finally {
      a.close();
      b.close();
    }
  });
});
