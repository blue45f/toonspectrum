import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import {
  STUDIO_NPC_CAST,
  studioNpcCastHasKey,
  studioNpcCastSkinByKey,
  studioNpcCastTextureUrls,
} from "./studio-virtual-space-npc-cast";

function playerUrls(): Set<string> {
  const urls = new Set<string>();
  for (const skin of STUDIO_CHARACTER_SKINS) {
    Object.values(skin.directional).forEach((url) => urls.add(url));
    Object.values(skin.state ?? {}).forEach((url) => { if (url) urls.add(url); });
    Object.values(skin.clips ?? {}).forEach((clip) => { if (clip) urls.add(clip.textureUrl); });
    Object.values(skin.actions ?? {}).forEach((directions) => {
      Object.values(directions ?? {}).forEach((clip) => { if (clip) urls.add(clip.textureUrl); });
    });
    Object.values(skin.poses ?? {}).forEach((pose) => { if (pose) urls.add(pose.textureUrl); });
  }
  return urls;
}

interface NpcArtManifest {
  readonly version: number;
  readonly playerSpriteReuse: boolean;
  readonly derivedFromSelectableStyle: boolean;
  readonly files: readonly {
    readonly file: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly size: readonly [number, number];
  }[];
}

const npcAssetRoot = resolve(process.cwd(), "apps/web/public/assets/virtual-studio/npc-cast-v2");
const playerAssetRoot = resolve(process.cwd(), "apps/web/public/assets/virtual-studio/production-v2");
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

describe("studio NPC cast", () => {
  it("uses stable NPC-only keys and no player texture URL", () => {
    expect(STUDIO_NPC_CAST).toHaveLength(4);
    expect(new Set(STUDIO_NPC_CAST.map((skin) => skin.key)).size).toBe(STUDIO_NPC_CAST.length);
    expect(STUDIO_NPC_CAST.every((skin) => skin.key.startsWith("npc-"))).toBe(true);
    const overlap = [...studioNpcCastTextureUrls()].filter((url) => playerUrls().has(url));
    expect(overlap).toEqual([]);
  });

  it("verifies every generated file and keeps all NPC bytes independent from player sprites", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(npcAssetRoot, "art-manifest.json"), "utf8"),
    ) as NpcArtManifest;
    expect(manifest.version).toBe(2);
    expect(manifest.playerSpriteReuse).toBe(false);
    expect(manifest.derivedFromSelectableStyle).toBe(true);
    expect(manifest.files).toHaveLength(35);
    const pngNames = readdirSync(npcAssetRoot).filter((name) => name.endsWith(".png")).sort();
    expect(pngNames).toEqual(manifest.files.map((item) => item.file).sort());

    const npcHashes = new Set<string>();
    for (const item of manifest.files) {
      const data = readFileSync(resolve(npcAssetRoot, item.file));
      expect(data.byteLength).toBe(item.bytes);
      expect(sha256(data)).toBe(item.sha256);
      expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual(item.size);
      npcHashes.add(item.sha256);
    }
    expect(npcHashes.size).toBe(manifest.files.length);

    const playerHashes = new Set(
      readdirSync(playerAssetRoot)
        .filter((name) => /^player-.*\.png$/u.test(name))
        .map((name) => sha256(readFileSync(resolve(playerAssetRoot, name)))),
    );
    expect(playerHashes.size).toBeGreaterThan(0);
    expect([...npcHashes].filter((hash) => playerHashes.has(hash))).toEqual([]);
  });

  it("keeps unknown authored cast keys fail-detectable while rendering a safe NPC fallback", () => {
    expect(studioNpcCastHasKey("npc-concierge")).toBe(true);
    expect(studioNpcCastHasKey("pink")).toBe(false);
    expect(studioNpcCastHasKey("missing")).toBe(false);
    expect(studioNpcCastSkinByKey("missing").key).toBe("npc-concierge");
  });
});
