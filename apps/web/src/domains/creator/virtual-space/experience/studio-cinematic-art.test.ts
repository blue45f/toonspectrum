import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STUDIO_CINEMATIC_ART, studioCinematicArtUrl, studioCinematicBackdropUrl } from "./studio-cinematic-art";

const root = resolve("apps/web/public");
const directory = resolve(root, "assets/virtual-studio/cinematic-v9");
const manifest = JSON.parse(readFileSync(resolve(directory, "art-manifest.json"), "utf8"));
describe("생성 아트의 실제 파일 연결", () => {
  it("등록한 모든 크기의 파일·해시·바이트와 원장을 검증한다", () => {
    const names = STUDIO_CINEMATIC_ART.flatMap((art) => [480, 1024].map((width) => `${art.id}-${width}.webp`));
    expect(readdirSync(directory).filter((name) => name.endsWith(".webp")).sort()).toEqual(names.sort());
    expect(manifest.assets).toHaveLength(8);
    for (const item of manifest.assets) {
      const bytes = readFileSync(resolve(directory, item.file));
      expect(bytes.length).toBe(item.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(item.sha256);
      expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
    }
    expect(manifest.modelVersionVerified).toBe(false);
  });
  it("내장 공중섬의 원경만 교체하고 다른 테마와 사용자 월드는 보존한다", () => {
    expect(studioCinematicBackdropUrl("sky", "sky-island", true)).toBe(studioCinematicArtUrl("campus-day"));
    expect(studioCinematicBackdropUrl("forest", "sky-island", true)).toBe(studioCinematicArtUrl("campus-garden"));
    expect(studioCinematicBackdropUrl("sky", "ink", true)).toContain("backdrop-ink-sky.png");
    expect(studioCinematicBackdropUrl("sky", "sky-island", false)).toContain("experience-v8/sky.png");
  });
});
