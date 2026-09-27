import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO_VIRTUAL_BACKDROPS, studioVirtualBackdropUrl } from "./studio-virtual-space-environment-preference";
import { STUDIO_VIRTUAL_DECOR_FRAME, STUDIO_VIRTUAL_DECOR_TYPES } from "./studio-virtual-space-customization";

const root = resolve(import.meta.dirname, "../../../../public/assets/virtual-studio/experience-v8");
const manifest = JSON.parse(readFileSync(resolve(root, "art-manifest.json"), "utf8")) as {
  assets: Array<{ file: string; bytes: number; sha256: string; source: string; modelVersion: null }>;
};

describe("가상 스튜디오 생성 아트 무결성", () => {
  it("실제 생성된 PNG와 출처 원장의 바이트·해시가 일치한다", () => {
    for (const asset of manifest.assets) {
      const bytes = readFileSync(resolve(root, asset.file));
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.length).toBe(asset.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      expect(asset.source).toBe("built-in image_gen");
      expect(asset.modelVersion).toBeNull();
    }
  });
  it("모든 환경과 16종 가구가 실제 아트에 연결된다", () => {
    for (const backdrop of STUDIO_VIRTUAL_BACKDROPS) {
      expect(manifest.assets.some((entry) => studioVirtualBackdropUrl(backdrop).endsWith(`/${entry.file}`))).toBe(true);
    }
    const furniture = readFileSync(resolve(root, "furniture.png"));
    expect(furniture[25]).toBe(6);
    expect(furniture.readUInt32BE(16)).toBe(furniture.readUInt32BE(20));
    expect(furniture.readUInt32BE(16)).toBeGreaterThanOrEqual(1024);
    expect(STUDIO_VIRTUAL_DECOR_TYPES.map((type) => STUDIO_VIRTUAL_DECOR_FRAME[type])).toEqual(Array.from({ length: 16 }, (_, index) => index));
  });
});
