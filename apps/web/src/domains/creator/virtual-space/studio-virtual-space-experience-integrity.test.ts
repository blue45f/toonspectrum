import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO_VIRTUAL_ART_STYLE_KEYS } from "./studio-virtual-space-art-style";
import { STUDIO_VIRTUAL_BACKDROPS, studioVirtualBackdropUrl } from "./studio-virtual-space-environment-preference";

interface OriginalAsset {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly width?: number;
  readonly height?: number;
}

const publicDirectory = resolve(process.cwd(), "apps/web/public");
const artDirectory = resolve(publicDirectory, "assets/virtual-studio/experience-v8");
const manifest = JSON.parse(readFileSync(resolve(artDirectory, "art-manifest.json"), "utf8")) as {
  readonly assets: readonly OriginalAsset[];
};
const npcManifest = JSON.parse(readFileSync(resolve(artDirectory, "npc-art-manifest.json"), "utf8")) as {
  readonly files: readonly OriginalAsset[];
};
const allAssets = [...manifest.assets, ...npcManifest.files];
const originalBackdropFiles = new Set(STUDIO_VIRTUAL_BACKDROPS.map((backdrop) => basename(studioVirtualBackdropUrl(backdrop))));

describe("가상 스튜디오 전체 생성 원본 무결성", () => {
  it("아트 50개와 NPC 4개의 원장이 실제 PNG 전체와 중복·누락 없이 일치한다", () => {
    expect(manifest.assets).toHaveLength(50);
    expect(npcManifest.files).toHaveLength(4);
    expect(new Set(allAssets.map((asset) => asset.file)).size).toBe(54);
    expect(readdirSync(artDirectory).filter((file) => file.endsWith(".png")).sort())
      .toEqual(allAssets.map((asset) => asset.file).sort());
  });

  it.each(allAssets)("$file 원본의 SHA-256·바이트·PNG 형식·실제 치수가 원장과 일치한다", (asset) => {
    expect(asset.file).toBe(basename(asset.file));
    const png = readFileSync(resolve(artDirectory, asset.file));
    expect(png.byteLength).toBe(asset.bytes);
    expect(createHash("sha256").update(png).digest("hex")).toBe(asset.sha256);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(8)).toBe(13);
    expect(png.toString("ascii", 12, 16)).toBe("IHDR");
    expect(png.subarray(-12).toString("hex")).toBe("0000000049454e44ae426082");
    // 초기 원경 4개 원장은 치수가 없으므로 확인된 원본 규격을 명시적으로 보존한다.
    const expectedSize = originalBackdropFiles.has(asset.file) ? [1536, 1024] : [asset.width, asset.height];
    expect(expectedSize.every((value) => Number.isSafeInteger(value) && Number(value) > 0)).toBe(true);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(expectedSize);
  });

  it.each(STUDIO_VIRTUAL_ART_STYLE_KEYS)("%s의 환경 선택 URL 네 개가 등록된 1536×1024 원본을 가리킨다", (style) => {
    for (const backdrop of STUDIO_VIRTUAL_BACKDROPS) {
      const url = studioVirtualBackdropUrl(backdrop, style);
      const asset = manifest.assets.find((record) => record.file === basename(url));
      expect(asset, url).toBeDefined();
      const png = readFileSync(resolve(publicDirectory, url.replace(/^\//u, "")));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1536, 1024]);
      expect(createHash("sha256").update(png).digest("hex")).toBe(asset?.sha256);
      expect(png.byteLength).toBe(asset?.bytes);
    }
  });

  it("6개 스타일과 4개 배경의 24개 선택이 서로 다른 URL과 원본을 사용한다", () => {
    const urls = STUDIO_VIRTUAL_ART_STYLE_KEYS.flatMap((style) => STUDIO_VIRTUAL_BACKDROPS.map((backdrop) => studioVirtualBackdropUrl(backdrop, style)));
    expect(urls).toHaveLength(24);
    expect(new Set(urls).size).toBe(24);
    const hashes = urls.map((url) => manifest.assets.find((asset) => asset.file === basename(url))?.sha256);
    expect(hashes.every((hash) => typeof hash === "string")).toBe(true);
    expect(new Set(hashes).size).toBe(24);
  });
});
