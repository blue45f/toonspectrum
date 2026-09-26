import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { STUDIO_CHARACTER_SKINS, studioCharacterAppearanceForAvatarIndex, resolveStudioCharacterAppearance, studioCharacterActionClip } from "./studio-virtual-space-character-skins";
import {
  StudioCharacterAssetResidency, studioCharacterStaticAsset, studioCharacterVisualAssets,
  studioCharacterFrameGeometry,
  studioCharacterActionFrame,
  studioCharacterActionSheetMatches,
  studioCharacterStaticSheetMatches,
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
  it("네이티브 걷기와 정지는 한 원본 시트를 공유하고 이전 저해상도 방향 이미지를 요청하지 않는다", () => {
    const native = STUDIO_CHARACTER_SKINS.find((item) => item.key === "imagegen25")!;
    const h = harness();
    for (const direction of ["down", "left", "right", "up"] as const) {
      const idle = studioCharacterStaticAsset(native, direction);
      const walk = studioCharacterVisualAssets(native, direction, "walk");
      expect(studioCharacterVisualAssets(native, direction, "idle")).toEqual([idle]);
      expect(walk).toEqual([idle]);
      expect(idle).toMatchObject({ type: "spritesheet", frameWidth: 627, frameHeight: 627, frame: 0 });
      expect(idle.url).toBe(`/assets/virtual-studio/world-v2/characters/pixel-maker/walk-${direction}.png`);
      expect(studioCharacterStaticSheetMatches(idle, 1254, 1254)).toBe(true);
      expect(studioCharacterStaticSheetMatches(idle, 1253, 1254)).toBe(false);
      expect(studioCharacterStaticSheetMatches(idle, 2508, 627)).toBe(false);
      h.residency.use("self", [idle]);
      h.pending.get(idle.key)!(true);
      h.residency.use("self", walk);
      h.residency.use("self", [idle]);
    }
    expect(h.load).toHaveBeenCalledTimes(4);
    expect(h.load.mock.calls.every(([asset]) => !asset.url.includes("living-town-v6"))).toBe(true);
    expect(studioCharacterStaticAsset({ ...native, idleFrames: { down: 4 } }, "down").type).toBe("image");
  });
  it("네이티브 PNG 원본과 프레임 경계를 보존하고 실제 머리 높이와 발 기준을 정렬한다", () => {
    const native = STUDIO_CHARACTER_SKINS.find((item) => item.key === "imagegen25")!;
    const root = new URL("../../../../public/assets/virtual-studio/world-v2/characters/pixel-maker/", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8")) as {
      directions: Record<string, { sha256: string; bytes: number; frames: { bounds: number[]; hash: string }[] }>;
    };
    for (const direction of ["down", "left", "right", "up"] as const) {
      const png = readFileSync(new URL(`walk-${direction}.png`, root));
      const record = manifest.directions[direction]!;
      expect(createHash("sha256").update(png).digest("hex")).toBe(record.sha256);
      expect(png.byteLength).toBe(record.bytes);
      expect(png.readUInt32BE(16)).toBe(1254);
      expect(png.readUInt32BE(20)).toBe(1254);
      expect(png[25]).toBe(6); // PNG RGBA 형식을 유지한다.
      expect(png.includes(Buffer.from("caBX"))).toBe(true);
      expect(new Set(record.frames.map((frame) => frame.hash)).size).toBe(4);
      const clip = native.clips![`walk-${direction}`]!;
      expect(studioCharacterActionSheetMatches(clip, 1254, 1254)).toBe(true);
      for (const [index, presentation] of clip.frames!.entries()) {
        const bounds = record.frames[index]!.bounds;
        const geometry = studioCharacterFrameGeometry(presentation, 627, 627, 98, 131);
        expect(geometry.width).toBe(geometry.height);
        expect((bounds[3]! / 627 - geometry.originY) * geometry.height).toBeCloseTo(0);
        expect((bounds[1]! / 627 - geometry.originY) * geometry.height).toBeCloseTo(-131 * 0.82);
      }
    }
  });
  it("보존한 정지 그림 이동 행동을 실제 작화 걷기와 구분한다", () => {
    const native = STUDIO_CHARACTER_SKINS.find((item) => item.key === "imagegen25")!;
    for (const direction of ["down", "left", "right", "up"] as const) {
      expect(native.clips![`walk-${direction}`]!.technique).toBe("drawn");
      for (const action of ["talk", "draw", "review"] as const) {
        const clip = studioCharacterActionClip(native, direction, action)!;
        expect(clip.technique).toBe("translated-still");
        expect(clip.textureUrl).toContain("/living-town-v6/imagegen25-character/");
        expect(studioCharacterVisualAssets(native, direction, action).some((asset) => asset.url === clip.textureUrl)).toBe(true);
      }
    }
    expect(native.poses?.sit).toBeDefined();
    expect(native.poses?.wave).toBeDefined();
  });
  it("advertises actual local poses and resolves stable identity independently of legacy index", () => {
    for (let index = 0; index < STUDIO_CHARACTER_SKINS.length; index++) {
      const appearance = studioCharacterAppearanceForAvatarIndex(index);
      expect(appearance.capabilities).toEqual(expect.arrayContaining(["idle", "walk-down", "walk-left", "walk-right", "walk-up", "sit", "wave"]));
      const character = STUDIO_CHARACTER_SKINS[index]!;
      expect(appearance.capabilities.includes("draw")).toBe(index === 0 || character.key === "imagegen25");
      expect(appearance.capabilities.includes("review")).toBe(index < 2 || character.key === "imagegen25");
      expect(new Set(appearance.capabilities).size).toBe(appearance.capabilities.length);
      const resolved = resolveStudioCharacterAppearance({ avatarIndex: (index + 1) % STUDIO_CHARACTER_SKINS.length, appearance }, "peer", "sit");
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
  it("loads only silver's current review direction and restores directional idle/walk assets on exit", () => {
    const silver = STUDIO_CHARACTER_SKINS[1]!;
    for (const direction of ["down", "left", "right", "up"] as const) {
      const assets = studioCharacterVisualAssets(silver, direction, "review");
      expect(assets).toHaveLength(2);
      expect(assets[0]).toEqual(studioCharacterStaticAsset(silver, direction));
      expect(assets[1]).toMatchObject({ key: `studio-player-silver-review-sheet-${direction}`, type: "spritesheet", frameWidth: 561, frameHeight: 701 });
      expect(studioCharacterVisualAssets(silver, direction, "walk").map((asset) => asset.key))
        .toEqual([`studio-player-silver-direction-${direction}`, `studio-player-silver-walk-sheet-${direction}`]);
      expect(studioCharacterVisualAssets(silver, direction, "idle")).toEqual([assets[0]]);
      expect(studioCharacterVisualAssets(STUDIO_CHARACTER_SKINS[2]!, direction, "review")).toHaveLength(1);
    }
  });
  it("loads one actual pink drawing direction and accepts only its declared original PNG layout", () => {
    for (const direction of ["down", "left", "right", "up"] as const) {
      const clip = studioCharacterActionClip(skin, direction, "draw")!;
      const assets = studioCharacterVisualAssets(skin, direction, "draw");
      expect(assets.filter((asset) => asset.type === "spritesheet").map((asset) => asset.key))
        .toEqual([`studio-player-pink-draw-sheet-${direction}`]);
      expect(assets).toContainEqual(studioCharacterStaticAsset(skin, direction, "draw"));
      expect(studioCharacterActionSheetMatches(clip, clip.atlas!.width, clip.atlas!.height)).toBe(true);
      expect(studioCharacterActionSheetMatches(clip, clip.atlas!.width + 1, clip.atlas!.height)).toBe(false);
      expect(studioCharacterActionSheetMatches(clip, clip.atlas!.width, clip.atlas!.height - 1)).toBe(false);
      expect([0, 600, 1200, 1800, 2400].map((ms) => studioCharacterActionFrame(clip, ms, false))).toEqual([0, 1, 2, 3, 0]);
      expect(studioCharacterActionFrame(clip, 1800, true)).toBe(0);
      expect(studioCharacterVisualAssets(skin, direction, "walk").some((asset) => asset.key.includes("draw-sheet"))).toBe(false);
    }
    const silver = studioCharacterActionClip(STUDIO_CHARACTER_SKINS[1]!, "up", "review")!;
    expect(studioCharacterActionSheetMatches(silver, 1122, 1402)).toBe(true);
    expect(studioCharacterActionSheetMatches(silver, 1122, 1403)).toBe(false);
  });
  it("plays four genuine review phases at a fixed foot attachment and freezes the first frame for reduced motion", () => {
    for (const direction of ["down", "left", "right", "up"] as const) {
      const clip = studioCharacterActionClip(STUDIO_CHARACTER_SKINS[1]!, direction, "review")!;
      expect([0, 600, 1200, 1800, 2400].map((ms) => studioCharacterActionFrame(clip, ms, false))).toEqual([0, 1, 2, 3, 0]);
      expect([0, 599, 2400, 99999].map((ms) => studioCharacterActionFrame(clip, ms, true))).toEqual([0, 0, 0, 0]);
      const geometries = clip.frames!.map((frame) => studioCharacterFrameGeometry(frame, 561, 701, 98, 131));
      expect(new Set(geometries.map((frame) => frame.height)).size).toBe(1);
      // Placing this origin at the authority point keeps each distinct drawn shoe baseline grounded.
      for (const [index, geometry] of geometries.entries()) {
        const footOffset = clip.frames![index]!.originY * 701;
        expect((footOffset / 701 - geometry.originY) * geometry.height).toBeCloseTo(0);
        expect(geometry.width / geometry.height).toBeCloseTo(561 / 701);
      }
    }
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
