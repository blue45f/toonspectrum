import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import {
  STUDIO_NPC_CAST,
  studioNpcCastHasKey,
  studioNpcCastSkinByKey,
  studioNpcCastTextureUrls,
} from "./studio-virtual-space-npc-cast";
import { STUDIO_VIRTUAL_ART_STYLE_KEYS } from "./studio-virtual-space-art-style";

interface V4ManifestFile {
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly size: readonly [number, number];
}
interface V4Manifest {
  readonly version: number;
  readonly sourceTechnique: string;
  readonly roles: readonly string[];
  readonly styles: readonly string[];
  readonly frame: { readonly width: number; readonly height: number; readonly countPerDirection: number };
  readonly files: readonly V4ManifestFile[];
}

const root = resolve(process.cwd(), "apps/web/public/assets/virtual-studio");
const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

function playerUrls(): Set<string> {
  const urls = new Set<string>();
  for (const skin of STUDIO_CHARACTER_SKINS) {
    Object.values(skin.directional).forEach((url) => urls.add(url));
    Object.values(skin.state ?? {}).forEach((url) => { if (url) urls.add(url); });
    Object.values(skin.clips ?? {}).forEach((clip) => { if (clip) urls.add(clip.textureUrl); });
    Object.values(skin.actions ?? {}).forEach((directions) => {
      Object.values(directions ?? {}).forEach((clip) => { if (clip) urls.add(clip.textureUrl); });
    });
  }
  return urls;
}

function diskPath(url: string): string {
  return resolve(process.cwd(), "apps/web/public", url.replace(/^\//u, ""));
}

describe("studio NPC cast v4", () => {
  it("uses eight stable generated NPC identities and never reuses player URLs", () => {
    expect(STUDIO_NPC_CAST).toHaveLength(8);
    expect(new Set(STUDIO_NPC_CAST.map((skin) => skin.key)).size).toBe(8);
    expect(STUDIO_NPC_CAST.every((skin) => skin.key.startsWith("npc-"))).toBe(true);
    expect([...studioNpcCastTextureUrls()].filter((url) => playerUrls().has(url))).toEqual([]);
  });

  it("loads every webtoon and styled v4 runtime texture from the integrity manifest", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "art-v4-manifest.json"), "utf8")) as V4Manifest;
    expect(manifest.version).toBe(4);
    expect(manifest.sourceTechnique).toMatch(/generated source art/u);
    expect(manifest.roles).toHaveLength(8);
    expect(manifest.styles).toEqual(["webtoon", "sky-island", "pastel", "retro", "ink", "neon"]);
    expect(manifest.frame).toEqual({ width: 128, height: 128, countPerDirection: 4 });
    const records = new Map(manifest.files.map((item) => [`/assets/virtual-studio/${item.file}`, item]));

    for (const style of STUDIO_VIRTUAL_ART_STYLE_KEYS) {
      const urls = studioNpcCastTextureUrls(style);
      expect(urls.size).toBeGreaterThanOrEqual(69);
      for (const url of urls) {
        const record = records.get(url);
        expect(record, `${style}: ${url}`).toBeDefined();
        const path = diskPath(url);
        expect(existsSync(path), path).toBe(true);
        const data = readFileSync(path);
        expect(data.byteLength).toBe(record?.bytes);
        expect(sha256(data)).toBe(record?.sha256);
      }
    }
  });

  it("keeps unknown authored cast keys fail-detectable while rendering a safe NPC fallback", () => {
    expect(studioNpcCastHasKey("npc-concierge")).toBe(true);
    expect(studioNpcCastHasKey("pink")).toBe(false);
    expect(studioNpcCastHasKey("missing")).toBe(false);
    expect(studioNpcCastSkinByKey("missing").key).toBe("npc-concierge");
  });
});
