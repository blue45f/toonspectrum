import { describe, expect, it, vi } from "vitest";
import { STUDIO_CHARACTER_SKINS, studioCharacterAppearanceForAvatarIndex, resolveStudioCharacterAppearance } from "./studio-virtual-space-character-skins";
import {
  StudioCharacterAssetResidency, studioCharacterStaticAsset, studioCharacterVisualAssets,
  studioCharacterFrameGeometry,
  type StudioCharacterTextureAsset,
} from "./studio-virtual-space-character-assets";

const skin = STUDIO_CHARACTER_SKINS[0]!;
const standing = studioCharacterStaticAsset(skin, "down");
const walking = studioCharacterVisualAssets(skin, "left", "walk");
function harness(initial: readonly StudioCharacterTextureAsset[] = []) {
  const loaded = new Set(initial.map((asset) => asset.key));
  const pending = new Map<string, (success: boolean) => void>();
  const disposers: ReturnType<typeof vi.fn>[] = [];
  let time = 0;
  const load = vi.fn((asset: StudioCharacterTextureAsset, complete: (success: boolean) => void) => {
    pending.set(asset.key, (success) => { if (success) loaded.add(asset.key); complete(success); });
    const dispose = vi.fn(); disposers.push(dispose); return dispose;
  });
  const remove = vi.fn((asset: StudioCharacterTextureAsset) => { loaded.delete(asset.key); });
  const residency = new StudioCharacterAssetResidency({ has: (asset) => loaded.has(asset.key), load, remove }, () => time, 100);
  return { residency, load, remove, pending, loaded, disposers, advance: (ms: number) => { time += ms; } };
}

describe("Virtual Studio character texture residency", () => {
  it("advertises actual local poses and resolves stable identity independently of legacy index", () => {
    for (let index = 0; index < STUDIO_CHARACTER_SKINS.length; index++) {
      const appearance = studioCharacterAppearanceForAvatarIndex(index);
      expect(appearance.capabilities).toEqual(expect.arrayContaining(["idle", "walk-down", "walk-left", "walk-right", "walk-up", "sit", "wave"]));
      expect(appearance.capabilities.includes("draw")).toBe(index === 0);
      const resolved = resolveStudioCharacterAppearance({ avatarIndex: (index + 1) % 4, appearance }, "peer", "sit");
      expect(resolved.skin.key).toBe(STUDIO_CHARACTER_SKINS[index]!.key);
      expect(resolved.clip).toBe("sit");
      const restricted = resolveStudioCharacterAppearance({ avatarIndex: index, appearance: { ...appearance, capabilities: ["idle"] } }, "peer", "sit");
      expect(restricted.clip).toBe("idle");
      expect(restricted.issues).toContain("unsupported-clip");
    }
  });
  it("requests only the current skin, direction and supported action, with no idle atlas", () => {
    expect(studioCharacterVisualAssets(skin, "down", "idle")).toEqual([standing]);
    expect(walking.map((asset) => asset.key)).toEqual(["studio-player-pink-direction-left", "studio-player-pink-walk-sheet-left"]);
    expect(studioCharacterVisualAssets(STUDIO_CHARACTER_SKINS[1]!, "up", "draw")).toHaveLength(1);
  });
  it("shares one directional pose sheet and keeps its directional static fallback", () => {
    const down = studioCharacterVisualAssets(skin, "down", "wave");
    const right = studioCharacterVisualAssets(skin, "right", "wave");
    expect(down).toHaveLength(2);
    expect(right[1]?.key).toBe(down[1]?.key);
    expect(down[0]).toEqual(standing);
    expect(down[1]?.type).toBe("spritesheet");
  });
  it("aligns drawn frames without stretching pixels and uses the hip only for a seat attachment", () => {
    const pose = skin.poses!.sit!;
    const frame = pose.frames[0]!;
    const ground = studioCharacterFrameGeometry(frame, pose.frameWidth, pose.frameHeight, 98, 131);
    const seat = studioCharacterFrameGeometry(frame, pose.frameWidth, pose.frameHeight, 98, 131, true);
    expect(ground.width / ground.height).toBeCloseTo(pose.frameWidth / pose.frameHeight);
    expect(ground.originY).toBe(frame.originY);
    expect(seat.originY).toBe(frame.seatOriginY);
    expect(seat.height).toBe(ground.height);
    expect(studioCharacterFrameGeometry(undefined, 384, 512, 98, 131).originY).toBe(492 / 512);
  });
  it("deduplicates a shared skin, retains it for another actor and evicts only after the grace period", () => {
    const h = harness();
    h.residency.use("self", walking); h.residency.use("npc", walking); h.residency.use("self", walking);
    expect(h.load).toHaveBeenCalledTimes(2);
    for (const asset of walking) h.pending.get(asset.key)!(true);
    h.residency.release("self"); h.advance(200); h.residency.collect();
    expect(h.remove).not.toHaveBeenCalled();
    h.residency.release("npc"); h.advance(99); h.residency.collect();
    expect(h.remove).not.toHaveBeenCalled();
    h.advance(1); h.residency.collect(); expect(h.remove).toHaveBeenCalledTimes(2);
  });
  it("keeps the displayed old frame while a new skin loads, then releases it after the switch", () => {
    const h = harness([standing]);
    const next = studioCharacterStaticAsset(STUDIO_CHARACTER_SKINS[1]!, "up");
    h.residency.use("self", [standing]);
    h.residency.use("self", [next], standing.key);
    h.advance(200); h.residency.collect(); expect(h.loaded.has(standing.key)).toBe(true);
    h.pending.get(next.key)!(true);
    h.residency.use("self", [next], next.key);
    h.advance(100); h.residency.collect(); expect(h.loaded.has(standing.key)).toBe(false);
  });
  it("drops a late download after the only actor left without retaining its texture", () => {
    const h = harness();
    h.residency.use("peer:a", walking); h.residency.release("peer:a");
    for (const asset of walking) h.pending.get(asset.key)!(true);
    expect(h.loaded.size).toBe(0); expect(h.remove).toHaveBeenCalledTimes(2);
  });
  it("shares an in-flight download with a new actor without letting the departed actor own it", () => {
    const h = harness();
    h.residency.use("peer:a", [standing]); h.residency.release("peer:a");
    h.residency.use("peer:b", [standing]); h.pending.get(standing.key)!(true);
    h.advance(200); h.residency.collect();
    expect(h.load).toHaveBeenCalledTimes(1); expect(h.remove).not.toHaveBeenCalled();
    h.residency.release("peer:b"); h.advance(100); h.residency.collect(); expect(h.remove).toHaveBeenCalledTimes(1);
  });
  it("does not retry a failed texture every frame and leaves the fallback referenced", () => {
    const h = harness([standing]);
    h.residency.use("fallback", [standing]);
    const next = studioCharacterStaticAsset(STUDIO_CHARACTER_SKINS[1]!, "up");
    h.residency.use("peer", [next], standing.key); h.pending.get(next.key)!(false);
    for (let frame = 0; frame < 60; frame++) h.residency.use("peer", [next], standing.key);
    expect(h.load).toHaveBeenCalledTimes(1); expect(h.loaded.has(standing.key)).toBe(true);
  });
  it("invalidates old-scene completions and releases every subscription on teardown", () => {
    const h = harness(); h.residency.use("self", walking); h.residency.close();
    for (const asset of walking) h.pending.get(asset.key)!(true);
    h.residency.use("next", [standing]); h.residency.collect();
    expect(h.load).toHaveBeenCalledTimes(2); expect(h.remove).not.toHaveBeenCalled();
    expect(h.disposers.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
  });
});
